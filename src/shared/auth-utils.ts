/**
 * Utilities for handling OAuth resource URIs according to RFC 8707.
 */

/**
 * Converts a server URL to a resource URL by removing the fragment.
 * RFC 8707 section 2 states that resource URIs "MUST NOT include a fragment component".
 * Keeps everything else unchanged (scheme, domain, port, path, query).
 */
export function resourceUrlFromServerUrl(url: string): string {
  const hashIndex = url.indexOf('#');
  return hashIndex === -1 ? url : url.substring(0, hashIndex);
}

/**
 * Validates a resource URI according to RFC 8707 requirements.
 * @param resourceUri The resource URI to validate
 * @throws Error if the URI contains a fragment
 */
export function validateResourceUri(resourceUri: string): void {
  if (resourceUri.includes('#')) {
    throw new Error(`Invalid resource URI: ${resourceUri} - must not contain a fragment`);
  }
}

/**
 * Removes fragment from URI to make it RFC 8707 compliant.
 * @deprecated Use resourceUrlFromServerUrl instead
 */
export function canonicalizeResourceUri(resourceUri: string): string {
  return resourceUrlFromServerUrl(resourceUri);
}

/**
 * Extracts resource URI from server URL by removing fragment.
 * @param serverUrl The server URL to extract from
 * @returns The resource URI without fragment
 */
export function extractResourceUri(serverUrl: string | URL): string {
  return resourceUrlFromServerUrl(typeof serverUrl === 'string' ? serverUrl : serverUrl.href);
}

// Backward compatibility alias
export const extractCanonicalResourceUri = extractResourceUri;