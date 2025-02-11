import pkceChallenge from "pkce-challenge";
import { z } from "zod";

export const OAuthMetadataSchema = z
  .object({
    issuer: z.string(),
    authorization_endpoint: z.string(),
    token_endpoint: z.string(),
    registration_endpoint: z.string().optional(),
    scopes_supported: z.array(z.string()).optional(),
    response_types_supported: z.array(z.string()),
    response_modes_supported: z.array(z.string()).optional(),
    grant_types_supported: z.array(z.string()).optional(),
    token_endpoint_auth_methods_supported: z.array(z.string()).optional(),
    token_endpoint_auth_signing_alg_values_supported: z
      .array(z.string())
      .optional(),
    service_documentation: z.string().optional(),
    revocation_endpoint: z.string().optional(),
    revocation_endpoint_auth_methods_supported: z.array(z.string()).optional(),
    revocation_endpoint_auth_signing_alg_values_supported: z
      .array(z.string())
      .optional(),
    introspection_endpoint: z.string().optional(),
    introspection_endpoint_auth_methods_supported: z
      .array(z.string())
      .optional(),
    introspection_endpoint_auth_signing_alg_values_supported: z
      .array(z.string())
      .optional(),
    code_challenge_methods_supported: z.array(z.string()).optional(),
  })
  .passthrough();

export const OAuthTokensSchema = z
  .object({
    access_token: z.string(),
    token_type: z.string(),
    expires_in: z.number().optional(),
    scope: z.string().optional(),
    refresh_token: z.string().optional(),
  })
  .strip();

/**
 * Client metadata schema according to RFC 7591 OAuth 2.0 Dynamic Client Registration
 */
export const OAuthClientMetadataSchema = z.object({
  redirect_uris: z.array(z.string()),
  token_endpoint_auth_method: z.string().optional(),
  grant_types: z.array(z.string()).optional(),
  response_types: z.array(z.string()).optional(),
  client_name: z.string().optional(),
  client_uri: z.string().optional(),
  logo_uri: z.string().optional(),
  scope: z.string().optional(),
  contacts: z.array(z.string()).optional(),
  tos_uri: z.string().optional(),
  policy_uri: z.string().optional(),
  jwks_uri: z.string().optional(),
  jwks: z.any().optional(),
  software_id: z.string().optional(),
  software_version: z.string().optional(),
}).passthrough();

/**
 * Client information response schema according to RFC 7591
 */
export const OAuthClientInformationSchema = z.object({
  client_id: z.string(),
  client_secret: z.string().optional(),
  client_id_issued_at: z.number().optional(),
  client_secret_expires_at: z.number().optional(),
}).merge(OAuthClientMetadataSchema);

export type OAuthMetadata = z.infer<typeof OAuthMetadataSchema>;
export type OAuthTokens = z.infer<typeof OAuthTokensSchema>;

export type OAuthClientMetadata = z.infer<typeof OAuthClientMetadataSchema>;
export type OAuthClientInformation = z.infer<typeof OAuthClientInformationSchema>;

/**
 * Implements an end-to-end OAuth client to be used with one MCP server.
 * 
 * This client relies upon a concept of an authorized "session," the exact
 * meaning of which is application-defined. Tokens, authorization codes, and
 * code verifiers should not cross different sessions.
 */
export interface OAuthClientProvider {
  /**
   * The URL to redirect the user agent to after authorization.
   */
  get redirectUrl(): string | URL;

  /**
   * Metadata about this OAuth client.
   */
  get clientMetadata(): OAuthClientMetadata;

  /**
   * Loads information about this OAuth client, as registered already with the
   * server, or returns `undefined` if the client is not registered with the
   * server.
   */
  clientInformation(): OAuthClientInformation | undefined | Promise<OAuthClientInformation | undefined>;

  /**
   * If implemented, this permits the OAuth client to dynamically register with
   * the server. Client information saved this way should later be read via
   * `clientInformation()`.
   * 
   * This method is not required to be implemented if client information is
   * statically known (e.g., pre-registered).
   */
  saveClientInformation?(clientInformation: OAuthClientInformation): void | Promise<void>;

  /**
   * Loads any existing OAuth tokens for the current session, or returns
   * `undefined` if there are no saved tokens.
   */
  tokens(): OAuthTokens | undefined | Promise<OAuthTokens | undefined>;

  /**
   * Stores new OAuth tokens for the current session, after a successful
   * authorization.
   */
  saveTokens(tokens: OAuthTokens): void | Promise<void>;

  /**
   * Invoked to redirect the user agent to the given URL to begin the authorization flow.
   */
  redirectToAuthorization(authorizationUrl: URL): void | Promise<void>;

