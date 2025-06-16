import { describe, it, expect, beforeEach } from '@jest/globals';
import { DemoInMemoryAuthProvider, DemoInMemoryClientsStore } from './demoInMemoryOAuthProvider.js';
import { InvalidTargetError } from '../../server/auth/errors.js';
import { OAuthClientInformationFull } from '../../shared/auth.js';
import { Response } from 'express';

describe('DemoInMemoryOAuthProvider - RFC 8707 Resource Validation', () => {
  let provider: DemoInMemoryAuthProvider;
  let clientsStore: DemoInMemoryClientsStore;
  let mockClient: OAuthClientInformationFull & { allowed_resources?: string[] };
  let mockResponse: Partial<Response>;

  beforeEach(() => {
    provider = new DemoInMemoryAuthProvider();
    clientsStore = provider.clientsStore as DemoInMemoryClientsStore;
    
    mockClient = {
      client_id: 'test-client',
      client_name: 'Test Client',
      client_uri: 'https://example.com',
      redirect_uris: ['https://example.com/callback'],
      grant_types: ['authorization_code'],
      response_types: ['code'],
      scope: 'mcp:tools',
      token_endpoint_auth_method: 'none',
    };

    mockResponse = {
      redirect: jest.fn(),
    };
  });

  describe('Authorization with resource parameter', () => {
    it('should allow authorization when no resources are configured', async () => {
      await clientsStore.registerClient(mockClient);
      
      await expect(provider.authorize(mockClient, {
        codeChallenge: 'test-challenge',
        redirectUri: mockClient.redirect_uris[0],
        resource: 'https://api.example.com/v1',
        scopes: ['mcp:tools']
      }, mockResponse as Response)).resolves.not.toThrow();

      expect(mockResponse.redirect).toHaveBeenCalled();
    });

    it('should allow authorization when resource is in allowed list', async () => {
      mockClient.allowed_resources = ['https://api.example.com/v1', 'https://api.example.com/v2'];
      await clientsStore.registerClient(mockClient);
      
      await expect(provider.authorize(mockClient, {
        codeChallenge: 'test-challenge',
        redirectUri: mockClient.redirect_uris[0],
        resource: 'https://api.example.com/v1',
        scopes: ['mcp:tools']
      }, mockResponse as Response)).resolves.not.toThrow();

      expect(mockResponse.redirect).toHaveBeenCalled();
    });

    it('should reject authorization when resource is not in allowed list', async () => {
      mockClient.allowed_resources = ['https://api.example.com/v1'];
      await clientsStore.registerClient(mockClient);
      
      await expect(provider.authorize(mockClient, {
        codeChallenge: 'test-challenge',
        redirectUri: mockClient.redirect_uris[0],
        resource: 'https://api.forbidden.com',
        scopes: ['mcp:tools']
      }, mockResponse as Response)).rejects.toThrow(InvalidTargetError);
    });
  });

  describe('Token exchange with resource validation', () => {
    let authorizationCode: string;

    beforeEach(async () => {
      await clientsStore.registerClient(mockClient);
      
      // Authorize without resource first
      await provider.authorize(mockClient, {
        codeChallenge: 'test-challenge',
        redirectUri: mockClient.redirect_uris[0],
        scopes: ['mcp:tools']
      }, mockResponse as Response);

      // Extract authorization code from redirect call
      const redirectCall = (mockResponse.redirect as jest.Mock).mock.calls[0][0];
      const url = new URL(redirectCall);
      authorizationCode = url.searchParams.get('code')!;
    });

    it('should exchange code successfully when resource matches', async () => {
      // First authorize with a specific resource
      mockResponse.redirect = jest.fn();
      await provider.authorize(mockClient, {
        codeChallenge: 'test-challenge',
        redirectUri: mockClient.redirect_uris[0],
        resource: 'https://api.example.com/v1',
        scopes: ['mcp:tools']
      }, mockResponse as Response);

      const redirectCall = (mockResponse.redirect as jest.Mock).mock.calls[0][0];
      const url = new URL(redirectCall);
      const codeWithResource = url.searchParams.get('code')!;

      const tokens = await provider.exchangeAuthorizationCode(
        mockClient,
        codeWithResource,
        undefined,
        undefined,
        'https://api.example.com/v1'
      );

      expect(tokens).toHaveProperty('access_token');
      expect(tokens.token_type).toBe('bearer');
    });

    it('should reject token exchange when resource does not match', async () => {
      // First authorize with a specific resource
      mockResponse.redirect = jest.fn();
      await provider.authorize(mockClient, {
        codeChallenge: 'test-challenge',
        redirectUri: mockClient.redirect_uris[0],
        resource: 'https://api.example.com/v1',
        scopes: ['mcp:tools']
      }, mockResponse as Response);

      const redirectCall = (mockResponse.redirect as jest.Mock).mock.calls[0][0];
      const url = new URL(redirectCall);
      const codeWithResource = url.searchParams.get('code')!;

      await expect(provider.exchangeAuthorizationCode(
        mockClient,
        codeWithResource,
        undefined,
        undefined,
        'https://api.different.com'
      )).rejects.toThrow(InvalidTargetError);
    });

    it('should reject token exchange when resource was not authorized but is requested', async () => {
      await expect(provider.exchangeAuthorizationCode(
        mockClient,
        authorizationCode,
        undefined,
        undefined,
        'https://api.example.com/v1'
      )).rejects.toThrow(InvalidTargetError);
    });

    it('should store resource in token data', async () => {
      // Authorize with resource
      mockResponse.redirect = jest.fn();
      await provider.authorize(mockClient, {
        codeChallenge: 'test-challenge',
        redirectUri: mockClient.redirect_uris[0],
        resource: 'https://api.example.com/v1',
        scopes: ['mcp:tools']
      }, mockResponse as Response);

      const redirectCall = (mockResponse.redirect as jest.Mock).mock.calls[0][0];
      const url = new URL(redirectCall);
      const codeWithResource = url.searchParams.get('code')!;

      const tokens = await provider.exchangeAuthorizationCode(
        mockClient,
        codeWithResource,
        undefined,
        undefined,
        'https://api.example.com/v1'
      );

      // Verify token has resource information
      const tokenDetails = provider.getTokenDetails(tokens.access_token);
      expect(tokenDetails?.resource).toBe('https://api.example.com/v1');
    });
  });

  describe('Refresh token with resource validation', () => {
    it('should validate resource when exchanging refresh token', async () => {
      mockClient.allowed_resources = ['https://api.example.com/v1'];
      await clientsStore.registerClient(mockClient);

      await expect(provider.exchangeRefreshToken(
        mockClient,
        'refresh-token',
        undefined,
        'https://api.forbidden.com'
      )).rejects.toThrow(InvalidTargetError);
    });
  });

  describe('Allowed resources management', () => {
    it('should update allowed resources for a client', async () => {
      await clientsStore.registerClient(mockClient);
      
      // Initially no resources configured
      await expect(provider.authorize(mockClient, {
        codeChallenge: 'test-challenge',
        redirectUri: mockClient.redirect_uris[0],
        resource: 'https://any.api.com',
        scopes: ['mcp:tools']
      }, mockResponse as Response)).resolves.not.toThrow();

      // Set allowed resources
      clientsStore.setAllowedResources(mockClient.client_id, ['https://api.example.com/v1']);

      // Now should reject unauthorized resources
      await expect(provider.authorize(mockClient, {
        codeChallenge: 'test-challenge',
        redirectUri: mockClient.redirect_uris[0],
        resource: 'https://any.api.com',
        scopes: ['mcp:tools']
      }, mockResponse as Response)).rejects.toThrow(InvalidTargetError);
    });
  });
});