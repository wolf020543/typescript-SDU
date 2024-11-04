import { Protocol } from "../shared/protocol.js";
import { Transport } from "../shared/transport.js";
import {
  ClientNotification,
  ClientRequest,
  ClientResult,
  Implementation,
  InitializeResultSchema,
  Notification,
  PROTOCOL_VERSION,
  Request,
  Result,
  ServerCapabilities,
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

    const result = await this.request(
      {
        method: "initialize",
        params: {
          protocolVersion: PROTOCOL_VERSION,
          capabilities: {},
          clientInfo: this._clientInfo,
        },
      },
      InitializeResultSchema,
    );

    if (result === undefined) {
      throw new Error(`Server sent invalid initialize result: ${result}`);
    }

    if (result.protocolVersion !== PROTOCOL_VERSION) {
      throw new Error(
        `Server's protocol version is not supported: ${result.protocolVersion}`,
      );
    }

    this._serverCapabilities = result.capabilities;
    this._serverVersion = result.serverInfo;

    await this.notification({
      method: "notifications/initialized",
    });
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
}
