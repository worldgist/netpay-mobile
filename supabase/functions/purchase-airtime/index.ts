import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const CORS_HEADERS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const PROVIDER_FUNCTION_MAP: Record<string, string> = {
  smeplug: "purchase-smeplug-airtime",
  ebills: "purchase-ebills-airtime",
  "ebills.africa": "purchase-ebills-airtime",
  mobilenig: "purchase-mobilenig-airtime",
  "mobile-nig": "purchase-mobilenig-airtime",
  flutterwave: "purchase-flutterwave-airtime",
};

function normalizeProvider(raw: unknown): string {
  if (typeof raw !== "string" || !raw.trim()) return "smeplug";
  let normalized = raw.toLowerCase().trim();
  if (normalized === "ebill") normalized = "ebills";
  if (normalized === "mobile_nig") normalized = "mobilenig";
  if (normalized === "flutter-wave" || normalized === "flw") normalized = "flutterwave";
  return normalized;
}

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: CORS_HEADERS });
  }

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const supabase = createClient(supabaseUrl, supabaseKey);

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

    const bodyText = await req.text();
    const requestBody = bodyText ? JSON.parse(bodyText) : {};

    const { data: providerSetting } = await supabase
      .from("app_settings")
      .select("setting_value")
      .eq("setting_key", "airtime_provider")
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();

    let rawProvider = "smeplug";
    if (providerSetting?.setting_value) {
      rawProvider = typeof providerSetting.setting_value === "string"
        ? providerSetting.setting_value
        : String((providerSetting.setting_value as { provider?: string }).provider || "smeplug");
    }

    const vendingProvider = normalizeProvider(rawProvider);
    const functionName = PROVIDER_FUNCTION_MAP[vendingProvider] || "purchase-smeplug-airtime";
    const functionUrl = `${supabaseUrl}/functions/v1/${functionName}`;

    const response = await fetch(functionUrl, {
      method: "POST",
      headers: {
        Authorization: authHeader,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(requestBody),
    });

    const responseData = await response.json();
    const status = response.ok || (responseData && typeof responseData === "object" && "success" in responseData)
      ? 200
      : response.status;

    return new Response(JSON.stringify(responseData), {
      status,
      headers: { ...CORS_HEADERS, "Content-Type": "application/json" },
    });
  } catch (error) {
    console.error("purchase-airtime router error:", error);
    return new Response(JSON.stringify({
      success: false,
      error: error instanceof Error ? error.message : "Unknown error occurred",
    }), {
      status: 200,
      headers: { ...CORS_HEADERS, "Content-Type": "application/json" },
    });
  }
});
