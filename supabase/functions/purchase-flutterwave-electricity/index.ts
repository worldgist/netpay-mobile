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
    const meter_number = String(body?.meter_number || "").trim();
    const provider = String(body?.provider || "").trim().toUpperCase();
    const meter_type = String(body?.meter_type || "prepaid").trim().toLowerCase();
    const amount = Number(body?.amount || 0);
    const customer_name = String(body?.customer_name || "").trim();
    const customer_address = String(body?.customer_address || "").trim();
    const itemCodeOverride = String(body?.variation_id || body?.api_code || "").trim() || undefined;

    if (!meter_number || !provider || !Number.isFinite(amount) || amount <= 0) {
      return new Response(JSON.stringify({
        success: false,
        error: "meter_number, provider, and amount are required",
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

    const CHARGE_FEE_RATE = 0.1;
    const purchaseAmount = Math.round(amount);
    const chargeFee = Math.round(purchaseAmount * CHARGE_FEE_RATE * 100) / 100;
    const totalAmount = purchaseAmount + chargeFee;
    const balanceBefore = Number(profile.balance) || 0;
    const isDemoUser = profile.email === "demo@netppay.com";
    const reference = `ELEC-FLW-${Date.now()}-${user.id.slice(0, 8)}`;

    if (!isDemoUser && balanceBefore < totalAmount) {
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
        amount: totalAmount,
        transactionType: "electricity_purchase",
        description: `Electricity purchase (Flutterwave) — ${provider} ${meter_type}`,
        reference,
        performedBy: user.id,
        balanceBefore,
      });
    }

    let paymentResult = { success: true, reference, vendorResponse: { demo: true } };

    if (!isDemoUser) {
      const networkKey = `${provider}_${meter_type.toUpperCase()}`;
      const { billerCode, itemCode } = await resolveFlutterwaveServiceBillCodes({
        service: "ELECTRICITY",
        network: networkKey,
        itemCodeOverride,
      });

      paymentResult = await payFlutterwaveBill({
        billerCode,
        itemCode,
        customerId: meter_number,
        amount: purchaseAmount,
        reference,
      });

      if (!paymentResult.success) {
        if (debitResult) {
          await creditUserWallet({
            supabase,
            userId: user.id,
            amount: totalAmount,
            transactionType: "refund",
            description: `Electricity refund — ${paymentResult.error || "provider failed"}`,
            reference: `${reference}-REF`,
            performedBy: user.id,
          });
        }

        return new Response(JSON.stringify({
          success: false,
          error: paymentResult.error || "Flutterwave electricity purchase failed",
        }), {
          status: 200,
          headers: { ...CORS_HEADERS, "Content-Type": "application/json" },
        });
      }
    }

    await supabase.from("electricity_transactions").insert({
      user_id: user.id,
      amount: totalAmount,
      purchase_amount: purchaseAmount,
      charge_fee: chargeFee,
      balance_before: debitResult?.balanceBefore ?? balanceBefore,
      balance_after: debitResult?.balanceAfter ?? balanceBefore - totalAmount,
      meter_number,
      provider,
      meter_type,
      customer_name,
      status: "completed",
      reference: paymentResult.reference || reference,
      performed_by: user.id,
    });

    if (!isDemoUser) {
      await sendPushNotification(
        supabase,
        user.id,
        "Electricity Purchase Successful",
        `₦${purchaseAmount.toFixed(2)} electricity token purchased for meter ${meter_number}.`,
        { type: "electricity_purchase", reference },
      );
    }

    return new Response(JSON.stringify({
      success: true,
      data: {
        reference: paymentResult.reference || reference,
        meter_number,
        provider,
        meter_type,
        amount: purchaseAmount,
        total_amount: totalAmount,
        vendor: "flutterwave",
        customer_name,
        customer_address,
      },
      message: "Electricity purchased successfully via Flutterwave",
    }), {
      status: 200,
      headers: { ...CORS_HEADERS, "Content-Type": "application/json" },
    });
  } catch (error) {
    console.error("purchase-flutterwave-electricity error:", error);
    return new Response(JSON.stringify({
      success: false,
      error: error instanceof Error ? error.message : "Unknown error occurred",
    }), {
      status: 500,
      headers: { ...CORS_HEADERS, "Content-Type": "application/json" },
    });
  }
});
