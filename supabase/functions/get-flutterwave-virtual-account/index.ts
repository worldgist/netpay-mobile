import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const FLUTTERWAVE_BANK_CODE = "FLW";
const FLUTTERWAVE_BUSINESS_ID = "flutterwave";

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

    const { data: existingAccount } = await supabase
      .from("virtual_accounts")
      .select("account_number, bank_name, account_name, bank_code, tracking_reference")
      .eq("user_id", user.id)
      .eq("provider", "flutterwave")
      .eq("bank_code", FLUTTERWAVE_BANK_CODE)
      .maybeSingle();

    if (existingAccount) {
      return new Response(
        JSON.stringify({
          success: true,
          data: existingAccount,
          existing: true,
        }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    const { data: savedNinRow } = await supabase
      .from("user_nin")
      .select("nin")
      .eq("user_id", user.id)
      .maybeSingle();

    const body = await req.json().catch(() => ({}));
    const { email, name, phoneNumber, bvn, nin, identityType, identityNumber } = body;

    if (!email || !name || !phoneNumber) {
      throw new Error("Missing required parameters");
    }

    const resolvedType = String(identityType || (nin ? "nin" : "nin")).toLowerCase();
    let identityValue = String(identityNumber || nin || savedNinRow?.nin || bvn || "").replace(/\D/g, "");

    if (identityValue.length !== 11) {
      throw new Error("NIN must be 11 digits");
    }

    if (resolvedType !== "nin") {
      throw new Error("Only NIN is supported for virtual account creation");
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
      nin: identityValue,
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
    const accountName = `${firstname} ${lastname}`.trim();
    const bankName = account.bank_name || "Flutterwave";
    const trackingReference = txRef;

    const { error: upsertError } = await supabase.from("virtual_accounts").upsert(
      {
        user_id: user.id,
        business_id: FLUTTERWAVE_BUSINESS_ID,
        bank_code: FLUTTERWAVE_BANK_CODE,
        bank_name: bankName,
        account_number: account.account_number,
        account_name: accountName,
        tracking_reference: trackingReference,
        nin: identityValue,
        bvn: null,
        provider: "flutterwave",
        updated_at: new Date().toISOString(),
      },
      { onConflict: "user_id,bank_code" },
    );

    if (upsertError) {
      console.error("Failed to store Flutterwave virtual account:", upsertError);
      throw new Error("Virtual account created but could not be saved");
    }

    const { error: ninUpsertError } = await supabase.from("user_nin").upsert(
      {
        user_id: user.id,
        nin: identityValue,
        provider: "flutterwave",
        verified_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      },
      { onConflict: "user_id" },
    );

    if (ninUpsertError) {
      console.warn("Virtual account saved but failed to store user NIN:", ninUpsertError);
    }

    return new Response(
      JSON.stringify({
        success: true,
        data: {
          account_number: account.account_number,
          bank_name: bankName,
          account_name: accountName,
          bank_code: FLUTTERWAVE_BANK_CODE,
          tracking_reference: trackingReference,
        },
        existing: false,
      }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } },
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
      },
    );
  }
});
