import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const CORS_HEADERS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const isDelivered = (status?: string | null) => {
  if (!status) return false;
  const statusLower = status.toLowerCase();
  return statusLower === "delivered" || statusLower === "success";
};

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: CORS_HEADERS });
  }

  if (req.method !== "POST") {
    return new Response(
      JSON.stringify({ success: false, error: "Method not allowed" }),
      { status: 405, headers: { ...CORS_HEADERS, "Content-Type": "application/json" } },
    );
  }

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const supabase = createClient(supabaseUrl, supabaseKey);

    const VTPASS_API_KEY = Deno.env.get("VTPASS_API_KEY");
    const VTPASS_PUBLIC_KEY = Deno.env.get("VTPASS_PUBLIC_KEY");
    const VTPASS_SECRET_KEY = Deno.env.get("VTPASS_SECRET_KEY");
    const VTPASS_MODE = (Deno.env.get("VTPASS_MODE") || "live").toLowerCase();

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

    let parsedBody: Record<string, unknown> | null = null;
    try {
      const bodyText = await req.text();
      if (bodyText && bodyText.trim().length > 0) {
        parsedBody = JSON.parse(bodyText);
      }
    } catch (error) {
      console.error("Unable to parse request body:", error);
      parsedBody = null;
    }

    const reference = parsedBody?.reference || parsedBody?.request_id;
    if (!reference || typeof reference !== "string") {
      return new Response(
        JSON.stringify({ success: false, error: "reference or request_id is required" }),
        { status: 400, headers: { ...CORS_HEADERS, "Content-Type": "application/json" } },
      );
    }

    // Find the pending transaction
    // Check for provider field, but handle if it doesn't exist
    let query = supabase
      .from("data_transactions")
      .select("*")
      .eq("reference", reference)
      .in("status", ["pending", "processing"]);

    // Try to filter by provider if it exists
    try {
      query = query.eq("provider", "vtpass");
    } catch (e) {
      // Provider column may not exist, continue without filter
      console.warn('Provider column may not exist, querying without filter');
    }

    const { data: transaction, error: txnError } = await query.maybeSingle();

    if (txnError || !transaction) {
      return new Response(
        JSON.stringify({ 
          success: false, 
          error: "Pending transaction not found or already processed",
          reference 
        }),
        { status: 404, headers: { ...CORS_HEADERS, "Content-Type": "application/json" } },
      );
    }

    // Requery VTpass for current status
    const baseUrl = VTPASS_MODE === "sandbox"
      ? "https://sandbox.vtpass.com"
      : "https://vtpass.com";

    const headers: HeadersInit = {
      "api-key": VTPASS_API_KEY || VTPASS_PUBLIC_KEY,
      "public-key": VTPASS_PUBLIC_KEY,
      "Content-Type": "application/json",
    };
    if (VTPASS_SECRET_KEY) {
      headers["secret-key"] = VTPASS_SECRET_KEY;
    }

    const requeryResponse = await fetch(`${baseUrl}/api/requery`, {
      method: "POST",
      headers,
      body: JSON.stringify({ request_id: reference }),
    });

    if (!requeryResponse.ok) {
      return new Response(
        JSON.stringify({
          success: false,
          error: `Failed to requery VTpass: ${requeryResponse.status}`,
        }),
        { status: requeryResponse.status, headers: { ...CORS_HEADERS, "Content-Type": "application/json" } },
      );
    }

    const requeryJson = await requeryResponse.json();
    const vtpassTransaction = requeryJson?.content?.transactions || null;
    const vtpassStatus = vtpassTransaction?.status || requeryJson?.status || "";

    const isDeliveredStatus = isDelivered(vtpassStatus);
    const newStatus = isDeliveredStatus ? "success" : vtpassStatus?.toLowerCase() || "pending";

    // Update transaction status
    const { data: updatedTransaction, error: updateError } = await supabase
      .from("data_transactions")
      .update({
        status: newStatus,
        api_response: requeryJson,
        updated_at: new Date().toISOString(),
      })
      .eq("id", transaction.id)
      .select()
      .single();

    if (updateError) {
      console.error("Failed to update transaction status:", updateError);
      return new Response(
        JSON.stringify({
          success: false,
          error: "Failed to update transaction status",
          details: updateError,
        }),
        { status: 500, headers: { ...CORS_HEADERS, "Content-Type": "application/json" } },
      );
    }

    return new Response(
      JSON.stringify({
        success: true,
        message: `Transaction status updated to ${newStatus}`,
        data: {
          reference,
          status: newStatus,
          vtpass_status: vtpassStatus,
          transaction: updatedTransaction,
        },
      }),
      { status: 200, headers: { ...CORS_HEADERS, "Content-Type": "application/json" } },
    );
  } catch (error) {
    console.error("Error in update-vtpass-transaction-status function:", error);
    const message = error instanceof Error ? error.message : "Unknown error occurred";
    return new Response(
      JSON.stringify({ success: false, error: message }),
      { status: 500, headers: { ...CORS_HEADERS, "Content-Type": "application/json" } },
    );
  }
});


