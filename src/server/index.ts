import { ProgressCallback, Protocol } from "../shared/protocol.js";
import {
  ClientCapabilities,
  Implementation,
  InitializedNotificationSchema,
  InitializeRequest,
  InitializeRequestSchema,
  InitializeResult,
  Notification,
  PROTOCOL_VERSION,
  Request,
  Result,
  ServerNotification,
  ServerRequest,
  ServerResult,
  ServerCapabilities,
  ListResourcesRequestSchema,
  ListToolsRequestSchema,
  ListPromptsRequestSchema,
  SetLevelRequestSchema,
  CreateMessageRequest,
  CreateMessageResultSchema,
  EmptyResultSchema,
  LoggingMessageNotification,
  ResourceUpdatedNotification,
  ListRootsRequest,
  ListRootsResultSchema,
} from "../types.js";

/**
 * An MCP server on top of a pluggable transport.
 *
 * This server will automatically respond to the initialization flow as initiated from the client.
 *
 * To use with custom types, extend the base Request/Notification/Result types and pass them as type parameters:
 *
 * ```typescript
 * // Custom schemas
 * const CustomRequestSchema = RequestSchema.extend({...})
 * const CustomNotificationSchema = NotificationSchema.extend({...})
 * const CustomResultSchema = ResultSchema.extend({...})
 *
 * // Type aliases
 * type CustomRequest = z.infer<typeof CustomRequestSchema>
 * type CustomNotification = z.infer<typeof CustomNotificationSchema>
 * type CustomResult = z.infer<typeof CustomResultSchema>
 *
 * // Create typed server
 * const server = new Server<CustomRequest, CustomNotification, CustomResult>({
 *   name: "CustomServer",
 *   version: "1.0.0"
 * })
 * ```
 */
export class Server<
  RequestT extends Request = Request,
  NotificationT extends Notification = Notification,
  ResultT extends Result = Result,
> extends Protocol<
  ServerRequest | RequestT,
  ServerNotification | NotificationT,
  ServerResult | ResultT
> {
  private _clientCapabilities?: ClientCapabilities;
  private _clientVersion?: Implementation;

  /**
   * Callback for when initialization has fully completed (i.e., the client has sent an `initialized` notification).
   */
  oninitialized?: () => void;

  /**
   * Initializes this server with the given name and version information.
   */
  constructor(private _serverInfo: Implementation) {
    super();

    this.setRequestHandler(InitializeRequestSchema, (request) =>
      this._oninitialize(request),
    );
    this.setNotificationHandler(InitializedNotificationSchema, () =>
      this.oninitialized?.(),
    );
  }

  private async _oninitialize(
    request: InitializeRequest,
  ): Promise<InitializeResult> {
    if (request.params.protocolVersion !== PROTOCOL_VERSION) {
      throw new Error(
        `Client's protocol version is not supported: ${request.params.protocolVersion}`,
      );
    }

    this._clientCapabilities = request.params.capabilities;
    this._clientVersion = request.params.clientInfo;

    return {
      protocolVersion: PROTOCOL_VERSION,
      capabilities: this.getCapabilities(),
      serverInfo: this._serverInfo,
    };
  }

  /**
   * After initialization has completed, this will be populated with the client's reported capabilities.
   */
  getClientCapabilities(): ClientCapabilities | undefined {
    return this._clientCapabilities;
  }

  /**
   * After initialization has completed, this will be populated with information about the client's name and version.
   */
  getClientVersion(): Implementation | undefined {
    return this._clientVersion;
  }

  private getCapabilities(): ServerCapabilities {
    return {
      prompts: this._requestHandlers.has(
        ListPromptsRequestSchema.shape.method.value as string,
      )
        ? {}
        : undefined,
      resources: this._requestHandlers.has(
        ListResourcesRequestSchema.shape.method.value as string,
      )
        ? {}
        : undefined,
      tools: this._requestHandlers.has(
        ListToolsRequestSchema.shape.method.value as string,
      )
        ? {}
        : undefined,
      logging: this._requestHandlers.has(
        SetLevelRequestSchema.shape.method.value as string,
      )
        ? {}
        : undefined,
    };
  }

  async ping() {
    return this.request({ method: "ping" }, EmptyResultSchema);
  }

  async createMessage(
    params: CreateMessageRequest["params"],
    onprogress?: ProgressCallback,
  ) {
    return this.request(
      { method: "sampling/createMessage", params },
      CreateMessageResultSchema,
      onprogress,
    );
  }

  async listRoots(
    params?: ListRootsRequest["params"],
    onprogress?: ProgressCallback,
  ) {
    return this.request(
      { method: "roots/list", params },
      ListRootsResultSchema,
      onprogress,
    );
  }

  async sendLoggingMessage(params: LoggingMessageNotification["params"]) {
    return this.notification({ method: "notifications/message", params });
  }

  async sendResourceUpdated(params: ResourceUpdatedNotification["params"]) {
    return this.notification({
      method: "notifications/resources/updated",
      params,
    });
  }

  async sendResourceListChanged() {
    return this.notification({
      method: "notifications/resources/list_changed",
    });
  }

  async sendToolListChanged() {
    return this.notification({ method: "notifications/tools/list_changed" });
  }

  async sendPromptListChanged() {
    return this.notification({ method: "notifications/prompts/list_changed" });
  }
}
