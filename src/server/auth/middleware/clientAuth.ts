import { z } from "zod";
import { RequestHandler } from "express";
import { OAuthRegisteredClientsStore } from "../clients.js";
import { OAuthClientInformationFull } from "../../../shared/auth.js";

export type ClientAuthenticationMiddlewareOptions = {
  /**
   * A store used to read information about registered OAuth clients.
   */
  clientsStore: OAuthRegisteredClientsStore;
}

const ClientAuthenticatedRequestSchema = z.object({
  client_id: z.string(),
  client_secret: z.string().optional(),
});

declare module "express-serve-static-core" {
  interface Request {
    /**
     * The authenticated client for this request, if the `authenticateClient` middleware was used.
     */
    client?: OAuthClientInformationFull;
  }
}

export function authenticateClient({ clientsStore }: ClientAuthenticationMiddlewareOptions): RequestHandler {
  return async (req, res, next) => {
    let client_id, client_secret;
    try {
      const result = ClientAuthenticatedRequestSchema.parse(req.body);
      client_id = result.client_id;
      client_secret = result.client_secret;
    } catch (error) {
      res.status(400).json({
        error: "invalid_request",
        error_description: String(error),
      });
      return;
    }

    const client = await clientsStore.getClient(client_id);
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

    req.client = client;
    next();
  }
}