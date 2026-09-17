import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import {
  getEBillsToken,
  getEBillsServiceId,
  generateEBillsRequestId,
  purchaseEBillsCableTV,
  requeryEBillsOrder,
} from "../_shared/ebills-api.ts";
import { debitUserWallet, getUserLedgerBalance } from "../_shared/wallet.ts";
import { resolveEbillsPurchaseResult } from "../_shared/ebills-reconcile.ts";
import { getEbillsOrderStatus, refundPurchaseWallet } from "../_shared/purchase-refund.ts";
import { sendPushNotification } from "../_shared/push-notifications.ts";

const CORS_HEADERS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: CORS_HEADERS });
  }

  let debited = false;
  let debitUserId: string | null = null;
  let debitAmount = 0;
  let debitReference = "";
  let debitBalanceBefore = 0;
  let supabaseForRefund: ReturnType<typeof createClient> | null = null;

  const json = (body: Record<string, unknown>, status = 200) =>
    new Response(JSON.stringify(body), {
      status,
      headers: { ...CORS_HEADERS, "Content-Type": "application/json" },
    });

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const supabase = createClient(supabaseUrl, supabaseKey);
    supabaseForRefund = supabase;

    const authHeader = req.headers.get("Authorization");
    if (!authHeader) {
      return json({ success: false, error: "Unauthorized" }, 401);
    }

    const token = authHeader.replace("Bearer ", "");
    const { data: { user }, error: authError } = await supabase.auth.getUser(token);

    if (authError || !user) {
      return json({ success: false, error: "Unauthorized" }, 401);
    }

    let body: Record<string, unknown> = {};
    try {
      const bodyText = await req.text();
      if (bodyText && bodyText.trim().length > 0) {
        body = JSON.parse(bodyText);
      }
    } catch {
      return json({ success: false, error: "Invalid request body format" }, 400);
    }

    const card_number = String(body.card_number || body.billersCode || body.smartcard_number || "").trim();
    const provider = String(body.provider || "").trim();
    const customer_name = String(body.customer_name || "").trim();
    const package_name = String(body.package_name || `${provider} Package`).trim();
    const api_code = String(body.api_code || body.variation_code || body.plan_id || body.variation_id || "").trim();
    const parsedPrice = typeof body.price === "string" ? parseFloat(body.price) : Number(body.price || body.amount || 0);

    if (!card_number || !provider) {
      return json({ success: false, error: "Missing required fields: card_number and provider" }, 400);
    }

    if (!api_code) {
      return json({ success: false, error: "Package variation ID (api_code) is required" }, 400);
    }

    if (!parsedPrice || parsedPrice <= 0 || Number.isNaN(parsedPrice)) {
      return json({ success: false, error: "Plan price is required and must be a valid number" }, 400);
    }

    const CHARGE_FEE_RATE = 0.02;
    const purchaseAmount = parsedPrice;
    const chargeFee = purchaseAmount * CHARGE_FEE_RATE;
    const totalAmount = purchaseAmount + chargeFee;

    const { data: profile, error: profileError } = await supabase
      .from("profiles")
      .select("balance, email")
      .eq("id", user.id)
      .single();

    if (profileError || !profile) {
      return json({ success: false, error: "User profile not found" }, 404);
    }

    const isDemoUser = profile.email === "demo@netppay.com";
    const balanceBefore = await getUserLedgerBalance(supabase, user.id);

    if (balanceBefore < totalAmount) {
      return json({ success: false, error: "Insufficient balance" }, 400);
    }

    // eBills requires req_* request IDs (same format as airtime/data/betting).
    const reference = generateEBillsRequestId(user.id);
    const serviceId = getEBillsServiceId(provider);

    const refundWallet = async (reason: string, refSuffix: string) => {
      if (!debited || !debitUserId || debitAmount <= 0) return false;
      const ok = await refundPurchaseWallet({
        supabase,
        userId: debitUserId,
        amount: debitAmount,
        purchaseReference: debitReference || reference,
        productLabel: "Cable TV purchase",
        reason,
        refSuffix,
        performedBy: user.id,
      });
      if (ok) debited = false;
      return ok;
    };

    const recordCableTransaction = async (params: {
      status: string;
      balanceBeforeValue: number;
      balanceAfterValue: number;
      customerName?: string | null;
      apiResponse?: unknown;
    }) => {
      const row = {
        user_id: user.id,
        smartcard_number: card_number,
        provider,
        plan_name: package_name,
        customer_name: params.customerName ?? customer_name ?? null,
        amount: totalAmount,
        purchase_amount: purchaseAmount,
        charge_fee: chargeFee,
        balance_before: params.balanceBeforeValue,
        balance_after: params.balanceAfterValue,
        status: params.status,
        reference,
        api_response: params.apiResponse ?? null,
        vending_provider: "ebills",
        performed_by: user.id,
      };
      const { error } = await supabase.from("cable_tv_transactions").insert(row);
      if (error && /vending_provider/i.test(error.message || "")) {
        const { vending_provider: _vendor, ...withoutVendor } = row;
        await supabase.from("cable_tv_transactions").insert(withoutVendor);
      } else if (error) {
        console.error("Failed to record cable_tv_transactions row:", error);
      }
    };

    if (isDemoUser) {
      const debitResult = await debitUserWallet({
        supabase,
        userId: user.id,
        amount: totalAmount,
        transactionType: "cable_purchase",
        description: `Cable TV purchase (eBills Demo) - ${package_name}`,
        reference,
        performedBy: user.id,
        balanceBefore,
      });

      await recordCableTransaction({
        status: "success",
        balanceBeforeValue: debitResult.balanceBefore,
        balanceAfterValue: debitResult.balanceAfter,
      });

      return json({
        success: true,
        data: {
          reference,
          smartcard_number: card_number,
          provider,
          package_name,
          amount: totalAmount,
          purchase_amount: purchaseAmount,
          charge_fee: chargeFee,
          vendor: "ebills",
          balance_before: debitResult.balanceBefore,
          balance_after: debitResult.balanceAfter,
        },
        message: "Cable TV subscription purchased successfully (Demo)",
      });
    }

    let debitResult: Awaited<ReturnType<typeof debitUserWallet>>;
    try {
      debitResult = await debitUserWallet({
        supabase,
        userId: user.id,
        amount: totalAmount,
        transactionType: "cable_purchase",
        description: `Cable TV purchase (pending eBills) - ${package_name}`,
        reference,
        performedBy: user.id,
        balanceBefore,
      });
      debited = true;
      debitUserId = user.id;
      debitAmount = totalAmount;
      debitReference = reference;
      debitBalanceBefore = debitResult.balanceBefore;
    } catch (debitError) {
      console.error("Debit failed before eBills cable purchase:", debitError);
      return json({
        success: false,
        error: debitError instanceof Error
          ? debitError.message
          : "Could not debit wallet for cable purchase",
      });
    }

    let purchaseResult: Awaited<ReturnType<typeof purchaseEBillsCableTV>>;
    let ebillsToken: string;
    try {
      ebillsToken = await getEBillsToken();
      purchaseResult = await purchaseEBillsCableTV(
        ebillsToken,
        reference,
        card_number,
        serviceId,
        api_code,
        purchaseAmount,
      );
    } catch (vendorError) {
      console.error("eBills cable vendor call failed after debit:", vendorError);
      const refunded = await refundWallet(
        vendorError instanceof Error ? vendorError.message : "provider request failed",
        "VENDOR-FAIL",
      );
      await recordCableTransaction({
        status: "failed",
        balanceBeforeValue: debitResult.balanceBefore,
        balanceAfterValue: debitResult.balanceBefore,
        apiResponse: {
          message: vendorError instanceof Error ? vendorError.message : "Vendor failed",
          wallet_refunded: refunded,
        },
      });

      return json({
        success: false,
        error: refunded
          ? (vendorError instanceof Error ? vendorError.message : "Cable TV purchase failed") +
            " Your wallet has been credited back."
          : (vendorError instanceof Error ? vendorError.message : "Cable TV purchase failed") +
            " Refund could not be completed automatically — contact support with reference " + reference,
        data: {
          reference,
          status: "failed",
          wallet_refunded: refunded,
          balance_before: debitResult.balanceBefore,
          balance_after: debitResult.balanceBefore,
        },
      });
    }

    let resolved = await resolveEbillsPurchaseResult(ebillsToken, reference, purchaseResult);
    purchaseResult = resolved.purchaseResult;
    let orderStatus = resolved.orderStatus;

    // After poll timeout, do one final requery. If the order is gone/failed, refund immediately
    // instead of leaving the user debited in limbo.
    if (resolved.timedOut && !orderStatus.isCompleted && !orderStatus.shouldRefund) {
      try {
        purchaseResult = await requeryEBillsOrder(ebillsToken, reference);
        orderStatus = getEbillsOrderStatus(purchaseResult);
        resolved = { ...resolved, purchaseResult, orderStatus, timedOut: true };
      } catch (finalRequeryError) {
        const msg = finalRequeryError instanceof Error ? finalRequeryError.message : String(finalRequeryError);
        if (/not found/i.test(msg)) {
          const refunded = await refundWallet("order not found after provider timeout", "STALE-REF");
          await recordCableTransaction({
            status: "failed",
            balanceBeforeValue: debitResult.balanceBefore,
            balanceAfterValue: debitResult.balanceBefore,
            apiResponse: {
              message: msg,
              poll: { polled: resolved.polled, timedOut: true },
              wallet_refunded: refunded,
            },
          });
          return json({
            success: false,
            error: refunded
              ? "Cable TV purchase could not be confirmed with the provider. Your wallet has been credited back."
              : `Cable TV purchase could not be confirmed. Refund pending — contact support with reference ${reference}.`,
            data: {
              reference,
              status: "failed",
              wallet_refunded: refunded,
              balance_before: debitResult.balanceBefore,
              balance_after: debitResult.balanceBefore,
            },
          });
        }
      }
    }

    const resolvedCustomerName = customer_name || purchaseResult.data?.customer_name || null;

    if (orderStatus.shouldRefund) {
      const refunded = await refundWallet(
        orderStatus.isRefunded ? "provider refunded order" : "provider rejected order",
        resolved.polled ? "POLL-REF" : "REF",
      );
      await recordCableTransaction({
        status: orderStatus.isRefunded ? "refunded" : "failed",
        balanceBeforeValue: debitResult.balanceBefore,
        balanceAfterValue: debitResult.balanceBefore,
        customerName: resolvedCustomerName,
        apiResponse: { ...purchaseResult, wallet_refunded: refunded },
      });

      return json({
        success: false,
        error: refunded
          ? (orderStatus.isRefunded
            ? "Cable TV purchase was refunded by the provider. Your wallet has been credited back."
            : "Cable TV purchase failed at the provider. Your wallet has been credited back.")
          : `Cable TV purchase failed. Refund pending — contact support with reference ${reference}.`,
        data: {
          reference,
          status: orderStatus.isRefunded ? "refunded" : "failed",
          wallet_refunded: refunded,
          balance_before: debitResult.balanceBefore,
          balance_after: debitResult.balanceBefore,
        },
      });
    }

    if (!orderStatus.isCompleted) {
      await recordCableTransaction({
        status: "processing",
        balanceBeforeValue: debitResult.balanceBefore,
        balanceAfterValue: debitResult.balanceAfter,
        customerName: resolvedCustomerName,
        apiResponse: {
          ...purchaseResult,
          poll: { polled: resolved.polled, timedOut: resolved.timedOut },
        },
      });

      // Debit is intentional while processing; mark so outer catch does not auto-refund.
      debited = false;

      await sendPushNotification(
        supabase,
        user.id,
        "Cable TV Purchase Processing",
        `₦${totalAmount.toFixed(2)} ${package_name} for ${provider} is being processed. Reference: ${reference}. You will be notified when completed.`,
        {
          type: "cable_tv_subscription",
          reference,
          amount: totalAmount,
          provider,
          package_name,
          card_number,
          status: "processing",
        },
      );

      return json({
        success: false,
        pending: true,
        message:
          "Your cable TV subscription is still being processed. You will be notified when it completes or if a refund is issued.",
        data: {
          reference,
          amount: totalAmount,
          purchase_amount: purchaseAmount,
          charge_fee: chargeFee,
          balance_before: debitResult.balanceBefore,
          balance_after: debitResult.balanceAfter,
          provider,
          package: package_name,
          card_number,
          customer_name: resolvedCustomerName,
          status: "processing",
          vendor: "ebills",
          api_response: purchaseResult.data,
        },
      });
    }

    await recordCableTransaction({
      status: "success",
      balanceBeforeValue: debitResult.balanceBefore,
      balanceAfterValue: debitResult.balanceAfter,
      customerName: resolvedCustomerName,
      apiResponse: purchaseResult,
    });

    // Success — do not refund on later notification errors.
    debited = false;

    try {
      await sendPushNotification(
        supabase,
        user.id,
        "Cable TV Subscription Successful",
        `₦${totalAmount.toFixed(2)} ${package_name} subscription successful for ${provider} (Card: ${card_number}). Your new balance is ₦${debitResult.balanceAfter.toFixed(2)}.`,
        {
          type: "cable_tv_subscription",
          reference,
          amount: totalAmount,
          provider,
          package_name,
          card_number,
          status: "success",
        },
      );
    } catch (pushError) {
      console.warn("Cable success push failed (non-fatal):", pushError);
    }

    return json({
      success: true,
      data: {
        reference,
        amount: totalAmount,
        purchase_amount: purchaseAmount,
        charge_fee: chargeFee,
        balance_before: debitResult.balanceBefore,
        balance_after: debitResult.balanceAfter,
        provider,
        package: package_name,
        card_number,
        customer_name: resolvedCustomerName,
        status: "success",
        vendor: "ebills",
        api_response: purchaseResult.data,
      },
    });
  } catch (error) {
    console.error("purchase-ebills-cable error:", error);

    // Safety net: if we debited and then hit an unexpected error, always attempt refund.
    if (debited && supabaseForRefund && debitUserId && debitAmount > 0 && debitReference) {
      const refunded = await refundPurchaseWallet({
        supabase: supabaseForRefund,
        userId: debitUserId,
        amount: debitAmount,
        purchaseReference: debitReference,
        productLabel: "Cable TV purchase",
        reason: error instanceof Error ? error.message : "unexpected error after debit",
        refSuffix: "CATCH-REF",
        performedBy: debitUserId,
      });

      try {
        await supabaseForRefund.from("cable_tv_transactions").insert({
          user_id: debitUserId,
          smartcard_number: "unknown",
          provider: "unknown",
          plan_name: "Cable TV",
          amount: debitAmount,
          purchase_amount: debitAmount,
          charge_fee: 0,
          balance_before: debitBalanceBefore,
          balance_after: debitBalanceBefore,
          status: "failed",
          reference: debitReference,
          api_response: {
            error: error instanceof Error ? error.message : String(error),
            wallet_refunded: refunded,
          },
          vending_provider: "ebills",
          performed_by: debitUserId,
        });
      } catch (recordError) {
        console.error("Failed to record failed cable row after catch refund:", recordError);
      }

      return json({
        success: false,
        error: refunded
          ? "Cable TV purchase failed unexpectedly. Your wallet has been credited back."
          : `Cable TV purchase failed. Refund pending — contact support with reference ${debitReference}.`,
        data: {
          reference: debitReference,
          status: "failed",
          wallet_refunded: refunded,
        },
      });
    }

    return json({
      success: false,
      error: error instanceof Error ? error.message : "Cable TV purchase failed",
    }, 500);
  }
});
