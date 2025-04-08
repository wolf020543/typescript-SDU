import { Transport } from "../shared/transport.js";
import { JSONRPCMessage, JSONRPCMessageSchema } from "../types.js";
import { auth, AuthResult, OAuthClientProvider, UnauthorizedError } from "./auth.js";
import { EventSource, type ErrorEvent, type EventSourceInit } from "eventsource";

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
   * Customizes the initial SSE request to the server (the request that begins the stream).
   */
  eventSourceInit?: EventSourceInit;

  /**
   * Customizes recurring POST requests to the server.
   */
  requestInit?: RequestInit;
};

/**
 * Client transport for Streamable HTTP: this implements the MCP Streamable HTTP transport specification.
 * It will connect to a server using HTTP POST for sending messages and HTTP GET with Server-Sent Events
 * for receiving messages.
 */
export class StreamableHTTPClientTransport implements Transport {
  private _eventSource?: EventSource;
  private _abortController?: AbortController;
  private _url: URL;
  private _eventSourceInit?: EventSourceInit;
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
    this._eventSourceInit = opts?.eventSourceInit;
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

  private _startOrAuth(): Promise<void> {
    return new Promise((resolve, reject) => {
      // Try to open an SSE stream with GET to listen for server messages
      // This is optional according to the spec - server may not support it

      const headers: HeadersInit = {
        'Accept': 'text/event-stream'
      };

      // Include Last-Event-ID header for resumable streams
      if (this._lastEventId) {
        headers['last-event-id'] = this._lastEventId;
      }

      fetch(this._url, {
        method: 'GET',
        headers
      }).then(response => {
        if (response.status === 405) {
          // Server doesn't support GET for SSE, which is allowed by the spec
          // We'll rely on SSE responses to POST requests for communication
          resolve();
          return;
        }

        if (!response.ok) {
          if (response.status === 401 && this._authProvider) {
            // Need to authenticate
            this._authThenStart().then(resolve, reject);
            return;
          }

          const error = new Error(`Failed to open SSE stream: ${response.status} ${response.statusText}`);
          reject(error);
          this.onerror?.(error);
          return;
        }

        // Successful connection, handle the SSE stream
        this._handleSseStream(response.body);
        resolve();
      }).catch(error => {
        reject(error);
        this.onerror?.(error);
      });
    });
  }

  async start() {
    if (this._eventSource) {
      throw new Error(
        "StreamableHTTPClientTransport already started! If using Client class, note that connect() calls start() automatically.",
      );
    }

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
    this._abortController?.abort();
    this._eventSource?.close();

    // If we have a session ID, send a DELETE request to explicitly terminate the session
    if (this._sessionId) {
      try {
        const commonHeaders = await this._commonHeaders();
        const response = await fetch(this._url, {
          method: "DELETE",
          headers: commonHeaders,
          signal: this._abortController?.signal,
        });

        if (!response.ok) {
          // Server might respond with 405 if it doesn't support explicit session termination
          // We don't throw an error in that case
          if (response.status !== 405) {
            const text = await response.text().catch(() => null);
            throw new Error(`Error terminating session (HTTP ${response.status}): ${text}`);
          }
        }
      } catch (error) {
        // We still want to invoke onclose even if the session termination fails
        this.onerror?.(error as Error);
      }
    }

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

      // Determine if the message contains any requests
      const containsRequests = Array.isArray(message)
        ? message.some(msg => 'method' in msg && 'id' in msg)
        : ('method' in message && 'id' in message);

      if (containsRequests) {
        // Check if we got text/event-stream in response - if so, handle SSE stream
        const contentType = response.headers.get("content-type");
        if (contentType?.includes("text/event-stream")) {
          // Handle SSE stream to receive responses
          this._handleSseStream(response.body);
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

  private _handleSseStream(stream: ReadableStream<Uint8Array> | null): void {
    if (!stream) {
      return;
    }

    // Set up stream handling for server-sent events
    const reader = stream.getReader();
    const decoder = new TextDecoder();
    let buffer = '';

    const processStream = async () => {
      try {
        while (true) {
          const { done, value } = await reader.read();
          if (done) break;

          buffer += decoder.decode(value, { stream: true });

          // Process SSE messages in the buffer
          const events = buffer.split('\n\n');
          buffer = events.pop() || '';

          for (const event of events) {
            const lines = event.split('\n');
            let id: string | undefined;
            let eventType: string | undefined;
            let data: string | undefined;

            // Parse SSE message according to the format
            for (const line of lines) {
              if (line.startsWith('id:')) {
                id = line.slice(3).trim();
              } else if (line.startsWith('event:')) {
                eventType = line.slice(6).trim();
              } else if (line.startsWith('data:')) {
                data = line.slice(5).trim();
              }
            }

            // Update last event ID if provided by server
            if (id) {
              this._lastEventId = id;
            }

            // Handle message event
            if (eventType === 'message' && data) {
              try {
                const message = JSONRPCMessageSchema.parse(JSON.parse(data));
                this.onmessage?.(message);
              } catch (error) {
                this.onerror?.(error as Error);
              }
            }
          }
        }
      } catch (error) {
        this.onerror?.(error as Error);
      }
    };

    processStream();
  }
}