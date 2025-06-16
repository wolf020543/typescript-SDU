import { randomUUID } from 'node:crypto';
import { AuthorizationParams, OAuthServerProvider } from '../../server/auth/provider.js';
import { OAuthRegisteredClientsStore } from '../../server/auth/clients.js';
import { OAuthClientInformationFull, OAuthMetadata, OAuthTokens } from '../../shared/auth.js';
import express, { Request, Response } from "express";
import { AuthInfo } from '../../server/auth/types.js';
import { createOAuthMetadata, mcpAuthRouter } from '../../server/auth/router.js';
import { InvalidTargetError, InvalidRequestError } from '../../server/auth/errors.js';
import { resourceUrlFromServerUrl } from '../../shared/auth-utils.js';


interface ExtendedClientInformation extends OAuthClientInformationFull {
  allowed_resources?: string[];
}

export class DemoInMemoryClientsStore implements OAuthRegisteredClientsStore {
  private clients = new Map<string, ExtendedClientInformation>();

  async getClient(clientId: string) {
    return this.clients.get(clientId);
  }

  async registerClient(clientMetadata: OAuthClientInformationFull & { allowed_resources?: string[] }) {
    this.clients.set(clientMetadata.client_id, clientMetadata);
    return clientMetadata;
  }

  /**
   * Demo method to set allowed resources for a client
   */
  setAllowedResources(clientId: string, resources: string[]) {
    const client = this.clients.get(clientId);
    if (client) {
      client.allowed_resources = resources;
    }
  }
}

/**
 * 🚨 DEMO ONLY - NOT FOR PRODUCTION
 *
 * This example demonstrates MCP OAuth flow but lacks some of the features required for production use,
 * for example:
 * - Persistent token storage
 * - Rate limiting
 */
interface ExtendedAuthInfo extends AuthInfo {
  resource?: string;
  type?: string;
}

/**
 * Configuration options for the demo OAuth provider
 */
export interface DemoOAuthProviderConfig {
  /**
   * The canonical URL of this MCP server. When provided, the provider will validate
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

export class DemoInMemoryAuthProvider implements OAuthServerProvider {
  clientsStore = new DemoInMemoryClientsStore();
  private codes = new Map<string, {
    params: AuthorizationParams,
    client: OAuthClientInformationFull}>();
  private tokens = new Map<string, ExtendedAuthInfo>();
  private config?: DemoOAuthProviderConfig;

  constructor(config?: DemoOAuthProviderConfig) {
    if (config?.validateResourceMatchesServer && !config?.serverUrl) {
      throw new Error("serverUrl must be configured when validateResourceMatchesServer is true");
    }
    this.config = config;
  }

  async authorize(
    client: OAuthClientInformationFull,
    params: AuthorizationParams,
    res: Response
  ): Promise<void> {
    // Validate resource parameter based on configuration
    if (this.config?.validateResourceMatchesServer) {
      if (!params.resource) {
        throw new InvalidRequestError("Resource parameter is required when server URL validation is enabled");
      }
      
      // Remove fragment from server URL if present (though it shouldn't have one)
      const canonicalServerUrl = resourceUrlFromServerUrl(this.config.serverUrl!);
      
      if (params.resource !== canonicalServerUrl) {
        throw new InvalidTargetError(
          `Resource parameter '${params.resource}' does not match this server's URL '${canonicalServerUrl}'`
        );
      }
    } else if (!params.resource) {
      // Always log warning if resource is missing (unless validation is enabled)
      console.warn(`Authorization request from client ${client.client_id} is missing the resource parameter. Consider migrating to RFC 8707.`);
    }
    
    // Additional validation: check if client is allowed to access the resource
    if (params.resource) {
      await this.validateResource(client, params.resource);
    }

    const code = randomUUID();

    const searchParams = new URLSearchParams({
      code,
    });
    if (params.state !== undefined) {
      searchParams.set('state', params.state);
    }

    this.codes.set(code, {
      client,
      params
    });

    const targetUrl = new URL(client.redirect_uris[0]);
    targetUrl.search = searchParams.toString();
    res.redirect(targetUrl.toString());
  }

  async challengeForAuthorizationCode(
    client: OAuthClientInformationFull,
    authorizationCode: string
  ): Promise<string> {

    // Store the challenge with the code data
    const codeData = this.codes.get(authorizationCode);
    if (!codeData) {
      throw new Error('Invalid authorization code');
    }

    return codeData.params.codeChallenge;
  }

  async exchangeAuthorizationCode(
    client: OAuthClientInformationFull,
    authorizationCode: string,
    // Note: code verifier is checked in token.ts by default
    // it's unused here for that reason.
    _codeVerifier?: string,
    _redirectUri?: string,
    resource?: string
  ): Promise<OAuthTokens> {
    const codeData = this.codes.get(authorizationCode);
    if (!codeData) {
      throw new Error('Invalid authorization code');
    }

    if (codeData.client.client_id !== client.client_id) {
      throw new Error(`Authorization code was not issued to this client, ${codeData.client.client_id} != ${client.client_id}`);
    }

    // Validate resource parameter based on configuration
    if (this.config?.validateResourceMatchesServer) {
      if (!resource) {
        throw new InvalidRequestError("Resource parameter is required when server URL validation is enabled");
      }
      
      const canonicalServerUrl = resourceUrlFromServerUrl(this.config.serverUrl!);
      
      if (resource !== canonicalServerUrl) {
        throw new InvalidTargetError(
          `Resource parameter '${resource}' does not match this server's URL '${canonicalServerUrl}'`
        );
      }
    } else if (!resource) {
      // Always log warning if resource is missing (unless validation is enabled)
      console.warn(`Token exchange request from client ${client.client_id} is missing the resource parameter. Consider migrating to RFC 8707.`);
    }

    // Validate that the resource matches what was authorized
    if (resource !== codeData.params.resource) {
      throw new InvalidTargetError('Resource parameter does not match the authorized resource');
    }

    // If resource was specified during authorization, validate it's still allowed
    if (codeData.params.resource) {
      await this.validateResource(client, codeData.params.resource);
    }

    this.codes.delete(authorizationCode);
    const token = randomUUID();

    const tokenData: ExtendedAuthInfo = {
      token,
      clientId: client.client_id,
      scopes: codeData.params.scopes || [],
      expiresAt: Date.now() + 3600000, // 1 hour
      type: 'access',
      resource: codeData.params.resource
    };

    this.tokens.set(token, tokenData);

    return {
      access_token: token,
      token_type: 'bearer',
      expires_in: 3600,
      scope: (codeData.params.scopes || []).join(' '),
    };
  }

  async exchangeRefreshToken(
    client: OAuthClientInformationFull,
    _refreshToken: string,
    _scopes?: string[],
    resource?: string
  ): Promise<OAuthTokens> {
    // Validate resource parameter based on configuration
    if (this.config?.validateResourceMatchesServer) {
      if (!resource) {
        throw new InvalidRequestError("Resource parameter is required when server URL validation is enabled");
      }
      
      const canonicalServerUrl = resourceUrlFromServerUrl(this.config.serverUrl!);
      
      if (resource !== canonicalServerUrl) {
        throw new InvalidTargetError(
          `Resource parameter '${resource}' does not match this server's URL '${canonicalServerUrl}'`
        );
      }
    } else if (!resource) {
      // Always log warning if resource is missing (unless validation is enabled)
      console.warn(`Token refresh request from client ${client.client_id} is missing the resource parameter. Consider migrating to RFC 8707.`);
    }
    
    // Additional validation: check if client is allowed to access the resource
    if (resource) {
      await this.validateResource(client, resource);
    }
    throw new Error('Refresh tokens not implemented for example demo');
  }

  async verifyAccessToken(token: string): Promise<AuthInfo> {
    const tokenData = this.tokens.get(token);
    if (!tokenData || !tokenData.expiresAt || tokenData.expiresAt < Date.now()) {
      throw new Error('Invalid or expired token');
    }

    return {
      token,
      clientId: tokenData.clientId,
      scopes: tokenData.scopes,
      expiresAt: Math.floor(tokenData.expiresAt / 1000),
    };
  }

  /**
   * Validates that the client is allowed to access the requested resource.
   * In a real implementation, this would check against a database or configuration.
   */
  private async validateResource(client: OAuthClientInformationFull, resource: string): Promise<void> {
    const extendedClient = client as ExtendedClientInformation;
    
    // If no resources are configured, allow any resource (for demo purposes)
    if (!extendedClient.allowed_resources) {
      return;
    }

    // Check if the requested resource is in the allowed list
    if (!extendedClient.allowed_resources.includes(resource)) {
      throw new InvalidTargetError(
        `Client is not authorized to access resource: ${resource}`
      );
    }
  }

