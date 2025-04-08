import { StreamableHTTPClientTransport } from "./streamableHttp.js";
import { JSONRPCMessage } from "../types.js";


describe("StreamableHTTPClientTransport", () => {
  let transport: StreamableHTTPClientTransport;

  beforeEach(() => {
    transport = new StreamableHTTPClientTransport(new URL("http://localhost:1234/mcp"));
    jest.spyOn(global, "fetch");
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  it("should send JSON-RPC messages via POST", async () => {
    const message: JSONRPCMessage = {
      jsonrpc: "2.0",
      method: "test",
      params: {},
      id: "test-id"
    };

    (global.fetch as jest.Mock).mockResolvedValueOnce({
      ok: true,
      status: 202,
      headers: new Headers(),
    });

    await transport.send(message);

    expect(global.fetch).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({
        method: "POST",
        headers: expect.any(Headers),
        body: JSON.stringify(message)
      })
    );
  });

  it("should send batch messages", async () => {
    const messages: JSONRPCMessage[] = [
      { jsonrpc: "2.0", method: "test1", params: {}, id: "id1" },
      { jsonrpc: "2.0", method: "test2", params: {}, id: "id2" }
    ];

    (global.fetch as jest.Mock).mockResolvedValueOnce({
      ok: true,
      status: 200,
      headers: new Headers({ "content-type": "text/event-stream" }),
      body: null
    });

    await transport.send(messages);

    expect(global.fetch).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({
        method: "POST",
        headers: expect.any(Headers),
        body: JSON.stringify(messages)
      })
    );
  });

  it("should store session ID received during initialization", async () => {
    const message: JSONRPCMessage = {
      jsonrpc: "2.0",
      method: "initialize",
      params: {
        clientInfo: { name: "test-client", version: "1.0" },
        protocolVersion: "2025-03-26"
      },
      id: "init-id"
    };

    (global.fetch as jest.Mock).mockResolvedValueOnce({
      ok: true,
      status: 200,
      headers: new Headers({ "mcp-session-id": "test-session-id" }),
    });

    await transport.send(message);

    // Send a second message that should include the session ID
    (global.fetch as jest.Mock).mockResolvedValueOnce({
      ok: true,
      status: 202,
      headers: new Headers()
    });

    await transport.send({ jsonrpc: "2.0", method: "test", params: {} } as JSONRPCMessage);

    // Check that second request included session ID header
    const calls = (global.fetch as jest.Mock).mock.calls;
    const lastCall = calls[calls.length - 1];
    expect(lastCall[1].headers).toBeDefined();
    expect(lastCall[1].headers.get("mcp-session-id")).toBe("test-session-id");
  });

  it("should handle 404 response when session expires", async () => {
    const message: JSONRPCMessage = {
      jsonrpc: "2.0",
      method: "test",
      params: {},
      id: "test-id"
    };

    (global.fetch as jest.Mock).mockResolvedValueOnce({
      ok: false,
      status: 404,
      statusText: "Not Found",
      text: () => Promise.resolve("Session not found"),
      headers: new Headers()
    });

    const errorSpy = jest.fn();
    transport.onerror = errorSpy;

    await expect(transport.send(message)).rejects.toThrow("Error POSTing to endpoint (HTTP 404)");
    expect(errorSpy).toHaveBeenCalled();
  });

  it("should handle session termination via DELETE request", async () => {
    // First set the session ID by mocking initialization
    (global.fetch as jest.Mock).mockResolvedValueOnce({
      ok: true,
      status: 200,
      headers: new Headers({ "mcp-session-id": "session-to-terminate" }),
    });

    await transport.send({
      jsonrpc: "2.0",
      method: "initialize",
      params: {
        clientInfo: { name: "test-client", version: "1.0" },
        protocolVersion: "2025-03-26"
      },
      id: "init-id"
    } as JSONRPCMessage);

    // Mock DELETE request for session termination
    (global.fetch as jest.Mock).mockResolvedValueOnce({
      ok: true,
      status: 200,
      headers: new Headers()
    });

    const closeSpy = jest.fn();
    transport.onclose = closeSpy;

    await transport.close();

    // Check that DELETE request was sent
    const calls = (global.fetch as jest.Mock).mock.calls;
    const lastCall = calls[calls.length - 1];
    expect(lastCall[1].method).toBe("DELETE");
    // The headers may be a plain object in tests
    expect(lastCall[1].headers["mcp-session-id"]).toBe("session-to-terminate");

    expect(closeSpy).toHaveBeenCalled();
  });

  it("should handle non-streaming JSON response", async () => {
    const message: JSONRPCMessage = {
      jsonrpc: "2.0",
      method: "test",
      params: {},
      id: "test-id"
    };

    const responseMessage: JSONRPCMessage = {
      jsonrpc: "2.0",
      result: { success: true },
      id: "test-id"
    };

    (global.fetch as jest.Mock).mockResolvedValueOnce({
      ok: true,
      status: 200,
      headers: new Headers({ "content-type": "application/json" }),
      json: () => Promise.resolve(responseMessage)
    });

    const messageSpy = jest.fn();
    transport.onmessage = messageSpy;

    await transport.send(message);

    expect(messageSpy).toHaveBeenCalledWith(responseMessage);
  });
});