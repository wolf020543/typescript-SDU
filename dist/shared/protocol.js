import { CONNECTION_CLOSED_ERROR, INTERNAL_ERROR, McpError, METHOD_NOT_FOUND, PING_REQUEST_METHOD, PROGRESS_NOTIFICATION_METHOD, } from "../types/index.js";
/**
 * Implements MCP protocol framing on top of a pluggable transport, including
 * features like request/response linking, notifications, and progress.
 */
export class Protocol {
    constructor() {
        this._requestMessageId = 0;
        this._requestHandlers = new Map();
        this._notificationHandlers = new Map();
        this._responseHandlers = new Map();
        this._progressHandlers = new Map();
        this.setNotificationHandler(PROGRESS_NOTIFICATION_METHOD, (notification) => {
            this._onprogress(notification);
        });
        this.setRequestHandler(PING_REQUEST_METHOD, 
        // Automatic pong by default.
        (_request) => ({}));
    }
    /**
     * Attaches to the given transport and starts listening for messages.
     *
     * The Protocol object assumes ownership of the Transport, replacing any callbacks that have already been set, and expects that it is the only user of the Transport instance going forward.
     */
    async connect(transport) {
        this._transport = transport;
        this._transport.onclose = () => {
            this._onclose();
        };
        this._transport.onerror = (error) => {
            this._onerror(error);
        };
        this._transport.onmessage = (message) => {
            if (!("method" in message)) {
                this._onresponse(message);
            }
            else if ("id" in message) {
                this._onrequest(message);
            }
            else {
                this._onnotification(message);
            }
        };
    }
    _onclose() {
        var _a;
        const responseHandlers = this._responseHandlers;
        this._responseHandlers = new Map();
        this._progressHandlers.clear();
        this._transport = undefined;
        (_a = this.onclose) === null || _a === void 0 ? void 0 : _a.call(this);
        const error = new McpError(CONNECTION_CLOSED_ERROR, "Connection closed");
        for (const handler of responseHandlers.values()) {
            handler(error);
        }
    }
    _onerror(error) {
        var _a;
        (_a = this.onerror) === null || _a === void 0 ? void 0 : _a.call(this, error);
    }
    _onnotification(notification) {
        var _a;
        const handler = (_a = this._notificationHandlers.get(notification.method)) !== null && _a !== void 0 ? _a : this.fallbackNotificationHandler;
        // Ignore notifications not being subscribed to.
        if (handler === undefined) {
            return;
        }
        handler(notification).catch((error) => this._onerror(new Error(`Uncaught error in notification handler: ${error}`)));
    }
    _onrequest(request) {
        var _a, _b;
        const handler = (_a = this._requestHandlers.get(request.method)) !== null && _a !== void 0 ? _a : this.fallbackRequestHandler;
        if (handler === undefined) {
            (_b = this._transport) === null || _b === void 0 ? void 0 : _b.send({
                jsonrpc: "2.0",
                id: request.id,
                error: {
                    code: METHOD_NOT_FOUND,
                    message: "Method not found",
                },
            }).catch((error) => this._onerror(new Error(`Failed to send an error response: ${error}`)));
            return;
        }
        handler(request)
            .then((result) => {
            var _a;
            (_a = this._transport) === null || _a === void 0 ? void 0 : _a.send({
                result,
                jsonrpc: "2.0",
                id: request.id,
            });
        }, (error) => {
            var _a, _b;
            return (_a = this._transport) === null || _a === void 0 ? void 0 : _a.send({
                jsonrpc: "2.0",
                id: request.id,
                error: {
                    code: error["code"]
                        ? Math.floor(Number(error["code"]))
                        : INTERNAL_ERROR,
                    message: (_b = error.message) !== null && _b !== void 0 ? _b : "Internal error",
                },
            });
        })
            .catch((error) => this._onerror(new Error(`Failed to send response: ${error}`)));
    }
    _onprogress(notification) {
        const { progress, total, progressToken } = notification.params;
        const handler = this._progressHandlers.get(Number(progressToken));
        if (handler === undefined) {
            this._onerror(new Error(`Received a progress notification for an unknown token: ${JSON.stringify(notification)}`));
            return;
        }
        handler({ progress, total });
    }
    _onresponse(response) {
        const messageId = response.id;
        const handler = this._responseHandlers.get(Number(messageId));
        if (handler === undefined) {
            this._onerror(new Error(`Received a response for an unknown message ID: ${JSON.stringify(response)}`));
            return;
        }
        this._responseHandlers.delete(Number(messageId));
        this._progressHandlers.delete(Number(messageId));
        if ("result" in response) {
            handler(response.result);
        }
        else {
            const error = new McpError(response.error.code, response.error.message, response.error.data);
            handler(error);
        }
    }
    get transport() {
        return this._transport;
    }
    /**
     * Closes the connection.
     */
    async close() {
        var _a;
        await ((_a = this._transport) === null || _a === void 0 ? void 0 : _a.close());
    }
    /**
     * Sends a request and wait for a response, with optional progress notifications in the meantime (if supported by the server).
     *
     * Do not use this method to emit notifications! Use notification() instead.
     */
    // TODO: This could infer a better response type based on the method
    request(request, onprogress) {
        return new Promise((resolve, reject) => {
            if (!this._transport) {
                reject(new Error("Not connected"));
                return;
            }
            const messageId = this._requestMessageId++;
            const jsonrpcRequest = {
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
                }
                else {
                    resolve(response);
                }
            });
            this._transport.send(jsonrpcRequest).catch(reject);
        });
    }
    /**
     * Emits a notification, which is a one-way message that does not expect a response.
     */
    async notification(notification) {
        if (!this._transport) {
            throw new Error("Not connected");
        }
        const jsonrpcNotification = {
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
    setRequestHandler(method, handler) {
        this._requestHandlers.set(method, (request) => Promise.resolve(handler(request)));
    }
    /**
     * Removes the request handler for the given method.
     */
    removeRequestHandler(method) {
        this._requestHandlers.delete(method);
    }
    /**
     * Registers a handler to invoke when this protocol object receives a notification with the given method.
     *
     * Note that this will replace any previous notification handler for the same method.
     */
    // TODO: This could infer a better notification type based on the method.
    setNotificationHandler(method, handler) {
        this._notificationHandlers.set(method, (notification) => Promise.resolve(handler(notification)));
    }
    /**
     * Removes the notification handler for the given method.
     */
    removeNotificationHandler(method) {
        this._notificationHandlers.delete(method);
    }
}
//# sourceMappingURL=protocol.js.map