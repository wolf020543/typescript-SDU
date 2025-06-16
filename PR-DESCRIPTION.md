# RFC 8707 Resource Indicators Implementation

<!-- Provide a brief summary of your changes -->
Implements RFC 8707 (Resource Indicators for OAuth 2.0) support in the MCP TypeScript SDK. This adds the `resource` parameter to OAuth authorization and token exchange flows, allowing access tokens to be explicitly bound to specific MCP servers. The implementation includes automatic resource extraction in client transports, server-side parameter passing, and demonstrates resource validation in the demo OAuth provider.

(Fixes #592, Related to #635)

## Motivation and Context
<!-- Why is this change needed? What problem does it solve? -->
This change addresses critical security vulnerabilities identified in https://github.com/modelcontextprotocol/modelcontextprotocol/issues/544. Without resource indicators, OAuth tokens intended for one MCP server could be stolen and misused by malicious servers. RFC 8707 prevents these token confusion attacks by explicitly binding tokens to their intended resources.

Key problems solved:
- Prevents token theft/confusion attacks where a malicious MCP server steals tokens meant for other services
- Enables fine-grained access control by restricting OAuth clients to specific resources
- Improves security posture by following OAuth 2.0 Security Best Current Practice recommendations

## How Has This Been Tested?
<!-- Have you tested this in a real application? Which scenarios were tested? -->
Comprehensive test coverage has been added:

**Client-side testing:**
- Unit tests verify resource parameter inclusion in authorization URLs and token requests (512 new lines in auth.test.ts)
- Transport layer tests ensure automatic resource extraction works correctly
- Fragment removal and URI validation tests

**Server-side testing:**
- Authorization handler tests for resource parameter acceptance
- Token handler tests for resource parameter passing
- Demo provider tests for resource restrictions and validation (including server URL validation)
- Proxy provider tests for resource parameter forwarding

**Integration testing:**
- End-to-end OAuth flow with resource validation
- Resource validation example demonstrating real-world usage patterns
- Tests for both clients with and without resource restrictions

## Breaking Changes

While the change is breaking at a protocol level, it should not require code changes from SDK users (just SDK version bumping).

- **Client developers**: No code changes required. The SDK automatically extracts and includes the resource parameter from the server URL
- **Server developers**: The core server handlers now pass through the resource parameter. Resource validation is demonstrated in the demo provider but remains optional for custom providers
- **Auth providers**: Should be updated to accept and handle the resource parameter. The demo provider shows how to implement server URL validation and client-specific resource restrictions

## Types of changes
<!-- What types of changes does your code introduce? Put an `x` in all the boxes that apply: -->
- [x] Bug fix (non-breaking change which fixes an issue)
- [x] New feature (non-breaking change which adds functionality)
- [ ] Breaking change (fix or feature that would cause existing functionality to change)
- [ ] Documentation update

## Checklist
<!-- Go over all the following points, and put an `x` in all the boxes that apply. -->
- [x] I have read the [MCP Documentation](https://modelcontextprotocol.io)
- [x] My code follows the repository's style guidelines
- [x] New and existing tests pass locally
- [x] I have added appropriate error handling
- [x] I have added or updated documentation as needed

## Additional context
<!-- Add any other context, implementation notes, or design decisions -->

### Server-Side Implementation Approach

The core server implementation focuses on passing through the resource parameter without enforcing validation, maintaining backward compatibility and flexibility. The demo provider demonstrates how to implement RFC 8707 validation:

1. **Core Server**: Handlers accept and forward the resource parameter to auth providers without validation
2. **Demo Provider**: Shows how to implement comprehensive resource validation including:
   - Server URL matching validation (configurable via `DemoOAuthProviderConfig`)
   - Client-specific resource allowlists
   - Warning logs for missing resource parameters
   - Consistent resource validation between authorization and token exchange

This separation allows:
- Existing providers to continue working without modification
- New providers to implement validation according to their security requirements
- Gradual migration to RFC 8707 compliance
- Different validation strategies for different deployment scenarios

### Implementation Approach

Resource URIs are used as-is with only fragment removal (per RFC requirement). This allows having different MCP servers under different subpaths (even w/ different query URLs) w/o sharing spilling their resource authorization to each other (to allow a variety of MCP server federation use cases).

### Key Components Added
1. **Shared utilities** (`auth-utils.ts`): Resource URI handling and validation
2. **Client auth** modifications: Resource parameter support in authorization/token flows
3. **Transport layers**: Automatic resource extraction from server URLs
4. **Server handlers**: Resource parameter acceptance and forwarding
5. **Demo provider**: Full RFC 8707 implementation with resource validation
6. **Error handling**: New `InvalidTargetError` for RFC 8707 compliance

### Example Usage
```typescript
// Client-side (automatic)
const transport = new StreamableHttpClientTransport(
  'https://api.example.com/mcp',
  authProvider
);

// Demo provider configuration with validation
const demoProviderConfig = {
  serverUrl: 'https://api.example.com/mcp',
  validateResourceMatchesServer: true  // Makes resource required and validates it matches serverUrl
};
const provider = new DemoInMemoryAuthProvider(demoProviderConfig);
```

### References
- [RFC 8707 - Resource Indicators for OAuth 2.0](https://datatracker.ietf.org/doc/html/rfc8707)
- Fixes #592: OAuth token confusion vulnerability - client-side resource parameter support
- Related to #635: Demonstrates server-side RFC 8707 validation in demo provider