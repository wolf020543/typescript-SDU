import { RequestHandler } from "express";
import { z } from "zod";
import { isValidUrl } from "../validation.js";
import { OAuthServerProvider } from "../provider.js";

export type AuthorizationHandlerOptions = {
  provider: OAuthServerProvider;
};

// Parameters that must be validated in order to issue redirects.
const ClientAuthorizationParamsSchema = z.object({
  client_id: z.string(),
  redirect_uri: z.string().optional().refine((value) => value === undefined || isValidUrl(value), { message: "redirect_uri must be a valid URL" }),
});

// Parameters that must be validated for a successful authorization request. Failure can be reported to the redirect URI.
const RequestAuthorizationParamsSchema = z.object({
  response_type: z.literal("code"),
  code_challenge: z.string(),
  code_challenge_method: z.literal("S256"),
  scope: z.string().optional(),
  state: z.string().optional(),
});

export function authorizationHandler({ provider }: AuthorizationHandlerOptions): RequestHandler {
  return async (req, res) => {
    if (req.method !== "GET" && req.method !== "POST") {
      res.status(405).end("Method Not Allowed");
      return;
    }

    let client_id, redirect_uri;
    try {
      ({ client_id, redirect_uri } = ClientAuthorizationParamsSchema.parse(req.query));
    } catch (error) {
      res.status(400).end(`Bad Request: ${error}`);
      return;
    }

    const client = await provider.clientsStore.getClient(client_id);
    if (!client) {
      res.status(400).end("Bad Request: invalid client_id");
      return;
    }

    if (redirect_uri !== undefined) {
      if (!client.redirect_uris.includes(redirect_uri)) {
        res.status(400).end("Bad Request: unregistered redirect_uri");
        return;
      }
    } else if (client.redirect_uris.length === 1) {
      redirect_uri = client.redirect_uris[0];
    } else {
      res.status(400).end("Bad Request: missing redirect_uri");
      return;
    }

    let params;
    try {
      params = RequestAuthorizationParamsSchema.parse(req.query);
    } catch (error) {
      const errorUrl = new URL(redirect_uri);
      errorUrl.searchParams.set("error", "invalid_request");
      errorUrl.searchParams.set("error_description", String(error));
      res.redirect(302, errorUrl.href);
      return;
    }

    let requestedScopes: string[] = [];
    if (params.scope !== undefined && client.scope !== undefined) {
      requestedScopes = params.scope.split(" ");
      const allowedScopes = new Set(client.scope.split(" "));

      // If any requested scope is not in the client's registered scopes, error out
      for (const scope of requestedScopes) {
        if (!allowedScopes.has(scope)) {
          const errorUrl = new URL(redirect_uri);
          errorUrl.searchParams.set("error", "invalid_scope");
          errorUrl.searchParams.set("error_description", `Client was not registered with scope ${scope}`);
          res.redirect(302, errorUrl.href);
          return;
        }
      }
    }

    await provider.authorize(client, {
      state: params.state,
      scopes: requestedScopes,
      redirectUri: redirect_uri,
      codeChallenge: params.code_challenge,
    }, res);
  };
}