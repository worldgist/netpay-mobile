import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const MIN_AMOUNT = 100;
const MAX_AMOUNT = 500_000;

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabase = createClient(
      Deno.env.get("SUPABASE_URL") ?? "",
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "",
    );

    const authHeader = req.headers.get("Authorization");
    if (!authHeader) {
      throw new Error("No authorization header");
    }

    const {
      data: { user },
      error: authError,
    } = await supabase.auth.getUser(authHeader.replace("Bearer ", ""));

    if (authError || !user) {
      throw new Error("Unauthorized");
    }

    const { amount, redirectUrl } = await req.json();
    const paymentAmount = Number(amount);

    if (!Number.isFinite(paymentAmount) || paymentAmount < MIN_AMOUNT || paymentAmount > MAX_AMOUNT) {
      throw new Error(`Amount must be between ₦${MIN_AMOUNT.toLocaleString()} and ₦${MAX_AMOUNT.toLocaleString()}`);
    }

    if (!redirectUrl || typeof redirectUrl !== "string") {
      throw new Error("Redirect URL is required");
    }

    const secretKey = Deno.env.get("FLUTTERWAVE_SECRET_KEY");
    if (!secretKey) {
      throw new Error("Flutterwave credentials not configured");
    }

    const { data: profile } = await supabase
      .from("profiles")
      .select("full_name, phone, email")
      .eq("id", user.id)
      .maybeSingle();

    const email = profile?.email || user.email || "";
    const fullName = profile?.full_name || email.split("@")[0] || "User";
    const phoneDigits = String(profile?.phone || "").replace(/\D/g, "");
    const phonenumber = phoneDigits.length > 10 ? phoneDigits.slice(-10) : phoneDigits || "08000000000";
    const txRef = `netpay-fund-${user.id.replace(/-/g, "").slice(0, 12)}-${Date.now()}`;

    const flutterwaveResponse = await fetch("https://api.flutterwave.com/v3/payments", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${secretKey}`,
        "Content-Type": "application/json",
        Accept: "application/json",
      },
      body: JSON.stringify({
        tx_ref: txRef,
        amount: paymentAmount,
        currency: "NGN",
        redirect_url: redirectUrl,
        payment_options: "card,banktransfer,ussd",
        customer: {
          email,
          name: fullName,
          phonenumber,
        },
        customizations: {
          title: "NetPay Wallet Funding",
          description: `Add ₦${paymentAmount.toLocaleString()} to your NetPay wallet`,
          logo: "https://netppay.com/logo.png",
        },
        meta: {
          user_id: user.id,
          purpose: "wallet_funding",
        },
      }),
    });

    const flutterwaveData = await flutterwaveResponse.json();

    if (!flutterwaveResponse.ok || flutterwaveData.status !== "success" || !flutterwaveData.data?.link) {
      const errorMsg = flutterwaveData.message || "Failed to initialize Flutterwave checkout";
      console.error("Flutterwave checkout init error:", errorMsg, flutterwaveData);
      throw new Error(errorMsg);
    }

    await supabase.from("funding_transactions").insert({
      user_id: user.id,
      amount: paymentAmount,
      status: "pending",
      reference: txRef,
      bank_name: "Flutterwave",
      account_name: fullName,
      updated_at: new Date().toISOString(),
    });

    return new Response(
      JSON.stringify({
        success: true,
        data: {
          paymentLink: flutterwaveData.data.link,
          txRef,
          amount: paymentAmount,
        },
      }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  } catch (error) {
    console.error("Initialize Flutterwave checkout error:", error);
    const errorMessage = error instanceof Error ? error.message : "An unknown error occurred";
    return new Response(
      JSON.stringify({ success: false, error: errorMessage }),
      {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      },
    );
  }
});
