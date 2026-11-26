import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { sendPushNotification } from "../_shared/push-notifications.ts";
import { getUserLedgerBalance } from "../_shared/wallet.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

type TransferPayload = {
  recipientEmail?: string;
  amount?: number;
  description?: string;
};

type TransferRiskLimits = {
  max_single_txn: number;
  daily_outflow_cap: number;
  hourly_txn_count_cap: number;
  new_account_days: number;
  new_account_daily_outflow_cap: number;
};

const DEFAULT_TRANSFER_LIMITS: TransferRiskLimits = {
  max_single_txn: 500_000,
  daily_outflow_cap: 5_000_000,
  hourly_txn_count_cap: 40,
  new_account_days: 7,
  new_account_daily_outflow_cap: 500_000,
};

const normalizeEmail = (value?: string | null) => value?.trim().toLowerCase() ?? "";

const TRANSFER_FEE_PERCENTAGE = 0.05;
const MIN_TRANSFER_FEE = 10;

const calculateTransferFee = (amount: number): number => {
  const percentageFee = amount * TRANSFER_FEE_PERCENTAGE;
  return Math.max(MIN_TRANSFER_FEE, Math.round(percentageFee * 100) / 100);
};

const startOfUtcDayIso = (): string => {
  const d = new Date();
  return new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate(), 0, 0, 0, 0)).toISOString();
};

const utcDayAgeInDays = (createdAt: string): number => {
  const t = Date.parse(createdAt);
  if (!Number.isFinite(t)) return Infinity;
  return (Date.now() - t) / 86_400_000;
};

async function loadTransferRiskLimits(supabase: ReturnType<typeof createClient>): Promise<TransferRiskLimits> {
  const { data, error } = await supabase
    .from("app_settings")
    .select("setting_value")
    .eq("setting_key", "transfer_risk_limits")
    .maybeSingle();

  if (error || !data?.setting_value || typeof data.setting_value !== "object") {
    return DEFAULT_TRANSFER_LIMITS;
  }

  const v = data.setting_value as Record<string, unknown>;
  const num = (key: string, fallback: number) => {
    const n = Number(v[key]);
    return Number.isFinite(n) && n > 0 ? n : fallback;
  };

  return {
    max_single_txn: num("max_single_txn", DEFAULT_TRANSFER_LIMITS.max_single_txn),
    daily_outflow_cap: num("daily_outflow_cap", DEFAULT_TRANSFER_LIMITS.daily_outflow_cap),
    hourly_txn_count_cap: num("hourly_txn_count_cap", DEFAULT_TRANSFER_LIMITS.hourly_txn_count_cap),
    new_account_days: num("new_account_days", DEFAULT_TRANSFER_LIMITS.new_account_days),
    new_account_daily_outflow_cap: num(
      "new_account_daily_outflow_cap",
      DEFAULT_TRANSFER_LIMITS.new_account_daily_outflow_cap,
    ),
  };
}

/**
 * Velocity / daily caps before the atomic transfer RPC runs.
 * Demo user is exempt so QA is not blocked.
 */
