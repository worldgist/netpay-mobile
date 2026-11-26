/**
 * Resolve Flutterwave credentials from Supabase Edge Function secrets.
 * Optional fallback: public.vendors row name = flutterwave.
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
  supabase?: SupabaseClient | null,
): Promise<{ api_key: string | null; secret: string | null } | null> {
  const client = supabase ?? serviceClient();
  if (!client) return null;
  try {
    const { data, error } = await client
      .from("vendors")
      .select("api_key, secret")
      .ilike("name", "flutterwave")
      .maybeSingle();
    if (error || !data) return null;
    return {
      api_key: typeof data.api_key === "string" ? data.api_key : null,
      secret: typeof data.secret === "string" ? data.secret : null,
    };
  } catch (error) {
    console.warn("flutterwave-secrets: failed reading vendors.flutterwave:", error);
    return null;
  }
}

/** Live secret key — Edge secret FLUTTERWAVE_SECRET_KEY (aliases supported). */
export function getFlutterwaveSecretKeyFromEnv(): string | null {
  return envFirst(
    "FLUTTERWAVE_SECRET_KEY",
    "FLW_SECRET_KEY",
    "FLUTTERWAVE_SECRET",
    "FLW_SECRET",
  );
}

export function getFlutterwavePublicKeyFromEnv(): string | null {
  return envFirst(
    "FLUTTERWAVE_PUBLIC_KEY",
    "FLW_PUBLIC_KEY",
    "FLUTTERWAVE_PUBLIC",
  );
}

/** Webhook verif-hash — Edge secret FLUTTERWAVE_SECRET_HASH. */
export function getFlutterwaveSecretHashFromEnv(): string | null {
  return envFirst(
    "FLUTTERWAVE_SECRET_HASH",
    "FLW_SECRET_HASH",
    "FLUTTERWAVE_WEBHOOK_HASH",
    "FLUTTERWAVE_WEBHOOK_SECRET",
  );
}

export async function resolveFlutterwaveSecretKey(
  supabase?: SupabaseClient | null,
): Promise<string | null> {
  const fromEnv = getFlutterwaveSecretKeyFromEnv();
  if (fromEnv) return fromEnv;
  const row = await vendorRow(supabase);
  return firstNonEmpty(row?.secret, row?.api_key);
}

export async function requireFlutterwaveSecretKey(
  supabase?: SupabaseClient | null,
): Promise<string> {
  const key = await resolveFlutterwaveSecretKey(supabase);
  if (!key) {
    throw new Error("FLUTTERWAVE_SECRET_KEY is not configured in Supabase Edge Function secrets");
  }
  return key;
}

export async function resolveFlutterwavePublicKey(
  supabase?: SupabaseClient | null,
): Promise<string | null> {
  const fromEnv = getFlutterwavePublicKeyFromEnv();
  if (fromEnv) return fromEnv;
  const row = await vendorRow(supabase);
  return firstNonEmpty(row?.api_key);
}

export function resolveFlutterwaveSecretHash(): string | null {
  return getFlutterwaveSecretHashFromEnv();
}
