import { Request, Response } from "express";
import { OAuthClientInformationFull, OAuthClientMetadataSchema, OAuthClientRegistrationError } from "../../../shared/auth.js";
import crypto from 'node:crypto';
import bodyParser from 'body-parser';
import { OAuthRegisteredClientsStore } from "../clients.js";

export type ClientRegistrationHandlerOptions = {
  /**
   * A store used to save information about dynamically registered OAuth clients.
   */
  store: OAuthRegisteredClientsStore;

  /**
   * The number of seconds after which to expire issued client secrets, or 0 to prevent expiration of client secrets (not recommended).
   * 
   * If not set, defaults to 30 days.
   */
  clientSecretExpirySeconds?: number;
};

const DEFAULT_CLIENT_SECRET_EXPIRY_SECONDS = 30 * 24 * 60 * 60; // 30 days

export function clientRegistrationHandler({ store, clientSecretExpirySeconds = DEFAULT_CLIENT_SECRET_EXPIRY_SECONDS }: ClientRegistrationHandlerOptions) {
  if (!store.registerClient) {
    throw new Error("Client registration store does not support registering clients");
  }

  async function register(requestBody: unknown): Promise<OAuthClientInformationFull | OAuthClientRegistrationError> {
    let clientMetadata;
    try {
      clientMetadata = OAuthClientMetadataSchema.parse(requestBody);
    } catch (error) {
      return { error: "invalid_client_metadata", error_description: String(error) };
    }

    // Implement RFC 7591 dynamic client registration
    const clientId = crypto.randomUUID();
    const clientSecret = clientMetadata.token_endpoint_auth_method !== 'none'
      ? crypto.randomBytes(32).toString('hex')
      : undefined;
    const clientIdIssuedAt = Math.floor(Date.now() / 1000);

    let clientInfo: OAuthClientInformationFull = {
      ...clientMetadata,
      client_id: clientId,
      client_secret: clientSecret,
      client_id_issued_at: clientIdIssuedAt,
      client_secret_expires_at: clientSecretExpirySeconds > 0 ? clientIdIssuedAt + clientSecretExpirySeconds : 0
    };

    clientInfo = await store.registerClient!(clientInfo);
    return clientInfo;
  }

  // Actual request handler
  return (req: Request, res: Response) => bodyParser.json()(req, res, (err) => {
    if (err === undefined) {
      register(req.body).then((result) => {
        if ("error" in result) {
          res.status(400).json(result);
        } else {
          res.status(201).json(result);
        }
      }, (error) => {
        console.error("Uncaught error in client registration handler:", error);
        res.status(500).end("Internal Server Error");
      });
    }
  });
}