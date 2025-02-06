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

export type OAuthMetadata = z.infer<typeof OAuthMetadataSchema>;

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

export async function startAuthorization(
  serverUrl: string | URL,
  {
    metadata,
    redirectUrl,
  }: { metadata: OAuthMetadata; redirectUrl: string | URL },
): Promise<{ authorizationUrl: URL; codeVerifier: string }> {
  // Generate PKCE challenge
  const challenge = await pkceChallenge();
  const codeVerifier = challenge.code_verifier;
  const codeChallenge = challenge.code_challenge;

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

  authorizationUrl.searchParams.set("response_type", responseType);
  authorizationUrl.searchParams.set("code_challenge", codeChallenge);
  authorizationUrl.searchParams.set(
    "code_challenge_method",
    codeChallengeMethod,
  );
  authorizationUrl.searchParams.set("redirect_uri", String(redirectUrl));

  return { authorizationUrl, codeVerifier };
}
