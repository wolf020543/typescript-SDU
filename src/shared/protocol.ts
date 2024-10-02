import {
  CONNECTION_CLOSED_ERROR,
  INTERNAL_ERROR,
  JSONRPCError,
  JSONRPCNotification,
  JSONRPCRequest,
  JSONRPCResponse,
  McpError,
  METHOD_NOT_FOUND,
  Notification,
  PING_REQUEST_METHOD,
  Progress,
  PROGRESS_NOTIFICATION_METHOD,
  ProgressNotification,
  Request,
  Result,
} from "../types.js";
import { Transport } from "./transport.js";

/**
 * Callback for progress notifications.
 */
export type ProgressCallback = (progress: Progress) => void;

/**
 * Implements MCP protocol framing on top of a pluggable transport, including
 * features like request/response linking, notifications, and progress.
 */
export class Protocol<
  ReceiveRequestT extends Request,
  ReceiveNotificationT extends Notification,
  ReceiveResultT extends Result,
  SendRequestT extends Request,
  SendNotificationT extends Notification,
  SendResultT extends Result,
> {
  private _transport?: Transport;
  private _requestMessageId = 0;
  private _requestHandlers: Map<
    string,
    (request: ReceiveRequestT) => Promise<SendResultT>
  > = new Map();
  private _notificationHandlers: Map<
    string,
    (notification: ReceiveNotificationT) => Promise<void>
  > = new Map();
  private _responseHandlers: Map<
    number,
    (response: ReceiveResultT | Error) => void
  > = new Map();
  private _progressHandlers: Map<number, ProgressCallback> = new Map();

  /**
   * Callback for when the connection is closed for any reason.
   *
   * This is invoked when close() is called as well.
   */
  onclose?: () => void;

  /**
   * Callback for when an error occurs.
   *
   * Note that errors are not necessarily fatal; they are used for reporting any kind of exceptional condition out of band.
   */
  onerror?: (error: Error) => void;

  /**
   * A handler to invoke for any request types that do not have their own handler installed.
   */
  fallbackRequestHandler?: (request: ReceiveRequestT) => Promise<SendResultT>;

  /**
   * A handler to invoke for any notification types that do not have their own handler installed.
   */
  fallbackNotificationHandler?: (
    notification: ReceiveNotificationT,
  ) => Promise<void>;

  constructor() {
    this.setNotificationHandler(
      PROGRESS_NOTIFICATION_METHOD,
      (notification) => {
        this._onprogress(notification as unknown as ProgressNotification);
      },
    );

    this.setRequestHandler(
      PING_REQUEST_METHOD,
      // Automatic pong by default.
      (_request) => ({}) as SendResultT,
    );
  }

  /**
   * Attaches to the given transport and starts listening for messages.
   *
   * The Protocol object assumes ownership of the Transport, replacing any callbacks that have already been set, and expects that it is the only user of the Transport instance going forward.
   */
  async connect(transport: Transport): Promise<void> {
    this._transport = transport;
    this._transport.onclose = () => {
      this._onclose();
    };

    this._transport.onerror = (error: Error) => {
      this._onerror(error);
    };

    this._transport.onmessage = (message) => {
      if (!("method" in message)) {
        this._onresponse(message as JSONRPCResponse | JSONRPCError);
      } else if ("id" in message) {
        this._onrequest(message as JSONRPCRequest);
      } else {
        this._onnotification(message as JSONRPCNotification);
      }
    };
  }

  private _onclose(): void {
    const responseHandlers = this._responseHandlers;
    this._responseHandlers = new Map();
    this._progressHandlers.clear();
    this._transport = undefined;
    this.onclose?.();

    const error = new McpError(CONNECTION_CLOSED_ERROR, "Connection closed");
    for (const handler of responseHandlers.values()) {
      handler(error);
    }
  }

  private _onerror(error: Error): void {
    this.onerror?.(error);
  }

  private _onnotification(notification: JSONRPCNotification): void {
    const handler =
      this._notificationHandlers.get(notification.method) ??
      this.fallbackNotificationHandler;

    // Ignore notifications not being subscribed to.
    if (handler === undefined) {
      return;
    }

    handler(notification as unknown as ReceiveNotificationT).catch((error) =>
      this._onerror(
        new Error(`Uncaught error in notification handler: ${error}`),
      ),
    );
  }

  private _onrequest(request: JSONRPCRequest): void {
    const handler =
      this._requestHandlers.get(request.method) ?? this.fallbackRequestHandler;

    if (handler === undefined) {
      this._transport
        ?.send({
          jsonrpc: "2.0",
          id: request.id,
          error: {
            code: METHOD_NOT_FOUND,
            message: "Method not found",
          },
        })
        .catch((error) =>
          this._onerror(
            new Error(`Failed to send an error response: ${error}`),
          ),
        );
      return;
    }

    handler(request as unknown as ReceiveRequestT)
      .then(
        (result) => {
          this._transport?.send({
            result,
            jsonrpc: "2.0",
            id: request.id,
          });
        },
        (error) => {
          return this._transport?.send({
            jsonrpc: "2.0",
            id: request.id,
            error: {
              code: error["code"]
                ? Math.floor(Number(error["code"]))
                : INTERNAL_ERROR,
              message: error.message ?? "Internal error",
            },
          });
        },
      )
      .catch((error) =>
        this._onerror(new Error(`Failed to send response: ${error}`)),
      );
  }

  private _onprogress(notification: ProgressNotification): void {
    const { progress, total, progressToken } = notification.params;
    const handler = this._progressHandlers.get(Number(progressToken));
    if (handler === undefined) {
      this._onerror(
        new Error(
          `Received a progress notification for an unknown token: ${JSON.stringify(notification)}`,
        ),
      );
      return;
    }

    handler({ progress, total });
  }

  private _onresponse(response: JSONRPCResponse | JSONRPCError): void {
    const messageId = response.id;
    const handler = this._responseHandlers.get(Number(messageId));
    if (handler === undefined) {
      this._onerror(
        new Error(
          `Received a response for an unknown message ID: ${JSON.stringify(response)}`,
        ),
      );
      return;
    }

    this._responseHandlers.delete(Number(messageId));
    this._progressHandlers.delete(Number(messageId));
    if ("result" in response) {
      handler(response.result as ReceiveResultT);
    } else {
      const error = new McpError(
        response.error.code,
        response.error.message,
        response.error.data,
      );
      handler(error);
    }
  }

  get transport(): Transport | undefined {
    return this._transport;
  }

  /**
   * Closes the connection.
   */
  async close(): Promise<void> {
    await this._transport?.close();
  }

  /**
   * Sends a request and wait for a response, with optional progress notifications in the meantime (if supported by the server).
   *
   * Do not use this method to emit notifications! Use notification() instead.
   */
  // TODO: This could infer a better response type based on the method
  request(
    request: SendRequestT,
    onprogress?: ProgressCallback,
  ): Promise<ReceiveResultT> {
    return new Promise((resolve, reject) => {
      if (!this._transport) {
        reject(new Error("Not connected"));
        return;
      }

      const messageId = this._requestMessageId++;
      const jsonrpcRequest: JSONRPCRequest = {
        ...request,
        jsonrpc: "2.0",
        id: messageId,
      };

      if (onprogress) {
        this._progressHandlers.set(messageId, onprogress);
        jsonrpcRequest.params = {
          ...request.params,
          _meta: { progressToken: messageId },
        };
      }

      this._responseHandlers.set(messageId, (response) => {
        if (response instanceof Error) {
          reject(response);
        } else {
          resolve(response);
        }
      });

      this._transport.send(jsonrpcRequest).catch(reject);
    });
  }

  /**
   * Emits a notification, which is a one-way message that does not expect a response.
   */
  async notification(notification: SendNotificationT): Promise<void> {
    if (!this._transport) {
      throw new Error("Not connected");
    }

    const jsonrpcNotification: JSONRPCNotification = {
      ...notification,
      jsonrpc: "2.0",
    };

    await this._transport.send(jsonrpcNotification);
  }

  /**
   * Registers a handler to invoke when this protocol object receives a request with the given method.
   *
   * Note that this will replace any previous request handler for the same method.
   */
  // TODO: This could infer a better request type based on the method.
  setRequestHandler(
    method: string,
    handler: (request: ReceiveRequestT) => SendResultT | Promise<SendResultT>,
  ): void {
    this._requestHandlers.set(method, (request) =>
      Promise.resolve(handler(request)),
    );
  }

  /**
   * Removes the request handler for the given method.
   */
  removeRequestHandler(method: string): void {
    this._requestHandlers.delete(method);
  }

  /**
   * Registers a handler to invoke when this protocol object receives a notification with the given method.
   *
   * Note that this will replace any previous notification handler for the same method.
   */
  // TODO: This could infer a better notification type based on the method.
  setNotificationHandler<T extends ReceiveNotificationT>(
    method: string,
    handler: (notification: T) => void | Promise<void>,
  ): void {
    this._notificationHandlers.set(method, (notification) =>
      Promise.resolve(handler(notification as T)),
    );
  }

  /**
   * Removes the notification handler for the given method.
   */
  removeNotificationHandler(method: string): void {
    this._notificationHandlers.delete(method);
  }
}
