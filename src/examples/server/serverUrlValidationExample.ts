/**
 * Example demonstrating server URL validation for RFC 8707 compliance
 * 
 * This example shows how to configure an OAuth server to validate that
 * the resource parameter in requests matches the server's own URL,
 * ensuring tokens are only issued for this specific server.
 */

import express from 'express';
import { authorizationHandler } from '../../server/auth/handlers/authorize.js';
import { tokenHandler } from '../../server/auth/handlers/token.js';
import { DemoInMemoryAuthProvider } from './demoInMemoryOAuthProvider.js';
import { OAuthServerConfig } from '../../server/auth/types.js';

// The canonical URL where this MCP server is accessible
const SERVER_URL = 'https://api.example.com/mcp';

// Configuration that validates resource matches this server
const serverValidationConfig: OAuthServerConfig = {
  // The server's canonical URL (without fragment)
  serverUrl: SERVER_URL,
  
  // Enable validation that resource parameter matches serverUrl
  // This also makes the resource parameter required
  validateResourceMatchesServer: true
};

// Create the OAuth provider
const provider = new DemoInMemoryAuthProvider();

// Create Express app
const app = express();

// Configure authorization endpoint with server URL validation
app.use('/oauth/authorize', authorizationHandler({
  provider,
  config: serverValidationConfig
}));

// Configure token endpoint with server URL validation
app.use('/oauth/token', tokenHandler({
  provider,
  config: serverValidationConfig
}));

// Example scenarios
console.log('🔐 Server URL Validation Example\n');
console.log(`This server only accepts resource parameters matching: ${SERVER_URL}\n`);

console.log('✅ Valid request examples:');
console.log(`1. Resource matches server URL:
   GET /oauth/authorize?client_id=my-client&resource=${SERVER_URL}&...
   Result: Authorization proceeds normally\n`);

console.log(`2. Resource with query parameters (exact match required):
   GET /oauth/authorize?client_id=my-client&resource=${SERVER_URL}?version=2&...
   Result: Rejected - resource must match exactly\n`);

console.log('❌ Invalid request examples:');
console.log(`1. Different domain:
   GET /oauth/authorize?client_id=my-client&resource=https://evil.com/mcp&...
   Response: 400 invalid_target - "Resource parameter 'https://evil.com/mcp' does not match this server's URL"\n`);

console.log(`2. Different path:
   GET /oauth/authorize?client_id=my-client&resource=https://api.example.com/different&...
   Response: 400 invalid_target - "Resource parameter does not match this server's URL"\n`);

console.log(`3. Missing resource (with validateResourceMatchesServer: true):
   GET /oauth/authorize?client_id=my-client&...
   Response: 400 invalid_request - "Resource parameter is required when server URL validation is enabled"\n`);

console.log('🛡️  Security Benefits:');
console.log('1. Prevents token confusion attacks - tokens cannot be obtained for other servers');
console.log('2. Ensures all tokens are scoped to this specific MCP server');
console.log('3. Provides clear audit trail of resource access attempts');
console.log('4. Protects against malicious clients trying to obtain tokens for other services\n');

console.log('📝 Configuration Notes:');
console.log('- serverUrl should be the exact URL clients use to connect');
console.log('- Fragments are automatically removed from both serverUrl and resource');
console.log('- When validateResourceMatchesServer is true, resource parameter is required');
console.log('- Validation ensures exact match between resource and serverUrl\n');

console.log('🔧 Implementation Tips:');
console.log('1. Set serverUrl from environment variable for different deployments:');
console.log('   serverUrl: process.env.MCP_SERVER_URL || "https://api.example.com/mcp"\n');

console.log('2. For development environments, you might disable validation:');
console.log('   validateResourceMatchesServer: process.env.NODE_ENV === "production"\n');

console.log('3. Consider logging failed validation attempts for security monitoring:');
console.log('   Monitor logs for patterns of invalid_target errors\n');

// Example of dynamic configuration based on environment
const productionConfig: OAuthServerConfig = {
  serverUrl: process.env.MCP_SERVER_URL || SERVER_URL,
  validateResourceMatchesServer: process.env.NODE_ENV === 'production'
};

console.log('🚀 Production configuration example:');
console.log(JSON.stringify(productionConfig, null, 2));

export { app, provider, serverValidationConfig };