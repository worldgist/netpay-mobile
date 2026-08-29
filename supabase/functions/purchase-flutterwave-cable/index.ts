import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import {
  getFlutterwaveSecretKeyOptional,
  payFlutterwaveBill,
  resolveFlutterwaveServiceBillCodes,
} from "../_shared/flutterwave-bills.ts";
import { creditUserWallet, debitUserWallet } from "../_shared/wallet.ts";
import { sendPushNotification } from "../_shared/push-notifications.ts";

const CORS_HEADERS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: CORS_HEADERS });
  }

  try {
    if (!getFlutterwaveSecretKeyOptional()) {
      return new Response(JSON.stringify({ success: false, error: "Flutterwave credentials are not configured" }), {
        status: 200,
        headers: { ...CORS_HEADERS, "Content-Type": "application/json" },
      });
    }

    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const supabase = createClient(supabaseUrl, supabaseKey);

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

    const body = await req.json();
    const card_number = String(body?.card_number || body?.smartcard_number || "").trim();
    const provider = String(body?.provider || "").trim().toUpperCase();
    const customer_name = String(body?.customer_name || "").trim();
    const package_name = String(body?.package_name || `${provider} Package`).trim();
    const api_code = String(body?.api_code || body?.variation_code || "").trim();
    const price = Number(body?.price || body?.amount || 0);

    if (!card_number || !provider || !api_code || !Number.isFinite(price) || price <= 0) {
      return new Response(JSON.stringify({
        success: false,
        error: "card_number, provider, api_code, and price are required",
      }), {
        status: 400,
        headers: { ...CORS_HEADERS, "Content-Type": "application/json" },
      });
    }

    const { data: profile } = await supabase
      .from("profiles")
      .select("balance, email")
      .eq("id", user.id)
      .single();

    if (!profile) {
      return new Response(JSON.stringify({ success: false, error: "User profile not found" }), {
        status: 404,
        headers: { ...CORS_HEADERS, "Content-Type": "application/json" },
      });
    }

    const balanceBefore = Number(profile.balance) || 0;
    const isDemoUser = profile.email === "demo@netppay.com";
    const reference = `CABLE-FLW-${Date.now()}-${user.id.slice(0, 8)}`;

    if (!isDemoUser && balanceBefore < price) {
      return new Response(JSON.stringify({ success: false, error: "Insufficient balance" }), {
        status: 200,
        headers: { ...CORS_HEADERS, "Content-Type": "application/json" },
      });
    }

    let debitResult: Awaited<ReturnType<typeof debitUserWallet>> | null = null;
    if (!isDemoUser) {
      debitResult = await debitUserWallet({
        supabase,
        userId: user.id,
        amount: price,
        transactionType: "cable_tv_purchase",
        description: `Cable TV purchase (Flutterwave) — ${package_name}`,
        reference,
        performedBy: user.id,
        balanceBefore,
      });
    }

    let paymentResult = { success: true, reference, vendorResponse: { demo: true } };

    if (!isDemoUser) {
      const { billerCode, itemCode } = await resolveFlutterwaveServiceBillCodes({
        service: "CABLE",
        network: provider,
        itemCodeOverride: api_code,
      });

      paymentResult = await payFlutterwaveBill({
        billerCode,
        itemCode,
        customerId: card_number,
        amount: price,
        reference,
      });

      if (!paymentResult.success) {
        if (debitResult) {
          await creditUserWallet({
            supabase,
            userId: user.id,
            amount: price,
            transactionType: "refund",
            description: `Cable TV refund — ${paymentResult.error || "provider failed"}`,
            reference: `${reference}-REF`,
            performedBy: user.id,
          });
        }

        return new Response(JSON.stringify({
          success: false,
          error: paymentResult.error || "Flutterwave cable purchase failed",
        }), {
          status: 200,
          headers: { ...CORS_HEADERS, "Content-Type": "application/json" },
        });
      }
    }

    await supabase.from("cable_tv_transactions").insert({
      user_id: user.id,
      smartcard_number: card_number,
      provider,
      plan_name: package_name,
      customer_name,
      amount: price,
      balance_before: debitResult?.balanceBefore ?? balanceBefore,
      balance_after: debitResult?.balanceAfter ?? balanceBefore - price,
      status: "completed",
      reference: paymentResult.reference || reference,
      performed_by: user.id,
    });

    if (!isDemoUser) {
      await sendPushNotification(
        supabase,
        user.id,
        "Cable TV Purchase Successful",
        `${package_name} purchased for ${card_number}.`,
        { type: "cable_tv_purchase", reference },
      );
    }

    return new Response(JSON.stringify({
      success: true,
      data: {
        reference: paymentResult.reference || reference,
        smartcard_number: card_number,
        provider,
        plan_name: package_name,
        amount: price,
        vendor: "flutterwave",
      },
      message: "Cable TV purchased successfully via Flutterwave",
    }), {
      status: 200,
      headers: { ...CORS_HEADERS, "Content-Type": "application/json" },
    });
  } catch (error) {
    console.error("purchase-flutterwave-cable error:", error);
    return new Response(JSON.stringify({
      success: false,
      error: error instanceof Error ? error.message : "Unknown error occurred",
    }), {
      status: 500,
      headers: { ...CORS_HEADERS, "Content-Type": "application/json" },
    });
  }
});
