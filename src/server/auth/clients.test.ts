import { OAuthRegisteredClientsStore } from './clients.js';
import { OAuthClientInformationFull } from '../../shared/auth.js';

describe('OAuthRegisteredClientsStore', () => {
  // Create a mock implementation class for testing
  class MockClientStore implements OAuthRegisteredClientsStore {
    private clients: Record<string, OAuthClientInformationFull> = {};

    async getClient(clientId: string): Promise<OAuthClientInformationFull | undefined> {
      const client = this.clients[clientId];

      // Return undefined for non-existent client
      if (!client) return undefined;

      // Check if client secret has expired
      if (client.client_secret &&
        client.client_secret_expires_at &&
        client.client_secret_expires_at < Math.floor(Date.now() / 1000)) {
        // If expired, retain client but remove the secret
        const { client_secret: _unused, ...clientWithoutSecret } = client;
        return clientWithoutSecret as OAuthClientInformationFull;
      }

      return client;
    }

    async registerClient(client: OAuthClientInformationFull): Promise<OAuthClientInformationFull> {
      this.clients[client.client_id] = { ...client };
      return client;
    }
  }

  let mockStore: MockClientStore;

  beforeEach(() => {
    mockStore = new MockClientStore();
  });

  describe('getClient', () => {
    it('returns undefined for non-existent client', async () => {
      const result = await mockStore.getClient('non-existent-id');
      expect(result).toBeUndefined();
    });

    it('returns client information for existing client', async () => {
      const mockClient: OAuthClientInformationFull = {
        client_id: 'test-client-123',
        client_secret: 'secret456',
        redirect_uris: ['https://example.com/callback']
      };

      await mockStore.registerClient(mockClient);
      const result = await mockStore.getClient('test-client-123');

      expect(result).toEqual(mockClient);
    });

    it('handles expired client secrets correctly', async () => {
      const now = Math.floor(Date.now() / 1000);

      // Client with expired secret (one hour in the past)
      const expiredClient: OAuthClientInformationFull = {
        client_id: 'expired-client',
        client_secret: 'expired-secret',
        client_secret_expires_at: now - 3600,
        redirect_uris: ['https://example.com/callback']
      };

      await mockStore.registerClient(expiredClient);
      const result = await mockStore.getClient('expired-client');

      // Expect client to be returned but without the secret
      expect(result).toBeDefined();
      expect(result!.client_id).toBe('expired-client');
      expect(result!.client_secret).toBeUndefined();
    });

    it('keeps valid client secrets', async () => {
      const now = Math.floor(Date.now() / 1000);

      // Client with valid secret (expires one hour in the future)
      const validClient: OAuthClientInformationFull = {
        client_id: 'valid-client',
        client_secret: 'valid-secret',
        client_secret_expires_at: now + 3600,
        redirect_uris: ['https://example.com/callback']
      };

      await mockStore.registerClient(validClient);
      const result = await mockStore.getClient('valid-client');

      // Secret should still be present
      expect(result?.client_secret).toBe('valid-secret');
    });
  });

  describe('registerClient', () => {
    it('successfully registers a new client', async () => {
      const newClient: OAuthClientInformationFull = {
        client_id: 'new-client-id',
        client_secret: 'new-client-secret',
        redirect_uris: ['https://example.com/callback']
      };

      const result = await mockStore.registerClient(newClient);

      // Verify registration returns the client
      expect(result).toEqual(newClient);

      // Verify the client is retrievable
      const storedClient = await mockStore.getClient('new-client-id');
      expect(storedClient).toEqual(newClient);
    });

    it('handles clients with all metadata fields', async () => {
      const fullClient: OAuthClientInformationFull = {
        client_id: 'full-client',
        client_secret: 'full-secret',
        client_id_issued_at: Math.floor(Date.now() / 1000),
        client_secret_expires_at: Math.floor(Date.now() / 1000) + 86400, // 24 hours
        redirect_uris: ['https://example.com/callback'],
        token_endpoint_auth_method: 'client_secret_basic',
        grant_types: ['authorization_code', 'refresh_token'],
        response_types: ['code'],
        client_name: 'Test Client',
        client_uri: 'https://example.com',
        logo_uri: 'https://example.com/logo.png',
        scope: 'profile email',
        contacts: ['dev@example.com'],
        tos_uri: 'https://example.com/tos',
        policy_uri: 'https://example.com/privacy',
        jwks_uri: 'https://example.com/jwks',
        software_id: 'test-software',
        software_version: '1.0.0'
      };

      await mockStore.registerClient(fullClient);
      const result = await mockStore.getClient('full-client');

      expect(result).toEqual(fullClient);
    });
  });
});