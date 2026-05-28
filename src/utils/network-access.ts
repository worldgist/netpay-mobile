import type { SupabaseClient } from "@supabase/supabase-js";

export const VPN_PROXY_BLOCK_MESSAGE =
  "NetPay cannot be used while connected through a VPN, proxy, or anonymizing network. Please disable it and try again.";

export type NetworkAccessStatus = {
  allowed: boolean;
  blocked: boolean;
  reason?: string;
  ip?: string | null;
};

function getWebClientContext(): { hostname?: string; pathname?: string } {
  if (typeof window === "undefined") return {};
  return {
    hostname: window.location.hostname,
    pathname: window.location.pathname,
  };
}

export async function checkNetworkAccess(
  supabase: SupabaseClient,
): Promise<NetworkAccessStatus> {
  try {
    const { data, error } = await supabase.functions.invoke("check-network-access", {
      body: getWebClientContext(),
    });

    if (error) {
      console.warn("Network access check invoke error:", error);
      return { allowed: true, blocked: false };
    }

    if (!data?.success) {
      console.warn("Network access check failed:", data?.error);
      return { allowed: true, blocked: false };
    }

    return {
      allowed: Boolean(data.allowed),
      blocked: Boolean(data.blocked),
      reason: typeof data.reason === "string" ? data.reason : undefined,
      ip: typeof data.ip === "string" ? data.ip : null,
    };
  } catch (err) {
    console.warn("Network access check exception:", err);
    return { allowed: true, blocked: false };
  }
}

export async function assertNetworkAccessAllowed(supabase: SupabaseClient): Promise<void> {
  const status = await checkNetworkAccess(supabase);
  if (status.blocked || !status.allowed) {
    throw new Error(status.reason || VPN_PROXY_BLOCK_MESSAGE);
  }
}
