import { getServiceClient } from "../lib/supabase.js";
import { env } from "../env.js";
import { randomToken } from "../lib/crypto.js";

export type OAuthClient = {
  client_id: string;
  redirect_uris: string[];
  client_name?: string | null;
  created_at?: string;
  cimd?: boolean;
};

/**
 * Platform allowlist only — never trust arbitrary client redirect_uris.
 * Includes ChatGPT stable redirect + legacy callback-ID patterns from OpenAI docs.
 */
const DEFAULT_REDIRECT_ALLOWLIST = [
  "https://chatgpt.com/connector_platform_oauth_redirect",
  "https://chatgpt.com/connector/oauth/*/callback",
  "https://chatgpt.com/connector/oauth/callback",
  "https://chatgpt.com/aip/*/oauth/callback",
  "https://chat.openai.com/aip/*/oauth/callback",
  "https://chat.openai.com/connector_platform_oauth_redirect",
];

function globalRedirectAllowlist(): string[] {
  return [...env.chatgptRedirectUris(), ...DEFAULT_REDIRECT_ALLOWLIST];
}

export function isRedirectGloballyAllowed(uri: string): boolean {
  return globalRedirectAllowlist().some((pattern) => matchRedirect(pattern, uri));
}

export function isRedirectAllowed(uri: string, _clientUris: string[]): boolean {
  return isRedirectGloballyAllowed(uri);
}

function matchRedirect(pattern: string, uri: string): boolean {
  if (pattern === uri) return true;
  if (!pattern.includes("*")) return false;
  const escaped = pattern.replace(/[.+?^${}()|[\]\\]/g, "\\$&").replace(/\*/g, "[^/]+");
  return new RegExp(`^${escaped}$`).test(uri);
}

function isHttpsUrl(value: string): boolean {
  try {
    const url = new URL(value);
    return url.protocol === "https:";
  } catch {
    return false;
  }
}

/**
 * Resolve a ChatGPT CIMD client_id (HTTPS metadata document URL).
 * Validates published redirect_uris against our global allowlist.
 */
export async function resolveCimdClient(clientId: string): Promise<OAuthClient | null> {
  if (!isHttpsUrl(clientId)) return null;
  // Only trust OpenAI-hosted CIMD documents
  let host: string;
  try {
    host = new URL(clientId).hostname.toLowerCase();
  } catch {
    return null;
  }
  if (!["chatgpt.com", "www.chatgpt.com", "chat.openai.com", "www.chat.openai.com"].includes(host)) {
    return null;
  }

  const response = await fetch(clientId, {
    headers: { Accept: "application/json" },
    redirect: "follow",
  });
  if (!response.ok) return null;
  const doc = (await response.json()) as {
    client_id?: string;
    client_name?: string;
    redirect_uris?: string[];
  };
  const redirectUris = Array.isArray(doc.redirect_uris) ? doc.redirect_uris.map(String) : [];
  if (!redirectUris.length) return null;
  const allowed = redirectUris.filter(isRedirectGloballyAllowed);
  if (!allowed.length) return null;

  return {
    client_id: doc.client_id || clientId,
    redirect_uris: allowed,
    client_name: doc.client_name || "ChatGPT",
    cimd: true,
  };
}

/**
 * Register or upsert a client only when every redirect URI is on the global allowlist.
 */
export async function getOrRegisterClient(params: {
  clientId?: string;
  redirectUris: string[];
  clientName?: string;
}): Promise<OAuthClient> {
  if (!params.redirectUris.length) {
    throw new Error("redirect_uris required");
  }
  for (const uri of params.redirectUris) {
    if (!isRedirectGloballyAllowed(uri)) {
      throw new Error(`redirect_uri not allowed: ${uri}`);
    }
  }

  // CIMD client_ids are HTTPS URLs — prefer live metadata over inventing a new id
  if (params.clientId && isHttpsUrl(params.clientId)) {
    const cimd = await resolveCimdClient(params.clientId);
    if (cimd) {
      // Persist for audit / token binding (best-effort)
      try {
        await persistClient({
          clientId: cimd.client_id,
          redirectUris: Array.from(new Set([...cimd.redirect_uris, ...params.redirectUris])),
          clientName: cimd.client_name || params.clientName || "ChatGPT",
        });
      } catch {
        // non-fatal
      }
      return {
        ...cimd,
        redirect_uris: Array.from(
          new Set([...cimd.redirect_uris, ...params.redirectUris]).values(),
        ).filter(isRedirectGloballyAllowed),
      };
    }
  }

  return persistClient({
    clientId: params.clientId || `np_${randomToken(12)}`,
    redirectUris: params.redirectUris,
    clientName: params.clientName || "ChatGPT",
  });
}

async function persistClient(params: {
  clientId: string;
  redirectUris: string[];
  clientName: string;
}): Promise<OAuthClient> {
  const db = getServiceClient();

  const { data: existing } = await db
    .from("chatgpt_oauth_clients")
    .select("*")
    .eq("client_id", params.clientId)
    .maybeSingle();

  if (existing) {
    const prior = (existing.redirect_uris || []) as string[];
    const merged = Array.from(
      new Set([...prior, ...params.redirectUris].filter(isRedirectGloballyAllowed)),
    );
    if (merged.join("|") !== prior.filter(isRedirectGloballyAllowed).join("|")) {
      await db
        .from("chatgpt_oauth_clients")
        .update({ redirect_uris: merged, client_name: params.clientName })
        .eq("client_id", params.clientId);
    }
    return {
      client_id: existing.client_id,
      redirect_uris: merged.length ? merged : prior,
      client_name: existing.client_name,
      created_at: existing.created_at,
    };
  }

  const { data, error } = await db
    .from("chatgpt_oauth_clients")
    .upsert(
      {
        client_id: params.clientId,
        redirect_uris: params.redirectUris,
        client_name: params.clientName,
      },
      { onConflict: "client_id" },
    )
    .select("*")
    .single();
  if (error || !data) throw new Error(error?.message || "Failed to register client");
  return {
    client_id: data.client_id,
    redirect_uris: data.redirect_uris || [],
    client_name: data.client_name,
    created_at: data.created_at,
  };
}

export async function findClient(clientId: string): Promise<OAuthClient | null> {
  if (isHttpsUrl(clientId)) {
    const cimd = await resolveCimdClient(clientId);
    if (cimd) return cimd;
  }

  const db = getServiceClient();
  const { data } = await db
    .from("chatgpt_oauth_clients")
    .select("*")
    .eq("client_id", clientId)
    .maybeSingle();
  if (!data) return null;
  return {
    client_id: data.client_id,
    redirect_uris: data.redirect_uris || [],
    client_name: data.client_name,
    created_at: data.created_at,
  };
}

export async function assertClientRedirect(clientId: string, redirectUri: string): Promise<OAuthClient> {
  if (!isRedirectGloballyAllowed(redirectUri)) {
    throw new Error("redirect_uri not allowed");
  }
  let client = await findClient(clientId);
  if (!client) {
    client = await getOrRegisterClient({
      clientId,
      redirectUris: [redirectUri],
      clientName: "ChatGPT",
    });
  }
  // CIMD / DCR: redirect must be globally allowed (already checked) and preferably listed on client
  if (client.redirect_uris.length && !client.redirect_uris.includes(redirectUri)) {
    // Allow if globally allowlisted (ChatGPT may rotate callback shapes within allowlist)
    if (!isRedirectGloballyAllowed(redirectUri)) {
      throw new Error("redirect_uri not registered for client");
    }
  }
  return client;
}
