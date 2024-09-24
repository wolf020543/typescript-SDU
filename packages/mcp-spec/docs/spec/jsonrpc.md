---
title: Base Protocol
type: docs
weight: 1
---

The Model Context Protocol (MCP) defines a set of JSON-RPC methods for communication between clients and servers in AI-assisted applications. MCP uses [JSON-RPC 2.0](https://www.jsonrpc.org/specification) as its base protocol.

### Transport

MCP client **SHOULD** use one of the following transport mechanisms, but are free to use alternative transports where applicable.:

Standard Input/Output (STDIO)
: Communication occurs through the standard input and output streams. JSON-RPC
  messages are sent as individual lines over these streams. Each message is a
  complete JSON object serialized as a single line of text, terminated by a
  newline character. The client writes requests to the server's standard input
  and reads responses from the server's standard output.  See [transports](transports.md) for more details.

HTTP with Server-Sent Events (SSE)
: This transport uses HTTP (1.1 or above) as the underlying protocol. The client sends
  requests to the server using standard HTTP POST requests with JSON-RPC
  payloads. For server-to-client communication, Server-Sent Events (SSE) are
  employed. The server keeps an open connection to the client and sends
  messages as SSE events. See [transports](transports.md) for more details.

### Message Format

All messages in MCP **MUST** follow the [JSON-RPC 2.0](https://www.jsonrpc.org/specification) specification. The protocol defines three types of messages:

1. Requests
2. Responses
3. Notifications

#### Requests

Requests are sent from the client to the server or vice versa. They **MUST** include a unique `id` and expect a response.

#### Responses

Responses are sent in reply to requests. They **MUST** include the same `id` as the corresponding request.

#### Notifications

Notifications are sent from the client to the server or vice versa. They do not expect a response and **MUST NOT** include an `id`.

### Base Protocol

The base protocol consists of the following JSON-RPC methods:

- `initialize`: Sent from the client to the server to initialize the connection.
- `initialized`: Sent from the client to the server after initialization is complete.
- `ping`: Sent by either party to check if the other is still alive.

Implementations **MUST** support these base protocol methods.

### Model Context Protocol specific methods

MCP defines methods based on JSON-RPC that clients and servers implement:

- [Lifecycle](lifecycle.md) handling
- [Resource](resources.md) management
- [Prompt](prompts.md) handling
- [Tool](tools.md) execution
- [Logging](logging.md)
- [Sampling](sampling.md)

### Authentication

Authentication mechanisms are not part of the core MCP specification. Implementations **MAY** provide authentication based on the transport they use..

### Versioning

The MCP version is declared in the `initialize` request and response. Clients and servers **MUST** agree on a compatible protocol version to proceed with communication.

## Specification

The conical specification can be found at [Model Context Protocol](http://github.com/modelcontextprotocol/spec/tree/main/spec/schema.ts). The specification of the data format
is available in TypeScript (source of truth) and JSON Schema format (generated).
