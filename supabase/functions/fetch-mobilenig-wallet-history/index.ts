import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import {
  getMobilenigPublicKey,
  getMobilenigWalletHistory,
  searchMobilenigWalletHistory,
} from "../_shared/mobilenig-api.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
};

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { status: 204, headers: corsHeaders });
  }

  try {
    getMobilenigPublicKey();

    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseKey = Deno.env.get("SUPABASE_ANON_KEY")!;

    const authHeader = req.headers.get("Authorization");
    if (!authHeader) {
      return new Response(
        JSON.stringify({ success: false, error: "Missing authorization header" }),
        { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    const supabase = createClient(supabaseUrl, supabaseKey, {
      global: { headers: { Authorization: authHeader } },
    });

    const { data: { user }, error: userError } = await supabase.auth.getUser();
    if (userError || !user) {
      return new Response(
        JSON.stringify({ success: false, error: "Unauthorized" }),
        { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    const { data: roleData, error: roleError } = await supabase
      .from("user_roles")
      .select("role")
      .eq("user_id", user.id)
      .eq("role", "admin")
      .maybeSingle();

    if (roleError) {
      return new Response(
        JSON.stringify({ success: false, error: "Error verifying permissions" }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    if (!roleData) {
      return new Response(
        JSON.stringify({ success: false, error: "Unauthorized - Admin access required" }),
        { status: 403, headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    const body = await req.json().catch(() => ({}));
    const transId = typeof body.trans_id === "string" ? body.trans_id.trim() : "";
    const page = Number(body.page) > 0 ? Number(body.page) : 1;
    const perPage = Number(body.per_page) > 0 ? Number(body.per_page) : 10;

    const transactions = transId
      ? await searchMobilenigWalletHistory(transId)
      : await getMobilenigWalletHistory(page, perPage);

    return new Response(
      JSON.stringify({
        success: true,
        transactions,
        message: "success",
        statusCode: 200,
      }),
      { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  } catch (error) {
    console.error("Error in fetch-mobilenig-wallet-history:", error);
    const message = error instanceof Error ? error.message : "Unknown error";
    const notConfigured = message.includes("not configured");

    return new Response(
      JSON.stringify({
        success: false,
        error: notConfigured ? "MobileNig API credentials not configured" : message,
      }),
      {
        status: notConfigured ? 500 : 502,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      },
    );
  }
});
