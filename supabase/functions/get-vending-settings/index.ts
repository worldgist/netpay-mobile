import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import {
  DEFAULT_VENDING_PROVIDERS,
  VENDING_SETTING_KEYS,
  extractProviderValue,
  normalizeVendingProvider,
} from "../_shared/vending-settings.ts";

const CORS_HEADERS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
};

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { status: 204, headers: CORS_HEADERS });
  }

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const supabase = createClient(supabaseUrl, serviceRoleKey, {
      auth: { persistSession: false, autoRefreshToken: false },
    });

    const { data, error } = await supabase
      .from("app_settings")
      .select("setting_key, setting_value, updated_at")
      .in("setting_key", [...VENDING_SETTING_KEYS]);

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

    const resolve = (key: (typeof VENDING_SETTING_KEYS)[number]) =>
      normalizeVendingProvider(extractProviderValue(settingsMap.get(key)?.value)) ||
      DEFAULT_VENDING_PROVIDERS[key];

    const providers = {
      airtime: resolve("airtime_provider"),
      data: resolve("data_provider"),
      cable: resolve("cable_provider"),
      electricity: resolve("electricity_provider"),
      betting: resolve("betting_provider"),
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
