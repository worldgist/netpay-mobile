import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { purchaseViaMobilenig } from "../_shared/vendor-calls.ts";
import { debitUserWallet, creditUserWallet } from "../_shared/wallet.ts";
import { sendPushNotification } from "../_shared/push-notifications.ts";
import { runAfterResponse } from "../_shared/run-after-response.ts";
import { purchaseReference, queuedUserId } from "../_shared/purchase-queue.ts";

const CORS_HEADERS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

export async function handlePurchase(req: Request): Promise<Response> {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: CORS_HEADERS });
  }

  try {
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
    const balanceBefore = Number(profile.balance) || 0;
    const isDemoUser = profile.email === "demo@netppay.com";

    if (!isDemoUser && balanceBefore < userCharged) {
      return new Response(JSON.stringify({ success: false, error: "Insufficient balance" }), {
        status: 200,
        headers: { ...CORS_HEADERS, "Content-Type": "application/json" },
      });
    }

    const reference = purchaseReference(req, body, `DATA-MN-${Date.now()}-${user.id.slice(0, 8)}`);
    let debitResult: Awaited<ReturnType<typeof debitUserWallet>> | null = null;

    if (!isDemoUser) {
      debitResult = await debitUserWallet({
        supabase,
        userId: user.id,
        amount: userCharged,
        transactionType: "data_purchase",
        description: `Data purchase (MobileNig) — ${dataPlan.plan_name}`,
        reference,
        performedBy: user.id,
        balanceBefore,
      });
    }

    let purchaseResult = {
      success: true,
      status: "success" as const,
      reference,
      message: "Data purchased successfully (Demo)",
      vendor_response: { demo: true } as Record<string, unknown> | undefined,
    };

    if (!isDemoUser) {
      purchaseResult = await purchaseViaMobilenig(
        { id: 0, name: "mobilenig", base_url: "", status: "active" },
        {
          id: String(dataPlan.id),
          network: String(dataPlan.network || ""),
          plan_type: String(dataPlan.plan_type || ""),
          plan_name: String(dataPlan.plan_name || ""),
          // MobileNig requires its catalog amount; use synced vendor_price first.
          vendor_price: Number(
            dataPlan.vendor_price ?? dataPlan.original_price ?? dataPlan.price,
          ) || 0,
          user_price: userCharged,
          api_code: String(dataPlan.api_code || ""),
          mobilenig_code: String(dataPlan.mobilenig_code || dataPlan.api_code || ""),
        },
        phone_number,
        reference,
      );

      if (!purchaseResult.success) {
        if (debitResult) {
          await creditUserWallet({
            supabase,
            userId: user.id,
            amount: userCharged,
            transactionType: "refund",
            description: `Data refund — ${purchaseResult.error || "provider failed"}`,
            reference: `${reference}-REF`,
            performedBy: user.id,
          });
        }

        await supabase.from("data_transactions").insert({
          user_id: user.id,
          phone_number,
          network: dataPlan.network || null,
          plan_name: dataPlan.plan_name,
          plan_validity: dataPlan.validity || "N/A",
          amount: userCharged,
          balance_before: debitResult?.balanceBefore ?? balanceBefore,
          balance_after: debitResult?.balanceBefore ?? balanceBefore,
          status: "failed",
          reference,
          api_response: purchaseResult.vendor_response ?? { error: purchaseResult.error },
          provider: "mobilenig",
          vending_provider: "mobilenig",
          performed_by: user.id,
        });

        return new Response(JSON.stringify({
          success: false,
          error: purchaseResult.error || "MobileNig data purchase failed",
        }), {
          status: 200,
          headers: { ...CORS_HEADERS, "Content-Type": "application/json" },
        });
      }
    }

    const finalReference = purchaseResult.reference || reference;
    const { error: insertError } = await supabase.from("data_transactions").insert({
      user_id: user.id,
      phone_number,
      network: dataPlan.network || null,
      plan_name: dataPlan.plan_name,
      plan_validity: dataPlan.validity || "N/A",
      amount: userCharged,
      balance_before: debitResult?.balanceBefore ?? balanceBefore,
      balance_after: debitResult?.balanceAfter ?? balanceBefore - userCharged,
      // Provider-accepted pending orders are still successful purchases for the customer.
      status: "success",
      reference: finalReference,
      api_response: purchaseResult.vendor_response ?? { success: true },
      provider: "mobilenig",
      vending_provider: "mobilenig",
      performed_by: user.id,
    });

    if (insertError) {
      console.error("CRITICAL: MobileNig data purchased but transaction insert failed:", insertError);
    }

    if (!isDemoUser) {
      runAfterResponse(
        sendPushNotification(
          supabase,
          user.id,
          "Data Purchase Successful",
          `${dataPlan.plan_name} purchased for ${phone_number}.`,
          { type: "data_purchase", reference: finalReference },
        ),
      );
    }

    return new Response(JSON.stringify({
      success: true,
      data: {
        reference: finalReference,
        phone_number,
        plan_name: dataPlan.plan_name,
        amount: userCharged,
        vendor: "mobilenig",
        balance_before: debitResult?.balanceBefore ?? balanceBefore,
        balance_after: debitResult?.balanceAfter ?? balanceBefore - userCharged,
      },
      message: "Data purchased successfully via MobileNig",
    }), {
      status: 200,
      headers: { ...CORS_HEADERS, "Content-Type": "application/json" },
    });
  } catch (error) {
    console.error("purchase-mobilenig-data error:", error);
    return new Response(JSON.stringify({
      success: false,
      error: error instanceof Error ? error.message : "Unknown error occurred",
    }), {
      status: 500,
      headers: { ...CORS_HEADERS, "Content-Type": "application/json" },
    });
  }
}
