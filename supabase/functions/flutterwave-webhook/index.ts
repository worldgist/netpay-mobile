import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import {
  isSuccessfulFlutterwaveStatus,
  processFlutterwaveChargeData,
} from "../_shared/flutterwave-virtual-account.ts";

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

    const event = String(payload.event || payload.type || "");
    const data = (payload.data || {}) as Record<string, unknown>;

    if (event !== "charge.completed" || !isSuccessfulFlutterwaveStatus(data.status)) {
      console.log("Ignoring Flutterwave webhook event:", event, data.status);
      return new Response(JSON.stringify({ message: "Event ignored" }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const supabaseClient = createClient(
      Deno.env.get("SUPABASE_URL") ?? "",
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "",
    );

    const outcome = await processFlutterwaveChargeData(supabaseClient, data, payload);

    if (!outcome.processed) {
      console.log("Ignoring Flutterwave charge that is not virtual-account funding:", outcome.reason);
      return new Response(JSON.stringify({ message: "Charge ignored", reason: outcome.reason }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    return new Response(
      JSON.stringify({
        success: true,
        alreadyProcessed: outcome.result.alreadyProcessed,
        netCreditAmount: outcome.result.netCreditAmount,
        userId: outcome.userId,
        reference: outcome.reference,
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
