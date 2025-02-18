import { z } from "zod";
import { RequestHandler } from "express";
import { OAuthRegisteredClientsStore } from "../clients.js";
import { OAuthClientInformationFull } from "../../../shared/auth.js";
import { InvalidRequestError, InvalidClientError } from "../errors.js";

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
    try {
      let client_id, client_secret;
      try {
        const result = ClientAuthenticatedRequestSchema.parse(req.body);
        client_id = result.client_id;
        client_secret = result.client_secret;
      } catch (error) {
        throw new InvalidRequestError(String(error));
      }

      const client = await clientsStore.getClient(client_id);
      if (!client) {
        throw new InvalidClientError("Invalid client_id");
      }

      if (client.client_secret !== client_secret) {
        throw new InvalidClientError("Invalid client_secret");
      }

      req.client = client;
      next();
    } catch (error) {
      if (error instanceof InvalidRequestError || error instanceof InvalidClientError) {
        res.status(400).json(error.toResponseObject());
      } else {
        console.error("Unexpected error authenticating client:", error);
        res.status(500).end("Internal Server Error");
      }
    }
  }
}