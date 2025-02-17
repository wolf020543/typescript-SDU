import { z } from "zod";
import express, { RequestHandler } from "express";
import { OAuthServerProvider } from "../provider.js";
import cors from "cors";
import { verifyChallenge } from "pkce-challenge";

export type TokenHandlerOptions = {
  provider: OAuthServerProvider;
};

const TokenRequestSchema = z.object({
  client_id: z.string(),
  client_secret: z.string().optional(),
  grant_type: z.string(),
});

const AuthorizationCodeGrantSchema = z.object({
  code: z.string(),
  code_verifier: z.string(),
});

const RefreshTokenGrantSchema = z.object({
  refresh_token: z.string(),
  scope: z.string().optional(),
});

export function tokenHandler({ provider }: TokenHandlerOptions): RequestHandler {
  // Nested router so we can configure middleware and restrict HTTP method
  const router = express.Router();
  router.use(express.urlencoded({ extended: false }));

  // Configure CORS to allow any origin, to make accessible to web-based MCP clients
  router.use(cors());

  router.post("/", async (req, res) => {
    let client_id, client_secret, grant_type;
    try {
      ({ client_id, client_secret, grant_type } = TokenRequestSchema.parse(req.body));
    } catch (error) {
      res.status(400).json({
        error: "invalid_request",
        error_description: String(error),
      });
      return;
    }

    const client = await provider.clientsStore.getClient(client_id);
    if (!client) {
      // TODO: Return 401 with WWW-Authenticate if Authorization header was used
      res.status(400).json({
        error: "invalid_client",
        error_description: "Invalid client_id",
      });
      return;
    }

    if (client.client_secret !== client_secret) {
      res.status(400).json({
        error: "invalid_client",
        error_description: "Invalid client_secret",
      });
      return;
    }

    switch (grant_type) {
      case "authorization_code": {
        let grant;
        try {
          grant = AuthorizationCodeGrantSchema.parse(req.body);
        } catch (error) {
          res.status(400).json({
            error: "invalid_request",
            error_description: String(error),
          });
          return;
        }

        const codeChallenge = await provider.challengeForAuthorizationCode(grant.code);
        if (!(await verifyChallenge(grant.code_verifier, codeChallenge))) {
          res.status(400).json({
            error: "invalid_request",
            error_description: "code_verifier does not match the challenge",
          });

          return;
        }

        const tokens = await provider.exchangeAuthorizationCode(grant.code);
        res.status(200).json(tokens);
        break;
      }

      case "refresh_token": {
        let grant;
        try {
          grant = RefreshTokenGrantSchema.parse(req.body);
        } catch (error) {
          res.status(400).json({
            error: "invalid_request",
            error_description: String(error),
          });
          return;
        }

        const scopes = grant.scope ? grant.scope.split(" ") : undefined;
        const tokens = await provider.exchangeRefreshToken(grant.refresh_token, scopes);
        res.status(200).json(tokens);
        break;
      }

      // Not supported right now
      //case "client_credentials":

      default:
        res.status(400).json({
          error: "unsupported_grant_type",
          error_description: "The grant type is not supported by this authorization server.",
        });
        return;
    }
  });

  return router;
}