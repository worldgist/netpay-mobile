import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { processFlutterwaveFunding } from "../_shared/flutterwave-funding.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, verif-hash",
};

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const secretHash = Deno.env.get("FLUTTERWAVE_SECRET_HASH");
    const signature = req.headers.get("verif-hash");

    const bodyText = await req.text();
    const payload = JSON.parse(bodyText);

    if (secretHash) {
      if (!signature || signature !== secretHash) {
        console.error("Flutterwave webhook secret hash mismatch");
        return new Response(JSON.stringify({ error: "Invalid webhook signature" }), {
          status: 401,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
    } else if (signature) {
      console.warn("Flutterwave webhook sent verif-hash but FLUTTERWAVE_SECRET_HASH is not configured");
    }

    const event = String(payload.event || "");
    const data = payload.data || {};

    if (event !== "charge.completed" || String(data.status).toLowerCase() !== "successful") {
      return new Response(JSON.stringify({ message: "Event ignored" }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const reference = data.tx_ref || data.flw_ref || data.id?.toString();
    const creditAmount = Number(data.amount || data.charged_amount || 0);
    const userId = data.meta?.user_id || null;

    if (!reference || creditAmount <= 0) {
      return new Response(JSON.stringify({ error: "Missing reference or amount" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const supabaseClient = createClient(
      Deno.env.get("SUPABASE_URL") ?? "",
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "",
    );

    let resolvedUserId = userId;

    if (!resolvedUserId) {
      const { data: pendingFunding } = await supabaseClient
        .from("funding_transactions")
        .select("user_id")
        .eq("reference", reference)
        .maybeSingle();

      resolvedUserId = pendingFunding?.user_id || null;
    }

    if (!resolvedUserId) {
      console.error("Unable to resolve user for Flutterwave payment:", reference);
      return new Response(JSON.stringify({ error: "User not found for payment" }), {
        status: 404,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const result = await processFlutterwaveFunding({
      supabase: supabaseClient,
      userId: resolvedUserId,
      grossAmount: creditAmount,
      reference,
      bankName: data.payment_type || data.meta?.bankname || data.bankname || "Flutterwave",
      accountNumber: data.account_number ? String(data.account_number) : null,
      accountName: data.customer?.name || "Card/Bank Payment",
      apiResponse: payload,
    });

    return new Response(
      JSON.stringify({
        success: true,
        alreadyProcessed: result.alreadyProcessed,
        netCreditAmount: result.netCreditAmount,
      }),
      {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      },
    );
  } catch (error) {
    console.error("Flutterwave webhook error:", error);
    return new Response(
      JSON.stringify({ error: error instanceof Error ? error.message : "Webhook processing failed" }),
      {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      },
    );
  }
});
