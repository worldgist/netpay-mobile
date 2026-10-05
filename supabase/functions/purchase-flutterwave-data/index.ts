import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import {
  getFlutterwaveSecretKeyOptional,
  normalizePhoneForFlutterwave,
  payFlutterwaveBill,
  resolveFlutterwaveServiceBillCodes,
} from "../_shared/flutterwave-bills.ts";
import { creditUserWallet, debitUserWallet } from "../_shared/wallet.ts";
import { sendPushNotification } from "../_shared/push-notifications.ts";
import { purchaseReference, queuedUserId } from "../_shared/purchase-queue.ts";

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
    const replayUserId = queuedUserId(req);
    let user: { id: string };
    if (replayUserId) {
      user = { id: replayUserId };
    } else {
      const { data: { user: authUser }, error: authError } = await supabase.auth.getUser(token);
      if (authError || !authUser) {
        return new Response(JSON.stringify({ success: false, error: "Unauthorized" }), {
          status: 401,
          headers: { ...CORS_HEADERS, "Content-Type": "application/json" },
        });
      }
      user = authUser;
    }

    const body = await req.json();
    const phone_number = String(body?.phone_number || "").trim();
    const plan_id = body?.plan_id;

    if (!phone_number || !plan_id) {
      return new Response(JSON.stringify({ success: false, error: "phone_number and plan_id are required" }), {
        status: 400,
        headers: { ...CORS_HEADERS, "Content-Type": "application/json" },
      });
    }

    const { data: dataPlan, error: planError } = await supabase
      .from("data_plans")
      .select("*")
      .eq("id", plan_id)
      .single();

    if (planError || !dataPlan) {
      return new Response(JSON.stringify({ success: false, error: "Data plan not found" }), {
        status: 404,
        headers: { ...CORS_HEADERS, "Content-Type": "application/json" },
      });
    }

    const itemCode = String(dataPlan.api_code || dataPlan.mobilenig_code || dataPlan.vtpass_code || "").trim();
    if (!itemCode) {
      return new Response(JSON.stringify({
        success: false,
        error: "Data plan is missing a Flutterwave item code (api_code)",
      }), {
        status: 200,
        headers: { ...CORS_HEADERS, "Content-Type": "application/json" },
      });
    }

    const { data: profile, error: profileError } = await supabase
      .from("profiles")
      .select("balance, email")
      .eq("id", user.id)
      .single();

    if (profileError || !profile) {
      return new Response(JSON.stringify({ success: false, error: "Failed to fetch user profile" }), {
        status: 500,
        headers: { ...CORS_HEADERS, "Content-Type": "application/json" },
      });
    }

    const userCharged = Number(dataPlan.custom_price ?? dataPlan.original_price ?? dataPlan.price) || 0;
    const providerAmount = Number(dataPlan.original_price ?? dataPlan.price) || userCharged;
    const balanceBefore = Number(profile.balance) || 0;
    const isDemoUser = profile.email === "demo@netppay.com";

    if (!isDemoUser && balanceBefore < userCharged) {
      return new Response(JSON.stringify({ success: false, error: "Insufficient balance" }), {
        status: 200,
        headers: { ...CORS_HEADERS, "Content-Type": "application/json" },
      });
    }

    const reference = purchaseReference(req, body, `DATA-FLW-${Date.now()}-${user.id.slice(0, 8)}`);
    const network = String(dataPlan.network || "MTN");
    let debitResult: Awaited<ReturnType<typeof debitUserWallet>> | null = null;

    if (!isDemoUser) {
      debitResult = await debitUserWallet({
        supabase,
        userId: user.id,
        amount: userCharged,
        transactionType: "data_purchase",
        description: `Data purchase (Flutterwave) — ${dataPlan.plan_name}`,
        reference,
        performedBy: user.id,
        balanceBefore,
      });
    }

    let paymentResult = { success: true, status: "success" as const, reference, vendorResponse: { demo: true } };

    if (!isDemoUser) {
      const { billerCode, itemCode: resolvedItemCode } = await resolveFlutterwaveServiceBillCodes({
        service: "DATA",
        network,
        itemCodeOverride: itemCode,
      });

      paymentResult = await payFlutterwaveBill({
        billerCode,
        itemCode: resolvedItemCode,
        customerId: normalizePhoneForFlutterwave(phone_number),
        amount: providerAmount,
        reference,
      });

      if (!paymentResult.success) {
        if (debitResult) {
          await creditUserWallet({
            supabase,
            userId: user.id,
            amount: userCharged,
            transactionType: "refund",
            description: `Data refund — ${paymentResult.error || "provider failed"}`,
            reference: `${reference}-REF`,
            performedBy: user.id,
          });
        }

        return new Response(JSON.stringify({
          success: false,
          error: paymentResult.error || "Flutterwave data purchase failed",
        }), {
          status: 200,
          headers: { ...CORS_HEADERS, "Content-Type": "application/json" },
        });
      }
    }

    await supabase.from("data_transactions").insert({
      user_id: user.id,
      phone_number,
      plan_id,
      plan_name: dataPlan.plan_name,
      amount: userCharged,
      balance_before: debitResult?.balanceBefore ?? balanceBefore,
      balance_after: debitResult?.balanceAfter ?? balanceBefore - userCharged,
      status: "success",
      reference: paymentResult.reference || reference,
      vendor: "flutterwave",
      performed_by: user.id,
    });

    if (!isDemoUser) {
      await sendPushNotification(
        supabase,
        user.id,
        "Data Purchase Successful",
        `${dataPlan.plan_name} purchased for ${phone_number}.`,
        { type: "data_purchase", reference },
      );
    }

    return new Response(JSON.stringify({
      success: true,
      data: {
        reference: paymentResult.reference || reference,
        phone_number,
        plan_name: dataPlan.plan_name,
        amount: userCharged,
        vendor: "flutterwave",
        balance_before: debitResult?.balanceBefore ?? balanceBefore,
        balance_after: debitResult?.balanceAfter ?? balanceBefore - userCharged,
      },
      message: "Data purchased successfully via Flutterwave",
    }), {
      status: 200,
      headers: { ...CORS_HEADERS, "Content-Type": "application/json" },
    });
  } catch (error) {
    console.error("purchase-flutterwave-data error:", error);
    return new Response(JSON.stringify({
      success: false,
      error: error instanceof Error ? error.message : "Unknown error occurred",
    }), {
      status: 500,
      headers: { ...CORS_HEADERS, "Content-Type": "application/json" },
    });
  }
});
