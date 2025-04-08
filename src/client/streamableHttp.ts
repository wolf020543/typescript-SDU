import { Transport } from "../shared/transport.js";
import { JSONRPCMessage, JSONRPCMessageSchema } from "../types.js";
import { auth, AuthResult, OAuthClientProvider, UnauthorizedError } from "./auth.js";
import { type ErrorEvent } from "eventsource";
import { EventSourceParserStream } from 'eventsource-parser/stream';
export class StreamableHTTPError extends Error {
  constructor(
    public readonly code: number | undefined,
    message: string | undefined,
    public readonly event: ErrorEvent,
  ) {
    super(`Streamable HTTP error: ${message}`);
  }
}

/**
 * Configuration options for the `StreamableHTTPClientTransport`.
 */
export type StreamableHTTPClientTransportOptions = {
  /**
   * An OAuth client provider to use for authentication.
   * 
   * When an `authProvider` is specified and the connection is started:
   * 1. The connection is attempted with any existing access token from the `authProvider`.
   * 2. If the access token has expired, the `authProvider` is used to refresh the token.
   * 3. If token refresh fails or no access token exists, and auth is required, `OAuthClientProvider.redirectToAuthorization` is called, and an `UnauthorizedError` will be thrown from `connect`/`start`.
   * 
   * After the user has finished authorizing via their user agent, and is redirected back to the MCP client application, call `StreamableHTTPClientTransport.finishAuth` with the authorization code before retrying the connection.
   * 
   * If an `authProvider` is not provided, and auth is required, an `UnauthorizedError` will be thrown.
   * 
   * `UnauthorizedError` might also be thrown when sending any message over the transport, indicating that the session has expired, and needs to be re-authed and reconnected.
   */
  authProvider?: OAuthClientProvider;

  /**
   * Customizes HTTP requests to the server.
   */
  requestInit?: RequestInit;
};

/**
 * Client transport for Streamable HTTP: this implements the MCP Streamable HTTP transport specification.
 * It will connect to a server using HTTP POST for sending messages and HTTP GET with Server-Sent Events
 * for receiving messages.
 */
export class StreamableHTTPClientTransport implements Transport {
  private _activeStreams: Map<string, ReadableStreamDefaultReader<any>> = new Map();
  private _abortController?: AbortController;
  private _url: URL;
  private _requestInit?: RequestInit;
  private _authProvider?: OAuthClientProvider;
  private _sessionId?: string;
  private _lastEventId?: string;

  onclose?: () => void;
  onerror?: (error: Error) => void;
  onmessage?: (message: JSONRPCMessage) => void;

  constructor(
    url: URL,
    opts?: StreamableHTTPClientTransportOptions,
  ) {
    this._url = url;
    this._requestInit = opts?.requestInit;
    this._authProvider = opts?.authProvider;
  }

  private async _authThenStart(): Promise<void> {
    if (!this._authProvider) {
      throw new UnauthorizedError("No auth provider");
    }

    let result: AuthResult;
    try {
      result = await auth(this._authProvider, { serverUrl: this._url });
    } catch (error) {
      this.onerror?.(error as Error);
      throw error;
    }

    if (result !== "AUTHORIZED") {
      throw new UnauthorizedError();
    }

    return await this._startOrAuth();
  }

  private async _commonHeaders(): Promise<HeadersInit> {
    const headers: HeadersInit = {};
    if (this._authProvider) {
      const tokens = await this._authProvider.tokens();
      if (tokens) {
        headers["Authorization"] = `Bearer ${tokens.access_token}`;
      }
    }

    if (this._sessionId) {
      headers["mcp-session-id"] = this._sessionId;
    }

    return headers;
  }

  private async _startOrAuth(): Promise<void> {
    try {
      // Try to open an initial SSE stream with GET to listen for server messages
      // This is optional according to the spec - server may not support it
      const commonHeaders = await this._commonHeaders();
      const headers = new Headers(commonHeaders);
      headers.set('Accept', 'text/event-stream');

      // Include Last-Event-ID header for resumable streams
      if (this._lastEventId) {
        headers.set('last-event-id', this._lastEventId);
      }

      const response = await fetch(this._url, {
        method: 'GET',
        headers,
        signal: this._abortController?.signal,
      });

      if (response.status === 405 || response.status === 404) {
        // Server doesn't support GET for SSE, which is allowed by the spec
        // We'll rely on SSE responses to POST requests for communication
        return;
      }

      if (!response.ok) {
        if (response.status === 401 && this._authProvider) {
          // Need to authenticate
          return await this._authThenStart();
        }

        const error = new Error(`Failed to open SSE stream: ${response.status} ${response.statusText}`);
        this.onerror?.(error);
        throw error;
      }

      // Successful connection, handle the SSE stream as a standalone listener
      const streamId = `initial-${Date.now()}`;
      this._handleSseStream(response.body, streamId);
    } catch (error) {
      this.onerror?.(error as Error);
      throw error;
    }
  }