  /**
   * Get token details including resource information (for demo introspection endpoint)
   */
  getTokenDetails(token: string): ExtendedAuthInfo | undefined {
    return this.tokens.get(token);
  }
}


export const setupAuthServer = (authServerUrl: URL, config?: DemoOAuthProviderConfig): OAuthMetadata => {
  // Create separate auth server app
  // NOTE: This is a separate app on a separate port to illustrate
  // how to separate an OAuth Authorization Server from a Resource
  // server in the SDK. The SDK is not intended to be provide a standalone
  // authorization server.
  const provider = new DemoInMemoryAuthProvider(config);
  const authApp = express();
  authApp.use(express.json());
  // For introspection requests
  authApp.use(express.urlencoded());

  // Add OAuth routes to the auth server
  // NOTE: this will also add a protected resource metadata route,
  // but it won't be used, so leave it.
  authApp.use(mcpAuthRouter({
    provider,
    issuerUrl: authServerUrl,
    scopesSupported: ['mcp:tools'],
  }));

  authApp.post('/introspect', async (req: Request, res: Response) => {
    try {
      const { token } = req.body;
      if (!token) {
        res.status(400).json({ error: 'Token is required' });
        return;
      }

      const tokenInfo = await provider.verifyAccessToken(token);
      // For demo purposes, we'll add a method to get token details
      const tokenDetails = provider.getTokenDetails(token);
      res.json({
        active: true,
        client_id: tokenInfo.clientId,
        scope: tokenInfo.scopes.join(' '),
        exp: tokenInfo.expiresAt,
        ...(tokenDetails?.resource && { aud: tokenDetails.resource })
      });
      return
    } catch (error) {
      res.status(401).json({
        active: false,
        error: 'Unauthorized',
        error_description: `Invalid token: ${error}`
      });
    }
  });

  const auth_port = authServerUrl.port;
  // Start the auth server
  authApp.listen(auth_port, () => {
    console.log(`OAuth Authorization Server listening on port ${auth_port}`);
  });

  // Note: we could fetch this from the server, but then we end up
  // with some top level async which gets annoying.
  const oauthMetadata: OAuthMetadata = createOAuthMetadata({
    provider,
    issuerUrl: authServerUrl,
    scopesSupported: ['mcp:tools'],
  })

  oauthMetadata.introspection_endpoint = new URL("/introspect", authServerUrl).href;

  return oauthMetadata;
}
