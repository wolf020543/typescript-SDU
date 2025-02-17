import { Request, Response } from "express";
import { OAuthClientInformationFull, OAuthClientMetadataSchema, OAuthClientRegistrationError } from "../../../shared/auth.js";
import crypto from 'node:crypto';
import bodyParser from 'body-parser';

async function handler(requestBody: unknown): Promise<OAuthClientInformationFull | OAuthClientRegistrationError> {
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

  const clientInfo: OAuthClientInformationFull = {
    ...clientMetadata,
    client_id: clientId,
    client_secret: clientSecret,
    client_id_issued_at: clientIdIssuedAt,
    client_secret_expires_at: 0 // Set to 0 for non-expiring secret
  };

  // TODO: Store client information securely

  return clientInfo;
}

export const clientRegistrationHandler = (req: Request, res: Response) => bodyParser.json()(req, res, (err) => {
  if (err === undefined) {
    handler(req.body).then((result) => {
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