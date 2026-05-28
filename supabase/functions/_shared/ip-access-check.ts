const CORS_HEADERS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

export { CORS_HEADERS };

export const VPN_PROXY_BLOCK_MESSAGE =
  "NetPay cannot be used while connected through a VPN, proxy, or anonymizing network. Please disable it and try again.";

export type IpAccessResult = {
  allowed: boolean;
  blocked: boolean;
  reason?: string;
  ip?: string | null;
  detection?: string;
};

const PRIVATE_IP_PATTERNS = [
  /^127\./,
  /^10\./,
  /^192\.168\./,
  /^172\.(1[6-9]|2\d|3[0-1])\./,
  /^::1$/,
  /^fc00:/i,
  /^fe80:/i,
];

export function getClientIp(req: Request): string | null {
  const cf = req.headers.get("cf-connecting-ip")?.trim();
  if (cf) return cf;

  const forwarded = req.headers.get("x-forwarded-for");
  if (forwarded) {
    const first = forwarded.split(",")[0]?.trim();
    if (first) return first;
  }

  const realIp = req.headers.get("x-real-ip")?.trim();
  if (realIp) return realIp;

  return null;
}

export function isPrivateOrLocalIp(ip: string): boolean {
  const normalized = ip.trim().toLowerCase();
  if (!normalized || normalized === "unknown") return true;
  return PRIVATE_IP_PATTERNS.some((pattern) => pattern.test(normalized));
}

function isCheckDisabled(): boolean {
  return Deno.env.get("IP_ACCESS_CHECK_DISABLED") === "true";
}

function isBlockingEnabled(): boolean {
  return Deno.env.get("BLOCK_VPN_PROXY") !== "false";
}

function shouldFailClosed(): boolean {
  return Deno.env.get("IP_ACCESS_FAIL_CLOSED") === "true";
}

type ProxycheckEntry = {
  proxy?: string;
  type?: string;
  risk?: string | number;
};

async function queryProxycheck(ip: string): Promise<IpAccessResult> {
  const apiKey = Deno.env.get("PROXYCHECK_API_KEY")?.trim();
  const params = new URLSearchParams({
    vpn: "1",
    asn: "1",
    risk: "1",
  });
  if (apiKey) params.set("key", apiKey);

  const response = await fetch(
    `https://proxycheck.io/v2/${encodeURIComponent(ip)}?${params.toString()}`,
    { headers: { Accept: "application/json" } },
  );

  if (!response.ok) {
    throw new Error(`proxycheck HTTP ${response.status}`);
  }

  const payload = await response.json() as Record<string, unknown>;
  const entry = payload[ip] as ProxycheckEntry | undefined;

  if (!entry) {
    return { allowed: true, blocked: false, ip, detection: "proxycheck:no-entry" };
  }

  const proxyFlag = String(entry.proxy ?? "").toLowerCase() === "yes";
  const type = String(entry.type ?? "").toLowerCase();
  const risk = Number(entry.risk ?? 0);

  const isVpn = type.includes("vpn");
  const isProxy = proxyFlag || type.includes("proxy");
  const isTor = type.includes("tor");
  const isHosting = type.includes("hosting") || type.includes("datacenter");

  if (isVpn || isProxy || isTor) {
    const label = isVpn ? "VPN" : isProxy ? "proxy" : "Tor";
    return {
      allowed: false,
      blocked: true,
      ip,
      detection: `proxycheck:${label}`,
      reason: VPN_PROXY_BLOCK_MESSAGE,
    };
  }

  // High-risk anonymizer scores from proxycheck (when available).
  if (risk >= 66 && (proxyFlag || isHosting)) {
    return {
      allowed: false,
      blocked: true,
      ip,
      detection: "proxycheck:high-risk",
      reason: VPN_PROXY_BLOCK_MESSAGE,
    };
  }

  return { allowed: true, blocked: false, ip, detection: "proxycheck:clean" };
}

/** Fallback when proxycheck is unavailable (no API key required). */
async function queryIpapiIs(ip: string): Promise<IpAccessResult> {
  const response = await fetch(`https://api.ipapi.is/?q=${encodeURIComponent(ip)}`, {
    headers: { Accept: "application/json" },
  });
  if (!response.ok) {
    throw new Error(`ipapi.is HTTP ${response.status}`);
  }

  const payload = await response.json() as {
    is_vpn?: boolean;
    is_proxy?: boolean;
    is_tor?: boolean;
    is_datacenter?: boolean;
    is_abuser?: boolean;
  };

  if (payload.is_vpn || payload.is_proxy || payload.is_tor) {
    const label = payload.is_vpn ? "vpn" : payload.is_proxy ? "proxy" : "tor";
    return {
      allowed: false,
      blocked: true,
      ip,
      detection: `ipapi.is:${label}`,
      reason: VPN_PROXY_BLOCK_MESSAGE,
    };
  }

  if (payload.is_datacenter && payload.is_abuser) {
    return {
      allowed: false,
      blocked: true,
      ip,
      detection: "ipapi.is:datacenter-abuser",
      reason: VPN_PROXY_BLOCK_MESSAGE,
    };
  }

  return { allowed: true, blocked: false, ip, detection: "ipapi.is:clean" };
}

export async function checkIpAccess(req: Request): Promise<IpAccessResult> {
  const ip = getClientIp(req);

  if (isCheckDisabled()) {
    return { allowed: true, blocked: false, ip, detection: "disabled" };
  }

  if (!isBlockingEnabled()) {
    return { allowed: true, blocked: false, ip, detection: "blocking-disabled" };
  }

  if (!ip || isPrivateOrLocalIp(ip)) {
    return { allowed: true, blocked: false, ip, detection: "local-or-private" };
  }

  try {
    return await queryProxycheck(ip);
  } catch (proxycheckError) {
    console.warn("proxycheck lookup failed, trying ipapi.is fallback:", proxycheckError);
    try {
      return await queryIpapiIs(ip);
    } catch (fallbackError) {
      console.error("IP access fallback failed:", fallbackError);
      if (shouldFailClosed()) {
        return {
          allowed: false,
          blocked: true,
          ip,
          detection: "lookup-failed",
          reason: "Unable to verify your network connection. Please try again without VPN or proxy.",
        };
      }
      return { allowed: true, blocked: false, ip, detection: "lookup-failed-open" };
    }
  }
}

/** Use at the start of sensitive edge functions (sign-in, purchases). */
export async function enforceIpAccess(
  req: Request,
): Promise<Response | null> {
  const result = await checkIpAccess(req);
  if (!result.blocked) return null;

  return new Response(
    JSON.stringify({
      success: false,
      error: result.reason ?? VPN_PROXY_BLOCK_MESSAGE,
      code: "VPN_PROXY_BLOCKED",
      blocked: true,
    }),
    { status: 403, headers: { ...CORS_HEADERS, "Content-Type": "application/json" } },
  );
}
