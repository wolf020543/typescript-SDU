/* eslint-disable @typescript-eslint/no-unused-vars */
/* eslint-disable no-constant-binary-expression */
/* eslint-disable @typescript-eslint/no-unused-expressions */
import { Client } from "./index.js";
import { z } from "zod";
import {
  RequestSchema,
  NotificationSchema,
  ResultSchema,
  LATEST_PROTOCOL_VERSION,
  SUPPORTED_PROTOCOL_VERSIONS,
  InitializeRequestSchema,
  ListResourcesRequestSchema,
  ListToolsRequestSchema,
} from "../types.js";
import { Transport } from "../shared/transport.js";
import { Server } from "../server/index.js";
import { InMemoryTransport } from "../inMemory.js";

test("should initialize with matching protocol version", async () => {
  const clientTransport: Transport = {
    start: jest.fn().mockResolvedValue(undefined),
    close: jest.fn().mockResolvedValue(undefined),
    send: jest.fn().mockImplementation((message) => {
      if (message.method === "initialize") {
        clientTransport.onmessage?.({
          jsonrpc: "2.0",
          id: message.id,
          result: {
            protocolVersion: LATEST_PROTOCOL_VERSION,
            capabilities: {},
            serverInfo: {
              name: "test",
              version: "1.0",
            },
          },
        });
      }
      return Promise.resolve();
    }),
  };

  const client = new Client({
    name: "test client",
    version: "1.0",
  });

  await client.connect(clientTransport);

  // Should have sent initialize with latest version
  expect(clientTransport.send).toHaveBeenCalledWith(
    expect.objectContaining({
      method: "initialize",
      params: expect.objectContaining({
        protocolVersion: LATEST_PROTOCOL_VERSION,
      }),
    }),
  );
});

test("should initialize with supported older protocol version", async () => {
  const OLD_VERSION = SUPPORTED_PROTOCOL_VERSIONS[1];
  const clientTransport: Transport = {
    start: jest.fn().mockResolvedValue(undefined),
    close: jest.fn().mockResolvedValue(undefined),
    send: jest.fn().mockImplementation((message) => {
      if (message.method === "initialize") {
        clientTransport.onmessage?.({
          jsonrpc: "2.0",
          id: message.id,
          result: {
            protocolVersion: OLD_VERSION,
            capabilities: {},
            serverInfo: {
              name: "test",
              version: "1.0",
            },
          },
        });
      }
      return Promise.resolve();
    }),
  };

  const client = new Client({
    name: "test client",
    version: "1.0",
  });

  await client.connect(clientTransport);

  // Connection should succeed with the older version
  expect(client.getServerVersion()).toEqual({
    name: "test",
    version: "1.0",
  });
});

test("should reject unsupported protocol version", async () => {
  const clientTransport: Transport = {
    start: jest.fn().mockResolvedValue(undefined),
    close: jest.fn().mockResolvedValue(undefined),
    send: jest.fn().mockImplementation((message) => {
      if (message.method === "initialize") {
        clientTransport.onmessage?.({
          jsonrpc: "2.0",
          id: message.id,
          result: {
            protocolVersion: "invalid-version",
            capabilities: {},
            serverInfo: {
              name: "test",
              version: "1.0",
            },
          },
        });
      }
      return Promise.resolve();
    }),
  };

  const client = new Client({
    name: "test client",
    version: "1.0",
  });

  await expect(client.connect(clientTransport)).rejects.toThrow(
    "Server's protocol version is not supported: invalid-version",
  );

  expect(clientTransport.close).toHaveBeenCalled();
});

test("should respect server capabilities", async () => {
  const server = new Server({
    name: "test server",
    version: "1.0",
  });

  server.setRequestHandler(InitializeRequestSchema, (request) => ({
    protocolVersion: LATEST_PROTOCOL_VERSION,
    capabilities: {
      resources: {},
      tools: {},
    },
    serverInfo: {
      name: "test",
      version: "1.0",
    },
  }));

  server.setRequestHandler(ListResourcesRequestSchema, () => ({
    resources: [],
  }));

  server.setRequestHandler(ListToolsRequestSchema, () => ({
    tools: [],
  }));

  const [clientTransport, serverTransport] =
    InMemoryTransport.createLinkedPair();

  const client = new Client({
    name: "test client",
    version: "1.0",
  });

  await Promise.all([
    client.connect(clientTransport),
    server.connect(serverTransport),
  ]);

  // Server supports resources and tools, but not prompts
  expect(client.getServerCapabilities()).toEqual({
    resources: {},
    tools: {},
  });

  // These should work
  await expect(client.listResources()).resolves.not.toThrow();
  await expect(client.listTools()).resolves.not.toThrow();

  // This should throw because prompts are not supported
  await expect(client.listPrompts()).rejects.toThrow(
    "Server does not support prompts",
  );
});

/*
  Test that custom request/notification/result schemas can be used with the Client class.
  */
test("should typecheck", () => {
  const GetWeatherRequestSchema = RequestSchema.extend({
    method: z.literal("weather/get"),
    params: z.object({
      city: z.string(),
    }),
  });

  const GetForecastRequestSchema = RequestSchema.extend({
    method: z.literal("weather/forecast"),
    params: z.object({
      city: z.string(),
      days: z.number(),
    }),
  });

  const WeatherForecastNotificationSchema = NotificationSchema.extend({
    method: z.literal("weather/alert"),
    params: z.object({
      severity: z.enum(["warning", "watch"]),
      message: z.string(),
    }),
  });

  const WeatherRequestSchema = GetWeatherRequestSchema.or(
    GetForecastRequestSchema,
  );
  const WeatherNotificationSchema = WeatherForecastNotificationSchema;
  const WeatherResultSchema = ResultSchema.extend({
    temperature: z.number(),
    conditions: z.string(),
  });

  type WeatherRequest = z.infer<typeof WeatherRequestSchema>;
  type WeatherNotification = z.infer<typeof WeatherNotificationSchema>;
  type WeatherResult = z.infer<typeof WeatherResultSchema>;

  // Create a typed Client for weather data
  const weatherClient = new Client<
    WeatherRequest,
    WeatherNotification,
    WeatherResult
  >({
    name: "WeatherClient",
    version: "1.0.0",
  });

  // Typecheck that only valid weather requests/notifications/results are allowed
  false &&
    weatherClient.request(
      {
        method: "weather/get",
        params: {
          city: "Seattle",
        },
      },
      WeatherResultSchema,
    );

  false &&
    weatherClient.notification({
      method: "weather/alert",
      params: {
        severity: "warning",
        message: "Storm approaching",
      },
    });
});
