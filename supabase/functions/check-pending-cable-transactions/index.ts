import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const CORS_HEADERS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
};

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: CORS_HEADERS });
  }

  try {
    const SUPABASE_URL = Deno.env.get("SUPABASE_URL") ?? "";
    const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";
    const MOBILENIG_SECRET_KEY = Deno.env.get("MOBILENIG_SECRET_KEY");
    const MOBILENIG_PUBLIC_KEY = Deno.env.get("MOBILENIG_PUBLIC_KEY");

    const apiKey = MOBILENIG_SECRET_KEY || MOBILENIG_PUBLIC_KEY;
    if (!apiKey) {
      return new Response(
        JSON.stringify({ error: "MOBILENIG_SECRET_KEY or MOBILENIG_PUBLIC_KEY not configured" }),
        { status: 500, headers: { ...CORS_HEADERS, "Content-Type": "application/json" } }
      );
    }

    const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

    // Get authentication token
    const authHeader = req.headers.get("Authorization");
    if (!authHeader) {
      return new Response(
        JSON.stringify({ error: "Missing authorization header" }),
        { status: 401, headers: { ...CORS_HEADERS, "Content-Type": "application/json" } }
      );
    }

    const token = authHeader.replace("Bearer ", "");
    const { data: userData, error: userError } = await supabase.auth.getUser(token);
    if (userError || !userData?.user) {
      return new Response(
        JSON.stringify({ error: "Unauthorized" }),
        { status: 401, headers: { ...CORS_HEADERS, "Content-Type": "application/json" } }
      );
    }

    const user = userData.user;

    // Check if user is admin
    const { data: roleData, error: roleError } = await supabase
      .from("user_roles")
      .select("role")
      .eq("user_id", user.id)
      .eq("role", "admin")
      .limit(1);

    if (roleError || !roleData || roleData.length === 0) {
      return new Response(
        JSON.stringify({ error: "Admin access required" }),
        { status: 403, headers: { ...CORS_HEADERS, "Content-Type": "application/json" } }
      );
    }

    // Parse request body
    const body = await req.json().catch(() => ({}));
    const { reference, trans_id, auto_refund = false } = body;

    if (!reference && !trans_id) {
      return new Response(
        JSON.stringify({ error: "reference or trans_id is required" }),
        { status: 400, headers: { ...CORS_HEADERS, "Content-Type": "application/json" } }
      );
    }

    // Find transaction by reference
    const { data: transaction, error: txnError } = await supabase
      .from("user_transactions")
      .select("*")
      .eq("reference", reference || `CABLE-${trans_id}`)
      .eq("transaction_type", "purchase")
      .maybeSingle();

    if (txnError || !transaction) {
      return new Response(
        JSON.stringify({ error: "Transaction not found" }),
        { status: 404, headers: { ...CORS_HEADERS, "Content-Type": "application/json" } }
      );
    }

    // Extract trans_id from reference (format: CABLE-{trans_id}-{user_id})
    const refParts = transaction.reference?.split('-') || [];
    const transactionId = trans_id || refParts[1] || transaction.reference?.replace('CABLE-', '');

    if (!transactionId) {
      return new Response(
        JSON.stringify({ error: "Could not extract trans_id from reference" }),
        { status: 400, headers: { ...CORS_HEADERS, "Content-Type": "application/json" } }
      );
    }

    // Query MobileNig for transaction status
    const queryUrl = `https://enterprise.mobilenig.com/api/v2/services/query?trans_id=${transactionId}`;
    const queryResponse = await fetch(queryUrl, {
      method: "GET",
      headers: {
        "Content-Type": "application/json",
        "Authorization": `Bearer ${apiKey}`,
      },
    });

    if (!queryResponse.ok) {
      const errorText = await queryResponse.text();
      return new Response(
        JSON.stringify({ 
          error: "Failed to query MobileNig transaction",
          details: errorText 
        }),
        { status: 500, headers: { ...CORS_HEADERS, "Content-Type": "application/json" } }
      );
    }

    const queryText = await queryResponse.text();
    const queryResult = JSON.parse(queryText);

    if (queryResult.statusCode !== "200" || queryResult.message !== "success") {
      return new Response(
        JSON.stringify({ 
          error: "MobileNig API error",
          details: queryResult 
        }),
        { status: 400, headers: { ...CORS_HEADERS, "Content-Type": "application/json" } }
      );
    }

    const details = queryResult.details || {};
    const status = String(details.status || '').toLowerCase();
    const isPending = status.includes('pending') || status.includes('processing');
    const isApproved = status.includes('approved') || status.includes('success') || status === 'successful' || status === 'completed';
    const isCancelled = status.includes('cancelled') || status.includes('failed') || status.includes('rejected');

    // If transaction is still pending and auto_refund is enabled, refund the user
    if (isPending && auto_refund) {
      // Refund the user
      const { data: userProfile } = await supabase
        .from("profiles")
        .select("balance")
        .eq("id", transaction.user_id)
        .single();

      if (userProfile) {
        const currentBalance = parseFloat(userProfile.balance.toString()) || 0;
        const refundAmount = parseFloat(transaction.amount.toString());
        const newBalance = currentBalance + refundAmount;

        // Update balance
        await supabase
          .from("profiles")
          .update({ balance: newBalance })
          .eq("id", transaction.user_id);

        // Create refund transaction
        await supabase.from("user_transactions").insert({
          user_id: transaction.user_id,
          transaction_type: "refund",
          amount: refundAmount,
          balance_before: currentBalance,
          balance_after: newBalance,
          description: `Refund: ${transaction.description} - Transaction still pending in MobileNig`,
          reference: `REFUND-${transaction.reference}`,
          performed_by: user.id,
        });

        // Update original transaction description
        await supabase
          .from("user_transactions")
          .update({
            description: `[REFUNDED - PENDING] ${transaction.description}`
          })
          .eq("id", transaction.id);
      }
    }

    return new Response(
      JSON.stringify({
        success: true,
        transaction: {
          id: transaction.id,
          reference: transaction.reference,
          amount: transaction.amount,
          user_id: transaction.user_id,
          created_at: transaction.created_at
        },
        mobilenig_status: {
          status: details.status,
          is_pending: isPending,
          is_approved: isApproved,
          is_cancelled: isCancelled,
          details: details
        },
        action_taken: isPending && auto_refund ? "refunded" : "none"
      }),
      { status: 200, headers: { ...CORS_HEADERS, "Content-Type": "application/json" } }
    );
  } catch (error) {
    console.error("Error checking pending transaction:", error);
    return new Response(
      JSON.stringify({
        error: "Internal server error",
        details: error instanceof Error ? error.message : String(error),
      }),
      { status: 500, headers: { ...CORS_HEADERS, "Content-Type": "application/json" } }
    );
  }
});



