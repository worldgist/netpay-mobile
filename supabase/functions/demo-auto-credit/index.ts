import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const CORS_HEADERS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const DEMO_USER_EMAIL = "demo@netpayy.ng";
const DEMO_CREDIT_AMOUNT = 50000.00;

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: CORS_HEADERS });
  }

  if (req.method !== "POST") {
    return new Response(
      JSON.stringify({ success: false, error: "Method not allowed" }),
      { status: 405, headers: { ...CORS_HEADERS, "Content-Type": "application/json" } },
    );
  }

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    // Get authorization header
    const authHeader = req.headers.get("Authorization");
    if (!authHeader) {
      return new Response(
        JSON.stringify({ success: false, error: "Missing authorization header" }),
        { status: 401, headers: { ...CORS_HEADERS, "Content-Type": "application/json" } },
      );
    }

    // Get user from token
    const token = authHeader.replace("Bearer ", "");
    const { data: { user }, error: userError } = await supabase.auth.getUser(token);

    if (userError || !user) {
      return new Response(
        JSON.stringify({ success: false, error: "Invalid or expired token" }),
        { status: 401, headers: { ...CORS_HEADERS, "Content-Type": "application/json" } },
      );
    }

    // Check if user is demo user
    if (user.email !== DEMO_USER_EMAIL) {
      return new Response(
        JSON.stringify({ success: false, error: "This feature is only available for demo users" }),
        { status: 403, headers: { ...CORS_HEADERS, "Content-Type": "application/json" } },
      );
    }

    // Get current balance
    const { data: profile, error: profileError } = await supabase
      .from("profiles")
      .select("balance")
      .eq("id", user.id)
      .single();

    if (profileError) {
      throw profileError;
    }

    const balanceBefore = Number(profile?.balance || 0);
    const balanceAfter = balanceBefore + DEMO_CREDIT_AMOUNT;
    const reference = `DEMO-${Date.now()}`;

    // Update balance
    const { error: updateError } = await supabase
      .from("profiles")
      .update({ balance: balanceAfter })
      .eq("id", user.id);

    if (updateError) {
      throw updateError;
    }

    // Record transaction
    const { error: transactionError } = await supabase
      .from("user_transactions")
      .insert({
        user_id: user.id,
        transaction_type: "credit",
        amount: DEMO_CREDIT_AMOUNT,
        balance_before: balanceBefore,
        balance_after: balanceAfter,
        description: "Demo mode auto-credit",
        reference,
        performed_by: user.id,
      });

    if (transactionError) {
      console.warn("Failed to record transaction:", transactionError);
    }

    // Create notification
    try {
      const { data: notification, error: notifError } = await supabase
        .from("notifications")
        .insert({
          title: "Demo Wallet Credited",
          message: `₦${DEMO_CREDIT_AMOUNT.toFixed(2)} has been credited to your demo wallet.`,
          recipient_type: "single",
          recipient_ids: [user.id],
          sent_by: user.id,
        })
        .select("id")
        .single();

      if (!notifError && notification?.id) {
        await supabase.from("notification_recipients").insert({
          notification_id: notification.id,
          user_id: user.id,
          is_read: false,
        });
      }
    } catch (notifException) {
      console.warn("Failed to create notification:", notifException);
    }

    return new Response(
      JSON.stringify({
        success: true,
        message: "Demo wallet credited successfully",
        amount: DEMO_CREDIT_AMOUNT,
        balanceBefore,
        balanceAfter,
        reference,
      }),
      { status: 200, headers: { ...CORS_HEADERS, "Content-Type": "application/json" } },
    );
  } catch (error) {
    console.error("Error in demo-auto-credit:", error);
    return new Response(
      JSON.stringify({
        success: false,
        error: error instanceof Error ? error.message : "Unknown error occurred",
      }),
      { status: 500, headers: { ...CORS_HEADERS, "Content-Type": "application/json" } },
    );
  }
});

