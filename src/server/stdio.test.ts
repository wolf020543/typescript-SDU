import { Readable, Writable } from "node:stream";
import { ReadBuffer, serializeMessage } from "../shared/stdio.js";
import { JSONRPCMessage } from "../types.js";
import { StdioServerTransport } from "./stdio.js";

let input: Readable;
let outputBuffer: ReadBuffer;
let output: Writable;

beforeEach(() => {
  input = new Readable({
    // We'll use input.push() instead.
    read: () => {},
  });

  outputBuffer = new ReadBuffer();
  output = new Writable({
    write(chunk, encoding, callback) {
      outputBuffer.append(chunk);
      callback();
    },
  });
});

test("should start then close cleanly", async () => {
  const server = new StdioServerTransport(input, output);
  server.onerror = (error) => {
    throw error;
  };

  let didClose = false;
  server.onclose = () => {
    didClose = true;
  };

  await server.start();
  expect(didClose).toBeFalsy();
  await server.close();
  expect(didClose).toBeTruthy();
});

test("should not read until started", async () => {
  const server = new StdioServerTransport(input, output);
  server.onerror = (error) => {
    throw error;
  };

  let didRead = false;
  const readMessage = new Promise((resolve) => {
    server.onmessage = (message) => {
      didRead = true;
      resolve(message);
    };
  });

  const message: JSONRPCMessage = {
    jsonrpc: "2.0",
    id: 1,
    method: "ping",
  };
  input.push(serializeMessage(message));

  expect(didRead).toBeFalsy();
  await server.start();
  expect(await readMessage).toEqual(message);
});

test("should read multiple messages", async () => {
  const server = new StdioServerTransport(input, output);
  server.onerror = (error) => {
    throw error;
  };

  const messages: JSONRPCMessage[] = [
    {
      jsonrpc: "2.0",
      id: 1,
      method: "ping",
    },
    {
      jsonrpc: "2.0",
      method: "notifications/initialized",
    },
  ];

  const readMessages: JSONRPCMessage[] = [];
  const finished = new Promise<void>((resolve) => {
    server.onmessage = (message) => {
      readMessages.push(message);
      if (JSON.stringify(message) === JSON.stringify(messages[1])) {
        resolve();
      }
    };
  });

  input.push(serializeMessage(messages[0]));
  input.push(serializeMessage(messages[1]));

  await server.start();
  await finished;
  expect(readMessages).toEqual(messages);
});

test("should properly clean up resources when closed", async () => {
  // Create mock streams that track their destroyed state
  const mockStdin = new Readable({
    read() {}, // No-op implementation
    destroy() {
      this.destroyed = true;
      return this;
    }
  });
  const mockStdout = new Writable({
    write(chunk, encoding, callback) {
      callback();
    },
    destroy() {
      this.destroyed = true;
      return this;
    }
  });

  const transport = new StdioServerTransport(mockStdin, mockStdout);
  await transport.start();

  // Send a message to potentially create 'drain' listeners
  await transport.send({ jsonrpc: "2.0", method: "test", id: 1 });

  // Close the transport
  await transport.close();

  // Check that all listeners were removed
  expect(mockStdin.listenerCount('data')).toBe(0);
  expect(mockStdin.listenerCount('error')).toBe(0);
  expect(mockStdout.listenerCount('drain')).toBe(0);
  
  // Check that streams were properly ended
  expect(mockStdin.destroyed).toBe(true);
  expect(mockStdout.destroyed).toBe(true);
});
