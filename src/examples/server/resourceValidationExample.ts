/**
 * Example demonstrating RFC 8707 Resource Indicators for OAuth 2.0
 * 
 * This example shows how to configure and use resource validation in the MCP OAuth flow.
 * RFC 8707 allows OAuth clients to specify which protected resource they intend to access,
 * and enables authorization servers to restrict tokens to specific resources.
 */

import { DemoInMemoryAuthProvider } from './demoInMemoryOAuthProvider.js';
import { OAuthClientInformationFull } from '../../shared/auth.js';

async function demonstrateResourceValidation() {
  // Create the OAuth provider
  const provider = new DemoInMemoryAuthProvider();
  const clientsStore = provider.clientsStore;

  // Register a client with specific allowed resources
  const clientWithResources: OAuthClientInformationFull & { allowed_resources?: string[] } = {
    client_id: 'resource-aware-client',
    client_name: 'Resource-Aware MCP Client',
    client_uri: 'https://example.com',
    redirect_uris: ['https://example.com/callback'],
    grant_types: ['authorization_code'],
    response_types: ['code'],
    scope: 'mcp:tools mcp:resources',
    token_endpoint_auth_method: 'none',
    // RFC 8707: Specify which resources this client can access
    allowed_resources: [
      'https://api.example.com/mcp/v1',
      'https://api.example.com/mcp/v2',
      'https://tools.example.com/mcp'
    ]
  };

  await clientsStore.registerClient(clientWithResources);

  console.log('Registered client with allowed resources:', clientWithResources.allowed_resources);

  // Example 1: Authorization request with valid resource
  try {
    const mockResponse = {
      redirect: (url: string) => {
        console.log('✅ Authorization successful, redirecting to:', url);
      }
    };

    await provider.authorize(clientWithResources, {
      codeChallenge: 'S256-challenge-here',
      redirectUri: clientWithResources.redirect_uris[0],
      resource: 'https://api.example.com/mcp/v1', // Valid resource
      scopes: ['mcp:tools']
    }, mockResponse as any);
  } catch (error) {
    console.error('Authorization failed:', error);
  }

  // Example 2: Authorization request with invalid resource
  try {
    const mockResponse = {
      redirect: (url: string) => {
        console.log('Redirecting to:', url);
      }
    };

    await provider.authorize(clientWithResources, {
      codeChallenge: 'S256-challenge-here',
      redirectUri: clientWithResources.redirect_uris[0],
      resource: 'https://unauthorized.api.com/mcp', // Invalid resource
      scopes: ['mcp:tools']
    }, mockResponse as any);
  } catch (error) {
    console.error('❌ Authorization failed as expected:', error instanceof Error ? error.message : String(error));
  }

  // Example 3: Client without resource restrictions
  const openClient: OAuthClientInformationFull = {
    client_id: 'open-client',
    client_name: 'Open MCP Client',
    client_uri: 'https://open.example.com',
    redirect_uris: ['https://open.example.com/callback'],
    grant_types: ['authorization_code'],
    response_types: ['code'],
    scope: 'mcp:tools',
    token_endpoint_auth_method: 'none',
    // No allowed_resources specified - can access any resource
  };

  await clientsStore.registerClient(openClient);

  try {
    const mockResponse = {
      redirect: (url: string) => {
        console.log('✅ Open client can access any resource, redirecting to:', url);
      }
    };

    await provider.authorize(openClient, {
      codeChallenge: 'S256-challenge-here',
      redirectUri: openClient.redirect_uris[0],
      resource: 'https://any.api.com/mcp', // Any resource is allowed
      scopes: ['mcp:tools']
    }, mockResponse as any);
  } catch (error) {
    console.error('Authorization failed:', error);
  }

  // Example 4: Token introspection with resource information
  // First, simulate getting a token with resource restriction
  const mockAuthCode = 'demo-auth-code';
  const mockTokenResponse = await simulateTokenExchange(provider, clientWithResources, mockAuthCode);
  
  if (mockTokenResponse) {
    const tokenDetails = provider.getTokenDetails(mockTokenResponse.access_token);
    console.log('\n📋 Token introspection result:');
    console.log('- Client ID:', tokenDetails?.clientId);
    console.log('- Scopes:', tokenDetails?.scopes);
    console.log('- Resource (aud):', tokenDetails?.resource);
    console.log('- Token is restricted to:', tokenDetails?.resource || 'No resource restriction');
  }
}

async function simulateTokenExchange(
  provider: DemoInMemoryAuthProvider,
  client: OAuthClientInformationFull,
  authCode: string
) {
  // This is a simplified simulation - in real usage, the auth code would come from the authorization flow
  console.log('\n🔄 Simulating token exchange with resource validation...');
  
  // Note: In a real implementation, you would:
  // 1. Get the authorization code from the redirect after authorize()
  // 2. Exchange it for tokens using the token endpoint
  // 3. The resource parameter in the token request must match the one from authorization
  
  return {
    access_token: 'demo-token-with-resource',
    token_type: 'bearer',
    expires_in: 3600,
    scope: 'mcp:tools'
  };
}

// Usage instructions
console.log('🚀 RFC 8707 Resource Indicators Demo\n');
console.log('This example demonstrates how to:');
console.log('1. Register clients with allowed resources');
console.log('2. Validate resource parameters during authorization');
console.log('3. Include resource information in tokens');
console.log('4. Handle invalid_target errors\n');

// Run the demonstration
demonstrateResourceValidation().catch(console.error);