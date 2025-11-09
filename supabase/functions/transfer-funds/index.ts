import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { debitUserWallet } from "../_shared/wallet.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

type TransferPayload = {
  recipientEmail?: string;
  amount?: number;
  description?: string;
};

const normalizeEmail = (value?: string | null) => value?.trim().toLowerCase() ?? "";

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

    const transferReference = `TRF-${Date.now()}-${Math.random().toString(36).substring(2, 10).toUpperCase()}`;

    let debitResult: { balanceBefore: number; balanceAfter: number; reference: string } | null = null;

    try {
      debitResult = await debitUserWallet({
        supabase,
        userId: sender.id,
        amount: amountValue,
        transactionType: "debit",
        description: description ?? `Transfer to ${recipientProfile.email}`,
        reference: transferReference,
        performedBy: sender.id,
        notification: {
          title: "Transfer Successful",
          message: `You sent ₦${amountValue.toFixed(2)} to ${recipientProfile.email}`,
          sentBy: sender.id,
        },
      });
    } catch (debitError) {
      console.error("Debit failed:", debitError);
      throw debitError instanceof Error ? debitError : new Error("Unable to debit sender wallet");
    }

    const recipientBalanceBefore = Number(recipientProfile.balance) || 0;
    const recipientBalanceAfter = recipientBalanceBefore + amountValue;

    const { error: recipientUpdateError } = await supabase
      .from("profiles")
      .update({ balance: recipientBalanceAfter })
      .eq("id", recipientProfile.id);

    if (recipientUpdateError) {
      console.error("Failed to credit recipient balance:", recipientUpdateError);
      // Attempt to roll back debit
      try {
        await supabase.from("profiles").update({ balance: debitResult.balanceBefore }).eq("id", sender.id);
        await supabase.from("user_transactions").insert({
          user_id: sender.id,
          transaction_type: "credit",
          amount: amountValue,
          balance_before: debitResult.balanceAfter,
          balance_after: debitResult.balanceBefore,
          reference: `${transferReference}-REVERSAL`,
          description: "Transfer reversal due to credit failure",
          performed_by: sender.id,
        });
      } catch (rollbackError) {
        console.error("Failed to rollback sender debit:", rollbackError);
      }
      throw new Error("Failed to credit recipient wallet");
    }

    const { error: recipientTransactionError } = await supabase.from("user_transactions").insert({
      user_id: recipientProfile.id,
      transaction_type: "credit",
      amount: amountValue,
      balance_before: recipientBalanceBefore,
      balance_after: recipientBalanceAfter,
      reference: transferReference,
      description: description ?? `Transfer from ${sender.email ?? "NetPay user"}`,
      performed_by: sender.id,
    });

    if (recipientTransactionError) {
      console.error("Failed to record recipient transaction:", recipientTransactionError);
    }

    const { error: transferRecordError } = await supabase.from("transfer_transactions").insert({
      sender_id: sender.id,
      recipient_id: recipientProfile.id,
      amount: amountValue,
      description,
      reference: transferReference,
      sender_balance_before: debitResult.balanceBefore,
      sender_balance_after: debitResult.balanceAfter,
      recipient_balance_before: recipientBalanceBefore,
      recipient_balance_after: recipientBalanceAfter,
      status: "completed",
    });

    if (transferRecordError) {
      console.error("Failed to create transfer record:", transferRecordError);
    }

    const responsePayload = {
      success: true,
      data: {
        amount: amountValue,
        reference: transferReference,
        recipientEmail: recipientProfile.email,
        recipientName: recipientProfile.full_name,
        senderBalanceBefore: debitResult.balanceBefore,
        senderBalanceAfter: debitResult.balanceAfter,
        recipientBalanceBefore,
        recipientBalanceAfter,
      },
    };

    return new Response(JSON.stringify(responsePayload), {
      status: 200,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (error) {
    console.error("transfer-funds error:", error);
    const message = error instanceof Error ? error.message : "Unexpected error";
    return new Response(
      JSON.stringify({ success: false, error: message }),
      { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  }
});
