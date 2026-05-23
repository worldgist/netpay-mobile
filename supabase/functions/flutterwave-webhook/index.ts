import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { sendPushNotification } from "../_shared/push-notifications.ts";

const CORS_HEADERS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, verif-hash",
};

const FUNDING_FEE_PERCENTAGE = 0.05;
const MIN_FUNDING_FEE = 10;

const calculateFundingFee = (amount: number): number => {
  const percentageFee = amount * FUNDING_FEE_PERCENTAGE;
  return Math.max(MIN_FUNDING_FEE, Math.round(percentageFee * 100) / 100);
};

const digitsOnly = (value: unknown): string | null => {
  if (typeof value !== "string") return null;
  const normalized = value.replace(/\D/g, "").trim();
  return normalized.length > 0 ? normalized : null;
};

const normalizeReference = (value: unknown): string | null => {
  if (typeof value !== "string") return null;
  const normalized = value.trim();
  return normalized.length > 0 ? normalized : null;
};

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: CORS_HEADERS });
  }

  if (req.method === "GET") {
    return new Response(
      JSON.stringify({
        success: true,
        function: "flutterwave-webhook",
        message: "Webhook endpoint is active",
      }),
      { status: 200, headers: { ...CORS_HEADERS, "Content-Type": "application/json" } },
    );
  }

  try {
    const secretHash =
      Deno.env.get("FLW_SECRET_HASH") ||
      Deno.env.get("FLUTTERWAVE_SECRET_HASH") ||
      Deno.env.get("SECRET_HASH");

    if (!secretHash) {
      console.error("Flutterwave secret hash not configured");
      return new Response(
        JSON.stringify({ success: false, error: "Webhook secret hash is not configured" }),
        { status: 500, headers: { ...CORS_HEADERS, "Content-Type": "application/json" } },
      );
    }

    const incomingHash = req.headers.get("verif-hash");
    if (!incomingHash || incomingHash !== secretHash) {
      console.warn("Invalid Flutterwave webhook hash", { hasHash: !!incomingHash });
      return new Response(
        JSON.stringify({ success: false, error: "Invalid webhook signature" }),
        { status: 401, headers: { ...CORS_HEADERS, "Content-Type": "application/json" } },
      );
    }

    const payload = await req.json();
    const event = String(payload?.event || "").toLowerCase();
    const data = payload?.data ?? {};

    const status = String(data?.status || "").toLowerCase();
    if (!["successful", "completed"].includes(status)) {
      return new Response(
        JSON.stringify({ success: true, message: `Payment status ignored: ${status || "unknown"}` }),
        { status: 200, headers: { ...CORS_HEADERS, "Content-Type": "application/json" } },
      );
    }

    const txRef = normalizeReference(data?.tx_ref) || normalizeReference(data?.reference);
    const flwRef = normalizeReference(data?.flw_ref) ||
      (typeof data?.id === "number" ? String(data.id) : null);

    const providerReference = txRef || flwRef;

    const accountNumberCandidates = [
      data?.account_number,
      data?.account?.account_number,
      data?.account?.bank_account_number,
      data?.meta?.account_number,
      data?.customer?.account_number,
      data?.customer?.account?.number,
      data?.source_account_number,
      data?.originatoraccountnumber,
      data?.originator_account_number,
      data?.charged_amount_details?.source_account_number,
      data?.destination_account_number,
      data?.meta?.originatoraccountnumber,
      data?.meta?.originator_account_number,
      data?.narration?.match?.(/\b\d{10,12}\b/)?.[0],
      payload?.meta?.account_number,
      payload?.originatoraccountnumber,
      payload?.originator_account_number,
      payload?.data?.account_number,
    ];

    const accountNumber = accountNumberCandidates
      .map((candidate) => digitsOnly(candidate))
      .find((candidate) => !!candidate) || null;

    const acceptedEvents = new Set([
      "charge.completed",
      "transfer.completed",
      "bank_transfer.completed",
      "collection.completed",
      "payment.completed",
    ]);

    const looksLikeVirtualAccountFunding =
      !!accountNumber ||
      (typeof txRef === "string" && txRef.startsWith("FLW-VA-"));

    // Ignore clearly unrelated events, but allow empty/unknown event labels when
    // the payload still matches our static virtual account funding shape.
    if (event && !acceptedEvents.has(event) && !looksLikeVirtualAccountFunding) {
      return new Response(
        JSON.stringify({ success: true, message: `Event ignored: ${event}` }),
        { status: 200, headers: { ...CORS_HEADERS, "Content-Type": "application/json" } },
      );
    }

    if (!providerReference) {
      return new Response(
        JSON.stringify({ success: false, error: "Missing transaction reference" }),
        { status: 400, headers: { ...CORS_HEADERS, "Content-Type": "application/json" } },
      );
    }

    const amountValue = Number(data?.amount);
    if (!Number.isFinite(amountValue) || amountValue <= 0) {
      return new Response(
        JSON.stringify({ success: false, error: "Invalid payment amount" }),
        { status: 400, headers: { ...CORS_HEADERS, "Content-Type": "application/json" } },
      );
    }

    const currency = String(data?.currency || "").toUpperCase();
    if (currency && currency !== "NGN") {
      return new Response(
        JSON.stringify({ success: true, message: `Currency ignored: ${currency}` }),
        { status: 200, headers: { ...CORS_HEADERS, "Content-Type": "application/json" } },
      );
    }

    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const supabase = createClient(supabaseUrl, serviceRoleKey);

    let { data: existingTx } = await supabase
      .from("funding_transactions")
      .select("id, user_id, status, amount, account_name, account_number")
      .eq("reference", providerReference)
      .maybeSingle();

    if (!existingTx && txRef && flwRef && txRef !== flwRef) {
      const { data: alternateRefs } = await supabase
        .from("funding_transactions")
        .select("id, user_id, status, amount, account_name, account_number, reference")
        .in("reference", [txRef, flwRef])
        .limit(1);

      if (alternateRefs && alternateRefs.length > 0) {
        existingTx = alternateRefs[0];
      }
    }

    // Some Flutterwave flows persist tx_ref in api_response while reference may differ.
    if (!existingTx && txRef) {
      const { data: byApiResponseTxRef } = await supabase
        .from("funding_transactions")
        .select("id, user_id, status, amount, account_name, account_number")
        .contains("api_response", { tx_ref: txRef })
        .limit(1);

      if (byApiResponseTxRef && byApiResponseTxRef.length > 0) {
        existingTx = byApiResponseTxRef[0];
      }
    }

    if (!existingTx) {
      let resolvedUserId: string | null = null;
      let resolvedAccountName: string | null = null;
      let resolvedBankName: string | null = null;
      let resolvedAccountNumber: string | null = accountNumber;

      let virtualAccount: {
        user_id: string;
        account_name: string | null;
        bank_name: string | null;
        account_number: string | null;
        bank_code: string | null;
      } | null = null;

      if (accountNumber) {
        const { data } = await supabase
          .from("virtual_accounts")
          .select("user_id, account_name, bank_name, account_number, bank_code")
          .eq("account_number", accountNumber)
          .eq("bank_code", "FLW")
          .maybeSingle();
        virtualAccount = data;
      }

      // Fallbacks for account-number formatting/bank_code variants.
      if (!virtualAccount && accountNumber) {
        const { data: byAnyBankCode } = await supabase
          .from("virtual_accounts")
          .select("user_id, account_name, bank_name, account_number, bank_code")
          .eq("account_number", accountNumber)
          .maybeSingle();
        virtualAccount = byAnyBankCode;
      }

      if (!virtualAccount && accountNumber) {
        const accountWithNoLeadingZeros = accountNumber.replace(/^0+/, "");
        const fallbackCandidates = [
          accountWithNoLeadingZeros,
          accountWithNoLeadingZeros.padStart(10, "0"),
          accountWithNoLeadingZeros.padStart(11, "0"),
        ].filter((v, i, arr) => !!v && arr.indexOf(v) === i);

        for (const candidate of fallbackCandidates) {
          const { data: fallbackVirtualAccount } = await supabase
            .from("virtual_accounts")
            .select("user_id, account_name, bank_name, account_number, bank_code")
            .eq("account_number", candidate)
            .maybeSingle();

          if (fallbackVirtualAccount) {
            virtualAccount = fallbackVirtualAccount;
            break;
          }
        }
      }

      if (virtualAccount) {
        resolvedUserId = virtualAccount.user_id;
        resolvedAccountName = virtualAccount.account_name;
        resolvedBankName = virtualAccount.bank_name;
        resolvedAccountNumber = virtualAccount.account_number || accountNumber;
      }

      // Fallback: match by tracking reference emitted during Flutterwave virtual-account creation.
      if (!resolvedUserId) {
        const trackingCandidates = [providerReference, txRef, flwRef]
          .filter((candidate, idx, arr): candidate is string => !!candidate && arr.indexOf(candidate) === idx);

        if (trackingCandidates.length > 0) {
          const { data: byTrackingReference } = await supabase
            .from("virtual_accounts")
            .select("user_id, account_name, bank_name, account_number, bank_code, tracking_reference")
            .in("tracking_reference", trackingCandidates)
            .order("updated_at", { ascending: false })
            .limit(1)
            .maybeSingle();

          if (byTrackingReference) {
            resolvedUserId = byTrackingReference.user_id;
            resolvedAccountName = byTrackingReference.account_name;
            resolvedBankName = byTrackingReference.bank_name;
            resolvedAccountNumber = byTrackingReference.account_number || accountNumber;
            virtualAccount = {
              user_id: byTrackingReference.user_id,
              account_name: byTrackingReference.account_name,
              bank_name: byTrackingReference.bank_name,
              account_number: byTrackingReference.account_number,
              bank_code: byTrackingReference.bank_code,
            };
          }
        }
      }

      // Fallback for Flutterwave payloads where originator account number is masked/unavailable.
      if (!resolvedUserId) {
        const customerEmail = typeof data?.customer?.email === "string" ? data.customer.email.trim().toLowerCase() : "";
        if (customerEmail) {
          const { data: profileByEmail } = await supabase
            .from("profiles")
            .select("id, full_name")
            .eq("email", customerEmail)
            .maybeSingle();

          if (profileByEmail?.id) {
            resolvedUserId = profileByEmail.id;
            resolvedAccountName = profileByEmail.full_name || data?.customer?.name || null;
            resolvedBankName = "Flutterwave";
          }
        }
      }

      if (!resolvedUserId) {
        console.error("Unable to resolve Flutterwave funding user", {
          providerReference,
          txRef,
          flwRef,
          accountNumber,
          event,
          status,
        });
        return new Response(
          JSON.stringify({ success: false, error: `Funding transaction not found for reference ${providerReference}` }),
          { status: 404, headers: { ...CORS_HEADERS, "Content-Type": "application/json" } },
        );
      }

      if (!virtualAccount) {
        console.warn("Resolved Flutterwave funding user without virtual account number match", {
          reference: providerReference,
          userId: resolvedUserId,
          hasAccountNumber: !!accountNumber,
        });
      }

      const { data: insertedTx, error: insertError } = await supabase
        .from("funding_transactions")
        .insert({
          user_id: resolvedUserId,
          amount: amountValue,
          bank_name: resolvedBankName || "Flutterwave",
          account_number: resolvedAccountNumber,
          account_name: resolvedAccountName || data?.customer?.name || null,
          reference: providerReference,
          status: "pending",
          api_response: payload,
        })
        .select("id, user_id, status, amount")
        .single();

      if (insertError || !insertedTx) {
        throw new Error(insertError?.message || "Failed to create funding transaction record");
      }

      existingTx = insertedTx;
    }

    if (String(existingTx.status).toLowerCase() === "completed") {
      return new Response(
        JSON.stringify({ success: true, message: "Transaction already processed", reference: providerReference }),
        { status: 200, headers: { ...CORS_HEADERS, "Content-Type": "application/json" } },
      );
    }

    const userId = existingTx.user_id;

    const existingReferenceVariants = [
      providerReference,
      txRef,
      flwRef,
    ].filter((ref, idx, arr): ref is string => !!ref && arr.indexOf(ref) === idx);

    const { data: existingLedger } = await supabase
      .from("user_transactions")
      .select("id, reference")
      .in("reference", existingReferenceVariants)
      .eq("user_id", userId)
      .limit(1);

    if (existingLedger && existingLedger.length > 0) {
      return new Response(
        JSON.stringify({ success: true, message: "Ledger already processed", reference: providerReference }),
        { status: 200, headers: { ...CORS_HEADERS, "Content-Type": "application/json" } },
      );
    }

    const { data: profile, error: profileError } = await supabase
      .from("profiles")
      .select("balance")
      .eq("id", userId)
      .single();

    if (profileError || !profile) {
      throw new Error(profileError?.message || "Failed to fetch profile");
    }

    const currentBalance = Number(profile.balance || 0);
    const fundingFee = calculateFundingFee(amountValue);
    const netCreditAmount = amountValue - fundingFee;
    const finalBalance = currentBalance + netCreditAmount;

    const { error: balanceError } = await supabase
      .from("profiles")
      .update({ balance: finalBalance })
      .eq("id", userId);

    if (balanceError) {
      throw new Error(`Failed to update balance: ${balanceError.message}`);
    }

    try {
      const { error: fundingUpdateError } = await supabase
        .from("funding_transactions")
        .update({
          status: "completed",
          amount: amountValue,
          api_response: payload,
          bank_name: data?.account?.bank_name || data?.bank_name || "Flutterwave",
          account_name: data?.customer?.name || existingTx.account_name || null,
          account_number: accountNumber || existingTx.account_number || null,
        })
        .eq("id", existingTx.id);

      if (fundingUpdateError) {
        throw new Error(`Failed to update funding transaction: ${fundingUpdateError.message}`);
      }

      const { error: creditTxError } = await supabase.from("user_transactions").insert({
        user_id: userId,
        amount: netCreditAmount,
        balance_before: currentBalance,
        balance_after: finalBalance,
        transaction_type: "credit",
        description: `Wallet funding via Flutterwave (₦${amountValue} received, ₦${fundingFee} fee)`,
        reference: providerReference,
        performed_by: userId,
      });

      if (creditTxError) {
        throw new Error(`Failed to record credit transaction: ${creditTxError.message}`);
      }

      const feeReference = `${providerReference}-FEE`;
      const { error: feeTxError } = await supabase.from("user_transactions").insert({
        user_id: userId,
        amount: fundingFee,
        balance_before: finalBalance,
        balance_after: finalBalance,
        transaction_type: "funding_fee",
        description: "Funding fee for wallet top-up",
        reference: feeReference,
        performed_by: userId,
      });

      if (feeTxError) {
        console.warn("Failed to record funding fee transaction:", feeTxError.message);
      }
    } catch (recordError) {
      // Roll back balance if downstream ledger updates fail.
      await supabase
        .from("profiles")
        .update({ balance: currentBalance })
        .eq("id", userId);
      throw recordError;
    }

    await sendPushNotification(
      supabase,
      userId,
      "Wallet Funded Successfully",
      `₦${amountValue.toFixed(2)} added to your wallet. Funding fee: ₦${fundingFee.toFixed(2)}. Net credit: ₦${netCreditAmount.toFixed(2)}. Your new balance is ₦${finalBalance.toFixed(2)}.`,
      {
        type: "add_money",
        reference: providerReference,
        amount: amountValue,
        funding_fee: fundingFee,
        net_amount: netCreditAmount,
      },
    );

    return new Response(
      JSON.stringify({
        success: true,
        message: "Wallet credited successfully",
        reference: providerReference,
        amount: amountValue,
        fundingFee,
        netAmount: netCreditAmount,
        newBalance: finalBalance,
      }),
      { status: 200, headers: { ...CORS_HEADERS, "Content-Type": "application/json" } },
    );
  } catch (error) {
    console.error("flutterwave-webhook error:", error);
    return new Response(
      JSON.stringify({
        success: false,
        error: error instanceof Error ? error.message : "An unexpected error occurred",
      }),
      { status: 500, headers: { ...CORS_HEADERS, "Content-Type": "application/json" } },
    );
  }
});
