import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { creditUserWallet, debitUserWallet } from "../_shared/wallet.ts";
import { sendPushNotification } from "../_shared/push-notifications.ts";
import { extractElectricityToken, sendElectricityReceiptEmail } from "../_shared/electricity-receipt-email.ts";
import { runAfterResponse } from "../_shared/run-after-response.ts";
import { queuedUserId } from "../_shared/purchase-queue.ts";
import {
  buyPlustiveElectricity,
  completePlustiveBuy,
  mapPlustiveStatus,
  plustiveClientReference,
  PlustiveUnconfirmedError,
  resolvePlustiveElectricityProductId,
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
    const meter_number = String(body?.meter_number || "").trim();
    const provider = String(body?.provider || "").trim().toUpperCase();
    const meter_type = String(body?.meter_type || "prepaid").trim().toLowerCase();
    const amount = Number(body?.amount || 0);
    const customer_name = String(body?.customer_name || "").trim();
    const customer_address = String(body?.customer_address || "").trim();
    const productOverride = String(body?.variation_id || body?.api_code || body?.product_id || "").trim();

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
      .select("balance, email, full_name")
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
    const reference = await plustiveClientReference(req, body, user.id, "electricity");

    const { data: existing } = await supabase
      .from("electricity_transactions")
      .select("reference, status, amount, meter_number, token, balance_before, balance_after")
      .eq("reference", reference)
      .maybeSingle();
    if (existing) {
      const existingStatus = String(existing.status || "").toLowerCase();
      if (existingStatus === "failed" || existingStatus === "refunded") {
        return new Response(JSON.stringify({
          success: false,
          error: "This electricity purchase already failed. Start a new purchase to try again.",
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
          meter_number: existing.meter_number,
          amount: existing.amount,
          token: existing.token,
          vendor: "plustive",
          balance_before: existing.balance_before,
          balance_after: existing.balance_after,
        },
        message: "Electricity purchase already submitted",
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
        transactionType: "electricity_purchase",
        description: `Electricity purchase (Plustive) — ${provider} ${meter_type}`,
        reference,
        performedBy: user.id,
        balanceBefore,
      });
    }

    const productId = productOverride ||
      (await resolvePlustiveElectricityProductId(provider, meter_type, apiKey));

    let purchaseResult: Awaited<ReturnType<typeof buyPlustiveElectricity>> | {
      demo: true;
      status: string;
      reference: string;
      token?: string;
    } = {
      demo: true,
      status: "Success",
      reference,
      token: "0000-0000-0000-0000-0000",
    };

    if (!isDemoUser) {
      try {
        purchaseResult = await completePlustiveBuy(reference, () => buyPlustiveElectricity({
          productId,
          meterNumber: meter_number,
          amountNaira: purchaseAmount,
          clientReference: reference,
          meterType: meter_type,
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
              description: `Electricity refund — ${error instanceof Error ? error.message : "Plustive failed"}`,
              reference: `${reference}-REF`,
              performedBy: user.id,
            });
          }
          return new Response(JSON.stringify({
            success: false,
            error: error instanceof Error ? error.message : "Plustive electricity purchase failed",
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
            description: `Electricity refund — ${purchaseResult.failureReason || "provider failed"}`,
            reference: `${reference}-REF`,
            performedBy: user.id,
          });
        }
        return new Response(JSON.stringify({
          success: false,
          error: purchaseResult.failureReason || "Plustive electricity purchase failed",
          data: purchaseResult,
        }), {
          status: 200,
          headers: { ...CORS_HEADERS, "Content-Type": "application/json" },
        });
      }
    }

    const electricityToken = String(
      ("token" in purchaseResult && purchaseResult.token) ||
        extractElectricityToken(purchaseResult) ||
        "",
    ) || null;
    const providerReference = String(
      ("reference" in purchaseResult && purchaseResult.reference) || reference,
    );

    const delivered =
      "deliveredDetails" in purchaseResult && purchaseResult.deliveredDetails
        ? purchaseResult.deliveredDetails
        : null;
    const elecRow: Record<string, unknown> = {
      user_id: user.id,
      amount: totalAmount,
      purchase_amount: purchaseAmount,
      charge_fee: chargeFee,
      balance_before: debitResult?.balanceBefore ?? balanceBefore,
      balance_after: debitResult?.balanceAfter ?? balanceBefore - totalAmount,
      meter_number,
      provider,
      meter_type,
      customer_name: customer_name || delivered?.customerName || null,
      customer_address: customer_address || delivered?.customerAddress || null,
      token: electricityToken,
      status: mapPlustiveStatus(("status" in purchaseResult && purchaseResult.status) || "Success") === "pending"
        ? "pending"
        : "completed",
      reference,
      vending_provider: "plustive",
      performed_by: user.id,
      api_response: { ...purchaseResult, clientReference: reference },
    };
    const { error: elecInsertError } = await supabase.from("electricity_transactions").insert(elecRow);
    if (elecInsertError && /vending_provider|api_response/i.test(elecInsertError.message || "")) {
      const { vending_provider: _v, api_response: _a, ...minimal } = elecRow;
      await supabase.from("electricity_transactions").insert(minimal);
    }

    if (!isDemoUser) {
      const receiptBefore = debitResult?.balanceBefore ?? balanceBefore;
      const receiptAfter = debitResult?.balanceAfter ?? balanceBefore - totalAmount;
      runAfterResponse((async () => {
        await sendPushNotification(
          supabase,
          user.id,
          "Electricity Purchase Successful",
          `₦${purchaseAmount.toFixed(2)} electricity token purchased for meter ${meter_number}.`,
          { type: "electricity_purchase", reference: providerReference, token: electricityToken || undefined },
        );
        await sendElectricityReceiptEmail({
          email: profile.email || undefined,
          fullName: profile.full_name,
          provider,
          token: electricityToken,
          amount: totalAmount,
          purchaseAmount,
          chargeFee,
          meterNumber: meter_number,
          meterType: meter_type,
          customerName: customer_name,
          customerAddress: customer_address,
          reference: providerReference,
          balanceBefore: receiptBefore,
          balanceAfter: receiptAfter,
        });
      })());
    }

    return new Response(JSON.stringify({
      success: true,
      data: {
        reference: providerReference,
        meter_number,
        provider,
        meter_type,
        amount: purchaseAmount,
        total_amount: totalAmount,
        token: electricityToken,
        vendor: "plustive",
        customer_name,
        customer_address,
      },
      message: "Electricity purchased successfully via Plustive",
    }), {
      status: 200,
      headers: { ...CORS_HEADERS, "Content-Type": "application/json" },
    });
  } catch (error) {
    console.error("purchase-plustive-electricity error:", error);
    return new Response(JSON.stringify({
      success: false,
      error: error instanceof Error ? error.message : "Unknown error occurred",
    }), {
      status: 500,
      headers: { ...CORS_HEADERS, "Content-Type": "application/json" },
    });
  }
}
