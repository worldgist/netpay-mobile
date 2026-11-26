import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const CORS_HEADERS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const DEFAULT_PROVIDER = "smeplug";

const normalizeProvider = (value?: string | null) => {
  if (!value) return DEFAULT_PROVIDER;
  const normalized = value.toLowerCase().trim();
  if (
    normalized === "smeplug" ||
    normalized === "vtpass" ||
    normalized === "anyone" ||
    normalized === "mobilenig" ||
    normalized === "ebills" ||
    normalized === "ebills.africa"
  ) {
    return normalized === "ebills.africa" ? "ebills" : normalized;
  }
  return DEFAULT_PROVIDER;
};

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
      .select("setting_value, updated_at")
      .eq("setting_key", "data_provider")
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();

    if (error) {
      console.error("get-data-provider: failed to fetch setting:", error);
    }

    const rawValue = data?.setting_value;
    let provider: string | undefined;

    if (typeof rawValue === "string") {
      provider = rawValue;
    } else if (rawValue && typeof rawValue === "object") {
      const obj = rawValue as Record<string, unknown>;
      if (typeof obj.provider === "string") {
        provider = obj.provider;
      }
    }

    const resolvedProvider = normalizeProvider(provider);

    return new Response(
      JSON.stringify({
        success: true,
        provider: resolvedProvider,
        updated_at: data?.updated_at || null,
      }),
      { status: 200, headers: { ...CORS_HEADERS, "Content-Type": "application/json" } },
    );
  } catch (error) {
    console.error("Error in get-data-provider function:", error);
    const message = error instanceof Error ? error.message : "Unknown error occurred";
    return new Response(
      JSON.stringify({ success: false, error: message, provider: DEFAULT_PROVIDER }),
      { status: 500, headers: { ...CORS_HEADERS, "Content-Type": "application/json" } },
    );
  }
});


