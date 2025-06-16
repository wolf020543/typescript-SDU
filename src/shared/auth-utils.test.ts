import { validateResourceUri, extractResourceUri, resourceUrlFromServerUrl } from './auth-utils.js';

describe('auth-utils', () => {
  describe('resourceUrlFromServerUrl', () => {
    it('should remove fragments', () => {
      expect(resourceUrlFromServerUrl('https://example.com/path#fragment')).toBe('https://example.com/path');
      expect(resourceUrlFromServerUrl('https://example.com#fragment')).toBe('https://example.com');
      expect(resourceUrlFromServerUrl('https://example.com/path?query=1#fragment')).toBe('https://example.com/path?query=1');
    });

    it('should return URL unchanged if no fragment', () => {
      expect(resourceUrlFromServerUrl('https://example.com')).toBe('https://example.com');
      expect(resourceUrlFromServerUrl('https://example.com/path')).toBe('https://example.com/path');
      expect(resourceUrlFromServerUrl('https://example.com/path?query=1')).toBe('https://example.com/path?query=1');
    });

    it('should keep everything else unchanged', () => {
      // Case sensitivity preserved
      expect(resourceUrlFromServerUrl('HTTPS://EXAMPLE.COM/PATH')).toBe('HTTPS://EXAMPLE.COM/PATH');
      // Ports preserved
      expect(resourceUrlFromServerUrl('https://example.com:443/path')).toBe('https://example.com:443/path');
      expect(resourceUrlFromServerUrl('https://example.com:8080/path')).toBe('https://example.com:8080/path');
      // Query parameters preserved
      expect(resourceUrlFromServerUrl('https://example.com?foo=bar&baz=qux')).toBe('https://example.com?foo=bar&baz=qux');
      // Trailing slashes preserved
      expect(resourceUrlFromServerUrl('https://example.com/')).toBe('https://example.com/');
      expect(resourceUrlFromServerUrl('https://example.com/path/')).toBe('https://example.com/path/');
    });
  });


  describe('validateResourceUri', () => {
    it('should accept valid resource URIs without fragments', () => {
      expect(() => validateResourceUri('https://example.com')).not.toThrow();
      expect(() => validateResourceUri('https://example.com/path')).not.toThrow();
      expect(() => validateResourceUri('http://example.com:8080')).not.toThrow();
      expect(() => validateResourceUri('https://example.com?query=1')).not.toThrow();
      expect(() => validateResourceUri('ftp://example.com')).not.toThrow(); // Only fragment check now
    });

    it('should reject URIs with fragments', () => {
      expect(() => validateResourceUri('https://example.com#fragment')).toThrow('must not contain a fragment');
      expect(() => validateResourceUri('https://example.com/path#section')).toThrow('must not contain a fragment');
      expect(() => validateResourceUri('https://example.com?query=1#anchor')).toThrow('must not contain a fragment');
    });

    it('should accept any URI without fragment', () => {
      // These are all valid now since we only check for fragments
      expect(() => validateResourceUri('//example.com')).not.toThrow();
      expect(() => validateResourceUri('https://user:pass@example.com')).not.toThrow();
      expect(() => validateResourceUri('/path')).not.toThrow();
      expect(() => validateResourceUri('path')).not.toThrow();
    });
  });

  describe('extractResourceUri', () => {
    it('should remove fragments from URLs', () => {
      expect(extractResourceUri('https://example.com/path#fragment')).toBe('https://example.com/path');
      expect(extractResourceUri('https://example.com/path?query=1#fragment')).toBe('https://example.com/path?query=1');
    });

    it('should handle URL object', () => {
      const url = new URL('https://example.com:8443/path?query=1#fragment');
      expect(extractResourceUri(url)).toBe('https://example.com:8443/path?query=1');
    });

    it('should keep everything else unchanged', () => {
      // Preserves case
      expect(extractResourceUri('HTTPS://EXAMPLE.COM/path')).toBe('HTTPS://EXAMPLE.COM/path');
      // Preserves all ports
      expect(extractResourceUri('https://example.com:443/path')).toBe('https://example.com:443/path');
      expect(extractResourceUri('http://example.com:80/path')).toBe('http://example.com:80/path');
      // Preserves query parameters
      expect(extractResourceUri('https://example.com/path?query=1')).toBe('https://example.com/path?query=1');
      // Preserves trailing slashes
      expect(extractResourceUri('https://example.com/')).toBe('https://example.com/');
      expect(extractResourceUri('https://example.com/app1/')).toBe('https://example.com/app1/');
    });

    it('should distinguish between different paths on same domain', () => {
      // This is the key test for the security concern mentioned
      const app1 = extractResourceUri('https://api.example.com/mcp-server-1');
      const app2 = extractResourceUri('https://api.example.com/mcp-server-2');
      expect(app1).not.toBe(app2);
      expect(app1).toBe('https://api.example.com/mcp-server-1');
      expect(app2).toBe('https://api.example.com/mcp-server-2');
    });
  });
});