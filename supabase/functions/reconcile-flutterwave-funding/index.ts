import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { sendPushNotification } from "../_shared/push-notifications.ts";

const CORS_HEADERS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-reconcile-token",
};

const FUNDING_FEE_PERCENTAGE = 0.05;
const MIN_FUNDING_FEE = 10;

const calculateFundingFee = (amount: number): number => {
  const percentageFee = amount * FUNDING_FEE_PERCENTAGE;
  return Math.max(MIN_FUNDING_FEE, Math.round(percentageFee * 100) / 100);
};

const normalizeReference = (value: unknown): string | null => {
  if (typeof value !== "string") return null;
  const normalized = value.trim();
  return normalized.length > 0 ? normalized : null;
};

const digitsOnly = (value: unknown): string | null => {
  if (typeof value !== "string") return null;
  const normalized = value.replace(/\D/g, "").trim();
  return normalized.length > 0 ? normalized : null;
};

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: CORS_HEADERS });
  }

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const flutterwaveSecret = Deno.env.get("FLW_SECRET_KEY") || Deno.env.get("FLUTTERWAVE_SECRET_KEY");

    if (!flutterwaveSecret) {
      return new Response(
        JSON.stringify({ success: false, error: "Flutterwave credentials not configured." }),
        { status: 500, headers: { ...CORS_HEADERS, "Content-Type": "application/json" } },
      );
    }

    const supabase = createClient(supabaseUrl, serviceRoleKey);

    const body = await req.json().catch(() => ({}));
    const requestedUserId = typeof body?.userId === "string" ? body.userId.trim() : null;
    const requestedReference = normalizeReference(body?.reference);

    const authHeader = req.headers.get("Authorization");
    const adminTokenHeader = req.headers.get("x-reconcile-token");
    const configuredAdminToken = Deno.env.get("RECONCILE_ADMIN_TOKEN");

    let requesterUserId: string | null = null;
    let isAdminRequest = false;

    if (authHeader?.startsWith("Bearer ")) {
      const token = authHeader.replace("Bearer ", "");
      const {
        data: { user },
        error: authError,
      } = await supabase.auth.getUser(token);

      if (!authError && user?.id) {
        requesterUserId = user.id;
      }
    }

    if (!requesterUserId && configuredAdminToken && adminTokenHeader === configuredAdminToken) {
      isAdminRequest = true;
    }

    if (!requesterUserId && !isAdminRequest) {
      return new Response(
        JSON.stringify({ success: false, error: "Unauthorized" }),
        { status: 401, headers: { ...CORS_HEADERS, "Content-Type": "application/json" } },
      );
    }

    if (requesterUserId && requestedUserId && requestedUserId !== requesterUserId) {
      return new Response(
        JSON.stringify({ success: false, error: "Forbidden: cannot reconcile another user's funding" }),
        { status: 403, headers: { ...CORS_HEADERS, "Content-Type": "application/json" } },
      );
    }

    const targetUserId = requestedUserId || requesterUserId;

    const maxLookbackMinutes = Number(body?.maxLookbackMinutes);
    const lookbackMinutes = Number.isFinite(maxLookbackMinutes) && maxLookbackMinutes > 0
      ? Math.min(maxLookbackMinutes, 365 * 24 * 60)
      : isAdminRequest
      ? 30 * 24 * 60
      : 180;

    const lookbackIso = new Date(Date.now() - lookbackMinutes * 60 * 1000).toISOString();

    let pendingQuery = supabase
      .from("funding_transactions")
      .select("id, user_id, amount, reference, status, account_name, account_number, bank_name, api_response, created_at")
      .eq("status", "pending")
      .or("bank_name.ilike.%flutterwave%,reference.like.FLW-%")
      .order("created_at", { ascending: false });

    if (targetUserId) {
      pendingQuery = pendingQuery.eq("user_id", targetUserId);
    }

    if (requestedReference) {
      pendingQuery = pendingQuery.eq("reference", requestedReference);
    } else {
      pendingQuery = pendingQuery.gte("created_at", lookbackIso);
    }

    pendingQuery = pendingQuery.limit(isAdminRequest ? 100 : 10);

    const { data: pendingRows, error: pendingError } = await pendingQuery;

    if (pendingError) {
      throw new Error(`Failed to load pending funding transactions: ${pendingError.message}`);
    }

    const pendingTransactions = pendingRows ? [...pendingRows] : [];
    let scannedTransactionsCount = 0;
    let createdBackfillCount = 0;
    const unmatchedScanSamples: Array<{ reference: string | null; reason: string }> = [];

    if (isAdminRequest) {
      const pageLimitRaw = Number(body?.scanPages);
      const scanPages = Number.isFinite(pageLimitRaw) && pageLimitRaw > 0 ? Math.min(pageLimitRaw, 10) : 3;

      for (let page = 1; page <= scanPages; page += 1) {
        const transactionsResponse = await fetch(
          `https://api.flutterwave.com/v3/transactions?page=${page}&status=successful`,
          {
            method: "GET",
            headers: {
              "Content-Type": "application/json",
              Authorization: `Bearer ${flutterwaveSecret}`,
            },
          },
        );

        const transactionsJson = await transactionsResponse.json().catch(() => ({}));
        if (!transactionsResponse.ok || transactionsJson?.status !== "success") {
          continue;
        }

        const transactions = Array.isArray(transactionsJson?.data) ? transactionsJson.data : [];
        scannedTransactionsCount += transactions.length;

        for (const txItem of transactions) {
          const itemTxRef = normalizeReference(txItem?.tx_ref) || normalizeReference(txItem?.reference);
          const itemFlwRef = normalizeReference(txItem?.flw_ref) ||
            (typeof txItem?.id === "number" ? String(txItem.id) : normalizeReference(txItem?.id));
          const providerReference = itemTxRef || itemFlwRef;

          if (!providerReference) {
            if (unmatchedScanSamples.length < 20) {
              unmatchedScanSamples.push({ reference: null, reason: "missing_reference" });
            }
            continue;
          }
          if (requestedReference && providerReference !== requestedReference && itemTxRef !== requestedReference && itemFlwRef !== requestedReference) {
            continue;
          }

          const paymentStatus = String(txItem?.status || "").toLowerCase();
          const currency = String(txItem?.currency || "").toUpperCase();
          const amountValue = Number(txItem?.amount);

          if (!["successful", "completed"].includes(paymentStatus)) {
            if (unmatchedScanSamples.length < 20) {
              unmatchedScanSamples.push({ reference: providerReference, reason: `status_${paymentStatus || "unknown"}` });
            }
            continue;
          }
          if (!Number.isFinite(amountValue) || amountValue <= 0) {
            if (unmatchedScanSamples.length < 20) {
              unmatchedScanSamples.push({ reference: providerReference, reason: "invalid_amount" });
            }
            continue;
          }
          if (currency && currency !== "NGN") {
            if (unmatchedScanSamples.length < 20) {
              unmatchedScanSamples.push({ reference: providerReference, reason: `unsupported_currency_${currency}` });
            }
            continue;
          }

          const referenceVariants = [providerReference, itemTxRef, itemFlwRef]
            .filter((ref, idx, arr): ref is string => !!ref && arr.indexOf(ref) === idx);

          const { data: existingFunding } = await supabase
            .from("funding_transactions")
            .select("id")
            .in("reference", referenceVariants)
            .limit(1);

          if (existingFunding && existingFunding.length > 0) {
            if (unmatchedScanSamples.length < 20) {
              unmatchedScanSamples.push({ reference: providerReference, reason: "already_exists_in_funding" });
            }
            continue;
          }

          const accountNumberCandidates = [
            txItem?.account_number,
            txItem?.account?.account_number,
            txItem?.account?.bank_account_number,
            txItem?.meta?.account_number,
            txItem?.customer?.account_number,
            txItem?.customer?.account?.number,
            txItem?.source_account_number,
            txItem?.originatoraccountnumber,
            txItem?.originator_account_number,
            txItem?.charged_amount_details?.source_account_number,
            txItem?.destination_account_number,
            txItem?.meta?.originatoraccountnumber,
            txItem?.meta?.originator_account_number,
          ];

          const accountNumber = accountNumberCandidates
            .map((candidate) => digitsOnly(candidate))
            .find((candidate) => !!candidate) || null;

          let resolvedUserId: string | null = null;
          let resolvedAccountName: string | null = null;
          let resolvedBankName: string | null = null;
          let resolvedAccountNumber: string | null = accountNumber;

          if (accountNumber) {
            const { data: virtualAccountByNumber } = await supabase
              .from("virtual_accounts")
              .select("user_id, account_name, bank_name, account_number")
              .eq("account_number", accountNumber)
              .order("updated_at", { ascending: false })
              .limit(1)
              .maybeSingle();

            if (virtualAccountByNumber?.user_id) {
              resolvedUserId = virtualAccountByNumber.user_id;
              resolvedAccountName = virtualAccountByNumber.account_name;
              resolvedBankName = virtualAccountByNumber.bank_name;
              resolvedAccountNumber = virtualAccountByNumber.account_number || accountNumber;
            }
          }

          if (!resolvedUserId) {
            const customerEmail = typeof txItem?.customer?.email === "string"
              ? txItem.customer.email.trim().toLowerCase()
              : "";

            if (customerEmail) {
              const { data: profileByEmail } = await supabase
                .from("profiles")
                .select("id, full_name")
                .eq("email", customerEmail)
                .maybeSingle();

              if (profileByEmail?.id) {
                if (!targetUserId || targetUserId === profileByEmail.id) {
                  resolvedUserId = profileByEmail.id;
                  resolvedAccountName = profileByEmail.full_name || txItem?.customer?.name || null;
                  resolvedBankName = "Flutterwave";
                }
              }
            }
          }

          if (!resolvedUserId) {
            if (unmatchedScanSamples.length < 20) {
              unmatchedScanSamples.push({ reference: providerReference, reason: "unable_to_resolve_user" });
            }
            continue;
          }

          const { data: insertedBackfill } = await supabase
            .from("funding_transactions")
            .insert({
              user_id: resolvedUserId,
              amount: amountValue,
              bank_name: resolvedBankName || txItem?.account?.bank_name || txItem?.bank_name || "Flutterwave",
              account_number: resolvedAccountNumber,
              account_name: resolvedAccountName || txItem?.customer?.name || null,
              reference: providerReference,
              status: "pending",
              api_response: {
                provider: "flutterwave",
                backfill_source: "admin_reconcile_scan",
                transaction: txItem,
              },
            })
            .select("id, user_id, amount, reference, status, account_name, account_number, bank_name, api_response, created_at")
            .single();

          if (insertedBackfill) {
            pendingTransactions.push(insertedBackfill);
            createdBackfillCount += 1;
          }
        }
      }
    }

    if (pendingTransactions.length === 0) {
      return new Response(
        JSON.stringify({
          success: true,
          mode: isAdminRequest ? "admin" : "user",
          creditedCount: 0,
          totalNetCredited: 0,
          checkedCount: 0,
          message: "No pending Flutterwave funding found.",
          diagnostics: isAdminRequest
            ? {
                scannedTransactionsCount,
                createdBackfillCount,
                unmatchedScanSamples,
              }
            : undefined,
        }),
        { status: 200, headers: { ...CORS_HEADERS, "Content-Type": "application/json" } },
      );
    }

    let creditedCount = 0;
    let totalNetCredited = 0;
    const results: Array<{ reference: string | null; status: string; message: string }> = [];

    for (const tx of pendingTransactions) {
      const actorUserId = tx.user_id;
      const fallbackTxRef = normalizeReference((tx.api_response as Record<string, unknown> | null)?.tx_ref);
      const txRef = normalizeReference(tx.reference) || fallbackTxRef;

      if (!txRef) {
        results.push({ reference: tx.reference, status: "skipped", message: "Missing transaction reference" });
        continue;
      }

      const verifyUrl = `https://api.flutterwave.com/v3/transactions/verify_by_reference?tx_ref=${encodeURIComponent(txRef)}`;
      const verifyResponse = await fetch(verifyUrl, {
        method: "GET",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${flutterwaveSecret}`,
        },
      });

      const verifyJson = await verifyResponse.json().catch(() => ({}));

      if (!verifyResponse.ok || verifyJson?.status !== "success" || !verifyJson?.data) {
        results.push({
          reference: txRef,
          status: "pending",
          message: verifyJson?.message || "Verification did not return a successful payment",
        });
        continue;
      }

      const flwData = verifyJson.data;
      const paymentStatus = String(flwData?.status || "").toLowerCase();
      const currency = String(flwData?.currency || "").toUpperCase();
      const amountValue = Number(flwData?.amount);

      if (!Number.isFinite(amountValue) || amountValue <= 0) {
        results.push({ reference: txRef, status: "skipped", message: "Invalid amount in verification payload" });
        continue;
      }

      if (currency && currency !== "NGN") {
        results.push({ reference: txRef, status: "skipped", message: `Unsupported currency ${currency}` });
        continue;
      }

      if (!["successful", "completed"].includes(paymentStatus)) {
        results.push({ reference: txRef, status: "pending", message: `Payment status is ${paymentStatus || "unknown"}` });
        continue;
      }

      const flwRef = normalizeReference(flwData?.flw_ref) || (typeof flwData?.id === "number" ? String(flwData.id) : null);
      const providerReference = normalizeReference(flwData?.tx_ref) || normalizeReference(flwData?.reference) || flwRef || txRef;
      const referenceVariants = [providerReference, txRef, flwRef]
        .filter((ref, idx, arr): ref is string => !!ref && arr.indexOf(ref) === idx);

      const { data: existingLedger } = await supabase
        .from("user_transactions")
        .select("id")
        .eq("user_id", actorUserId)
        .in("reference", referenceVariants)
        .limit(1);

      if (existingLedger && existingLedger.length > 0) {
        await supabase
          .from("funding_transactions")
          .update({
            status: "completed",
            amount: amountValue,
            api_response: { ...((tx.api_response as Record<string, unknown>) || {}), reconcile_verify_response: verifyJson },
          })
          .eq("id", tx.id);

        results.push({ reference: providerReference, status: "already_processed", message: "Already credited" });
        continue;
      }

      const { data: profile, error: profileError } = await supabase
        .from("profiles")
        .select("balance")
        .eq("id", actorUserId)
        .single();

      if (profileError || !profile) {
        throw new Error(profileError?.message || "Failed to load profile balance");
      }

      const currentBalance = Number(profile.balance || 0);
      const fundingFee = calculateFundingFee(amountValue);
      const netCreditAmount = amountValue - fundingFee;
      const finalBalance = currentBalance + netCreditAmount;

      const { error: balanceError } = await supabase
        .from("profiles")
        .update({ balance: finalBalance })
        .eq("id", actorUserId);

      if (balanceError) {
        throw new Error(`Failed to update balance: ${balanceError.message}`);
      }

      try {
        const { error: fundingUpdateError } = await supabase
          .from("funding_transactions")
          .update({
            status: "completed",
            amount: amountValue,
            bank_name: flwData?.account?.bank_name || flwData?.bank_name || tx.bank_name || "Flutterwave",
            account_name: flwData?.customer?.name || tx.account_name || null,
            account_number: flwData?.account_number || flwData?.account?.account_number || tx.account_number || null,
            reference: providerReference,
            api_response: { ...((tx.api_response as Record<string, unknown>) || {}), reconcile_verify_response: verifyJson },
          })
          .eq("id", tx.id);

        if (fundingUpdateError) {
          throw new Error(`Failed to update funding transaction: ${fundingUpdateError.message}`);
        }

        const { error: creditTxError } = await supabase.from("user_transactions").insert({
          user_id: actorUserId,
          amount: netCreditAmount,
          balance_before: currentBalance,
          balance_after: finalBalance,
          transaction_type: "credit",
          description: `Wallet funding via Flutterwave (₦${amountValue} received, ₦${fundingFee} fee)`,
          reference: providerReference,
          performed_by: actorUserId,
        });

        if (creditTxError) {
          throw new Error(`Failed to record credit transaction: ${creditTxError.message}`);
        }

        const feeReference = `${providerReference}-FEE`;
        const { error: feeTxError } = await supabase.from("user_transactions").insert({
          user_id: actorUserId,
          amount: fundingFee,
          balance_before: finalBalance,
          balance_after: finalBalance,
          transaction_type: "funding_fee",
          description: "Funding fee for wallet top-up",
          reference: feeReference,
          performed_by: actorUserId,
        });

        if (feeTxError) {
          console.warn("Failed to record funding fee transaction:", feeTxError.message);
        }
      } catch (processError) {
        await supabase
          .from("profiles")
          .update({ balance: currentBalance })
          .eq("id", actorUserId);
        throw processError;
      }

      creditedCount += 1;
      totalNetCredited += netCreditAmount;
      results.push({ reference: providerReference, status: "credited", message: `Credited ₦${netCreditAmount.toFixed(2)}` });

      await sendPushNotification(
        supabase,
        actorUserId,
        "Wallet Funded Successfully",
        `₦${amountValue.toFixed(2)} added to your wallet. Funding fee: ₦${fundingFee.toFixed(2)}. Net credit: ₦${netCreditAmount.toFixed(2)}.`,
        {
          type: "add_money",
          reference: providerReference,
          amount: amountValue,
          funding_fee: fundingFee,
          net_amount: netCreditAmount,
          source: "flutterwave_reconcile",
        },
      );
    }

    return new Response(
      JSON.stringify({
        success: true,
        mode: isAdminRequest ? "admin" : "user",
        creditedCount,
        totalNetCredited: Math.round(totalNetCredited * 100) / 100,
        checkedCount: pendingTransactions.length,
        results,
        diagnostics: isAdminRequest
          ? {
              scannedTransactionsCount,
              createdBackfillCount,
              unmatchedScanSamples,
            }
          : undefined,
      }),
      { status: 200, headers: { ...CORS_HEADERS, "Content-Type": "application/json" } },
    );
  } catch (error) {
    console.error("reconcile-flutterwave-funding error:", error);
    return new Response(
      JSON.stringify({
        success: false,
        error: error instanceof Error ? error.message : "An unexpected error occurred",
      }),
      { status: 500, headers: { ...CORS_HEADERS, "Content-Type": "application/json" } },
    );
  }
});