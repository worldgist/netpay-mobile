import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const CORS_HEADERS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const VENDING_KEYS = [
  "airtime_provider",
  "data_provider",
  "cable_provider",
  "electricity_provider",
  "betting_provider",
] as const;

const DEFAULTS: Record<(typeof VENDING_KEYS)[number], string> = {
  airtime_provider: "smeplug",
  data_provider: "smeplug",
  cable_provider: "mobilenig",
  electricity_provider: "vtpass",
  betting_provider: "ebills",
};

function extractProviderValue(rawValue: unknown): string | undefined {
  if (typeof rawValue === "string") {
    return rawValue;
  }
  if (rawValue && typeof rawValue === "object") {
    const obj = rawValue as Record<string, unknown>;
    if (typeof obj.provider === "string") {
      return obj.provider;
    }
    if (typeof obj.value === "string") {
      return obj.value;
    }
  }
  return undefined;
}

function normalizeVendingProvider(raw: string | undefined | null, key: (typeof VENDING_KEYS)[number]): string {
  if (!raw) return DEFAULTS[key];

  let normalized = raw.toLowerCase().trim();
  if (normalized === "ebill" || normalized === "ebills.africa") {
    normalized = "ebills";
  }
  if (normalized === "mobile-nig" || normalized === "mobile_nig") {
    normalized = "mobilenig";
  }
  if (normalized === "vt-pass" || normalized === "vt_pass") {
    normalized = "vtpass";
  }
  if (normalized === "sme-plug" || normalized === "sme_plug") {
    normalized = "smeplug";
  }

  return normalized || DEFAULTS[key];
}

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: CORS_HEADERS });
  }

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const supabase = createClient(supabaseUrl, serviceRoleKey);

    const authHeader = req.headers.get("Authorization");
    if (!authHeader) {
      return new Response(JSON.stringify({ success: false, error: "Unauthorized" }), {
        status: 401,
        headers: { ...CORS_HEADERS, "Content-Type": "application/json" },
      });
    }

    const token = authHeader.replace("Bearer ", "");
    const { data: { user }, error: authError } = await supabase.auth.getUser(token);
    if (authError || !user) {
      return new Response(JSON.stringify({ success: false, error: "Unauthorized" }), {
        status: 401,
        headers: { ...CORS_HEADERS, "Content-Type": "application/json" },
      });
    }

    const { data, error } = await supabase
      .from("app_settings")
      .select("setting_key, setting_value, updated_at")
      .in("setting_key", [...VENDING_KEYS]);

    if (error) {
      console.error("get-vending-settings: failed to fetch settings:", error);
    }

    const settingsMap = new Map<string, { value: unknown; updated_at: string | null }>();
    for (const row of data || []) {
      settingsMap.set(row.setting_key, {
        value: row.setting_value,
        updated_at: row.updated_at,
      });
    }

    const providers = {
      airtime: normalizeVendingProvider(
        extractProviderValue(settingsMap.get("airtime_provider")?.value),
        "airtime_provider",
      ),
      data: normalizeVendingProvider(
        extractProviderValue(settingsMap.get("data_provider")?.value),
        "data_provider",
      ),
      cable: normalizeVendingProvider(
        extractProviderValue(settingsMap.get("cable_provider")?.value),
        "cable_provider",
      ),
      electricity: normalizeVendingProvider(
        extractProviderValue(settingsMap.get("electricity_provider")?.value),
        "electricity_provider",
      ),
      betting: normalizeVendingProvider(
        extractProviderValue(settingsMap.get("betting_provider")?.value),
        "betting_provider",
      ),
    };

    const updatedAt = (data || [])
      .map((row) => row.updated_at)
      .filter(Boolean)
      .sort()
      .pop() || null;

    return new Response(
      JSON.stringify({
        success: true,
        providers,
        updated_at: updatedAt,
      }),
      { status: 200, headers: { ...CORS_HEADERS, "Content-Type": "application/json" } },
    );
  } catch (error) {
    console.error("Error in get-vending-settings:", error);
    const message = error instanceof Error ? error.message : "Unknown error occurred";
    return new Response(
      JSON.stringify({ success: false, error: message }),
      { status: 500, headers: { ...CORS_HEADERS, "Content-Type": "application/json" } },
    );
  }
});
