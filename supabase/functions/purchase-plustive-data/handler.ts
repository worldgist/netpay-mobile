import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { debitUserWallet, creditUserWallet } from "../_shared/wallet.ts";
import { sendPushNotification } from "../_shared/push-notifications.ts";
import { runAfterResponse } from "../_shared/run-after-response.ts";
import { queuedUserId } from "../_shared/purchase-queue.ts";
import {
  buyPlustiveData,
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

function sanitizePhone(raw: unknown): string {
  let phone = typeof raw === "string" ? raw.trim().replace(/\s+/g, "") : "";
  if (phone.startsWith("+234")) phone = `0${phone.slice(4)}`;
  else if (phone.startsWith("234") && phone.length === 13) phone = `0${phone.slice(3)}`;
  return phone.replace(/[^0-9]/g, "");
}

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
    const phone = sanitizePhone(body.phone_number);
    const planId = typeof body.plan_id === "string" ? body.plan_id : "";

    if (!phone || phone.length < 10 || phone.length > 11) {
      return new Response(JSON.stringify({
        success: false,
        error: "Please enter a valid phone number (10-11 digits)",
      }), {
        status: 200,
        headers: { ...CORS_HEADERS, "Content-Type": "application/json" },
      });
    }

    if (!planId) {
      return new Response(JSON.stringify({ success: false, error: "phone_number and plan_id are required" }), {
        status: 200,
        headers: { ...CORS_HEADERS, "Content-Type": "application/json" },
      });
    }

    const { data: dataPlan, error: planError } = await supabase
      .from("data_plans")
      .select("*")
      .eq("id", planId)
      .single();

    if (planError || !dataPlan) {
      return new Response(JSON.stringify({ success: false, error: "Data plan not found" }), {
        status: 404,
        headers: { ...CORS_HEADERS, "Content-Type": "application/json" },
      });
    }

    const plustivePlanId = String(
      dataPlan.plustive_code ||
        (String(dataPlan.provider || "").toLowerCase().includes("plustive") ? dataPlan.api_code : "") ||
        dataPlan.api_code ||
        "",
    ).trim();

    if (!plustivePlanId) {
      return new Response(JSON.stringify({
        success: false,
        error: "This data plan has no Plustive plan code configured",
      }), {
        status: 200,
        headers: { ...CORS_HEADERS, "Content-Type": "application/json" },
      });
    }

    const { data: profile, error: profileError } = await supabase
      .from("profiles")
      .select("balance, full_name, email")
      .eq("id", user.id)
      .single();

    if (profileError || !profile) {
      return new Response(JSON.stringify({ success: false, error: "Failed to fetch user profile" }), {
        status: 500,
        headers: { ...CORS_HEADERS, "Content-Type": "application/json" },
      });
    }

    const planAmount = Number(dataPlan.price) || 0;
    const balanceBefore = Number(profile.balance) || 0;
    const isDemoUser = profile.email === "demo@netppay.com";
    const reference = await plustiveClientReference(req, body, user.id, "data");
    const planName = String(dataPlan.plan_name || "Data Plan");

    const { data: existing } = await supabase
      .from("data_transactions")
      .select("reference, status, amount, phone_number, plan_name, balance_before, balance_after")
      .eq("reference", reference)
      .maybeSingle();
    if (existing) {
      const existingStatus = String(existing.status || "").toLowerCase();
      if (existingStatus === "failed" || existingStatus === "refunded") {
        return new Response(JSON.stringify({
          success: false,
          error: "This data purchase already failed. Start a new purchase to try again.",
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
          phone_number: existing.phone_number,
          plan_name: existing.plan_name,
          amount: existing.amount,
          vendor: "plustive",
          balance_before: existing.balance_before,
          balance_after: existing.balance_after,
        },
        message: "Data purchase already submitted",
      }), {
        status: 200,
        headers: { ...CORS_HEADERS, "Content-Type": "application/json" },
      });
    }

    if (!isDemoUser && balanceBefore < planAmount) {
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
        amount: planAmount,
        transactionType: "data_purchase",
        description: `Data purchase (Plustive) — ${planName}`,
        reference,
        performedBy: user.id,
        balanceBefore,
      });
    }

    let purchaseResult: Awaited<ReturnType<typeof buyPlustiveData>> | { demo: true; status: string; reference: string } = {
      demo: true,
      status: "Success",
      reference,
    };

    if (!isDemoUser) {
      try {
        purchaseResult = await completePlustiveBuy(reference, () => buyPlustiveData({
          planId: plustivePlanId,
          phone,
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
              amount: planAmount,
              transactionType: "refund",
              description: `Data refund — ${error instanceof Error ? error.message : "Plustive failed"}`,
              reference: `${reference}-REF`,
              performedBy: user.id,
            });
          }
          return new Response(JSON.stringify({
            success: false,
            error: error instanceof Error ? error.message : "Plustive data purchase failed",
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
            amount: planAmount,
            transactionType: "refund",
            description: `Data refund — ${purchaseResult.failureReason || "provider failed"}`,
            reference: `${reference}-REF`,
            performedBy: user.id,
          });
        }
        return new Response(JSON.stringify({
          success: false,
          error: purchaseResult.failureReason || "Plustive data purchase failed",
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
    const storedPurchase = {
      ...purchaseResult,
      clientReference: reference,
    };

    const dataRow: Record<string, unknown> = {
      user_id: user.id,
      phone_number: phone,
      plan_id: planId,
      plan_name: planName,
      amount: planAmount,
      balance_before: debitResult?.balanceBefore ?? balanceBefore,
      balance_after: debitResult?.balanceAfter ?? balanceBefore - planAmount,
      status: mapPlustiveStatus(("status" in purchaseResult && purchaseResult.status) || "Success") === "pending"
        ? "pending"
        : "success",
      reference,
      vendor: "plustive",
      vending_provider: "plustive",
      performed_by: user.id,
      api_response: storedPurchase,
    };
    const { error: dataInsertError } = await supabase.from("data_transactions").insert(dataRow);
    if (dataInsertError && /vending_provider|api_response/i.test(dataInsertError.message || "")) {
      const { vending_provider: _v, api_response: _a, ...minimal } = dataRow;
      await supabase.from("data_transactions").insert(minimal);
    }

    if (!isDemoUser) {
      runAfterResponse((async () => {
        await sendPushNotification(
          supabase,
          user.id,
          "Data Purchase Successful",
          `${planName} purchased for ${phone}. Reference: ${providerReference}.`,
          { type: "data_purchase", reference: providerReference },
        );
      })());
    }

    return new Response(JSON.stringify({
      success: true,
      data: {
        reference: providerReference,
        phone_number: phone,
        plan_name: planName,
        amount: planAmount,
        vendor: "plustive",
        balance_before: debitResult?.balanceBefore ?? balanceBefore,
        balance_after: debitResult?.balanceAfter ?? balanceBefore - planAmount,
      },
      message: "Data purchased successfully via Plustive",
    }), {
      status: 200,
      headers: { ...CORS_HEADERS, "Content-Type": "application/json" },
    });
  } catch (error) {
    console.error("purchase-plustive-data error:", error);
    return new Response(JSON.stringify({
      success: false,
      error: error instanceof Error ? error.message : "Unknown error occurred",
    }), {
      status: 500,
      headers: { ...CORS_HEADERS, "Content-Type": "application/json" },
    });
  }
}
