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

export type OAuthMetadata = z.infer<typeof OAuthMetadataSchema>;
export type OAuthTokens = z.infer<typeof OAuthTokensSchema>;

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
    redirectUrl,
  }: { metadata: OAuthMetadata; redirectUrl: string | URL },
): Promise<{ authorizationUrl: URL; codeVerifier: string }> {
  const responseType = "code";
  const codeChallengeMethod = "S256";

  let authorizationUrl: URL;
  if (metadata) {
    authorizationUrl = new URL(metadata.authorization_endpoint);

    if (!(responseType in metadata.response_types_supported)) {
      throw new Error(
        `Incompatible auth server: does not support response type ${responseType}`,
      );
    }

    if (
      !metadata.code_challenge_methods_supported ||
      !(codeChallengeMethod in metadata.code_challenge_methods_supported)
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
    authorizationCode,
    codeVerifier,
    redirectUrl,
  }: {
    metadata: OAuthMetadata;
    authorizationCode: string;
    codeVerifier: string;
    redirectUrl: string | URL;
  },
): Promise<OAuthTokens> {
  const grantType = "authorization_code";

  let tokenUrl: URL;
  if (metadata) {
    tokenUrl = new URL(metadata.token_endpoint);

    if (
      metadata.grant_types_supported &&
      !(grantType in metadata.grant_types_supported)
    ) {
      throw new Error(
        `Incompatible auth server: does not support grant type ${grantType}`,
      );
    }
  } else {
    tokenUrl = new URL("/token", serverUrl);
  }

  // Exchange code for tokens
  const response = await fetch(tokenUrl, {
    method: "POST",
    headers: {
      "Content-Type": "application/x-www-form-urlencoded",
    },
    body: new URLSearchParams({
      grant_type: grantType,
      code: authorizationCode,
      code_verifier: codeVerifier,
      redirect_uri: String(redirectUrl),
    }),
  });

  if (!response.ok) {
    throw new Error(`Token exchange failed: HTTP ${response.status}`);
  }

  return OAuthTokensSchema.parse(await response.json());
}
