export * from "./schema.js";
export const CONNECTION_CLOSED_ERROR = -1;
export class McpError extends Error {
    constructor(code, message, data) {
        super(`MCP error ${code}: ${message}`);
        this.code = code;
        this.data = data;
    }
}
export const PROGRESS_NOTIFICATION_METHOD = "notifications/progress";
export const PING_REQUEST_METHOD = "ping";
//# sourceMappingURL=index.js.map