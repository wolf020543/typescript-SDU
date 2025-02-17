import { Response } from "express";
import { OAuthRegisteredClientsStore } from "./clients.js";
import { OAuthClientInformationFull } from "../../shared/auth.js";

export type AuthorizationParams = {
  client: OAuthClientInformationFull;
  state?: string;
  scopes?: string[];
  codeChallenge: string;
  redirectUri: string;
};

/**
 * Implements an end-to-end OAuth server.
 */
export interface OAuthServerProvider {
  /**
   * A store used to read information about registered OAuth clients.
   */
  get clientsStore(): OAuthRegisteredClientsStore;

  /**
   * Begins the authorization flow, which can either be implemented by this server itself or via redirection to a separate authorization server. 
   * 
   * An authorization code can be generated using the `generateToken` function.
   * 
   * This server must eventually issue a redirect with an authorization response or an error response to the given redirect URI. Per OAuth 2.1:
   * - In the successful case, the redirect MUST include the `code` and `state` (if present) query parameters.
   * - In the error case, the redirect MUST include the `error` query parameter, and MAY include an optional `error_description` query parameter.
   */
  authorize(params: AuthorizationParams, res: Response): Promise<void>;

  /**
   * Returns the `codeChallenge` that was used when the indicated authorization began.
   */
  challengeForAuthorizationCode(authorizationCode: string): Promise<string>;
}