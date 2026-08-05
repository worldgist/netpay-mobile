import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

async function requireAdmin(supabase: ReturnType<typeof createClient>, authHeader: string) {
  const token = authHeader.replace("Bearer ", "");
  const { data: { user }, error } = await supabase.auth.getUser(token);
  if (error || !user) {
    throw new Response(
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
    throw new Response(
      JSON.stringify({ success: false, error: "Admin access required" }),
      { status: 403, headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  }

  return user;
}

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

    await requireAdmin(supabase, authHeader);

    let limit = 50;
    try {
      const body = req.method === "POST" ? await req.json() : {};
      if (body?.limit) limit = Number(body.limit) || 50;
    } catch {
      // ignore empty body
    }

    const [{ data: summary, error: summaryError }, { data: mismatches, error: mismatchError }] =
      await Promise.all([
        supabase.rpc("get_ledger_balance_summary"),
        supabase.rpc("get_ledger_balance_mismatches", { p_limit: limit }),
      ]);

    if (summaryError) {
      console.error("get_ledger_balance_summary error:", summaryError);
      throw summaryError;
    }

    if (mismatchError) {
      console.error("get_ledger_balance_mismatches error:", mismatchError);
      throw mismatchError;
    }

    return new Response(
      JSON.stringify({
        success: true,
        summary,
        mismatches: mismatches ?? [],
      }),
      { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  } catch (error) {
    if (error instanceof Response) return error;

    console.error("get-ledger-summary error:", error);
    return new Response(
      JSON.stringify({
        success: false,
        error: error instanceof Error ? error.message : "Unexpected error",
      }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  }
});
