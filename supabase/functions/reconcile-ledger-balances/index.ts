import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const authHeader = req.headers.get("Authorization");
    if (!authHeader) {
      return new Response(
        JSON.stringify({ success: false, error: "Missing authorization header" }),
        { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    const supabase = createClient(
      Deno.env.get("SUPABASE_URL") ?? "",
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "",
    );

    const token = authHeader.replace("Bearer ", "");
    const { data: { user }, error: authError } = await supabase.auth.getUser(token);
    if (authError || !user) {
      return new Response(
        JSON.stringify({ success: false, error: "Unauthorized" }),
        { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    const { data: roleData } = await supabase
      .from("user_roles")
      .select("role")
      .eq("user_id", user.id)
      .eq("role", "admin")
      .maybeSingle();

    if (!roleData) {
      return new Response(
        JSON.stringify({ success: false, error: "Admin access required" }),
        { status: 403, headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    let userId: string | undefined;
    try {
      const body = req.method === "POST" ? await req.json() : {};
      userId = body?.userId || body?.user_id;
    } catch {
      // ignore empty body
    }

    const syncResult = userId
      ? await supabase.rpc("sync_user_profile_balance_from_ledger", { p_user_id: userId })
      : await supabase.rpc("sync_profile_balances_from_ledger");

    const { data, error } = syncResult;
    if (error) throw error;

    const [{ data: summary }, { data: mismatches }] = await Promise.all([
      supabase.rpc("get_ledger_balance_summary"),
      supabase.rpc("get_ledger_balance_mismatches", { p_limit: 50 }),
    ]);

    const payload = (data && typeof data === "object") ? data : {};

    return new Response(
      JSON.stringify({
        success: true,
        ...payload,
        updated_count: userId
          ? ((payload as { updated?: boolean }).updated ? 1 : 0)
          : (payload as { updated_count?: number }).updated_count ?? 0,
        summary,
        mismatches: mismatches ?? [],
        user_id: userId ?? null,
      }),
      { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  } catch (error) {
    console.error("reconcile-ledger-balances error:", error);
    return new Response(
      JSON.stringify({
        success: false,
        error: error instanceof Error ? error.message : "Unexpected error",
      }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  }
});
