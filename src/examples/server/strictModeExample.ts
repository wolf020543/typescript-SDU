/**
 * Example demonstrating strict RFC 8707 enforcement mode
 * 
 * This example shows how to configure an OAuth server that requires
 * all requests to include a resource parameter, ensuring maximum
 * security against token confusion attacks.
 */

import express from 'express';
import { authorizationHandler } from '../../server/auth/handlers/authorize.js';
import { tokenHandler } from '../../server/auth/handlers/token.js';
import { DemoInMemoryAuthProvider } from './demoInMemoryOAuthProvider.js';
import { OAuthServerConfig } from '../../server/auth/types.js';

// Strict mode configuration - validates resource matches server URL
const SERVER_URL = 'https://api.example.com/mcp';
const strictConfig: OAuthServerConfig = {
  serverUrl: SERVER_URL,
  validateResourceMatchesServer: true
};

// Create the OAuth provider
const provider = new DemoInMemoryAuthProvider();

// Create Express app
const app = express();

// Configure authorization endpoint with strict mode
app.use('/oauth/authorize', authorizationHandler({
  provider,
  config: strictConfig,
  rateLimit: {
    windowMs: 15 * 60 * 1000, // 15 minutes
    max: 10 // limit each IP to 10 requests per window
  }
}));

// Configure token endpoint with strict mode
app.use('/oauth/token', tokenHandler({
  provider,
  config: strictConfig,
  rateLimit: {
    windowMs: 15 * 60 * 1000, // 15 minutes
    max: 20 // limit each IP to 20 requests per window
  }
}));

// Example of what happens with different requests:
console.log('🔒 Strict RFC 8707 Mode Example\n');
console.log(`This server validates that resource parameter matches: ${SERVER_URL}\n`);

console.log('✅ Valid request example:');
console.log(`GET /oauth/authorize?client_id=my-client&response_type=code&code_challenge=abc123&code_challenge_method=S256&resource=${SERVER_URL}\n`);

console.log('❌ Invalid request examples:');
console.log('1. Missing resource:');
console.log('GET /oauth/authorize?client_id=my-client&response_type=code&code_challenge=abc123&code_challenge_method=S256');
console.log('Response: 400 Bad Request - "Resource parameter is required when server URL validation is enabled"\n');

console.log('2. Wrong resource:');
console.log('GET /oauth/authorize?client_id=my-client&response_type=code&code_challenge=abc123&code_challenge_method=S256&resource=https://evil.com/mcp');
console.log(`Response: 400 Bad Request - "Resource parameter 'https://evil.com/mcp' does not match this server's URL '${SERVER_URL}'"\n`);

console.log('📋 Benefits of server URL validation:');
console.log('1. Prevents token confusion attacks - tokens can only be issued for this server');
console.log('2. Ensures all tokens are properly scoped to this specific MCP server');
console.log('3. No accidental token leakage to other services');
console.log('4. Clear security boundary enforcement\n');

console.log('⚠️  Migration considerations:');
console.log('1. Server must know its canonical URL (configure via environment variable)');
console.log('2. All clients must send the exact matching resource parameter');
console.log('3. Consider using warnings-only mode first (validateResourceMatchesServer: false)');
console.log('4. Monitor logs to track adoption before enabling validation\n');

// Example middleware to track resource parameter usage
app.use((req, res, next) => {
  if (req.path.includes('/oauth/')) {
    const hasResource = req.query.resource || req.body?.resource;
    console.log(`[${new Date().toISOString()}] OAuth request to ${req.path} - Resource parameter: ${hasResource ? 'present' : 'MISSING'}`);
  }
  next();
});

export { app, provider, strictConfig };