async function enforceTransferRiskLimits(params: {
  supabase: ReturnType<typeof createClient>;
  senderId: string;
  senderEmail: string | null | undefined;
  senderCreatedAt: string;
  amount: number;
}): Promise<void> {
  const senderEmail = normalizeEmail(params.senderEmail);
  if (senderEmail === "demo@netppay.com") {
    return;
  }

  const limits = await loadTransferRiskLimits(params.supabase);
  const { amount, senderId, supabase, senderCreatedAt } = params;

  if (amount > limits.max_single_txn) {
    throw new Error(
      `Transfer exceeds the maximum per transaction (₦${limits.max_single_txn.toLocaleString("en-NG")}).`,
    );
  }

  const dayStart = startOfUtcDayIso();
  const { data: dayRows, error: dayErr } = await supabase
    .from("transfer_transactions")
    .select("amount")
    .eq("sender_id", senderId)
    .eq("status", "completed")
    .gte("created_at", dayStart);

  if (dayErr) {
    console.error("transfer risk: daily sum query failed", dayErr);
    throw new Error("Unable to verify transfer limits. Please try again.");
  }

  const dailyOut = (dayRows ?? []).reduce((sum, row) => sum + Number(row.amount ?? 0), 0);
  const ageDays = utcDayAgeInDays(senderCreatedAt);
  const isNewAccount = ageDays < limits.new_account_days;
  const dailyCap = isNewAccount ? limits.new_account_daily_outflow_cap : limits.daily_outflow_cap;

  if (dailyOut + amount > dailyCap) {
    throw new Error(
      isNewAccount
        ? `For new accounts (under ${limits.new_account_days} days), daily outgoing transfers are limited to ₦${limits.new_account_daily_outflow_cap.toLocaleString("en-NG")}. Try again tomorrow or complete verification.`
        : `Daily outgoing transfer limit (₦${limits.daily_outflow_cap.toLocaleString("en-NG")}) would be exceeded.`,
    );
  }

  const hourAgo = new Date(Date.now() - 3_600_000).toISOString();
  const { count, error: hourErr } = await supabase
    .from("transfer_transactions")
    .select("id", { count: "exact", head: true })
    .eq("sender_id", senderId)
    .eq("status", "completed")
    .gte("created_at", hourAgo);

  if (hourErr) {
    console.error("transfer risk: hourly count query failed", hourErr);
    throw new Error("Unable to verify transfer limits. Please try again.");
  }

  if ((count ?? 0) >= limits.hourly_txn_count_cap) {
    throw new Error(
      `Too many transfers in the last hour (limit ${limits.hourly_txn_count_cap}). Please wait and try again.`,
    );
  }
}

