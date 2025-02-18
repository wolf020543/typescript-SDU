import { z } from "zod";
import express, { RequestHandler } from "express";
import { OAuthServerProvider } from "../provider.js";
import cors from "cors";
import { verifyChallenge } from "pkce-challenge";
import { authenticateClient } from "../middleware/clientAuth.js";
import { rateLimit, Options as RateLimitOptions } from "express-rate-limit";
import { allowedMethods } from "../middleware/allowedMethods.js";

export type TokenHandlerOptions = {
  provider: OAuthServerProvider;
  /**
   * Rate limiting configuration for the token endpoint.
   * Set to false to disable rate limiting for this endpoint.
   */
  rateLimit?: Partial<RateLimitOptions> | false;
};

const TokenRequestSchema = z.object({
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

export function tokenHandler({ provider, rateLimit: rateLimitConfig }: TokenHandlerOptions): RequestHandler {
  // Nested router so we can configure middleware and restrict HTTP method
  const router = express.Router();

  // Configure CORS to allow any origin, to make accessible to web-based MCP clients
  router.use(cors());

  router.use(allowedMethods(["POST"]));
  router.use(express.urlencoded({ extended: false }));

  // Apply rate limiting unless explicitly disabled
  if (rateLimitConfig !== false) {
    router.use(rateLimit({
      windowMs: 15 * 60 * 1000, // 15 minutes
      max: 50, // 50 requests per windowMs 
      standardHeaders: true,
      legacyHeaders: false,
      message: {
        error: 'too_many_requests',
        error_description: 'You have exceeded the rate limit for token requests'
      },
      ...rateLimitConfig
    }));
  }

  // Authenticate and extract client details
  router.use(authenticateClient({ clientsStore: provider.clientsStore }));

  router.post("/", async (req, res) => {
    let grant_type;
    try {
      ({ grant_type } = TokenRequestSchema.parse(req.body));
    } catch (error) {
      res.status(400).json({
        error: "invalid_request",
        error_description: String(error),
      });
      return;
    }

    const client = req.client;
    if (!client) {
      console.error("Missing client information after authentication");
      res.status(500).end("Internal Server Error");
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

        const codeChallenge = await provider.challengeForAuthorizationCode(client, grant.code);
        if (!(await verifyChallenge(grant.code_verifier, codeChallenge))) {
          res.status(400).json({
            error: "invalid_request",
            error_description: "code_verifier does not match the challenge",
          });

          return;
        }

        const tokens = await provider.exchangeAuthorizationCode(client, grant.code);
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
        const tokens = await provider.exchangeRefreshToken(client, grant.refresh_token, scopes);
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