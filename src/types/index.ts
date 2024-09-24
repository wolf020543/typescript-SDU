import { ProgressNotification, PingRequest } from "./schema.js";
export * from "./schema.js";

export const CONNECTION_CLOSED_ERROR = -1;

export class McpError extends Error {
  constructor(
    public readonly code: number,
    message: string,
    public readonly data?: unknown,
  ) {
    super(`MCP error ${code}: ${message}`);
  }
}

export type Progress = Pick<
  ProgressNotification["params"],
  "progress" | "total"
>;

export const PROGRESS_NOTIFICATION_METHOD: ProgressNotification["method"] =
  "notifications/progress";
export const PING_REQUEST_METHOD: PingRequest["method"] = "ping";

export type RequestId = string | number;
