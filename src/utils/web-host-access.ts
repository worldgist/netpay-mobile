/** Hostnames where optional marketing-only rules can apply (via env). */
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
 * Path blocking is disabled — customer `/user/*` and admin share the Vite site.
 * Kept for deep-link / future host rules.
 */
export function isWebAppPathBlockedOnHost(pathname: string, hostname?: string): boolean {
  if (!isMarketingOnlyHost(hostname)) return false;

  const path = pathname.toLowerCase();
  const isDeepLinkAllowed = ALLOWED_DEEP_LINK_PATH_PREFIXES.some(
    (prefix) => path === prefix || path.startsWith(`${prefix}/`),
  );
  if (isDeepLinkAllowed) return false;

  void path;
  return false;
}
