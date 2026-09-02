/** Hostnames where the public marketing site is served (customer web wallet stays off). */
const DEFAULT_MARKETING_ONLY_HOSTS = ["netppay.com", "www.netppay.com"];

/** App deep-link paths on netppay.com (allowed even when the web wallet is disabled). */
const ALLOWED_DEEP_LINK_PATH_PREFIXES = [
  "/reset-password",
  "/pay",
  "/open",
];

/** Customer web-wallet routes only. Admin login lives at /auth and must work in production. */
const BLOCKED_PATH_PREFIXES = [
  "/user",
];

export const WEB_APP_BLOCKED_ON_HOST_MESSAGE =
  "The NetPay customer wallet is not available on this website. Please use the official NetPay mobile app to sign in, pay bills, and manage your wallet.";

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

export function isWebAppPathBlockedOnHost(pathname: string, hostname?: string): boolean {
  if (!isMarketingOnlyHost(hostname)) return false;

  const path = pathname.toLowerCase();
  const isDeepLinkAllowed = ALLOWED_DEEP_LINK_PATH_PREFIXES.some(
    (prefix) => path === prefix || path.startsWith(`${prefix}/`),
  );
  if (isDeepLinkAllowed) return false;

  return BLOCKED_PATH_PREFIXES.some(
    (prefix) => path === prefix || path.startsWith(`${prefix}/`),
  );
}
