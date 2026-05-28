const DEFAULT_MARKETING_ONLY_HOSTS = ["netpayy.ng", "www.netpayy.ng"];

const ALLOWED_DEEP_LINK_PATH_PREFIXES = ["/reset-password", "/pay", "/open"];

const BLOCKED_PATH_PREFIXES = [
  "/user",
  "/auth",
  "/dashboard",
  "/smeplug",
  "/ebills",
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
  "/data-plans",
  "/airtime",
  "/support-admin",
  "/compliance",
  "/admin",
];

export const WEB_APP_BLOCKED_ON_HOST_MESSAGE =
  "The NetPay wallet and account features are not available on this website. Please use the official NetPay mobile app.";

function parseHostList(raw: string | undefined): string[] {
  if (!raw?.trim()) return [];
  return raw.split(",").map((h) => h.trim().toLowerCase()).filter(Boolean);
}

function getMarketingOnlyHosts(): string[] {
  const fromEnv = parseHostList(Deno.env.get("BLOCK_WEB_APP_ON_HOSTS"));
  if (fromEnv.length > 0) return fromEnv;
  return DEFAULT_MARKETING_ONLY_HOSTS;
}

export function isMarketingOnlyHost(hostname: string | null | undefined): boolean {
  const host = hostname?.trim().toLowerCase() ?? "";
  if (!host) return false;
  return getMarketingOnlyHosts().includes(host);
}

export function isWebAppPathBlockedOnHost(
  pathname: string | null | undefined,
  hostname: string | null | undefined,
): boolean {
  if (!isMarketingOnlyHost(hostname)) return false;
  const path = (pathname ?? "").toLowerCase();
  if (!path) return true;
  return BLOCKED_PATH_PREFIXES.some(
    (prefix) => path === prefix || path.startsWith(`${prefix}/`),
  );
}

export function enforceWebHostAccess(body: {
  hostname?: unknown;
  pathname?: unknown;
}): { blocked: boolean; reason?: string } {
  if (Deno.env.get("WEB_APP_HOST_BLOCK_DISABLED") === "true") {
    return { blocked: false };
  }

  const hostname = typeof body.hostname === "string" ? body.hostname : null;
  const pathname = typeof body.pathname === "string" ? body.pathname : null;

  const path = (pathname ?? "").toLowerCase();
  const deepLinkAllowed = ALLOWED_DEEP_LINK_PATH_PREFIXES.some(
    (prefix) => path === prefix || path.startsWith(`${prefix}/`),
  );
  if (deepLinkAllowed) {
    return { blocked: false };
  }

  if (!isWebAppPathBlockedOnHost(pathname, hostname)) {
    return { blocked: false };
  }

  return { blocked: true, reason: WEB_APP_BLOCKED_ON_HOST_MESSAGE };
}
