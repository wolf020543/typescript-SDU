import { ProgressNotification, PingRequest } from "./schema.js";
export * from "./schema.js";
export declare const CONNECTION_CLOSED_ERROR = -1;
export declare class McpError extends Error {
    readonly code: number;
    readonly data?: unknown;
    constructor(code: number, message: string, data?: unknown);
}
export type Progress = Pick<ProgressNotification["params"], "progress" | "total">;
export declare const PROGRESS_NOTIFICATION_METHOD: ProgressNotification["method"];
export declare const PING_REQUEST_METHOD: PingRequest["method"];
export type RequestId = string | number;
//# sourceMappingURL=index.d.ts.map