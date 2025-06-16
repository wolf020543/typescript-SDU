import { describe, it, expect, beforeEach } from '@jest/globals';
import { DemoInMemoryAuthProvider, DemoInMemoryClientsStore } from './demoInMemoryOAuthProvider.js';
import { OAuthClientInformationFull } from '../../shared/auth.js';
import { Response } from 'express';

describe('DemoInMemoryOAuthProvider', () => {
  let provider: DemoInMemoryAuthProvider;
  let clientsStore: DemoInMemoryClientsStore;
  let mockClient: OAuthClientInformationFull;
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

  describe('Basic authorization flow', () => {
    it('should handle authorization successfully', async () => {
      await clientsStore.registerClient(mockClient);
      
      await provider.authorize(mockClient, {
        codeChallenge: 'test-challenge',
        redirectUri: mockClient.redirect_uris[0],
        resource: new URL('https://api.example.com/v1'),
        scopes: ['mcp:tools']
      }, mockResponse as Response);

      expect(mockResponse.redirect).toHaveBeenCalled();
      const redirectCall = (mockResponse.redirect as jest.Mock).mock.calls[0][0];
      expect(redirectCall).toContain('code=');
    });

    it('should handle authorization without resource', async () => {
      await clientsStore.registerClient(mockClient);
      
      await provider.authorize(mockClient, {
        codeChallenge: 'test-challenge',
        redirectUri: mockClient.redirect_uris[0],
        scopes: ['mcp:tools']
      }, mockResponse as Response);

      expect(mockResponse.redirect).toHaveBeenCalled();
    });

    it('should preserve state parameter', async () => {
      await clientsStore.registerClient(mockClient);
      
      await provider.authorize(mockClient, {
        codeChallenge: 'test-challenge',
        redirectUri: mockClient.redirect_uris[0],
        state: 'test-state',
        scopes: ['mcp:tools']
      }, mockResponse as Response);

      const redirectCall = (mockResponse.redirect as jest.Mock).mock.calls[0][0];
      expect(redirectCall).toContain('state=test-state');
    });
  });

  describe('Token exchange', () => {
    let authorizationCode: string;

    beforeEach(async () => {
      await clientsStore.registerClient(mockClient);
      
      await provider.authorize(mockClient, {
        codeChallenge: 'test-challenge',
        redirectUri: mockClient.redirect_uris[0],
        scopes: ['mcp:tools']
      }, mockResponse as Response);

      const redirectCall = (mockResponse.redirect as jest.Mock).mock.calls[0][0];
      const url = new URL(redirectCall);
      authorizationCode = url.searchParams.get('code')!;
    });

    it('should exchange authorization code for tokens', async () => {
      const tokens = await provider.exchangeAuthorizationCode(
        mockClient,
        authorizationCode
      );

      expect(tokens).toHaveProperty('access_token');
      expect(tokens.token_type).toBe('bearer');
      expect(tokens.expires_in).toBe(3600);
    });

    it('should reject invalid authorization code', async () => {
      await expect(provider.exchangeAuthorizationCode(
        mockClient,
        'invalid-code'
      )).rejects.toThrow('Invalid authorization code');
    });

    it('should reject code from different client', async () => {
      const otherClient: OAuthClientInformationFull = {
        ...mockClient,
        client_id: 'other-client'
      };
      
      await clientsStore.registerClient(otherClient);

      await expect(provider.exchangeAuthorizationCode(
        otherClient,
        authorizationCode
      )).rejects.toThrow('Authorization code was not issued to this client');
    });

    it('should store resource in token when provided during authorization', async () => {
      mockResponse.redirect = jest.fn();
      await provider.authorize(mockClient, {
        codeChallenge: 'test-challenge',
        redirectUri: mockClient.redirect_uris[0],
        resource: new URL('https://api.example.com/v1'),
        scopes: ['mcp:tools']
      }, mockResponse as Response);

      const redirectCall = (mockResponse.redirect as jest.Mock).mock.calls[0][0];
      const url = new URL(redirectCall);
      const codeWithResource = url.searchParams.get('code')!;

      const tokens = await provider.exchangeAuthorizationCode(
        mockClient,
        codeWithResource
      );

      const tokenDetails = provider.getTokenDetails(tokens.access_token);
      expect(tokenDetails?.resource).toEqual(new URL('https://api.example.com/v1'));
    });
  });

  describe('Token verification', () => {
    it('should verify valid access token', async () => {
      await clientsStore.registerClient(mockClient);
      
      await provider.authorize(mockClient, {
        codeChallenge: 'test-challenge',
        redirectUri: mockClient.redirect_uris[0],
        scopes: ['mcp:tools']
      }, mockResponse as Response);

      const redirectCall = (mockResponse.redirect as jest.Mock).mock.calls[0][0];
      const url = new URL(redirectCall);
      const code = url.searchParams.get('code')!;

      const tokens = await provider.exchangeAuthorizationCode(mockClient, code);
      const tokenInfo = await provider.verifyAccessToken(tokens.access_token);

      expect(tokenInfo.clientId).toBe(mockClient.client_id);
      expect(tokenInfo.scopes).toEqual(['mcp:tools']);
    });

    it('should reject invalid token', async () => {
      await expect(provider.verifyAccessToken('invalid-token'))
        .rejects.toThrow('Invalid or expired token');
    });
  });

  describe('Refresh token', () => {
    it('should throw error for refresh token (not implemented)', async () => {
      await clientsStore.registerClient(mockClient);

      await expect(provider.exchangeRefreshToken(
        mockClient,
        'refresh-token'
      )).rejects.toThrow('Refresh tokens not implemented for example demo');
    });
  });

  describe('Server URL validation', () => {
    it('should accept mcpServerUrl configuration', () => {
      const serverUrl = new URL('https://api.example.com/mcp');
      const providerWithUrl = new DemoInMemoryAuthProvider({ mcpServerUrl: serverUrl });
      
      expect(providerWithUrl).toBeDefined();
    });

    it('should handle server URL with fragment', () => {
      const serverUrl = new URL('https://api.example.com/mcp#fragment');
      const providerWithUrl = new DemoInMemoryAuthProvider({ mcpServerUrl: serverUrl });
      
      expect(providerWithUrl).toBeDefined();
    });
  });
});