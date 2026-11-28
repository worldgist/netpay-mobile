import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { creditUserWallet, debitUserWallet } from "../_shared/wallet.ts";
import { sendPushNotification } from "../_shared/push-notifications.ts";
import { runAfterResponse } from "../_shared/run-after-response.ts";
import { queuedUserId } from "../_shared/purchase-queue.ts";
import {
  buyPlustiveCableTv,
  completePlustiveBuy,
  mapPlustiveStatus,
  plustiveClientReference,
  PlustiveUnconfirmedError,
} from "../_shared/plustive-api.ts";
import { requirePlustiveApiKey } from "../_shared/vendor-secrets.ts";

const CORS_HEADERS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, idempotency-key",
};

export async function handlePurchase(req: Request): Promise<Response> {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: CORS_HEADERS });
  }

  try {
    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    );
    const apiKey = await requirePlustiveApiKey(supabase);

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

    const body = await req.json().catch(() => ({}));
    const card_number = String(body.card_number || body.billersCode || body.smartcard_number || "").trim();
    const provider = String(body.provider || "").trim();
    const customer_name = String(body.customer_name || "").trim();
    const package_name = String(body.package_name || `${provider} Package`).trim();
    const productId = String(
      body.api_code || body.variation_code || body.product_id || body.plan_id || body.variation_id || "",
    ).trim();
    const parsedPrice = typeof body.price === "string" ? parseFloat(body.price) : Number(body.price || body.amount || 0);

    if (!card_number || !provider) {
      return new Response(JSON.stringify({
        success: false,
        error: "Missing required fields: card_number and provider",
      }), {
        status: 400,
        headers: { ...CORS_HEADERS, "Content-Type": "application/json" },
      });
    }

    if (!productId) {
      return new Response(JSON.stringify({
        success: false,
        error: "Package product ID (api_code) is required for Plustive",
      }), {
        status: 400,
        headers: { ...CORS_HEADERS, "Content-Type": "application/json" },
      });
    }

    if (!parsedPrice || parsedPrice <= 0 || Number.isNaN(parsedPrice)) {
      return new Response(JSON.stringify({
        success: false,
        error: "Plan price is required and must be a valid number",
      }), {
        status: 400,
        headers: { ...CORS_HEADERS, "Content-Type": "application/json" },
      });
    }

    const CHARGE_FEE_RATE = 0.02;
    const purchaseAmount = parsedPrice;
    const chargeFee = Math.round(purchaseAmount * CHARGE_FEE_RATE * 100) / 100;
    const totalAmount = purchaseAmount + chargeFee;

    const { data: profile, error: profileError } = await supabase
      .from("profiles")
      .select("balance, email, full_name")
      .eq("id", user.id)
      .single();

    if (profileError || !profile) {
      return new Response(JSON.stringify({ success: false, error: "Failed to fetch user profile" }), {
        status: 500,
        headers: { ...CORS_HEADERS, "Content-Type": "application/json" },
      });
    }

    const balanceBefore = Number(profile.balance) || 0;
    const isDemoUser = profile.email === "demo@netppay.com";
    const reference = await plustiveClientReference(req, body, user.id, "cable");

    const { data: existing } = await supabase
      .from("cable_tv_transactions")
      .select("reference, status, amount, smartcard_number, plan_name, balance_before, balance_after")
      .eq("reference", reference)
      .maybeSingle();
    if (existing) {
      const existingStatus = String(existing.status || "").toLowerCase();
      if (existingStatus === "failed" || existingStatus === "refunded") {
        return new Response(JSON.stringify({
          success: false,
          error: "This cable TV purchase already failed. Start a new purchase to try again.",
          data: { reference, status: existingStatus },
        }), {
          status: 200,
          headers: { ...CORS_HEADERS, "Content-Type": "application/json" },
        });
      }
      return new Response(JSON.stringify({
        success: true,
        pending: existingStatus === "pending" || existingStatus === "processing",
        data: {
          reference: existing.reference,
          smartcard_number: existing.smartcard_number,
          plan_name: existing.plan_name,
          amount: existing.amount,
          vendor: "plustive",
          balance_before: existing.balance_before,
          balance_after: existing.balance_after,
        },
        message: "Cable TV purchase already submitted",
      }), {
        status: 200,
        headers: { ...CORS_HEADERS, "Content-Type": "application/json" },
      });
    }

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
        transactionType: "cable_tv_purchase",
        description: `Cable TV purchase (Plustive) — ${package_name}`,
        reference,
        performedBy: user.id,
        balanceBefore,
      });
    }

    let purchaseResult: Awaited<ReturnType<typeof buyPlustiveCableTv>> | {
      demo: true;
      status: string;
      reference: string;
    } = { demo: true, status: "Success", reference };

    if (!isDemoUser) {
      try {
        purchaseResult = await completePlustiveBuy(reference, () => buyPlustiveCableTv({
          productId,
          smartcardNumber: card_number,
          clientReference: reference,
          apiKey,
        }), apiKey);
      } catch (error) {
        if (error instanceof PlustiveUnconfirmedError) {
          purchaseResult = { status: "Processing", reference };
        } else {
          if (debitResult) {
            await creditUserWallet({
              supabase,
              userId: user.id,
              amount: totalAmount,
              transactionType: "refund",
              description: `Cable TV refund — ${error instanceof Error ? error.message : "Plustive failed"}`,
              reference: `${reference}-REF`,
              performedBy: user.id,
            });
          }
          return new Response(JSON.stringify({
            success: false,
            error: error instanceof Error ? error.message : "Plustive cable purchase failed",
          }), {
            status: 200,
            headers: { ...CORS_HEADERS, "Content-Type": "application/json" },
          });
        }
      }

      const mapped = mapPlustiveStatus(purchaseResult.status);
      if (mapped === "failed") {
        if (debitResult) {
          await creditUserWallet({
            supabase,
            userId: user.id,
            amount: totalAmount,
            transactionType: "refund",
            description: `Cable TV refund — ${purchaseResult.failureReason || "provider failed"}`,
            reference: `${reference}-REF`,
            performedBy: user.id,
          });
        }
        return new Response(JSON.stringify({
          success: false,
          error: purchaseResult.failureReason || "Plustive cable purchase failed",
          data: purchaseResult,
        }), {
          status: 200,
          headers: { ...CORS_HEADERS, "Content-Type": "application/json" },
        });
      }
    }

    const providerReference = String(
      ("reference" in purchaseResult && purchaseResult.reference) || reference,
    );

    const cableRow: Record<string, unknown> = {
      user_id: user.id,
      amount: totalAmount,
      purchase_amount: purchaseAmount,
      charge_fee: chargeFee,
      balance_before: debitResult?.balanceBefore ?? balanceBefore,
      balance_after: debitResult?.balanceAfter ?? balanceBefore - totalAmount,
      smartcard_number: card_number,
      provider,
      plan_name: package_name,
      customer_name: customer_name || null,
      status: mapPlustiveStatus(("status" in purchaseResult && purchaseResult.status) || "Success") === "pending"
        ? "pending"
        : "completed",
      reference,
      vending_provider: "plustive",
      performed_by: user.id,
      api_response: { ...purchaseResult, clientReference: reference },
    };
    const { error: cableInsertError } = await supabase.from("cable_tv_transactions").insert(cableRow);
    if (cableInsertError && /vending_provider|purchase_amount|charge_fee|api_response/i.test(cableInsertError.message || "")) {
      const {
        vending_provider: _v,
        purchase_amount: _p,
        charge_fee: _c,
        api_response: _a,
        ...minimal
      } = cableRow;
      await supabase.from("cable_tv_transactions").insert(minimal);
    }

    if (!isDemoUser) {
      runAfterResponse((async () => {
        await sendPushNotification(
          supabase,
          user.id,
          "Cable TV Purchase Successful",
          `${package_name} renewed for ${card_number}. Reference: ${providerReference}.`,
          { type: "cable_tv_purchase", reference: providerReference },
        );
      })());
    }

    return new Response(JSON.stringify({
      success: true,
      data: {
        reference: providerReference,
        smartcard_number: card_number,
        provider,
        package_name,
        amount: purchaseAmount,
        total_amount: totalAmount,
        vendor: "plustive",
        customer_name,
      },
      message: "Cable TV purchased successfully via Plustive",
    }), {
      status: 200,
      headers: { ...CORS_HEADERS, "Content-Type": "application/json" },
    });
  } catch (error) {
    console.error("purchase-plustive-cable error:", error);
    return new Response(JSON.stringify({
      success: false,
      error: error instanceof Error ? error.message : "Unknown error occurred",
    }), {
      status: 500,
      headers: { ...CORS_HEADERS, "Content-Type": "application/json" },
    });
  }
}
