import { SSEClientTransport } from "./sse.js";
import { createServer, type Server } from "http";
import { JSONRPCMessage } from "../types.js";
import { AddressInfo } from "net";

describe("SSEClientTransport", () => {
  let server: Server;
  let transport: SSEClientTransport;
  let baseUrl: URL;

  beforeEach((done) => {
    // Create a test server that will receive the EventSource connection
    server = createServer((req, res) => {
      // Store the received headers for verification
      (server as any).lastRequest = req;

      // Send SSE headers
      res.writeHead(200, {
        "Content-Type": "text/event-stream",
        "Cache-Control": "no-cache",
        "Connection": "keep-alive"
      });

      // Send the endpoint event
      res.write("event: endpoint\n");
      res.write(`data: ${baseUrl.href}\n\n`);
    });

    // Start server on random port
    server.listen(0, "127.0.0.1", () => {
      const addr = server.address() as AddressInfo;
      baseUrl = new URL(`http://127.0.0.1:${addr.port}`);
      done();
    });
  });

  afterEach((done) => {
    transport?.close().then(() => {
      server.close(done);
    });
  });

  it("uses custom fetch implementation from EventSourceInit to add auth headers", async () => {
    const authToken = "Bearer test-token";

    // Create a fetch wrapper that adds auth header
    const fetchWithAuth = (url: string | URL, init?: RequestInit) => {
      const headers = new Headers(init?.headers);
      headers.set("Authorization", authToken);
      return fetch(url.toString(), { ...init, headers });
    };

    transport = new SSEClientTransport(baseUrl, {
      eventSourceInit: {
        fetch: fetchWithAuth
      }
    });

    await transport.start();

    // Verify the auth header was received by the server
    const headers = (server as any).lastRequest.headers;
    expect(headers.authorization).toBe(authToken);
  });

  it("passes custom headers to fetch requests", async () => {
    const customHeaders = {
      Authorization: "Bearer test-token",
      "X-Custom-Header": "custom-value"
    };

    transport = new SSEClientTransport(baseUrl, {
      requestInit: {
        headers: customHeaders
      }
    });

    await transport.start();

    // Mock fetch for the message sending test
    global.fetch = jest.fn().mockResolvedValue({
      ok: true
    });

    const message: JSONRPCMessage = {
      jsonrpc: "2.0",
      id: "1",
      method: "test",
      params: {}
    };

    await transport.send(message);

    // Verify fetch was called with correct headers
    expect(global.fetch).toHaveBeenCalledWith(
      expect.any(URL),
      expect.objectContaining({
        headers: expect.any(Headers)
      })
    );

    const calledHeaders = (global.fetch as jest.Mock).mock.calls[0][1].headers;
    expect(calledHeaders.get("Authorization")).toBe(customHeaders.Authorization);
    expect(calledHeaders.get("X-Custom-Header")).toBe(customHeaders["X-Custom-Header"]);
    expect(calledHeaders.get("content-type")).toBe("application/json");
  });
});