  /**
   * Saves a PKCE code verifier for the current session, before redirecting to
   * the authorization flow.
   */
  saveCodeVerifier(codeVerifier: string): void | Promise<void>;

  /**
   * Loads the PKCE code verifier for the current session, necessary to validate
   * the authorization result.
   */
  codeVerifier(): string | Promise<string>;
}

export type AuthResult = "AUTHORIZED" | "REDIRECT";

/**
 * Orchestrates the full auth flow with a server.
 * 
 * This can be used as a single entry point for all authorization functionality,
 * instead of linking together the other lower-level functions in this module.
 */
export async function auth(
  provider: OAuthClientProvider,
  { serverUrl, authorizationCode }: { serverUrl: string | URL, authorizationCode?: string }): Promise<AuthResult> {
  const metadata = await discoverOAuthMetadata(serverUrl);

  // Handle client registration if needed
  let clientInformation = await Promise.resolve(provider.clientInformation());
  if (!clientInformation) {
    if (authorizationCode !== undefined) {
      throw new Error("Existing OAuth client information is required when exchanging an authorization code");
    }

    if (!provider.saveClientInformation) {
      throw new Error("OAuth client information must be saveable for dynamic registration");
    }

    clientInformation = await registerClient(serverUrl, {
      metadata,
      clientMetadata: provider.clientMetadata,
    });

    await provider.saveClientInformation(clientInformation);
  }

  // Exchange authorization code for tokens
  if (authorizationCode !== undefined) {
    const codeVerifier = await provider.codeVerifier();
    const tokens = await exchangeAuthorization(serverUrl, {
      metadata,
      clientInformation,
      authorizationCode,
      codeVerifier,
    });

    await provider.saveTokens(tokens);
    return "AUTHORIZED";
  }

  const tokens = await provider.tokens();

  // Handle token refresh or new authorization
  if (tokens?.refresh_token) {
    try {
      // Attempt to refresh the token
      const newTokens = await refreshAuthorization(serverUrl, {
        metadata,
        clientInformation,
        refreshToken: tokens.refresh_token,
      });

      await provider.saveTokens(newTokens);
      return "AUTHORIZED";
    } catch (error) {
      console.error("Could not refresh OAuth tokens:", error);
    }
  }

  // Start new authorization flow
  const { authorizationUrl, codeVerifier } = await startAuthorization(serverUrl, {
    metadata,
    clientInformation,
    redirectUrl: provider.redirectUrl
  });

  await provider.saveCodeVerifier(codeVerifier);
  await provider.redirectToAuthorization(authorizationUrl);
  return "REDIRECT";
}

/**
 * Looks up RFC 8414 OAuth 2.0 Authorization Server Metadata.
 *
 * If the server returns a 404 for the well-known endpoint, this function will
 * return `undefined`. Any other errors will be thrown as exceptions.
 */
export async function discoverOAuthMetadata(
  serverUrl: string | URL,
): Promise<OAuthMetadata | undefined> {
  const url = new URL("/.well-known/oauth-authorization-server", serverUrl);
  const response = await fetch(url);
  if (response.status === 404) {
    return undefined;
  }

  if (!response.ok) {
    throw new Error(
      `HTTP ${response.status} trying to load well-known OAuth metadata`,
    );
  }

  return OAuthMetadataSchema.parse(await response.json());
}

/**
 * Begins the authorization flow with the given server, by generating a PKCE challenge and constructing the authorization URL.
 */
export async function startAuthorization(
  serverUrl: string | URL,
  {
    metadata,
    clientInformation,
    redirectUrl,
  }: {
    metadata?: OAuthMetadata;
    clientInformation: OAuthClientInformation;
    redirectUrl: string | URL;
  },
): Promise<{ authorizationUrl: URL; codeVerifier: string }> {
  const responseType = "code";
  const codeChallengeMethod = "S256";

  let authorizationUrl: URL;
  if (metadata) {
    authorizationUrl = new URL(metadata.authorization_endpoint);

    if (!metadata.response_types_supported.includes(responseType)) {
      throw new Error(
        `Incompatible auth server: does not support response type ${responseType}`,
      );
    }

    if (
      !metadata.code_challenge_methods_supported ||
      !metadata.code_challenge_methods_supported.includes(codeChallengeMethod)
    ) {
      throw new Error(
        `Incompatible auth server: does not support code challenge method ${codeChallengeMethod}`,
      );
    }
  } else {
    authorizationUrl = new URL("/authorize", serverUrl);
  }

  // Generate PKCE challenge
  const challenge = await pkceChallenge();
  const codeVerifier = challenge.code_verifier;
  const codeChallenge = challenge.code_challenge;

  authorizationUrl.searchParams.set("response_type", responseType);
  authorizationUrl.searchParams.set("client_id", clientInformation.client_id);
  authorizationUrl.searchParams.set("code_challenge", codeChallenge);
  authorizationUrl.searchParams.set(
    "code_challenge_method",
    codeChallengeMethod,
  );
  authorizationUrl.searchParams.set("redirect_uri", String(redirectUrl));

  return { authorizationUrl, codeVerifier };
}

