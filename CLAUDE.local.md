# RFC 8707 Resource Indicators Implementation for MCP TypeScript SDK

This PR implements RFC 8707 (Resource Indicators for OAuth 2.0) in the MCP TypeScript SDK, addressing critical security vulnerabilities and adding resource-scoped authorization support.

## Issues Addressed

- **Fixes #592**: Implements client-side resource parameter passing to prevent token confusion attacks
- **Related to #635**: Demonstrates server-side RFC 8707 validation in the demo OAuth provider

## Overview

This implementation adds resource parameter support to MCP's OAuth flow, explicitly binding access tokens to specific MCP servers. This prevents malicious servers from stealing OAuth tokens intended for other services.

## Implementation Summary

### 1. Core Auth Infrastructure

#### Client-Side Changes (`src/client/`)
- **auth.ts**: Added resource parameter support to authorization and token exchange flows
- **Transport layers** (sse.ts, streamableHttp.ts): Automatically extract canonical server URIs for resource parameter

#### Server-Side Changes (`src/server/auth/`)
- **handlers/**: Updated authorize and token handlers to accept and pass through resource parameters
- **provider.ts**: Extended provider interface to support resource parameters
- **errors.ts**: Added `InvalidTargetError` for RFC 8707 compliance

#### Shared Utilities (`src/shared/`)
- **auth-utils.ts**: Created utilities for resource URI validation and canonicalization
- **auth.ts**: Updated OAuth schemas to include resource parameter

### 2. Demo OAuth Provider Enhancement (`src/examples/server/`)

The demo provider demonstrates how to implement RFC 8707 validation:
- Optional resource validation during authorization (via `DemoOAuthProviderConfig`)
- Resource consistency checks during token exchange
- Resource information included in token introspection
- Support for validating resources against a configured server URL
- Client-specific resource allowlists

### 3. Resource URI Requirements

Resource URIs follow RFC 8707 requirements:
- **MUST NOT** include fragments (automatically removed by the SDK)
- The SDK preserves all other URL components (scheme, host, port, path, query) exactly as provided
- No additional canonicalization is performed to maintain compatibility with various server configurations

## Client vs Server Implementation Differences

### Client-Side Implementation
- **Automatic resource extraction**: Transports automatically determine the server URI for resource parameter
- **Transparent integration**: Resource parameter is added without changing existing auth APIs
- **Fragment removal**: Fragments are automatically removed from URIs per RFC 8707
- **Focus**: Ensuring resource parameter is correctly included in all OAuth requests

### Server-Side Implementation
- **Core handlers**: Pass through resource parameter without validation
- **Demo provider**: Shows how to implement resource validation
- **Provider flexibility**: Auth providers decide how to enforce resource restrictions
- **Backward compatibility**: Servers work with clients that don't send resource parameter
- **Focus**: Demonstrating best practices for resource validation

## Testing Approach Differences

### Client-Side Tests
- **Unit tests**: Verify resource parameter is included in auth URLs and token requests
- **Validation tests**: Ensure resource URI validation and canonicalization work correctly
- **Integration focus**: Test interaction between transport layer and auth module

### Server-Side Tests
- **Handler tests**: Verify resource parameter is accepted and passed to providers
- **Demo provider tests**: Comprehensive tests for server URL validation and client-specific allowlists
- **Security tests**: Verify invalid resources are rejected with proper errors
- **Configuration tests**: Test various demo provider configurations
- **End-to-end tests**: Full OAuth flow with resource validation

## Security Considerations

1. **Token Binding**: Tokens are explicitly bound to the resource they're intended for
2. **Validation**: Both client and server validate resource URIs to prevent attacks
3. **Consistency**: Resource must match between authorization and token exchange
4. **Introspection**: Resource information is included in token introspection responses

## Migration Guide

### For Client Developers
No changes required - the SDK automatically includes the resource parameter based on the server URL.

### For Server Developers
1. Core server handlers automatically pass through the resource parameter
2. Custom auth providers can implement resource validation as shown in the demo provider
3. Demo provider configuration options:
   - `serverUrl`: The canonical URL of the MCP server
   - `validateResourceMatchesServer`: Enable strict resource validation
4. Return `invalid_target` error for unauthorized resources
5. Include resource in token introspection responses

## Example Usage

```typescript
// Client automatically includes resource parameter
const transport = new StreamableHttpClientTransport(
  'https://api.example.com/mcp',
  authProvider
);

// Demo provider configuration with resource validation
const demoProviderConfig = {
  serverUrl: 'https://api.example.com/mcp',
  validateResourceMatchesServer: true  // Makes resource required and validates it
};
const provider = new DemoInMemoryAuthProvider(demoProviderConfig);
```

## Future Enhancements

1. Add support for multiple resource parameters (RFC 8707 allows arrays)
2. Implement resource-specific scope restrictions
3. Add telemetry for resource parameter usage
4. Create migration tooling for existing deployments

## References

- [RFC 8707 - Resource Indicators for OAuth 2.0](https://datatracker.ietf.org/doc/html/rfc8707)
- [OAuth 2.0 Security Best Current Practice](https://datatracker.ietf.org/doc/html/draft-ietf-oauth-security-topics)
- [MCP Issue #544 - Security Vulnerability](https://github.com/modelcontextprotocol/modelcontextprotocol/issues/544)