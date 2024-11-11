import { ProgressCallback, Protocol } from "../shared/protocol.js";
import { Transport } from "../shared/transport.js";
import {
  CallToolRequest,
  CallToolResultSchema,
  ClientNotification,
  ClientRequest,
  ClientResult,
  CompatibilityCallToolResultSchema,
  CompleteRequest,
  CompleteResultSchema,
  EmptyResultSchema,
  GetPromptRequest,
  GetPromptResultSchema,
  Implementation,
  InitializeResultSchema,
  LATEST_PROTOCOL_VERSION,
  ListPromptsRequest,
  ListPromptsResultSchema,
  ListResourcesRequest,
  ListResourcesResultSchema,
  ListResourceTemplatesRequest,
  ListResourceTemplatesResultSchema,
  ListToolsRequest,
  ListToolsResultSchema,
  LoggingLevel,
  Notification,
  ReadResourceRequest,
  ReadResourceResultSchema,
  Request,
  Result,
  ServerCapabilities,
  SubscribeRequest,
  SUPPORTED_PROTOCOL_VERSIONS,
  UnsubscribeRequest,
} from "../types.js";

/**
 * An MCP client on top of a pluggable transport.
 *
 * The client will automatically begin the initialization flow with the server when connect() is called.
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
 * // Create typed client
 * const client = new Client<CustomRequest, CustomNotification, CustomResult>({
 *   name: "CustomClient",
 *   version: "1.0.0"
 * })
 * ```
 */
export class Client<
  RequestT extends Request = Request,
  NotificationT extends Notification = Notification,
  ResultT extends Result = Result,
> extends Protocol<
  ClientRequest | RequestT,
  ClientNotification | NotificationT,
  ClientResult | ResultT
> {
  private _serverCapabilities?: ServerCapabilities;
  private _serverVersion?: Implementation;

  /**
   * Initializes this client with the given name and version information.
   */
  constructor(private _clientInfo: Implementation) {
    super();
  }

  override async connect(transport: Transport): Promise<void> {
    await super.connect(transport);

    try {
      const result = await this.request(
        {
          method: "initialize",
          params: {
            protocolVersion: LATEST_PROTOCOL_VERSION,
            capabilities: {},
            clientInfo: this._clientInfo,
          },
        },
        InitializeResultSchema,
      );

      if (result === undefined) {
        throw new Error(`Server sent invalid initialize result: ${result}`);
      }

      if (!SUPPORTED_PROTOCOL_VERSIONS.includes(result.protocolVersion)) {
        throw new Error(
          `Server's protocol version is not supported: ${result.protocolVersion}`,
        );
      }

      this._serverCapabilities = result.capabilities;
      this._serverVersion = result.serverInfo;

      await this.notification({
        method: "notifications/initialized",
      });
    } catch (error) {
      // Disconnect if initialization fails.
      void this.close();
      throw error;
    }
  }

  /**
   * After initialization has completed, this will be populated with the server's reported capabilities.
   */
  getServerCapabilities(): ServerCapabilities | undefined {
    return this._serverCapabilities;
  }

  /**
   * After initialization has completed, this will be populated with information about the server's name and version.
   */
  getServerVersion(): Implementation | undefined {
    return this._serverVersion;
  }

  async ping() {
    return this.request({ method: "ping" }, EmptyResultSchema);
  }

  async complete(
    params: CompleteRequest["params"],
    onprogress?: ProgressCallback,
  ) {
    return this.request(
      { method: "completion/complete", params },
      CompleteResultSchema,
      onprogress,
    );
  }

  async setLoggingLevel(level: LoggingLevel) {
    return this.request(
      { method: "logging/setLevel", params: { level } },
      EmptyResultSchema,
    );
  }

  async getPrompt(
    params: GetPromptRequest["params"],
    onprogress?: ProgressCallback,
  ) {
    return this.request(
      { method: "prompts/get", params },
      GetPromptResultSchema,
      onprogress,
    );
  }

  async listPrompts(
    params?: ListPromptsRequest["params"],
    onprogress?: ProgressCallback,
  ) {
    return this.request(
      { method: "prompts/list", params },
      ListPromptsResultSchema,
      onprogress,
    );
  }

  async listResources(
    params?: ListResourcesRequest["params"],
    onprogress?: ProgressCallback,
  ) {
    return this.request(
      { method: "resources/list", params },
      ListResourcesResultSchema,
      onprogress,
    );
  }

  async listResourceTemplates(
    params?: ListResourceTemplatesRequest["params"],
    onprogress?: ProgressCallback,
  ) {
    return this.request(
      { method: "resources/templates/list", params },
      ListResourceTemplatesResultSchema,
      onprogress,
    );
  }

  async readResource(
    params: ReadResourceRequest["params"],
    onprogress?: ProgressCallback,
  ) {
    return this.request(
      { method: "resources/read", params },
      ReadResourceResultSchema,
      onprogress,
    );
  }

  async subscribeResource(params: SubscribeRequest["params"]) {
    return this.request(
      { method: "resources/subscribe", params },
      EmptyResultSchema,
    );
  }

  async unsubscribeResource(params: UnsubscribeRequest["params"]) {
    return this.request(
      { method: "resources/unsubscribe", params },
      EmptyResultSchema,
    );
  }

  async callTool(
    params: CallToolRequest["params"],
    resultSchema:
      | typeof CallToolResultSchema
      | typeof CompatibilityCallToolResultSchema = CallToolResultSchema,
    onprogress?: ProgressCallback,
  ) {
    return this.request(
      { method: "tools/call", params },
      resultSchema,
      onprogress,
    );
  }

  async listTools(
    params?: ListToolsRequest["params"],
    onprogress?: ProgressCallback,
  ) {
    return this.request(
      { method: "tools/list", params },
      ListToolsResultSchema,
      onprogress,
    );
  }

  async sendRootsListChanged() {
    return this.notification({ method: "notifications/roots/list_changed" });
  }
}
