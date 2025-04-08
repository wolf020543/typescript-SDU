# MCP TypeScript SDK Examples

This directory contains example implementations of MCP clients and servers using the TypeScript SDK.

## Streamable HTTP Examples

### List Tool Request Example

Using `curl` to list available tools:

```bash
# First initialize the server and save the session ID to a variable
SESSION_ID=$(curl -X POST -H "Content-Type: application/json" -H "Accept: application/json, text/event-stream" \
  -d '{"jsonrpc":"2.0","method":"initialize","params":{"capabilities":{}},"id":"1"}' \
  -i http://localhost:3000/mcp 2>&1 | grep -i "mcp-session-id" | cut -d' ' -f2 | tr -d '\r')
echo "Session ID: $SESSION_ID"

# Then list tools using the saved session ID 
curl -X POST -H "Content-Type: application/json" -H "Accept: application/json, text/event-stream" \
  -H "mcp-session-id: $SESSION_ID" \
  -d '{"jsonrpc":"2.0","method":"tools/list","params":{},"id":"2"}' \
  http://localhost:3000/mcp
```

Using the TypeScript client (session management is handled automatically):

```typescript
const toolsRequest = { method: 'tools/list', params: {} };
const toolsResult = await client.request(toolsRequest, ListToolsResultSchema);
console.log('Available tools:', toolsResult.tools);
```

### Call Tool Request Example

Using `curl` to call a tool:

```bash
curl -X POST -H "Content-Type: application/json" -H "Accept: application/json, text/event-stream" \
  -H "mcp-session-id: $SESSION_ID" \
  -d '{"jsonrpc":"2.0","method":"tools/call","params":{"name":"greet","arguments":{"name":"User"}},"id":"3"}' \
  http://localhost:3000/mcp
```

Using the TypeScript client:

```typescript
const greetRequest = {
  method: 'tools/call',
  params: {
    name: 'greet',
    arguments: { name: 'MCP User' }
  }
};
const greetResult = await client.request(greetRequest, CallToolResultSchema);
```

### Get Prompt Request Example

Using `curl` to get a prompt:

```bash
curl -X POST -H "Content-Type: application/json" -H "Accept: application/json, text/event-stream" \
  -H "mcp-session-id: $SESSION_ID" \
  -d '{"jsonrpc":"2.0","method":"prompts/get","params":{"name":"greeting-template","arguments":{"name":"User"}},"id":"4"}' \
  http://localhost:3000/mcp
```

Using the TypeScript client:

```typescript
const promptRequest = {
  method: 'prompts/get',
  params: {
    name: 'greeting-template',
    arguments: { name: 'MCP User' }
  }
};
const promptResult = await client.request(promptRequest, GetPromptResultSchema);
```

### Server (`server/simpleStreamableHttp.ts`)

A simple MCP server that uses the Streamable HTTP transport, implemented with Express. The server provides:

- A simple `greet` tool that returns a greeting for a name
- A `greeting-template` prompt that generates a greeting template
- A static `greeting-resource` resource

#### Running the server

```bash
npx tsx src/examples/server/simpleStreamableHttp.ts
```

The server will start on port 3000. You can test the initialization with:

```bash
curl -X POST -H "Content-Type: application/json" -H "Accept: application/json, text/event-stream" \
  -d '{"jsonrpc":"2.0","method":"initialize","params":{"capabilities":{}},"id":"1"}' \
  http://localhost:3000/mcp
```

### Client (`client/simpleStreamableHttpClient.ts`)

A client that connects to the server, initializes it, and demonstrates how to:

- List available tools and call the `greet` tool
- List available prompts and get the `greeting-template` prompt
- List available resources

#### Running the client

```bash
npx tsx src/examples/client/simpleStreamableHttpClient.ts
```

Make sure the server is running before starting the client.

## Notes

- These examples demonstrate the basic usage of the Streamable HTTP transport
- The server manages sessions for stateful connections
- The client handles both direct HTTP responses and SSE streaming responses