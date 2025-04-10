# MCP TypeScript SDK Examples

This directory contains example implementations of MCP clients and servers using the TypeScript SDK.

## Table of Contents

- [Streamable HTTP Servers - Single Node Deployment](#streamable-http---single-node-deployment-with-basic-session-state-management)
  - [Simple Server with Streamable HTTP](#simple-server-with-streamable-http-transport-serversimplestreamablehttpts)
  - [Server Supporting SSE via GET](#server-supporting-with-sse-via-get-serverstandalonessewithgetstreamablehttpts)
  - [Server with JSON Response Mode](#server-with-json-response-mode-serverjsonresponsestreamablehttpts)
- [Client Example - Streamable HTTP](#client-clientsimplestreamablehttpts)

## Streamable HTTP - single node deployment with basic session state management

Multi node with state management example will be added soon after we add support.


### Simple Server with Streamable Http transport (`server/simpleStreamableHttp.ts`)

A simple MCP server that uses the Streamable HTTP transport, implemented with Express. The server provides:

- A simple `greet` tool that returns a greeting for a name
- A `greeting-template` prompt that generates a greeting template
- A static `greeting-resource` resource

#### Running the server

```bash
npx tsx src/examples/server/simpleStreamableHttp.ts
```

The server will start on port 3000. You can test the initialization and tool listing:

```bash
# First initialize the server and save the session ID to a variable
SESSION_ID=$(curl -X POST \
  -H "Content-Type: application/json" \
  -H "Accept: application/json" \
  -H "Accept: text/event-stream" \
  -d '{
    "jsonrpc": "2.0",
    "method": "initialize",
    "params": {
      "capabilities": {},
      "protocolVersion": "2025-03-26", 
      "clientInfo": {
        "name": "test",
        "version": "1.0.0"
      }
    },
    "id": "1"
  }' \
  -i http://localhost:3000/mcp 2>&1 | grep -i "mcp-session-id" | cut -d' ' -f2 | tr -d '\r')
echo "Session ID: $SESSION_ID

# Then list tools using the saved session ID 
curl -X POST -H "Content-Type: application/json" -H "Accept: application/json, text/event-stream" \
  -H "mcp-session-id: $SESSION_ID" \
  -d '{"jsonrpc":"2.0","method":"tools/list","params":{},"id":"2"}' \
  http://localhost:3000/mcp
```

### Server supporting with SSE via GET (`server/standaloneSseWithGetStreamableHttp.ts`)

An MCP server that demonstrates how to support SSE notifications via GET requests using the Streamable HTTP transport with Express. The server dynamically adds resources at regular intervals and supports notifications for resource list changes (server notifications are available through the standalone SSE connection established by GET request).

#### Running the server

```bash
npx tsx src/examples/server/standaloneSseWithGetStreamableHttp.ts
```

The server will start on port 3000 and automatically create new resources every 5 seconds.

### Server with JSON response mode (`server/jsonResponseStreamableHttp.ts`)

This is not recommented way to use the transport, as its quite limiting and not supporting features like logging and progress notifications on tool execution.
A simple MCP server that uses the Streamable HTTP transport with JSON response mode enabled, implemented with Express. The server provides a simple `greet` tool that returns a greeting for a name.

#### Running the server

```bash
npx tsx src/examples/server/jsonResponseStreamableHttp.ts
```

The server will start on port 3000. You can test the initialization and tool calling:

```bash
# Initialize the server and get the session ID from headers
SESSION_ID=$(curl -X POST \
  -H "Content-Type: application/json" \
  -H "Accept: application/json" \
  -H "Accept: text/event-stream" \
  -d '{
    "jsonrpc": "2.0",
    "method": "initialize",
    "params": {
      "capabilities": {},
      "protocolVersion": "2025-03-26", 
      "clientInfo": {
        "name": "test",
        "version": "1.0.0"
      }
    },
    "id": "1"
  }' \
  -i http://localhost:3000/mcp 2>&1 | grep -i "mcp-session-id" | cut -d' ' -f2 | tr -d '\r')
echo "Session ID: $SESSION_ID"

# Call the greet tool using the saved session ID
curl -X POST \
  -H "Content-Type: application/json" \
  -H "Accept: application/json" \
  -H "Accept: text/event-stream" \
  -H "mcp-session-id: $SESSION_ID" \
  -d '{
    "jsonrpc": "2.0",
    "method": "tools/call",
    "params": {
      "name": "greet",
      "arguments": {
        "name": "World"
      }
    },
    "id": "2"
  }' \
  http://localhost:3000/mcp
```


### Client (`client/simpleStreamableHttp.ts`)

A client that connects to the server, initializes it, and demonstrates how to:

- List available tools and call the `greet` tool
- List available prompts and get the `greeting-template` prompt
- List available resources

#### Running the client

```bash
npx tsx src/examples/client/simpleStreamableHttp.ts
```

Make sure the server is running before starting the client.


