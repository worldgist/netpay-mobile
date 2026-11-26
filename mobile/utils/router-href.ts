import type { Href } from 'expo-router';

type RouteParams = Record<string, string | number | boolean | null | undefined>;

/** Build a typed Expo Router href string to avoid deprecated object navigate calls. */
export function buildRouteHref(pathname: string, params?: RouteParams): Href {
  if (!params) {
    return pathname as Href;
  }

  const search = new URLSearchParams();

  for (const [key, value] of Object.entries(params)) {
    if (value == null || value === '') {
      continue;
    }
    search.set(key, String(value));
  }

  const query = search.toString();
  return (query ? `${pathname}?${query}` : pathname) as Href;
}
