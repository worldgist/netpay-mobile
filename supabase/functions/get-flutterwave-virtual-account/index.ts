import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabase = createClient(
      Deno.env.get("SUPABASE_URL") ?? "",
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? ""
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

    const { email, name, phoneNumber, bvn } = await req.json();

    if (!email || !name || !phoneNumber || !bvn) {
      throw new Error("Missing required parameters");
    }

    const normalizedBvn = String(bvn).replace(/\D/g, "");
    if (normalizedBvn.length !== 11) {
      throw new Error("BVN must be 11 digits");
    }

    const secretKey = Deno.env.get("FLUTTERWAVE_SECRET_KEY");
    if (!secretKey) {
      throw new Error("Flutterwave credentials not configured");
    }

    const nameParts = String(name).trim().split(/\s+/).filter(Boolean);
    const firstname = nameParts[0] || "User";
    const lastname = nameParts.slice(1).join(" ") || firstname;
    const phoneDigits = String(phoneNumber).replace(/\D/g, "");
    const phonenumber = phoneDigits.length > 10 ? phoneDigits.slice(-10) : phoneDigits;
    const txRef = `netpay-${user.id.slice(0, 8)}-${Date.now()}`;

    const requestBody = {
      email,
      tx_ref: txRef,
      phonenumber,
      is_permanent: true,
      firstname,
      lastname,
      narration: "NetPay Wallet Funding",
      bvn: normalizedBvn,
    };

    console.log("Creating Flutterwave virtual account for:", {
      email,
      tx_ref: txRef,
      phonenumber,
    });

    const flutterwaveResponse = await fetch("https://api.flutterwave.com/v3/virtual-account-numbers", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${secretKey}`,
        "Content-Type": "application/json",
        Accept: "application/json",
      },
      body: JSON.stringify(requestBody),
    });

    const flutterwaveData = await flutterwaveResponse.json();
    console.log("Flutterwave response status:", flutterwaveResponse.status);

    if (!flutterwaveResponse.ok || flutterwaveData.status !== "success" || !flutterwaveData.data) {
      const errorMsg =
        flutterwaveData.message ||
        flutterwaveData.data?.response_message ||
        "Failed to create Flutterwave virtual account";
      console.error("Flutterwave API error:", errorMsg, flutterwaveData);
      throw new Error(errorMsg);
    }

    const account = flutterwaveData.data;

    return new Response(
      JSON.stringify({
        success: true,
        data: {
          account_number: account.account_number,
          bank_name: account.bank_name || "Flutterwave",
          account_name: `${firstname} ${lastname}`.trim(),
          bank_code: "FLW",
          tracking_reference: account.order_ref || account.flw_ref || txRef,
        },
      }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (error) {
    console.error("Get Flutterwave virtual account error:", error);
    const errorMessage = error instanceof Error ? error.message : "An unknown error occurred";
    return new Response(
      JSON.stringify({
        success: false,
        error: errorMessage,
      }),
      {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      }
    );
  }
});