/**
 * Exchanges an authorization code for an access token with the given server.
 */
export async function exchangeAuthorization(
  serverUrl: string | URL,
  {
    metadata,
    clientInformation,
    authorizationCode,
    codeVerifier,
  }: {
    metadata?: OAuthMetadata;
    clientInformation: OAuthClientInformation;
    authorizationCode: string;
    codeVerifier: string;
  },
): Promise<OAuthTokens> {
  const grantType = "authorization_code";

  let tokenUrl: URL;
  if (metadata) {
    tokenUrl = new URL(metadata.token_endpoint);

    if (
      metadata.grant_types_supported &&
      !metadata.grant_types_supported.includes(grantType)
    ) {
      throw new Error(
        `Incompatible auth server: does not support grant type ${grantType}`,
      );
    }
  } else {
    tokenUrl = new URL("/token", serverUrl);
  }

  // Exchange code for tokens
  const params = new URLSearchParams({
    grant_type: grantType,
    client_id: clientInformation.client_id,
    code: authorizationCode,
    code_verifier: codeVerifier,
  });

  if (clientInformation.client_secret) {
    params.set("client_secret", clientInformation.client_secret);
  }

  const response = await fetch(tokenUrl, {
    method: "POST",
    headers: {
      "Content-Type": "application/x-www-form-urlencoded",
    },
    body: params,
  });

  if (!response.ok) {
    throw new Error(`Token exchange failed: HTTP ${response.status}`);
  }

  return OAuthTokensSchema.parse(await response.json());
}

/**
 * Exchange a refresh token for an updated access token.
 */
export async function refreshAuthorization(
  serverUrl: string | URL,
  {
    metadata,
    clientInformation,
    refreshToken,
  }: {
    metadata?: OAuthMetadata;
    clientInformation: OAuthClientInformation;
    refreshToken: string;
  },
): Promise<OAuthTokens> {
  const grantType = "refresh_token";

  let tokenUrl: URL;
  if (metadata) {
    tokenUrl = new URL(metadata.token_endpoint);

    if (
      metadata.grant_types_supported &&
      !metadata.grant_types_supported.includes(grantType)
    ) {
      throw new Error(
        `Incompatible auth server: does not support grant type ${grantType}`,
      );
    }
  } else {
    tokenUrl = new URL("/token", serverUrl);
  }

  // Exchange refresh token
  const params = new URLSearchParams({
    grant_type: grantType,
    client_id: clientInformation.client_id,
    refresh_token: refreshToken,
  });

  if (clientInformation.client_secret) {
    params.set("client_secret", clientInformation.client_secret);
  }

  const response = await fetch(tokenUrl, {
    method: "POST",
    headers: {
      "Content-Type": "application/x-www-form-urlencoded",
    },
    body: params,
  });

  if (!response.ok) {
    throw new Error(`Token refresh failed: HTTP ${response.status}`);
  }

  return OAuthTokensSchema.parse(await response.json());
}

/**
 * Performs OAuth 2.0 Dynamic Client Registration according to RFC 7591.
 * 
 * @param serverUrl - The base URL of the authorization server
 * @param options - Registration options
 * @param options.metadata - OAuth server metadata containing the registration endpoint
 * @param options.clientMetadata - Client metadata for registration
 * @returns The registered client information
 * @throws Error if the server doesn't support dynamic registration or if registration fails
 */
export async function registerClient(
  serverUrl: string | URL,
  {
    metadata,
    clientMetadata,
  }: {
    metadata?: OAuthMetadata;
    clientMetadata: OAuthClientMetadata;
  },
): Promise<OAuthClientInformation> {
  let registrationUrl: URL;

  if (metadata) {
    if (!metadata.registration_endpoint) {
      throw new Error("Incompatible auth server: does not support dynamic client registration");
    }

    registrationUrl = new URL(metadata.registration_endpoint);
  } else {
    registrationUrl = new URL("/register", serverUrl);
  }

  const response = await fetch(registrationUrl, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify(clientMetadata),
  });

  if (!response.ok) {
    throw new Error(`Dynamic client registration failed: HTTP ${response.status}`);
  }

  return OAuthClientInformationSchema.parse(await response.json());
}