import { IncomingMessage, ServerResponse } from "node:http";
import { StreamableHTTPServerTransport } from "./streamableHttp.js";
import { JSONRPCMessage } from "../types.js";
import { Readable } from "node:stream";
import { randomUUID } from "node:crypto";
// Mock IncomingMessage
function createMockRequest(options: {
  method: string;
  headers: Record<string, string | string[] | undefined>;
  body?: string;
}): IncomingMessage {
  const readable = new Readable();
  readable._read = () => { };
  if (options.body) {
    readable.push(options.body);
    readable.push(null);
  }

  return Object.assign(readable, {
    method: options.method,
    headers: options.headers,
  }) as IncomingMessage;
}

// Mock ServerResponse
function createMockResponse(): jest.Mocked<ServerResponse> {
  const response = {
    writeHead: jest.fn().mockReturnThis(),
    write: jest.fn().mockReturnThis(),
    end: jest.fn().mockReturnThis(),
    on: jest.fn().mockReturnThis(),
    emit: jest.fn().mockReturnThis(),
    getHeader: jest.fn(),
    setHeader: jest.fn(),
  } as unknown as jest.Mocked<ServerResponse>;
  return response;
}

describe("StreamableHTTPServerTransport", () => {
  let transport: StreamableHTTPServerTransport;
  let mockResponse: jest.Mocked<ServerResponse>;

  beforeEach(() => {
    transport = new StreamableHTTPServerTransport({
      sessionId: randomUUID(),
    });
    mockResponse = createMockResponse();
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  describe("Session Management", () => {
    it("should store a valid session ID", () => {
      expect(transport.sessionId).toBeTruthy();
      expect(typeof transport.sessionId).toBe("string");
    });

    it("should include session ID in response headers", async () => {
      // Use POST with initialize method to avoid session ID requirement
      const initializeMessage: JSONRPCMessage = {
        jsonrpc: "2.0",
        method: "initialize",
        params: {
          clientInfo: { name: "test-client", version: "1.0" },
          protocolVersion: "2025-03-26"
        },
        id: "init-1",
      };

      const req = createMockRequest({
        method: "POST",
        headers: {
          "content-type": "application/json",
          "accept": "application/json, text/event-stream",
        },
        body: JSON.stringify(initializeMessage),
      });

      await transport.handleRequest(req, mockResponse);

      expect(mockResponse.writeHead).toHaveBeenCalledWith(
        200,
        expect.objectContaining({
          "mcp-session-id": transport.sessionId,
        })
      );
    });

    it("should reject invalid session ID", async () => {
      const req = createMockRequest({
        method: "GET",
        headers: {
          "mcp-session-id": "invalid-session-id",
          "accept": "application/json, text/event-stream"
        },
      });

      await transport.handleRequest(req, mockResponse);

      expect(mockResponse.writeHead).toHaveBeenCalledWith(404);
      // check if the error response is a valid JSON-RPC error format
      expect(mockResponse.end).toHaveBeenCalledWith(expect.stringContaining('"jsonrpc":"2.0"'));
      expect(mockResponse.end).toHaveBeenCalledWith(expect.stringContaining('"error"'));
    });

    it("should reject non-initialization requests without session ID with 400 Bad Request", async () => {
      const req = createMockRequest({
        method: "GET",
        headers: {
          accept: "application/json, text/event-stream",
          // No mcp-session-id header
        },
      });

      await transport.handleRequest(req, mockResponse);

      expect(mockResponse.writeHead).toHaveBeenCalledWith(400);
      expect(mockResponse.end).toHaveBeenCalledWith(expect.stringContaining('"jsonrpc":"2.0"'));
      expect(mockResponse.end).toHaveBeenCalledWith(expect.stringContaining('"message":"Bad Request: Mcp-Session-Id header is required"'));
    });
  });
  describe("Stateless Mode", () => {
    let statelessTransport: StreamableHTTPServerTransport;
    let mockResponse: jest.Mocked<ServerResponse>;

    beforeEach(() => {
      statelessTransport = new StreamableHTTPServerTransport({ sessionId: undefined });
      mockResponse = createMockResponse();
    });

    it("should not include session ID in response headers when in stateless mode", async () => {
      // Use a non-initialization request
      const message: JSONRPCMessage = {
        jsonrpc: "2.0",
        method: "test",
        params: {},
        id: 1,
      };

      const req = createMockRequest({
        method: "POST",
        headers: {
          "content-type": "application/json",
          "accept": "application/json, text/event-stream",
        },
        body: JSON.stringify(message),
      });

      await statelessTransport.handleRequest(req, mockResponse);

      expect(mockResponse.writeHead).toHaveBeenCalled();
      // Extract the headers from writeHead call
      const headers = mockResponse.writeHead.mock.calls[0][1];
      expect(headers).not.toHaveProperty("mcp-session-id");
    });

    it("should not validate session ID in stateless mode", async () => {
      const req = createMockRequest({
        method: "POST",
        headers: {
          "content-type": "application/json",
          "accept": "application/json, text/event-stream",
          "mcp-session-id": "invalid-session-id", // This would cause a 404 in stateful mode
        },
        body: JSON.stringify({
          jsonrpc: "2.0",
          method: "test",
          params: {},
          id: 1
        }),
      });

      await statelessTransport.handleRequest(req, mockResponse);

      // Should still get 200 OK, not 404 Not Found
      expect(mockResponse.writeHead).toHaveBeenCalledWith(
        200,
        expect.not.objectContaining({
          "mcp-session-id": expect.anything(),
        })
      );
    });

    it("should handle POST requests without session validation in stateless mode", async () => {
      const message: JSONRPCMessage = {
        jsonrpc: "2.0",
        method: "test",
        params: {},
        id: 1,
      };

      const req = createMockRequest({
        method: "POST",
        headers: {
          "content-type": "application/json",
          "accept": "application/json, text/event-stream",
          "mcp-session-id": "non-existent-session-id", // This would be rejected in stateful mode
        },
        body: JSON.stringify(message),
      });

      const onMessageMock = jest.fn();
      statelessTransport.onmessage = onMessageMock;

      await statelessTransport.handleRequest(req, mockResponse);

      // Message should be processed despite invalid session ID
      expect(onMessageMock).toHaveBeenCalledWith(message);
    });

    it("should work with a mix of requests with and without session IDs in stateless mode", async () => {
      // First request without session ID
      const req1 = createMockRequest({
        method: "POST",
        headers: {
          "content-type": "application/json",
          accept: "application/json, text/event-stream",
        },
        body: JSON.stringify({
          jsonrpc: "2.0",
          method: "test",
          params: {},
          id: "test-id"
        })
      });

      await statelessTransport.handleRequest(req1, mockResponse);
      expect(mockResponse.writeHead).toHaveBeenCalledWith(
        200,
        expect.objectContaining({
          "Content-Type": "text/event-stream",
        })
      );

      // Reset mock for second request
      mockResponse.writeHead.mockClear();

      // Second request with a session ID (which would be invalid in stateful mode)
      const req2 = createMockRequest({
        method: "POST",
        headers: {
          "content-type": "application/json",
          accept: "application/json, text/event-stream",
          "mcp-session-id": "some-random-session-id",
        },
        body: JSON.stringify({
          jsonrpc: "2.0",
          method: "test2",
          params: {},
          id: "test-id-2"
        })
      });

      await statelessTransport.handleRequest(req2, mockResponse);

      // Should still succeed
      expect(mockResponse.writeHead).toHaveBeenCalledWith(
        200,
        expect.objectContaining({
          "Content-Type": "text/event-stream",
        })
      );
    });

    it("should handle initialization requests properly in stateful mode", async () => {
      // Initialize message that would typically be sent during initialization
      const initializeMessage: JSONRPCMessage = {
        jsonrpc: "2.0",
        method: "initialize",
        params: {
          clientInfo: { name: "test-client", version: "1.0" },
          protocolVersion: "2025-03-26"
        },
        id: "init-1",
      };

      // Test stateful transport (default)
      const statefulReq = createMockRequest({
        method: "POST",
        headers: {
          "content-type": "application/json",
          "accept": "application/json, text/event-stream",
        },
        body: JSON.stringify(initializeMessage),
      });

      await transport.handleRequest(statefulReq, mockResponse);

      // In stateful mode, session ID should be included in the response header
      expect(mockResponse.writeHead).toHaveBeenCalledWith(
        200,
        expect.objectContaining({
          "mcp-session-id": transport.sessionId,
        })
      );
    });

    it("should handle initialization requests properly in stateless mode", async () => {
      // Initialize message that would typically be sent during initialization
      const initializeMessage: JSONRPCMessage = {
        jsonrpc: "2.0",
        method: "initialize",
        params: {
          clientInfo: { name: "test-client", version: "1.0" },
          protocolVersion: "2025-03-26"
        },
        id: "init-1",
      };

      // Test stateless transport
      const statelessReq = createMockRequest({
        method: "POST",
        headers: {
          "content-type": "application/json",
          "accept": "application/json, text/event-stream",
        },
        body: JSON.stringify(initializeMessage),
      });

      await statelessTransport.handleRequest(statelessReq, mockResponse);

      // In stateless mode, session ID should also be included for initialize responses
      const headers = mockResponse.writeHead.mock.calls[0][1];
      expect(headers).not.toHaveProperty("mcp-session-id");

    });
  });

  describe("Request Handling", () => {
    it("should reject GET requests for SSE with 405 Method Not Allowed", async () => {
      const req = createMockRequest({
        method: "GET",
        headers: {
          "accept": "application/json, text/event-stream",
          "mcp-session-id": transport.sessionId,
        },
      });

      await transport.handleRequest(req, mockResponse);

      expect(mockResponse.writeHead).toHaveBeenCalledWith(405, expect.objectContaining({
        "Allow": "POST, DELETE"
      }));
      expect(mockResponse.end).toHaveBeenCalledWith(expect.stringContaining('"jsonrpc":"2.0"'));
      expect(mockResponse.end).toHaveBeenCalledWith(expect.stringContaining('Server does not offer an SSE stream at this endpoint'));
    });

    it("should reject POST requests without proper Accept header", async () => {
      const message: JSONRPCMessage = {
        jsonrpc: "2.0",
        method: "initialize", // Use initialize to bypass session ID check
        params: {},
        id: 1,
      };

      const req = createMockRequest({
        method: "POST",
        headers: {
          "content-type": "application/json",
        },
        body: JSON.stringify(message),
      });

      await transport.handleRequest(req, mockResponse);

      expect(mockResponse.writeHead).toHaveBeenCalledWith(406);
    });

    it("should properly handle JSON-RPC request messages in POST requests", async () => {
      const message: JSONRPCMessage = {
        jsonrpc: "2.0",
        method: "initialize", // Use initialize to bypass session ID check
        params: {},
        id: 1,
      };

      const req = createMockRequest({
        method: "POST",
        headers: {
          "content-type": "application/json",
          "accept": "application/json, text/event-stream",
        },
        body: JSON.stringify(message),
      });

      const onMessageMock = jest.fn();
      transport.onmessage = onMessageMock;

      await transport.handleRequest(req, mockResponse);

      expect(onMessageMock).toHaveBeenCalledWith(message);
      expect(mockResponse.writeHead).toHaveBeenCalledWith(
        200,
        expect.objectContaining({
          "mcp-session-id": transport.sessionId,
        })
      );
    });

    it("should properly handle JSON-RPC notification or response messages in POST requests", async () => {
      const notification: JSONRPCMessage = {
        jsonrpc: "2.0",
        method: "test",
        params: {},
      };

      const req = createMockRequest({
        method: "POST",
        headers: {
          "content-type": "application/json",
          "accept": "application/json, text/event-stream",
          "mcp-session-id": transport.sessionId,
        },
        body: JSON.stringify(notification),
      });

      const onMessageMock = jest.fn();
      transport.onmessage = onMessageMock;

      await transport.handleRequest(req, mockResponse);

      expect(onMessageMock).toHaveBeenCalledWith(notification);
      expect(mockResponse.writeHead).toHaveBeenCalledWith(202);
    });

    it("should handle batch notification messages properly with 202 response", async () => {
      const batchMessages: JSONRPCMessage[] = [
        { jsonrpc: "2.0", method: "test1", params: {} },
        { jsonrpc: "2.0", method: "test2", params: {} },
      ];

      const req = createMockRequest({
        method: "POST",
        headers: {
          "content-type": "application/json",
          "accept": "application/json, text/event-stream",
          "mcp-session-id": transport.sessionId,
        },
        body: JSON.stringify(batchMessages),
      });

      const onMessageMock = jest.fn();
      transport.onmessage = onMessageMock;

      await transport.handleRequest(req, mockResponse);

      expect(onMessageMock).toHaveBeenCalledTimes(2);
      expect(mockResponse.writeHead).toHaveBeenCalledWith(202);
    });

    it("should handle batch request messages with SSE when Accept header includes text/event-stream", async () => {
      const batchMessages: JSONRPCMessage[] = [
        { jsonrpc: "2.0", method: "test1", params: {}, id: "req1" },
        { jsonrpc: "2.0", method: "test2", params: {}, id: "req2" },
      ];

      const req = createMockRequest({
        method: "POST",
        headers: {
          "content-type": "application/json",
          "accept": "text/event-stream, application/json",
          "mcp-session-id": transport.sessionId,
        },
        body: JSON.stringify(batchMessages),
      });

      const onMessageMock = jest.fn();
      transport.onmessage = onMessageMock;

      await transport.handleRequest(req, mockResponse);

      // Should establish SSE connection
      expect(mockResponse.writeHead).toHaveBeenCalledWith(
        200,
        expect.objectContaining({
          "Content-Type": "text/event-stream"
        })
      );
      expect(onMessageMock).toHaveBeenCalledTimes(2);
      // Stream should remain open until responses are sent
      expect(mockResponse.end).not.toHaveBeenCalled();
    });

    it("should reject unsupported Content-Type", async () => {
      const req = createMockRequest({
        method: "POST",
        headers: {
          "content-type": "text/plain",
          "accept": "application/json, text/event-stream",
          "mcp-session-id": transport.sessionId,
        },
        body: "test",
      });

      await transport.handleRequest(req, mockResponse);

      expect(mockResponse.writeHead).toHaveBeenCalledWith(415);
      expect(mockResponse.end).toHaveBeenCalledWith(expect.stringContaining('"jsonrpc":"2.0"'));
    });

    it("should properly handle DELETE requests and close session", async () => {
      const req = createMockRequest({
        method: "DELETE",
        headers: {
          "mcp-session-id": transport.sessionId,
        },
      });

      const onCloseMock = jest.fn();
      transport.onclose = onCloseMock;

      await transport.handleRequest(req, mockResponse);

      expect(mockResponse.writeHead).toHaveBeenCalledWith(200);
      expect(onCloseMock).toHaveBeenCalled();
    });
  });

  describe("SSE Response Handling", () => {
    it("should send response messages as SSE events", async () => {
      // Setup a POST request with JSON-RPC request that accepts SSE
      const requestMessage: JSONRPCMessage = {
        jsonrpc: "2.0",
        method: "test",
        params: {},
        id: "test-req-id"
      };

      const req = createMockRequest({
        method: "POST",
        headers: {
          "content-type": "application/json",
          "accept": "application/json, text/event-stream",
          "mcp-session-id": transport.sessionId
        },
        body: JSON.stringify(requestMessage)
      });

      await transport.handleRequest(req, mockResponse);

      // Send a response to the request
      const responseMessage: JSONRPCMessage = {
        jsonrpc: "2.0",
        result: { value: "test-result" },
        id: "test-req-id"
      };

      await transport.send(responseMessage, { relatedRequestId: "test-req-id" });

      // Verify response was sent as SSE event
      expect(mockResponse.write).toHaveBeenCalledWith(
        expect.stringContaining(`event: message\ndata: ${JSON.stringify(responseMessage)}\n\n`)
      );

      // Stream should be closed after sending response
      expect(mockResponse.end).toHaveBeenCalled();
    });

    it("should keep stream open when sending intermediate notifications and requests", async () => {
      // Setup a POST request with JSON-RPC request that accepts SSE
      const requestMessage: JSONRPCMessage = {
        jsonrpc: "2.0",
        method: "test",
        params: {},
        id: "test-req-id"
      };

      const req = createMockRequest({
        method: "POST",
        headers: {
          "content-type": "application/json",
          "accept": "application/json, text/event-stream",
          "mcp-session-id": transport.sessionId
        },
        body: JSON.stringify(requestMessage)
      });

      await transport.handleRequest(req, mockResponse);

      // Send an intermediate notification 
      const notification: JSONRPCMessage = {
        jsonrpc: "2.0",
        method: "progress",
        params: { progress: "50%" }
      };

      await transport.send(notification, { relatedRequestId: "test-req-id" });

      // Stream should remain open
      expect(mockResponse.end).not.toHaveBeenCalled();

      // Send the final response
      const responseMessage: JSONRPCMessage = {
        jsonrpc: "2.0",
        result: { value: "test-result" },
        id: "test-req-id"
      };

      await transport.send(responseMessage, { relatedRequestId: "test-req-id" });

      // Now stream should be closed
      expect(mockResponse.end).toHaveBeenCalled();
    });
  });

  describe("Message Targeting", () => {
    it("should send response messages to the connection that sent the request", async () => {
      // Create request with two separate connections
      const requestMessage1: JSONRPCMessage = {
        jsonrpc: "2.0",
        method: "test1",
        params: {},
        id: "req-id-1",
      };

      const mockResponse1 = createMockResponse();
      const req1 = createMockRequest({
        method: "POST",
        headers: {
          "content-type": "application/json",
          "accept": "application/json, text/event-stream",
          "mcp-session-id": transport.sessionId
        },
        body: JSON.stringify(requestMessage1),
      });
      await transport.handleRequest(req1, mockResponse1);

      const requestMessage2: JSONRPCMessage = {
        jsonrpc: "2.0",
        method: "test2",
        params: {},
        id: "req-id-2",
      };

      const mockResponse2 = createMockResponse();
      const req2 = createMockRequest({
        method: "POST",
        headers: {
          "content-type": "application/json",
          "accept": "application/json, text/event-stream",
          "mcp-session-id": transport.sessionId
        },
        body: JSON.stringify(requestMessage2),
      });
      await transport.handleRequest(req2, mockResponse2);

      // Send responses with matching IDs
      const responseMessage1: JSONRPCMessage = {
        jsonrpc: "2.0",
        result: { success: true },
        id: "req-id-1",
      };

      await transport.send(responseMessage1, { relatedRequestId: "req-id-1" });

      const responseMessage2: JSONRPCMessage = {
        jsonrpc: "2.0",
        result: { success: true },
        id: "req-id-2",
      };

      await transport.send(responseMessage2, { relatedRequestId: "req-id-2" });

      // Verify responses were sent to the right connections
      expect(mockResponse1.write).toHaveBeenCalledWith(
        expect.stringContaining(JSON.stringify(responseMessage1))
      );

      expect(mockResponse2.write).toHaveBeenCalledWith(
        expect.stringContaining(JSON.stringify(responseMessage2))
      );

      // Verify responses were not sent to the wrong connections
      const resp1HasResp2 = mockResponse1.write.mock.calls.some(call =>
        typeof call[0] === 'string' && call[0].includes(JSON.stringify(responseMessage2))
      );
      expect(resp1HasResp2).toBe(false);

      const resp2HasResp1 = mockResponse2.write.mock.calls.some(call =>
        typeof call[0] === 'string' && call[0].includes(JSON.stringify(responseMessage1))
      );
      expect(resp2HasResp1).toBe(false);
    });
  });

  describe("Error Handling", () => {
    it("should handle invalid JSON data", async () => {
      const req = createMockRequest({
        method: "POST",
        headers: {
          "content-type": "application/json",
          "accept": "application/json, text/event-stream",
        },
        body: "invalid json",
      });

      const onErrorMock = jest.fn();
      transport.onerror = onErrorMock;

      await transport.handleRequest(req, mockResponse);

      expect(mockResponse.writeHead).toHaveBeenCalledWith(400);
      expect(mockResponse.end).toHaveBeenCalledWith(expect.stringContaining('"jsonrpc":"2.0"'));
      expect(mockResponse.end).toHaveBeenCalledWith(expect.stringContaining('"code":-32700'));
      expect(onErrorMock).toHaveBeenCalled();
    });

    it("should handle invalid JSON-RPC messages", async () => {
      const req = createMockRequest({
        method: "POST",
        headers: {
          "content-type": "application/json",
          "accept": "application/json, text/event-stream",
        },
        body: JSON.stringify({ invalid: "message" }),
      });

      const onErrorMock = jest.fn();
      transport.onerror = onErrorMock;

      await transport.handleRequest(req, mockResponse);

      expect(mockResponse.writeHead).toHaveBeenCalledWith(400);
      expect(mockResponse.end).toHaveBeenCalledWith(expect.stringContaining('"jsonrpc":"2.0"'));
      expect(onErrorMock).toHaveBeenCalled();
    });
  });

  describe("Handling Pre-Parsed Body", () => {
    it("should accept pre-parsed request body", async () => {
      const message: JSONRPCMessage = {
        jsonrpc: "2.0",
        method: "initialize",
        params: {
          clientInfo: { name: "test-client", version: "1.0" },
          protocolVersion: "2025-03-26"
        },
        id: "pre-parsed-test",
      };

      // Create a request without actual body content
      const req = createMockRequest({
        method: "POST",
        headers: {
          "content-type": "application/json",
          "accept": "application/json, text/event-stream",
        },
        // No body provided here - it will be passed as parsedBody
      });

      const onMessageMock = jest.fn();
      transport.onmessage = onMessageMock;

      // Pass the pre-parsed body directly
      await transport.handleRequest(req, mockResponse, message);

      // Verify the message was processed correctly
      expect(onMessageMock).toHaveBeenCalledWith(message);
      expect(mockResponse.writeHead).toHaveBeenCalledWith(
        200,
        expect.objectContaining({
          "mcp-session-id": transport.sessionId,
        })
      );
    });

    it("should handle pre-parsed batch messages", async () => {
      const batchMessages: JSONRPCMessage[] = [
        {
          jsonrpc: "2.0",
          method: "method1",
          params: { data: "test1" },
          id: "batch1"
        },
        {
          jsonrpc: "2.0",
          method: "method2",
          params: { data: "test2" },
          id: "batch2"
        },
      ];

      // Create a request without actual body content
      const req = createMockRequest({
        method: "POST",
        headers: {
          "content-type": "application/json",
          "accept": "application/json, text/event-stream",
          "mcp-session-id": transport.sessionId,
        },
        // No body provided here - it will be passed as parsedBody
      });

      const onMessageMock = jest.fn();
      transport.onmessage = onMessageMock;

      // Pass the pre-parsed body directly
      await transport.handleRequest(req, mockResponse, batchMessages);

      // Should be called for each message in the batch
      expect(onMessageMock).toHaveBeenCalledTimes(2);
      expect(onMessageMock).toHaveBeenCalledWith(batchMessages[0]);
      expect(onMessageMock).toHaveBeenCalledWith(batchMessages[1]);
    });

    it("should prefer pre-parsed body over request body", async () => {
      const requestBodyMessage: JSONRPCMessage = {
        jsonrpc: "2.0",
        method: "fromRequestBody",
        params: {},
        id: "request-body",
      };

      const parsedBodyMessage: JSONRPCMessage = {
        jsonrpc: "2.0",
        method: "fromParsedBody",
        params: {},
        id: "parsed-body",
      };

      // Create a request with actual body content
      const req = createMockRequest({
        method: "POST",
        headers: {
          "content-type": "application/json",
          "accept": "application/json, text/event-stream",
          "mcp-session-id": transport.sessionId,
        },
        body: JSON.stringify(requestBodyMessage),
      });

      const onMessageMock = jest.fn();
      transport.onmessage = onMessageMock;

      // Pass the pre-parsed body directly
      await transport.handleRequest(req, mockResponse, parsedBodyMessage);

      // Should use the parsed body instead of the request body
      expect(onMessageMock).toHaveBeenCalledWith(parsedBodyMessage);
      expect(onMessageMock).not.toHaveBeenCalledWith(requestBodyMessage);
    });
  });
}); 