import { Platform } from 'react-native';

const SENSITIVE_AUTH_PARAMS = [
  'access_token',
  'refresh_token',
  'token',
  'token_hash',
  'code',
  'provider_token',
  'provider_refresh_token',
] as const;

/**
 * Remove auth secrets from the browser URL after they have been consumed.
 * Prevents leakage via history, Referer, screenshots, and shared links.
 */
export function stripSensitiveAuthParamsFromUrl(): void {
  if (Platform.OS !== 'web' || typeof window === 'undefined' || !window.history?.replaceState) {
    return;
  }

  try {
    const url = new URL(window.location.href);
    let changed = false;

    for (const key of SENSITIVE_AUTH_PARAMS) {
      if (url.searchParams.has(key)) {
        url.searchParams.delete(key);
        changed = true;
      }
    }

    if (url.hash && /access_token|refresh_token|token_hash|provider_token/i.test(url.hash)) {
      url.hash = '';
      changed = true;
    }

    if (changed) {
      const next = `${url.pathname}${url.search}${url.hash}`;
      window.history.replaceState(window.history.state, '', next);
    }
  } catch (error) {
    console.warn('Unable to strip auth params from URL:', error);
  }
}
