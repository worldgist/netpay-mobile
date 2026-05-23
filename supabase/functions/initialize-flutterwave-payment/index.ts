import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const CORS_HEADERS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: CORS_HEADERS });
  }

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const flutterwaveSecret =
      Deno.env.get("FLW_SECRET_KEY") || Deno.env.get("FLUTTERWAVE_SECRET_KEY");

    if (!flutterwaveSecret) {
      return new Response(
        JSON.stringify({ success: false, error: "Flutterwave secret key is not configured." }),
        { status: 200, headers: { ...CORS_HEADERS, "Content-Type": "application/json" } },
      );
    }

    const supabase = createClient(supabaseUrl, serviceRoleKey);

    const authHeader = req.headers.get("Authorization");
    if (!authHeader) {
      return new Response(
        JSON.stringify({ success: false, error: "Unauthorized" }),
        { status: 401, headers: { ...CORS_HEADERS, "Content-Type": "application/json" } },
      );
    }

    const token = authHeader.replace("Bearer ", "");
    const {
      data: { user },
      error: authError,
    } = await supabase.auth.getUser(token);

    if (authError || !user) {
      return new Response(
        JSON.stringify({ success: false, error: "Unauthorized" }),
        { status: 401, headers: { ...CORS_HEADERS, "Content-Type": "application/json" } },
      );
    }

    const body = await req.json();
    const amount = Number(body?.amount);

    if (!Number.isFinite(amount) || amount <= 0) {
      return new Response(
        JSON.stringify({ success: false, error: "Please provide a valid amount greater than zero." }),
        { status: 200, headers: { ...CORS_HEADERS, "Content-Type": "application/json" } },
      );
    }

    if (amount < 50) {
      return new Response(
        JSON.stringify({ success: false, error: "Minimum Flutterwave amount is ₦50." }),
        { status: 200, headers: { ...CORS_HEADERS, "Content-Type": "application/json" } },
      );
    }

    const { data: profile } = await supabase
      .from("profiles")
      .select("full_name, email, phone")
      .eq("id", user.id)
      .maybeSingle();

    const customerEmail =
      (typeof profile?.email === "string" && profile.email.trim().length > 0
        ? profile.email
        : user.email) || "customer@netpayy.ng";

    const customerName =
      (typeof profile?.full_name === "string" && profile.full_name.trim().length > 0
        ? profile.full_name
        : user.email?.split("@")[0]) || "NetPay User";

    const customerPhone =
      typeof profile?.phone === "string" && profile.phone.trim().length > 0
        ? profile.phone
        : undefined;

    const txRef = `FLW-${Date.now()}-${user.id.slice(0, 8)}`;
    const redirectUrl =
      Deno.env.get("FLUTTERWAVE_REDIRECT_URL") ||
      Deno.env.get("FLW_REDIRECT_URL") ||
      "https://netpayy.ng";

    const flutterwavePayload = {
      tx_ref: txRef,
      amount: amount.toFixed(2),
      currency: "NGN",
      redirect_url: redirectUrl,
      payment_options: "card,banktransfer,ussd",
      customer: {
        email: customerEmail,
        name: customerName,
        phone_number: customerPhone,
      },
      customizations: {
        title: "NetPay Wallet Funding",
        description: "Add money to your NetPay wallet",
      },
      meta: {
        user_id: user.id,
        source: "mobile_add_money",
      },
    };

    const flwResponse = await fetch("https://api.flutterwave.com/v3/payments", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${flutterwaveSecret}`,
      },
      body: JSON.stringify(flutterwavePayload),
    });

    const flwData = await flwResponse.json();

    if (!flwResponse.ok || flwData?.status !== "success" || !flwData?.data?.link) {
      return new Response(
        JSON.stringify({
          success: false,
          error: flwData?.message || "Failed to initialize Flutterwave payment.",
          details: flwData,
        }),
        { status: 200, headers: { ...CORS_HEADERS, "Content-Type": "application/json" } },
      );
    }

    const { error: insertError } = await supabase.from("funding_transactions").insert({
      user_id: user.id,
      amount,
      bank_name: "Flutterwave",
      account_number: customerPhone || null,
      account_name: customerName,
      reference: txRef,
      status: "pending",
      api_response: {
        provider: "flutterwave",
        payment_link: flwData.data.link,
        tx_ref: txRef,
      },
    });

    if (insertError) {
      console.warn("Failed to insert pending funding transaction:", insertError);
    }

    return new Response(
      JSON.stringify({
        success: true,
        message: "Flutterwave payment initialized",
        tx_ref: txRef,
        link: flwData.data.link,
        data: flwData.data,
      }),
      { status: 200, headers: { ...CORS_HEADERS, "Content-Type": "application/json" } },
    );
  } catch (error) {
    console.error("initialize-flutterwave-payment error:", error);
    return new Response(
      JSON.stringify({
        success: false,
        error: error instanceof Error ? error.message : "An unexpected error occurred.",
      }),
      { status: 200, headers: { ...CORS_HEADERS, "Content-Type": "application/json" } },
    );
  }
});