type RpcTransferResult = {
  success?: boolean;
  error?: string;
  required?: number;
  available?: number;
  sender_balance_before?: number;
  sender_balance_after?: number;
  recipient_balance_before?: number;
  recipient_balance_after?: number;
};

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  if (req.method !== "POST") {
    return new Response(
      JSON.stringify({ success: false, error: "Method not allowed" }),
      { status: 405, headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  }

  const authHeader = req.headers.get("Authorization");
  if (!authHeader || !authHeader.startsWith("Bearer ")) {
    return new Response(
      JSON.stringify({ success: false, error: "Unauthorized" }),
      { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  }

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL");
    const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");

    if (!supabaseUrl || !serviceRoleKey) {
      throw new Error("Supabase environment variables are not configured");
    }

    const supabase = createClient(supabaseUrl, serviceRoleKey);
    const token = authHeader.replace("Bearer ", "");

    const { data: userData, error: userError } = await supabase.auth.getUser(token);
    if (userError || !userData?.user) {
      throw new Error("Unauthorized");
    }

    const sender = userData.user;
    const payload = (await req.json()) as TransferPayload;
    const recipientEmail = normalizeEmail(payload.recipientEmail);
    const amountValue = Number(payload.amount ?? 0);
    const description = payload.description?.trim() || null;

    if (!recipientEmail || !recipientEmail.includes("@")) {
      throw new Error("Recipient email is required");
    }

    if (amountValue <= 0 || !Number.isFinite(amountValue)) {
      throw new Error("Transfer amount must be greater than zero");
    }

    if (recipientEmail === normalizeEmail(sender.email)) {
      throw new Error("You cannot transfer to your own account");
    }

    const { data: recipientProfile, error: recipientError } = await supabase
      .from("profiles")
      .select("id, email, full_name, balance")
      .ilike("email", recipientEmail)
      .maybeSingle();

    if (recipientError || !recipientProfile) {
      throw new Error("Recipient not found");
    }

    if (recipientProfile.id === sender.id) {
      throw new Error("You cannot transfer to your own account");
    }

    const transferFee = calculateTransferFee(amountValue);
    const totalAmount = amountValue + transferFee;

    const { data: senderProfile, error: senderProfileError } = await supabase
      .from("profiles")
      .select("created_at")
      .eq("id", sender.id)
      .single();

    if (senderProfileError || !senderProfile) {
      throw new Error("Unable to fetch sender profile");
    }

    const senderBalanceBefore = await getUserLedgerBalance(supabase, sender.id);
    if (senderBalanceBefore < totalAmount) {
      throw new Error(
        `Insufficient balance. You need ₦${totalAmount.toFixed(2)} (₦${amountValue.toFixed(2)} + ₦${transferFee.toFixed(2)} fee)`,
      );
    }

    await enforceTransferRiskLimits({
      supabase,
      senderId: sender.id,
      senderEmail: sender.email,
      senderCreatedAt: String(senderProfile.created_at ?? new Date().toISOString()),
      amount: amountValue,
    });

    const transferReference = `TRF-${Date.now()}-${Math.random().toString(36).substring(2, 10).toUpperCase()}`;
    const feeReference = `${transferReference}-FEE`;

    const { data: rpcData, error: rpcError } = await supabase.rpc("execute_internal_transfer", {
      p_sender_id: sender.id,
      p_recipient_id: recipientProfile.id,
      p_amount: amountValue,
      p_transfer_fee: transferFee,
      p_reference: transferReference,
      p_fee_reference: feeReference,
      p_description: description,
      p_sender_email: sender.email ?? "NetPay user",
      p_recipient_email: recipientProfile.email ?? recipientEmail,
    });

    if (rpcError) {
      console.error("execute_internal_transfer RPC error:", rpcError);
      throw new Error(rpcError.message || "Transfer could not be completed");
    }

    const result = (rpcData ?? {}) as RpcTransferResult;
    if (!result.success) {
      if (result.error === "insufficient_balance") {
        throw new Error(
          `Insufficient balance. Required ₦${Number(result.required ?? 0).toFixed(2)}; available ₦${Number(result.available ?? 0).toFixed(2)}.`,
        );
      }
      if (result.error === "duplicate_reference") {
        throw new Error("Duplicate transfer reference. Please retry.");
      }
      throw new Error(result.error === "transfer_failed" ? "Transfer failed" : (result.error ?? "Transfer failed"));
    }

    const recipientBalanceBefore = Number(result.recipient_balance_before ?? 0);
    const recipientBalanceAfter = Number(result.recipient_balance_after ?? 0);

    try {
      await sendPushNotification(
        supabase,
        sender.id,
        "Transfer successful",
        `You sent ₦${amountValue.toFixed(2)} to ${recipientProfile.email}`,
        {
          type: "transfer",
          reference: transferReference,
          amount: amountValue,
        },
      );
      await sendPushNotification(
        supabase,
        recipientProfile.id,
        "You received a transfer",
        `You received ₦${amountValue.toFixed(2)} from ${sender.email ?? "a NetPay user"}`,
        {
          type: "transfer",
          reference: transferReference,
          amount: amountValue,
        },
      );
    } catch (pushErr) {
      console.warn("transfer push notification:", pushErr);
    }

    return new Response(
      JSON.stringify({
        success: true,
        data: {
          amount: amountValue,
          transferFee,
          totalAmount,
          reference: transferReference,
          recipientEmail: recipientProfile.email,
          recipientName: recipientProfile.full_name,
          senderBalanceBefore: result.sender_balance_before,
          senderBalanceAfter: result.sender_balance_after,
          recipientBalanceBefore,
          recipientBalanceAfter,
        },
      }),
      { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  } catch (error) {
    console.error("transfer-funds error:", error);
    const message = error instanceof Error ? error.message : "Unexpected error";
    return new Response(
      JSON.stringify({ success: false, error: message }),
      { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  }
});
