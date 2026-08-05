/** Hostnames where only marketing/landing pages are allowed (no web wallet or admin). */
const DEFAULT_MARKETING_ONLY_HOSTS = ["netppay.com", "www.netppay.com"];

/** App deep-link paths on netppay.com (allowed even when web wallet is disabled). */
const ALLOWED_DEEP_LINK_PATH_PREFIXES = [
  "/reset-password",
  "/pay",
  "/open",
];

const BLOCKED_PATH_PREFIXES = [
  "/user",
  "/auth",
  "/dashboard",
  "/smeplug",
  "/ebills",
  "/payvessel",
  "/mobilenig",
  "/flutterwave",
  "/users",
  "/transactions",
  "/analytics",
  "/referrals",
  "/content",
  "/staff",
  "/notifications",
  "/email-notifications",
  "/settings",
  "/hr",
  "/electricity",
  "/cable-tv",
  "/import-cable-transactions",
  "/education",
  "/betting",
  "/platform-revenue",
  "/treasury",
  "/wallets",
  "/wallet-management",
  "/ledger",
  "/admin/ledger",
  "/data-plans",
  "/airtime",
  "/support-admin",
  "/compliance",
  "/admin",
];

export const WEB_APP_BLOCKED_ON_HOST_MESSAGE =
  "The NetPay wallet and account features are not available on this website. Please use the official NetPay mobile app to sign in, pay bills, and manage your wallet.";

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
