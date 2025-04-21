/**
 * Integration tests for batch messaging in StreamableHttp transport
 * 
 * This test suite focuses specifically on the requirement from the spec:
 * "The body of the POST request MUST be one of the following:
 *  - A single JSON-RPC request, notification, or response
 *  - An array batching one or more requests and/or notifications
 *  - An array batching one or more responses"
 */

import { createServer, type Server } from "node:http";
import { AddressInfo } from "node:net";
import { randomUUID } from "node:crypto";
import { StreamableHTTPServerTransport } from "../server/streamableHttp.js";
import { McpServer } from "../server/mcp.js";
import { Client } from "../client/index.js";
import { CallToolResult, CallToolResultSchema, JSONRPCMessage } from "../types.js";
import { z } from "zod";
import { StreamableHTTPClientTransport } from '../client/streamableHttp.js';
describe("StreamableHttp Batch Messaging - SSE", () => {
  let server: Server;
  let client: Client;

  // Just a basic server and client for testing
  beforeEach(async () => {
    // Create MCP server with test tools
    const mcpServer = new McpServer(
      { name: "batch-test-server", version: "1.0.0" },
      { capabilities: { logging: {} } }
    );

    // Simple greeting tool
    mcpServer.tool(
      "greet",
      "A simple greeting tool",
      { name: z.string().describe("Name to greet") },
      async ({ name }): Promise<CallToolResult> => {
        return { content: [{ type: "text", text: `Hello, ${name}!` }] };
      }
    );

    // Server transport with session management
    const serverTransport = new StreamableHTTPServerTransport({
      sessionIdGenerator: () => randomUUID(),
    });

    // Connect transport to server
    await mcpServer.connect(serverTransport);

    // Create HTTP server
    server = createServer(async (req, res) => {
      await serverTransport.handleRequest(req, res);
    });

    // Start server on random port
    const baseUrl = await new Promise<URL>((resolve) => {
      server.listen(0, '127.0.0.1', () => {
        const addr = server.address() as AddressInfo;
        resolve(new URL(`http://127.0.0.1:${addr.port}`));
      });
    });

    // Create client that connects to the server
    const transport = new StreamableHTTPClientTransport(baseUrl);
    client = new Client({ name: "test-client", version: "1.0.0" });
    await client.connect(transport);

  });

  afterEach(async () => {
    await client.close();
    await new Promise<void>((resolve) => server.close(() => resolve()));
  });

  /**
   * 1. Test sending a single JSON-RPC request
   */
  it("handles a single request", async () => {
    const result = await client.callTool({
      name: "greet",
      arguments: {
        name: "user"
      }
    });

    expect(result).toHaveProperty("content");
    expect(Array.isArray(result.content)).toBe(true);
    expect(result.content).toHaveLength(1);

    // Type assertion to handle the unknown type
    const content = result.content as Array<{ type: string, text: string }>;
    expect(content[0]).toHaveProperty("type", "text");
    expect(content[0]).toHaveProperty("text", "Hello, user!");

  });

  /**
   * 1. Test sending a single JSON-RPC request
   */
  it("handles a single request with request", async () => {
    const result = await client.request(
      {
        method: "tools/call",
        params: {
          name: "greet",
          arguments: {
            name: "user"
          }
        },
      },
      CallToolResultSchema,
    );


    expect(result).toHaveProperty("content");
    expect(Array.isArray(result.content)).toBe(true);
    expect(result.content).toHaveLength(1);

    // Type assertion to handle the unknown type
    const content = result.content as Array<{ type: string, text: string }>;
    expect(content[0]).toHaveProperty("type", "text");
    expect(content[0]).toHaveProperty("text", "Hello, user!");

  });

  // it("handles an array batching one or more requests and/or notifications", async () => {
  //   const result = await client.request({

  //   });

  // });


});

describe("StreamableHttp Batch Messaging - JSON response", () => {
  let server: Server;
  let client: Client;

  // Just a basic server and client for testing
  beforeEach(async () => {
    // Create MCP server with test tools
    const mcpServer = new McpServer(
      { name: "batch-test-server", version: "1.0.0" },
      { capabilities: { logging: {} } }
    );

    // Simple greeting tool
    mcpServer.tool(
      "greet",
      "A simple greeting tool",
      { name: z.string().describe("Name to greet") },
      async ({ name }): Promise<CallToolResult> => {
        return { content: [{ type: "text", text: `Hello, ${name}!` }] };
      }
    );

    // Server transport with session management
    const serverTransport = new StreamableHTTPServerTransport({
      sessionIdGenerator: () => randomUUID(),
      enableJsonResponse: true,

    });

    // Connect transport to server
    await mcpServer.connect(serverTransport);

    // Create HTTP server
    server = createServer(async (req, res) => {
      await serverTransport.handleRequest(req, res);
    });

    // Start server on random port
    const baseUrl = await new Promise<URL>((resolve) => {
      server.listen(0, '127.0.0.1', () => {
        const addr = server.address() as AddressInfo;
        resolve(new URL(`http://127.0.0.1:${addr.port}`));
      });
    });

    // Create client that connects to the server
    const transport = new StreamableHTTPClientTransport(baseUrl);
    client = new Client({ name: "test-client", version: "1.0.0" });
    await client.connect(transport);

  });

  afterEach(async () => {
    await client.close();
    await new Promise<void>((resolve) => server.close(() => resolve()));
  });

  /**
   * 1. Test sending a single JSON-RPC request
   */
  it("handles a single request", async () => {
    const result = await client.callTool({
      name: "greet",
      arguments: {
        name: "user"
      }
    });

    expect(result).toHaveProperty("content");
    expect(Array.isArray(result.content)).toBe(true);
    expect(result.content).toHaveLength(1);

    // Type assertion to handle the unknown type
    const content = result.content as Array<{ type: string, text: string }>;
    expect(content[0]).toHaveProperty("type", "text");
    expect(content[0]).toHaveProperty("text", "Hello, user!");

  });

  /**
   * 1. Test sending a single JSON-RPC request
   */
  it("handles a single request with request", async () => {
    const result = await client.request(
      {
        method: "tools/call",
        params: {
          name: "greet",
          arguments: {
            name: "user"
          }
        },
      },
      CallToolResultSchema,
    );


    expect(result).toHaveProperty("content");
    expect(Array.isArray(result.content)).toBe(true);
    expect(result.content).toHaveLength(1);

    // Type assertion to handle the unknown type
    const content = result.content as Array<{ type: string, text: string }>;
    expect(content[0]).toHaveProperty("type", "text");
    expect(content[0]).toHaveProperty("text", "Hello, user!");

  });

  // it("handles an array batching one or more requests and/or notifications", async () => {
  //   const result = await client.request({

  //   });

  // });


});