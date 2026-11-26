/**
 * Client-side allowlist mirroring chatgpt-mcp OAuth redirect policy.
 * Never redirect OAuth callbacks to arbitrary URLs from the query string.
 */

const DEFAULT_REDIRECT_ALLOWLIST = [
  'https://chatgpt.com/connector_platform_oauth_redirect',
  'https://chatgpt.com/connector/oauth/*/callback',
  'https://chatgpt.com/connector/oauth/callback',
  'https://chatgpt.com/aip/*/oauth/callback',
  'https://chat.openai.com/aip/*/oauth/callback',
  'https://chat.openai.com/connector_platform_oauth_redirect',
];

function matchRedirect(pattern: string, uri: string): boolean {
  if (pattern === uri) return true;
  if (!pattern.includes('*')) return false;
  const escaped = pattern.replace(/[.+?^${}()|[\]\\]/g, '\\$&').replace(/\*/g, '[^/]+');
  return new RegExp(`^${escaped}$`).test(uri);
}

export function isChatgptOAuthRedirectAllowed(uri: string): boolean {
  const trimmed = (uri || '').trim();
  if (!trimmed.startsWith('https://')) return false;
  return DEFAULT_REDIRECT_ALLOWLIST.some((pattern) => matchRedirect(pattern, trimmed));
}
