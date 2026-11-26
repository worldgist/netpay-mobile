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
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const anonKey = Deno.env.get("SUPABASE_ANON_KEY")!;
    const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");

    if (!serviceRoleKey) {
      return new Response(
        JSON.stringify({ success: false, error: "Service configuration error" }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    const authHeader = req.headers.get("Authorization");
    if (!authHeader) {
      return new Response(
        JSON.stringify({ success: false, error: "Missing authorization header" }),
        { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    const authClient = createClient(supabaseUrl, anonKey, {
      global: {
        headers: {
          Authorization: authHeader,
        },
      },
    });

    const {
      data: { user },
      error: userError,
    } = await authClient.auth.getUser();

    if (userError || !user) {
      return new Response(
        JSON.stringify({ success: false, error: "Unauthorized" }),
        { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    const { data: isAdmin, error: roleError } = await authClient.rpc("has_role", {
      _user_id: user.id,
      _role: "admin",
    });

    if (roleError) {
      return new Response(
        JSON.stringify({ success: false, error: "Failed to verify permissions" }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    if (!isAdmin) {
      return new Response(
        JSON.stringify({ success: false, error: "Unauthorized - Admin access required" }),
        { status: 403, headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    const url = new URL(req.url);
    const userId = url.searchParams.get("user_id")?.trim() || null;
    const blockedReason = url.searchParams.get("blocked_reason")?.trim() || null;
    const from = url.searchParams.get("from")?.trim() || null;
    const to = url.searchParams.get("to")?.trim() || null;
    const limitParam = Number(url.searchParams.get("limit") || "50");
    const offsetParam = Number(url.searchParams.get("offset") || "0");

    const limit = Number.isFinite(limitParam) ? Math.min(Math.max(limitParam, 1), 200) : 50;
    const offset = Number.isFinite(offsetParam) ? Math.max(offsetParam, 0) : 0;

    const serviceClient = createClient(supabaseUrl, serviceRoleKey);

    let logsQuery = serviceClient
      .from("ai_chat_audit_logs")
      .select("id,user_id,request_message_count,request_total_chars,detected_intent,selected_action_type,selected_action_route,model_action_type,model_action_route,blocked_reason,created_at", { count: "exact" })
      .order("created_at", { ascending: false })
      .range(offset, offset + limit - 1);

    let summaryQuery = serviceClient
      .from("ai_chat_audit_logs")
      .select("id,blocked_reason,selected_action_type", { count: "exact" });

    if (userId) {
      logsQuery = logsQuery.eq("user_id", userId);
      summaryQuery = summaryQuery.eq("user_id", userId);
    }

    if (blockedReason) {
      logsQuery = logsQuery.eq("blocked_reason", blockedReason);
      summaryQuery = summaryQuery.eq("blocked_reason", blockedReason);
    }

    if (from) {
      logsQuery = logsQuery.gte("created_at", from);
      summaryQuery = summaryQuery.gte("created_at", from);
    }

    if (to) {
      logsQuery = logsQuery.lte("created_at", to);
      summaryQuery = summaryQuery.lte("created_at", to);
    }

    const [{ data: logs, count, error: logsError }, { data: summaryRows, error: summaryError }] = await Promise.all([
      logsQuery,
      summaryQuery,
    ]);

    if (logsError || summaryError) {
      console.error("fetch-ai-audit-logs query error:", logsError || summaryError);
      return new Response(
        JSON.stringify({ success: false, error: "Failed to fetch AI audit logs" }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    const rows = summaryRows ?? [];
    const blockedCount = rows.filter((r) => !!r.blocked_reason).length;
    const actionedCount = rows.filter((r) => !!r.selected_action_type).length;

    return new Response(
      JSON.stringify({
        success: true,
        logs: logs ?? [],
        pagination: {
          total: count ?? 0,
          limit,
          offset,
        },
        summary: {
          totalRows: rows.length,
          blockedCount,
          actionedCount,
        },
      }),
      { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  } catch (error) {
    console.error("fetch-ai-audit-logs error:", error);
    return new Response(
      JSON.stringify({
        success: false,
        error: "Internal server error",
        details: error instanceof Error ? error.message : "Unknown error",
      }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  }
});
