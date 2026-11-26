export type AuthLinkParams = {
  email?: string;
  accessToken?: string;
  refreshToken?: string;
  tokenHash?: string;
  type?: string;
  code?: string;
  error?: string;
  errorDescription?: string;
};

const AUTH_PARAM_KEYS = [
  'email',
  'access_token',
  'refresh_token',
  'token_hash',
  'token',
  'type',
  'code',
  'error',
  'error_description',
] as const;

function readParam(
  target: AuthLinkParams,
  key: (typeof AUTH_PARAM_KEYS)[number],
  value: string | null | undefined,
): void {
  if (!value) return;

  switch (key) {
    case 'email':
      target.email = value;
      break;
    case 'access_token':
      target.accessToken = value;
      break;
    case 'refresh_token':
      target.refreshToken = value;
      break;
    case 'token_hash':
    case 'token':
      target.tokenHash = target.tokenHash || value;
      break;
    case 'type':
      target.type = value;
      break;
    case 'code':
      target.code = value;
      break;
    case 'error':
      target.error = value;
      break;
    case 'error_description':
      target.errorDescription = value;
      break;
    default:
      break;
  }
}

function readFromSearchParams(target: AuthLinkParams, params: URLSearchParams): void {
  for (const key of AUTH_PARAM_KEYS) {
    readParam(target, key, params.get(key));
  }
}

/**
 * Extract Supabase auth callback params from a deep link URL and optional parsed query params.
 */
export function parseAuthLinkParams(
  url: string,
  queryParams?: Record<string, unknown> | null,
): AuthLinkParams {
  const result: AuthLinkParams = {};

  if (queryParams) {
    for (const key of AUTH_PARAM_KEYS) {
      readParam(result, key, typeof queryParams[key] === 'string' ? queryParams[key] : undefined);
    }
  }

  if (!url?.trim()) {
    return result;
  }

  try {
    const parsed = new URL(url);
    readFromSearchParams(result, parsed.searchParams);

    if (parsed.hash) {
      readFromSearchParams(result, new URLSearchParams(parsed.hash.replace(/^#/, '')));
    }
  } catch {
    const hashIndex = url.indexOf('#');
    if (hashIndex >= 0) {
      readFromSearchParams(result, new URLSearchParams(url.slice(hashIndex + 1)));
    }

    const queryIndex = url.indexOf('?');
    if (queryIndex >= 0) {
      const queryEnd = hashIndex >= 0 ? hashIndex : url.length;
      readFromSearchParams(result, new URLSearchParams(url.slice(queryIndex + 1, queryEnd)));
    }
  }

  return result;
}
