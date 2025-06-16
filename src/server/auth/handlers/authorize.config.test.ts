import express from "express";
import request from "supertest";
import { authorizationHandler } from "./authorize.js";
import { OAuthServerProvider } from "../provider.js";
import { OAuthServerConfig } from "../types.js";

describe("Authorization handler with config", () => {
  let app: express.Application;
  let mockProvider: jest.Mocked<OAuthServerProvider>;
  
  beforeEach(() => {
    app = express();
    
    const mockClientsStore = {
      getClient: jest.fn(),
      registerClient: jest.fn(),
    };
    
    mockProvider = {
      clientsStore: mockClientsStore,
      authorize: jest.fn(),
      exchangeAuthorizationCode: jest.fn(),
      exchangeRefreshToken: jest.fn(),
      challengeForAuthorizationCode: jest.fn(),
      verifyAccessToken: jest.fn(),
    } as jest.Mocked<OAuthServerProvider>;
  });

  describe("validateResourceMatchesServer configuration", () => {
    it("should throw error when validateResourceMatchesServer is true but serverUrl is not set", () => {
      const invalidConfig: OAuthServerConfig = {
        validateResourceMatchesServer: true
        // serverUrl is missing
      };

      expect(() => {
        authorizationHandler({ 
          provider: mockProvider,
          config: invalidConfig 
        });
      }).toThrow("serverUrl must be configured when validateResourceMatchesServer is true");
    });
  });

  describe("server URL validation (validateResourceMatchesServer: true)", () => {
    const serverValidationConfig: OAuthServerConfig = {
      serverUrl: "https://api.example.com/mcp",
      validateResourceMatchesServer: true
    };

    beforeEach(() => {
      app.use("/oauth/authorize", authorizationHandler({ 
        provider: mockProvider,
        config: serverValidationConfig 
      }));
    });

    it("should reject requests without resource parameter", async () => {
      const mockClient = {
        client_id: "test-client",
        client_name: "Test Client",
        redirect_uris: ["https://example.com/callback"],
        grant_types: ["authorization_code"],
        response_types: ["code"],
        scope: "read write",
        token_endpoint_auth_method: "none",
      };

      (mockProvider.clientsStore.getClient as jest.Mock).mockResolvedValue(mockClient);

      const response = await request(app)
        .get("/oauth/authorize")
        .query({
          client_id: "test-client",
          redirect_uri: "https://example.com/callback",
          response_type: "code",
          code_challenge: "test-challenge",
          code_challenge_method: "S256",
          state: "test-state"
        });

      expect(response.status).toBe(302);
      expect(response.headers.location).toContain("error=invalid_request");
      expect(response.headers.location).toContain("Resource+parameter+is+required+when+server+URL+validation+is+enabled");
    });

    it("should accept requests with resource parameter", async () => {
      const mockClient = {
        client_id: "test-client",
        client_name: "Test Client",
        redirect_uris: ["https://example.com/callback"],
        grant_types: ["authorization_code"],
        response_types: ["code"],
        scope: "read write",
        token_endpoint_auth_method: "none",
      };

      (mockProvider.clientsStore.getClient as jest.Mock).mockResolvedValue(mockClient);
      mockProvider.authorize.mockImplementation(async (client, params, res) => {
        res.redirect(`https://example.com/callback?code=auth-code&state=${params.state}`);
      });

      const response = await request(app)
        .get("/oauth/authorize")
        .query({
          client_id: "test-client",
          redirect_uri: "https://example.com/callback",
          response_type: "code",
          code_challenge: "test-challenge",
          code_challenge_method: "S256",
          state: "test-state",
          resource: "https://api.example.com/mcp"
        });

      expect(response.status).toBe(302);
      expect(response.headers.location).toContain("code=auth-code");
      expect(mockProvider.authorize).toHaveBeenCalledWith(
        mockClient,
        expect.objectContaining({
          resource: "https://api.example.com/mcp"
        }),
        expect.any(Object)
      );
    });
  });

  describe("warning mode (default behavior)", () => {
    const warnConfig: OAuthServerConfig = {
      // No configuration needed - warnings are always enabled by default
    };

    let consoleWarnSpy: jest.SpyInstance;

    beforeEach(() => {
      consoleWarnSpy = jest.spyOn(console, "warn").mockImplementation();
      app.use("/oauth/authorize", authorizationHandler({ 
        provider: mockProvider,
        config: warnConfig 
      }));
    });

    afterEach(() => {
      consoleWarnSpy.mockRestore();
    });

    it("should log warning when resource is missing", async () => {
      const mockClient = {
        client_id: "test-client",
        client_name: "Test Client",
        redirect_uris: ["https://example.com/callback"],
        grant_types: ["authorization_code"],
        response_types: ["code"],
        scope: "read write",
        token_endpoint_auth_method: "none",
      };

      (mockProvider.clientsStore.getClient as jest.Mock).mockResolvedValue(mockClient);
      mockProvider.authorize.mockImplementation(async (client, params, res) => {
        res.redirect(`https://example.com/callback?code=auth-code&state=${params.state}`);
      });

      await request(app)
        .get("/oauth/authorize")
        .query({
          client_id: "test-client",
          redirect_uri: "https://example.com/callback",
          response_type: "code",
          code_challenge: "test-challenge",
          code_challenge_method: "S256",
          state: "test-state"
        });

      expect(consoleWarnSpy).toHaveBeenCalledWith(
        expect.stringContaining("test-client is missing the resource parameter")
      );
    });

    it("should not log warning when resource is present", async () => {
      const mockClient = {
        client_id: "test-client",
        client_name: "Test Client",
        redirect_uris: ["https://example.com/callback"],
        grant_types: ["authorization_code"],
        response_types: ["code"],
        scope: "read write",
        token_endpoint_auth_method: "none",
      };

      (mockProvider.clientsStore.getClient as jest.Mock).mockResolvedValue(mockClient);
      mockProvider.authorize.mockImplementation(async (client, params, res) => {
        res.redirect(`https://example.com/callback?code=auth-code&state=${params.state}`);
      });

      await request(app)
        .get("/oauth/authorize")
        .query({
          client_id: "test-client",
          redirect_uri: "https://example.com/callback",
          response_type: "code",
          code_challenge: "test-challenge",
          code_challenge_method: "S256",
          state: "test-state",
          resource: "https://api.example.com/mcp"
        });

      expect(consoleWarnSpy).not.toHaveBeenCalled();
    });
  });

  // Note: No silent mode test anymore - warnings are always enabled

  describe("server URL validation (validateResourceMatchesServer: true)", () => {
    const serverValidationConfig: OAuthServerConfig = {
      serverUrl: "https://api.example.com/mcp",
      validateResourceMatchesServer: true
    };

    beforeEach(() => {
      app.use("/oauth/authorize", authorizationHandler({ 
        provider: mockProvider,
        config: serverValidationConfig 
      }));
    });

    it("should accept requests when resource matches server URL", async () => {
      const mockClient = {
        client_id: "test-client",
        client_name: "Test Client",
        redirect_uris: ["https://example.com/callback"],
        grant_types: ["authorization_code"],
        response_types: ["code"],
        scope: "read write",
        token_endpoint_auth_method: "none",
      };

      (mockProvider.clientsStore.getClient as jest.Mock).mockResolvedValue(mockClient);
      mockProvider.authorize.mockImplementation(async (client, params, res) => {
        res.redirect(`https://example.com/callback?code=auth-code&state=${params.state}`);
      });

      const response = await request(app)
        .get("/oauth/authorize")
        .query({
          client_id: "test-client",
          redirect_uri: "https://example.com/callback",
          response_type: "code",
          code_challenge: "test-challenge",
          code_challenge_method: "S256",
          state: "test-state",
          resource: "https://api.example.com/mcp"
        });

      expect(response.status).toBe(302);
      expect(response.headers.location).toContain("code=auth-code");
    });

    it("should reject requests when resource does not match server URL", async () => {
      const mockClient = {
        client_id: "test-client",
        client_name: "Test Client",
        redirect_uris: ["https://example.com/callback"],
        grant_types: ["authorization_code"],
        response_types: ["code"],
        scope: "read write",
        token_endpoint_auth_method: "none",
      };

      (mockProvider.clientsStore.getClient as jest.Mock).mockResolvedValue(mockClient);

      const response = await request(app)
        .get("/oauth/authorize")
        .query({
          client_id: "test-client",
          redirect_uri: "https://example.com/callback",
          response_type: "code",
          code_challenge: "test-challenge",
          code_challenge_method: "S256",
          state: "test-state",
          resource: "https://different.api.com/mcp"
        });

      expect(response.status).toBe(302);
      expect(response.headers.location).toContain("error=invalid_target");
      expect(response.headers.location).toContain("does+not+match+this+server");
    });

    it("should reject requests without resource parameter when validation is enabled", async () => {
      const mockClient = {
        client_id: "test-client",
        client_name: "Test Client",
        redirect_uris: ["https://example.com/callback"],
        grant_types: ["authorization_code"],
        response_types: ["code"],
        scope: "read write",
        token_endpoint_auth_method: "none",
      };

      (mockProvider.clientsStore.getClient as jest.Mock).mockResolvedValue(mockClient);

      const response = await request(app)
        .get("/oauth/authorize")
        .query({
          client_id: "test-client",
          redirect_uri: "https://example.com/callback",
          response_type: "code",
          code_challenge: "test-challenge",
          code_challenge_method: "S256",
          state: "test-state"
        });

      expect(response.status).toBe(302);
      expect(response.headers.location).toContain("error=invalid_request");
      expect(response.headers.location).toContain("Resource+parameter+is+required+when+server+URL+validation+is+enabled");
    });

    it("should handle server URL with fragment correctly", async () => {
      // Reconfigure with a server URL that has a fragment (though it shouldn't)
      const configWithFragment: OAuthServerConfig = {
        serverUrl: "https://api.example.com/mcp#fragment",
        validateResourceMatchesServer: true
      };

      app = express();
      app.use("/oauth/authorize", authorizationHandler({ 
        provider: mockProvider,
        config: configWithFragment 
      }));

      const mockClient = {
        client_id: "test-client",
        client_name: "Test Client",
        redirect_uris: ["https://example.com/callback"],
        grant_types: ["authorization_code"],
        response_types: ["code"],
        scope: "read write",
        token_endpoint_auth_method: "none",
      };

      (mockProvider.clientsStore.getClient as jest.Mock).mockResolvedValue(mockClient);
      mockProvider.authorize.mockImplementation(async (client, params, res) => {
        res.redirect(`https://example.com/callback?code=auth-code&state=${params.state}`);
      });

      const response = await request(app)
        .get("/oauth/authorize")
        .query({
          client_id: "test-client",
          redirect_uri: "https://example.com/callback",
          response_type: "code",
          code_challenge: "test-challenge",
          code_challenge_method: "S256",
          state: "test-state",
          resource: "https://api.example.com/mcp" // No fragment
        });

      expect(response.status).toBe(302);
      expect(response.headers.location).toContain("code=auth-code");
    });
  });
});