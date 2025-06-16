/**
 * Information about a validated access token, provided to request handlers.
 */
export interface AuthInfo {
  /**
   * The access token.
   */
  token: string;

  /**
   * The client ID associated with this token.
   */
  clientId: string;

  /**
   * Scopes associated with this token.
   */
  scopes: string[];

  /**
   * When the token expires (in seconds since epoch).
   */
  expiresAt?: number;

  /**
   * Additional data associated with the token.
   * This field should be used for any additional data that needs to be attached to the auth info.
  */
  extra?: Record<string, unknown>;
}

/**
 * Configuration options for OAuth server behavior
 */
export interface OAuthServerConfig {
  /**
   * The canonical URL of this MCP server. When provided, the server will validate
   * that the resource parameter in OAuth requests matches this URL.
   * 
   * This should be the full URL that clients use to connect to this server,
   * without any fragment component (e.g., "https://api.example.com/mcp").
   * 
   * Required when validateResourceMatchesServer is true.
   */
  serverUrl?: string;

  /**
   * If true, validates that the resource parameter matches the configured serverUrl.
   * 
   * When enabled:
   * - serverUrl must be configured (throws error if not)
   * - resource parameter is required on all requests
   * - resource must exactly match serverUrl (after fragment removal)
   * - requests without resource parameter will be rejected with invalid_request error
   * - requests with non-matching resource will be rejected with invalid_target error
   * 
   * When disabled:
   * - warnings are logged when resource parameter is missing (for migration tracking)
   * 
   * @default false
   */
  validateResourceMatchesServer?: boolean;
}