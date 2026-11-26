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

    let userId: string | undefined;
    try {
      const body = req.method === "POST" ? await req.json() : {};
      userId = body?.userId || body?.user_id;
    } catch {
      // ignore empty body
    }

    if (!userId) {
      return new Response(
        JSON.stringify({ success: false, error: "userId is required" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    const [{ data: detail, error: detailError }, { data: recentTx, error: txError }] = await Promise.all([
      supabase.rpc("get_user_balance_reconcile_detail", { p_user_id: userId }),
      supabase
        .from("user_transactions")
        .select("id, amount, balance_before, balance_after, transaction_type, description, reference, created_at")
        .eq("user_id", userId)
        .order("created_at", { ascending: false })
        .limit(15),
    ]);

    if (detailError) throw detailError;
    if (txError) throw txError;

    let resolvedDetail = detail;
    const needsSync =
      detail &&
      typeof detail === "object" &&
      (detail as { needs_reconcile?: boolean }).needs_reconcile === true;

    if (needsSync) {
      const { error: syncError } = await supabase.rpc("sync_user_profile_balance_from_ledger", {
        p_user_id: userId,
      });
      if (syncError) {
        console.error("auto sync_user_profile_balance_from_ledger error:", syncError);
      } else {
        const { data: refreshedDetail, error: refreshError } = await supabase.rpc(
          "get_user_balance_reconcile_detail",
          { p_user_id: userId },
        );
        if (!refreshError && refreshedDetail) {
          resolvedDetail = refreshedDetail;
        }
      }
    }

    if (resolvedDetail && typeof resolvedDetail === "object" && (resolvedDetail as { success?: boolean }).success === false) {
      return new Response(JSON.stringify(detail), {
        status: 404,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    return new Response(
      JSON.stringify({
        success: true,
        detail: resolvedDetail,
        recent_transactions: recentTx ?? [],
        auto_synced: needsSync,
      }),
      { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  } catch (error) {
    if (error instanceof Response) return error;

    console.error("get-user-balance-reconcile error:", error);
    return new Response(
      JSON.stringify({
        success: false,
        error: error instanceof Error ? error.message : "Unexpected error",
      }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  }
});