  async start() {
    if (this._activeStreams.size > 0) {
      throw new Error(
        "StreamableHTTPClientTransport already started! If using Client class, note that connect() calls start() automatically.",
      );
    }

    this._abortController = new AbortController();
    return await this._startOrAuth();
  }

  /**
   * Call this method after the user has finished authorizing via their user agent and is redirected back to the MCP client application. This will exchange the authorization code for an access token, enabling the next connection attempt to successfully auth.
   */
  async finishAuth(authorizationCode: string): Promise<void> {
    if (!this._authProvider) {
      throw new UnauthorizedError("No auth provider");
    }

    const result = await auth(this._authProvider, { serverUrl: this._url, authorizationCode });
    if (result !== "AUTHORIZED") {
      throw new UnauthorizedError("Failed to authorize");
    }
  }

  async close(): Promise<void> {
    // Close all active streams
    for (const reader of this._activeStreams.values()) {
      try {
        reader.cancel();
      } catch (error) {
        this.onerror?.(error as Error);
      }
    }
    this._activeStreams.clear();

    // Abort any pending requests
    this._abortController?.abort();

    this.onclose?.();
  }

  async send(message: JSONRPCMessage | JSONRPCMessage[]): Promise<void> {
    try {
      const commonHeaders = await this._commonHeaders();
      const headers = new Headers({ ...commonHeaders, ...this._requestInit?.headers });
      headers.set("content-type", "application/json");
      headers.set("accept", "application/json, text/event-stream");

      const init = {
        ...this._requestInit,
        method: "POST",
        headers,
        body: JSON.stringify(message),
        signal: this._abortController?.signal,
      };

      const response = await fetch(this._url, init);

      // Handle session ID received during initialization
      const sessionId = response.headers.get("mcp-session-id");
      if (sessionId) {
        this._sessionId = sessionId;
      }

      if (!response.ok) {
        if (response.status === 401 && this._authProvider) {
          const result = await auth(this._authProvider, { serverUrl: this._url });
          if (result !== "AUTHORIZED") {
            throw new UnauthorizedError();
          }

          // Purposely _not_ awaited, so we don't call onerror twice
          return this.send(message);
        }

        const text = await response.text().catch(() => null);
        throw new Error(
          `Error POSTing to endpoint (HTTP ${response.status}): ${text}`,
        );
      }

      // If the response is 202 Accepted, there's no body to process
      if (response.status === 202) {
        return;
      }

      // Get original message(s) for detecting request IDs
      const messages = Array.isArray(message) ? message : [message];

      // Extract IDs from request messages for tracking responses
      const requestIds = messages.filter(msg => 'method' in msg && 'id' in msg)
        .map(msg => 'id' in msg ? msg.id : undefined)
        .filter(id => id !== undefined);

      // If we have request IDs and an SSE response, create a unique stream ID
      const hasRequests = requestIds.length > 0;

      // Check the response type
      const contentType = response.headers.get("content-type");

      if (hasRequests) {
        if (contentType?.includes("text/event-stream")) {
          // For streaming responses, create a unique stream ID based on request IDs
          const streamId = `req-${requestIds.join('-')}-${Date.now()}`;
          this._handleSseStream(response.body, streamId);
        } else if (contentType?.includes("application/json")) {
          // For non-streaming servers, we might get direct JSON responses
          const data = await response.json();
          const responseMessages = Array.isArray(data)
            ? data.map(msg => JSONRPCMessageSchema.parse(msg))
            : [JSONRPCMessageSchema.parse(data)];

          for (const msg of responseMessages) {
            this.onmessage?.(msg);
          }
        }
      }
    } catch (error) {
      this.onerror?.(error as Error);
      throw error;
    }
  }

  private _handleSseStream(stream: ReadableStream<Uint8Array> | null, streamId: string): void {
    if (!stream) {
      return;
    }

    // Create a pipeline: binary stream -> text decoder -> SSE parser
    const eventStream = stream
      .pipeThrough(new TextDecoderStream())
      .pipeThrough(new EventSourceParserStream());

    const reader = eventStream.getReader();
    this._activeStreams.set(streamId, reader);

    const processStream = async () => {
      try {
        while (true) {
          const { done, value: event } = await reader.read();
          if (done) {
            this._activeStreams.delete(streamId);
            break;
          }

          // Update last event ID if provided
          if (event.id) {
            this._lastEventId = event.id;
          }

          // Handle message events (default event type is undefined per docs)
          // or explicit 'message' event type
          if (!event.event || event.event === 'message') {
            try {
              const message = JSONRPCMessageSchema.parse(JSON.parse(event.data));
              this.onmessage?.(message);
            } catch (error) {
              this.onerror?.(error as Error);
            }
          }
        }
      } catch (error) {
        this._activeStreams.delete(streamId);
        this.onerror?.(error as Error);
      }
    };

    processStream();
  }
}