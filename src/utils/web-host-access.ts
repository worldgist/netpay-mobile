/** Hostnames where the public marketing site is served. */
const DEFAULT_MARKETING_ONLY_HOSTS = ["netppay.com", "www.netppay.com"];

/** App deep-link paths on netppay.com (always allowed). */
const ALLOWED_DEEP_LINK_PATH_PREFIXES = [
  "/reset-password",
  "/pay",
  "/open",
];

export const WEB_APP_BLOCKED_ON_HOST_MESSAGE =
  "Customer account features open in the NetPay app. Admin tools remain available on this website at /auth.";

function parseHostList(raw: string | undefined): string[] {
  if (!raw?.trim()) return [];
  return raw
    .split(",")
    .map((h) => h.trim().toLowerCase())
    .filter(Boolean);
}

export function getMarketingOnlyHosts(): string[] {
  const fromEnv = parseHostList(import.meta.env.VITE_BLOCK_WEB_APP_ON_HOSTS as string | undefined);
  if (fromEnv.length > 0) return fromEnv;
  return DEFAULT_MARKETING_ONLY_HOSTS;
}

export function isMarketingOnlyHost(hostname?: string): boolean {
  if (import.meta.env.DEV) return false;

  const host = (hostname ?? (typeof window !== "undefined" ? window.location.hostname : ""))
    .trim()
    .toLowerCase();

  if (!host) return false;

  return getMarketingOnlyHosts().includes(host);
}

/**
 * Customer wallet Vite UIs are removed — `/user/*` always redirects to Expo in App.tsx.
 * Admin (`/auth`, `/dashboard`, …) stays on Vite and is never blocked.
 * This helper remains for deep-link / future host rules; currently never blocks `/user`.
 */
export function isWebAppPathBlockedOnHost(pathname: string, hostname?: string): boolean {
  if (!isMarketingOnlyHost(hostname)) return false;

  const path = pathname.toLowerCase();
  const isDeepLinkAllowed = ALLOWED_DEEP_LINK_PATH_PREFIXES.some(
    (prefix) => path === prefix || path.startsWith(`${prefix}/`),
  );
  if (isDeepLinkAllowed) return false;

  // Never block — customer routes redirect to Expo; admin must stay reachable.
  void path;
  return false;
}
