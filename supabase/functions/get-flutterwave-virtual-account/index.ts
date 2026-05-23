import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const CORS_HEADERS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const splitName = (fullName: string) => {
  const parts = fullName.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return { first_name: "NetPay", last_name: "User" };
  if (parts.length === 1) return { first_name: parts[0], last_name: "User" };
  return { first_name: parts[0], last_name: parts.slice(1).join(" ") };
};

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: CORS_HEADERS });
  }

  if (req.method !== "POST") {
    return new Response(
      JSON.stringify({ success: false, error: "Method not allowed" }),
      { status: 200, headers: { ...CORS_HEADERS, "Content-Type": "application/json" } },
    );
  }

  try {
    const supabase = createClient(
      Deno.env.get("SUPABASE_URL") ?? "",
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "",
    );

    const authHeader = req.headers.get("Authorization");
    if (!authHeader) {
      return new Response(
        JSON.stringify({ success: false, error: "No authorization header" }),
        { status: 200, headers: { ...CORS_HEADERS, "Content-Type": "application/json" } },
      );
    }

    const {
      data: { user },
      error: authError,
    } = await supabase.auth.getUser(authHeader.replace("Bearer ", ""));

    if (authError || !user) {
      return new Response(
        JSON.stringify({ success: false, error: "Unauthorized" }),
        { status: 200, headers: { ...CORS_HEADERS, "Content-Type": "application/json" } },
      );
    }

    const flwSecret = Deno.env.get("FLW_SECRET_KEY") || Deno.env.get("FLUTTERWAVE_SECRET_KEY");
    if (!flwSecret) {
      return new Response(
        JSON.stringify({ success: false, error: "Flutterwave credentials not configured" }),
        { status: 200, headers: { ...CORS_HEADERS, "Content-Type": "application/json" } },
      );
    }

    const { email, name, phoneNumber, bvn, nin } = await req.json();
    if (!email || !name || !phoneNumber) {
      return new Response(
        JSON.stringify({ success: false, error: "Missing required parameters" }),
        { status: 200, headers: { ...CORS_HEADERS, "Content-Type": "application/json" } },
      );
    }

    const cleanBvn = typeof bvn === "string" ? bvn.replace(/\D/g, "") : "";
    const cleanNin = typeof nin === "string" ? nin.replace(/\D/g, "") : "";

    if (cleanBvn.length !== 11 && cleanNin.length !== 11) {
      return new Response(
        JSON.stringify({ success: false, error: "BVN or NIN is required for static account number" }),
        { status: 200, headers: { ...CORS_HEADERS, "Content-Type": "application/json" } },
      );
    }

    const { first_name, last_name } = splitName(String(name));
    const cleanPhone = String(phoneNumber).replace(/\s+/g, "").replace(/[^0-9+]/g, "");
    const txRef = `FLW-VA-${Date.now()}-${user.id.slice(0, 8)}`;

    const requestBody = {
      email: String(email),
      is_permanent: true,
      tx_ref: txRef,
      firstname: first_name,
      lastname: last_name,
      phonenumber: cleanPhone,
      narration: `NetPay virtual account for ${String(name)}`,
      ...(cleanBvn.length === 11 ? { bvn: cleanBvn } : {}),
      ...(cleanNin.length === 11 ? { nin: cleanNin } : {}),
    };

    const response = await fetch("https://api.flutterwave.com/v3/virtual-account-numbers", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${flwSecret}`,
      },
      body: JSON.stringify(requestBody),
    });

    const data = await response.json();

    if (!response.ok || data?.status !== "success") {
      const message = data?.message || "Failed to create Flutterwave virtual account";
      return new Response(
        JSON.stringify({ success: false, error: message, details: data }),
        { status: 200, headers: { ...CORS_HEADERS, "Content-Type": "application/json" } },
      );
    }

    const payload = data?.data || {};
    const transformedData = {
      account_number: payload.account_number || payload.accountNumber,
      bank_name: payload.bank_name || payload.bankName || "Flutterwave",
      account_name: payload.account_name || payload.accountName || String(name),
      account_reference: payload.account_reference || payload.order_ref || txRef,
      trackingReference: payload.account_reference || payload.order_ref || txRef,
    };

    if (!transformedData.account_number) {
      return new Response(
        JSON.stringify({ success: false, error: "Flutterwave did not return an account number" }),
        { status: 200, headers: { ...CORS_HEADERS, "Content-Type": "application/json" } },
      );
    }

    return new Response(
      JSON.stringify({ success: true, data: transformedData }),
      { headers: { ...CORS_HEADERS, "Content-Type": "application/json" } },
    );
  } catch (error) {
    console.error("Get Flutterwave virtual account error:", error);
    return new Response(
      JSON.stringify({
        success: false,
        error: error instanceof Error ? error.message : "An unknown error occurred",
      }),
      { status: 200, headers: { ...CORS_HEADERS, "Content-Type": "application/json" } },
    );
  }
});
