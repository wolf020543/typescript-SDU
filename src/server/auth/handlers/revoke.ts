import { OAuthServerProvider } from "../provider.js";
import express, { RequestHandler } from "express";
import cors from "cors";
import { authenticateClient } from "../middleware/clientAuth.js";
import { OAuthTokenRevocationRequestSchema } from "../../../shared/auth.js";

export type RevocationHandlerOptions = {
  provider: OAuthServerProvider;
};

export function revocationHandler({ provider }: RevocationHandlerOptions): RequestHandler {
  if (!provider.revokeToken) {
    throw new Error("Auth provider does not support revoking tokens");
  }

  // Nested router so we can configure middleware and restrict HTTP method
  const router = express.Router();
  router.use(express.urlencoded({ extended: false }));

  // Configure CORS to allow any origin, to make accessible to web-based MCP clients
  router.use(cors());

  // Authenticate and extract client details
  router.use(authenticateClient({ clientsStore: provider.clientsStore }));

  router.post("/", async (req, res) => {
    let revocationRequest;
    try {
      revocationRequest = OAuthTokenRevocationRequestSchema.parse(req.body);
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

    await provider.revokeToken!(client, revocationRequest);
  });

  return router;
}
