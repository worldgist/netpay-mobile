import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { processFlutterwaveFunding } from "../_shared/flutterwave-funding.ts";
import { flutterwaveJson } from "../_shared/flutterwave-http.ts";
import type { FlutterwaveChargeData } from "../_shared/flutterwave-references.ts";
import {
  getFlutterwaveCreditAmount,
  getFlutterwaveFundingReference,
  isSuccessfulFlutterwaveStatus,
} from "../_shared/flutterwave-virtual-account.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabase = createClient(
      Deno.env.get("SUPABASE_URL") ?? "",
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "",
    );

    const authHeader = req.headers.get("Authorization");
    if (!authHeader) {
      throw new Error("No authorization header");
    }

    const {
      data: { user },
      error: authError,
    } = await supabase.auth.getUser(authHeader.replace("Bearer ", ""));

    if (authError || !user) {
      throw new Error("Unauthorized");
    }

    const { txRef } = await req.json();
    if (!txRef || typeof txRef !== "string") {
      throw new Error("Transaction reference is required");
    }

    const secretKey = Deno.env.get("FLUTTERWAVE_SECRET_KEY");
    if (!secretKey) {
      throw new Error("Flutterwave credentials not configured");
    }

    const verifyData = await flutterwaveJson<{
      status: string;
      message?: string;
      data?: Record<string, unknown>;
    }>(
      secretKey,
      `/transactions/verify_by_reference?tx_ref=${encodeURIComponent(txRef)}`,
      { method: "GET" },
    );

    if (!verifyData.data) {
      throw new Error(verifyData.message || "Unable to verify payment");
    }

    const transaction = verifyData.data as Record<string, unknown> & {
      status?: string;
      meta?: { user_id?: string };
      tx_ref?: string;
      payment_type?: string;
      account_id?: string | number;
      customer?: { name?: string };
    };
    const paymentStatus = String(transaction.status || "").toLowerCase();

    if (!isSuccessfulFlutterwaveStatus(transaction.status)) {
      return new Response(
        JSON.stringify({
          success: false,
          error: "Payment was not successful",
          status: paymentStatus,
        }),
        {
          status: 400,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        },
      );
    }

    const metaUserId = transaction.meta?.user_id;
    if (metaUserId && metaUserId !== user.id) {
      throw new Error("Payment does not belong to this user");
    }

    const { data: pendingFunding } = await supabase
      .from("funding_transactions")
      .select("user_id")
      .eq("reference", transaction.tx_ref || txRef)
      .maybeSingle();

    if (pendingFunding?.user_id && pendingFunding.user_id !== user.id) {
      throw new Error("Payment does not belong to this user");
    }

    const charge = transaction as FlutterwaveChargeData;
    const grossAmount = getFlutterwaveCreditAmount(charge);
    const reference = String(transaction.tx_ref || txRef || "").trim()
      || getFlutterwaveFundingReference(charge)
      || txRef;

    if (!reference) {
      throw new Error("Unable to determine payment reference");
    }

    const result = await processFlutterwaveFunding({
      supabase,
      userId: user.id,
      grossAmount,
      reference,
      bankName: transaction.payment_type || "Flutterwave",
      accountNumber: transaction.account_id ? String(transaction.account_id) : null,
      accountName: transaction.customer?.name || "Card/Bank Payment",
      apiResponse: verifyData,
    });

    return new Response(
      JSON.stringify({
        success: true,
        data: {
          txRef: reference,
          grossAmount: result.grossAmount,
          fundingFee: result.fundingFee,
          netCreditAmount: result.netCreditAmount,
          balanceAfter: result.finalBalance,
          alreadyProcessed: result.alreadyProcessed,
        },
      }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  } catch (error) {
    console.error("Verify Flutterwave payment error:", error);
    const errorMessage = error instanceof Error ? error.message : "An unknown error occurred";
    return new Response(
      JSON.stringify({ success: false, error: errorMessage }),
      {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      },
    );
  }
});
