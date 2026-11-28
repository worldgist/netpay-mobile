/**
 * Resolve SMEPLUG / MobileNig credentials from Supabase Edge Function secrets.
 * Optional fallback: public.vendors.api_key / secret (admin Vendors page).
 */
import { createClient, type SupabaseClient } from "https://esm.sh/@supabase/supabase-js@2";

function firstNonEmpty(...values: Array<string | null | undefined>): string | null {
  for (const value of values) {
    const trimmed = typeof value === "string" ? value.trim() : "";
    if (trimmed) return trimmed;
  }
  return null;
}

function envFirst(...names: string[]): string | null {
  return firstNonEmpty(...names.map((name) => Deno.env.get(name)));
}

let cachedServiceClient: SupabaseClient | null = null;

function serviceClient(): SupabaseClient | null {
  if (cachedServiceClient) return cachedServiceClient;
  const url = Deno.env.get("SUPABASE_URL") ?? "";
  const key = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";
  if (!url || !key) return null;
  cachedServiceClient = createClient(url, key);
  return cachedServiceClient;
}

async function vendorRow(
  name: string,
  supabase?: SupabaseClient | null,
): Promise<{ api_key: string | null; secret: string | null } | null> {
  const client = supabase ?? serviceClient();
  if (!client) return null;
  try {
    const { data, error } = await client
      .from("vendors")
      .select("api_key, secret")
      .ilike("name", name)
      .maybeSingle();
    if (error || !data) return null;
    return {
      api_key: typeof data.api_key === "string" ? data.api_key : null,
      secret: typeof data.secret === "string" ? data.secret : null,
    };
  } catch (error) {
    console.warn(`vendor-secrets: failed reading vendors.${name}:`, error);
    return null;
  }
}

/** SMEPLUG Bearer token — Edge secret SMEPLUG_SECRET_KEY (aliases supported). */
export function getSmeplugSecretKeyFromEnv(): string | null {
  return envFirst(
    "SMEPLUG_SECRET_KEY",
    "SMEPLUG_API_KEY",
    "SMEPLUG_KEY",
    "SME_PLUG_SECRET_KEY",
  );
}

export async function resolveSmeplugSecretKey(
  supabase?: SupabaseClient | null,
): Promise<string | null> {
  const fromEnv = getSmeplugSecretKeyFromEnv();
  if (fromEnv) return fromEnv;
  const row = await vendorRow("smeplug", supabase);
  return firstNonEmpty(row?.secret, row?.api_key);
}

export async function requireSmeplugSecretKey(
  supabase?: SupabaseClient | null,
): Promise<string> {
  const key = await resolveSmeplugSecretKey(supabase);
  if (!key) {
    throw new Error("SMEPLUG_SECRET_KEY is not configured in Supabase Edge Function secrets");
  }
  return key;
}

/** MobileNig purchase / write Bearer token. */
export function getMobilenigSecretKeyFromEnv(): string | null {
  return envFirst(
    "MOBILENIG_SECRET_KEY",
    "MOBILENIG_API_SECRET",
    "MOBILE_NIG_SECRET_KEY",
  );
}

/** MobileNig read / catalog key. */
export function getMobilenigPublicKeyFromEnv(): string | null {
  return envFirst(
    "MOBILENIG_PUBLIC_KEY",
    "MOBILENIG_API_KEY",
    "MOBILE_NIG_PUBLIC_KEY",
  );
}

export async function resolveMobilenigSecretKey(
  supabase?: SupabaseClient | null,
): Promise<string | null> {
  const fromEnv = getMobilenigSecretKeyFromEnv();
  if (fromEnv) return fromEnv;
  const row = await vendorRow("mobilenig", supabase);
  // Prefer secret; some installs only stored one key in api_key.
  return firstNonEmpty(row?.secret, row?.api_key);
}

export async function resolveMobilenigPublicKey(
  supabase?: SupabaseClient | null,
): Promise<string | null> {
  const fromEnv = getMobilenigPublicKeyFromEnv();
  if (fromEnv) return fromEnv;
  // Secret can authenticate read endpoints when public key is unset.
  const secretEnv = getMobilenigSecretKeyFromEnv();
  if (secretEnv) return secretEnv;
  const row = await vendorRow("mobilenig", supabase);
  return firstNonEmpty(row?.api_key, row?.secret);
}

export async function requireMobilenigSecretKey(
  supabase?: SupabaseClient | null,
): Promise<string> {
  const key = await resolveMobilenigSecretKey(supabase);
  if (!key) {
    throw new Error("MOBILENIG_SECRET_KEY is not configured in Supabase Edge Function secrets");
  }
  return key;
}

export async function requireMobilenigPublicKey(
  supabase?: SupabaseClient | null,
): Promise<string> {
  const key = await resolveMobilenigPublicKey(supabase);
  if (!key) {
    throw new Error("MOBILENIG_PUBLIC_KEY is not configured in Supabase Edge Function secrets");
  }
  return key;
}

/** Plustive Impact Bearer key (pk_live_… / pk_test_…). */
export function getPlustiveApiKeyFromEnv(): string | null {
  const raw = envFirst(
    "PLUSTIVE_API_KEY",
    "PLUSTIVE_SECRET_KEY",
    "PLUSTIVE_KEY",
  );
  if (!raw) return null;
  const key = raw.replace(/^Bearer\s+/i, "").replace(/^["']|["']$/g, "").trim();
  return key || null;
}

export async function resolvePlustiveApiKey(
  supabase?: SupabaseClient | null,
): Promise<string | null> {
  const fromEnv = getPlustiveApiKeyFromEnv();
  if (fromEnv) return fromEnv;
  const row = await vendorRow("plustive", supabase);
  return firstNonEmpty(row?.api_key, row?.secret);
}

export async function requirePlustiveApiKey(
  supabase?: SupabaseClient | null,
): Promise<string> {
  const key = await resolvePlustiveApiKey(supabase);
  if (!key) {
    throw new Error("PLUSTIVE_API_KEY is not configured in Supabase Edge Function secrets");
  }
  return key;
}
