import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { debitUserWallet } from "../_shared/wallet.ts";

const CORS_HEADERS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const NETWORK_SERVICE_MAP: Record<string, string> = {
  "MTN": "mtn-data",
  "MTN NIGERIA": "mtn-data",
  "AIRTEL": "airtel-data",
  "AIRTEL NIGERIA": "airtel-data",
  "GLO": "glo-data",
  "GLOBACOM": "glo-data",
  "9MOBILE": "9mobile-data",
  "9 MOBILE": "9mobile-data",
  "ETISALAT": "9mobile-data",
};

const REQUERY_STATUSES = new Set(["pending", "processing", "PROCESSING", "queued", "PENDING"]);

const normalizePhone = (value: unknown) => {
  if (typeof value === "string") return value.replace(/[^\d]/g, "").trim();
  if (typeof value === "number") return value.toString().replace(/[^\d]/g, "").trim();
  return "";
};

const normalizeNetwork = (value?: string | null) => {
  if (!value) return null;
  const upper = value.toUpperCase().trim();
  if (NETWORK_SERVICE_MAP[upper]) return upper;
  if (upper.includes("MTN")) return "MTN";
  if (upper.includes("AIRTEL")) return "AIRTEL";
  if (upper.includes("GLO")) return "GLO";
  if (upper.includes("9MOBILE") || upper.includes("9 MOBILE") || upper.includes("ETISALAT")) return "9MOBILE";
  return upper;
};

const resolveServiceId = (network?: string | null, requested?: string | null) => {
  if (requested && requested.trim().length > 0) return requested.trim();
  const normalized = normalizeNetwork(network);
  if (normalized && NETWORK_SERVICE_MAP[normalized]) {
    return NETWORK_SERVICE_MAP[normalized];
  }
  return "mtn-data";
};

const isDelivered = (status?: string | null) => {
  if (!status) return false;
  return status.toLowerCase() === "delivered";
};

const pad = (value: number) => `${value}`.padStart(2, "0");

const buildLagosTimestamp = () => {
  const now = new Date();
  const lagos = new Date(
    now.toLocaleString("en-US", {
      timeZone: "Africa/Lagos",
    }),
  );

  return (
    lagos.getFullYear().toString() +
    pad(lagos.getMonth() + 1) +
    pad(lagos.getDate()) +
    pad(lagos.getHours()) +
    pad(lagos.getMinutes())
  );
};

const generateRequestId = () => {
  const base = buildLagosTimestamp();
  const random = crypto.randomUUID().replace(/-/g, "").slice(0, 8).toUpperCase();
  return `${base}${random}`;
};

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
    const VTPASS_API_KEY = Deno.env.get("VTPASS_API_KEY");
    const VTPASS_PUBLIC_KEY = Deno.env.get("VTPASS_PUBLIC_KEY");
    const VTPASS_SECRET_KEY = Deno.env.get("VTPASS_SECRET_KEY");
    const VTPASS_MODE = (Deno.env.get("VTPASS_MODE") || "live").toLowerCase();

    if (!VTPASS_API_KEY || !VTPASS_PUBLIC_KEY) {
      return new Response(
        JSON.stringify({
          success: false,
          error: "VTpass credentials not configured. Please set VTPASS_API_KEY and VTPASS_PUBLIC_KEY.",
        }),
        { status: 500, headers: { ...CORS_HEADERS, "Content-Type": "application/json" } },
      );
    }

    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const supabase = createClient(supabaseUrl, supabaseKey);

    const authHeader = req.headers.get("Authorization");
    if (!authHeader) {
      return new Response(JSON.stringify({ success: false, error: "Unauthorized" }), {
        status: 401,
        headers: { ...CORS_HEADERS, "Content-Type": "application/json" },
      });
    }

    const token = authHeader.replace("Bearer ", "");
    const { data: { user }, error: authError } = await supabase.auth.getUser(token);
    if (authError || !user) {
      return new Response(JSON.stringify({ success: false, error: "Unauthorized" }), {
        status: 401,
        headers: { ...CORS_HEADERS, "Content-Type": "application/json" },
      });
    }

    let parsedBody: Record<string, unknown> | null = null;
    try {
      const bodyText = await req.text();
      if (bodyText && bodyText.trim().length > 0) {
        parsedBody = JSON.parse(bodyText);
      }
    } catch (error) {
      console.error("purchase-vtpass-data: unable to parse request body:", error);
      parsedBody = null;
    }

    const phone_number = parsedBody?.phone_number;
    const plan_id = parsedBody?.plan_id;
    const request_id = parsedBody?.request_id;
    const network_name = parsedBody?.network_name;
    const network_id = parsedBody?.network_id;
    const explicit_service_id = parsedBody?.serviceID;

    const sanitizedPhone = normalizePhone(phone_number);
    if (!sanitizedPhone || typeof plan_id !== "string") {
      return new Response(
        JSON.stringify({
          success: false,
          error: "phone_number and plan_id are required",
        }),
        { status: 400, headers: { ...CORS_HEADERS, "Content-Type": "application/json" } },
      );
    }

    const { data: dataPlan, error: planError } = await supabase
      .from("data_plans")
      .select("*")
      .eq("id", plan_id)
      .maybeSingle();

    if (planError || !dataPlan) {
      console.error("VTpass data plan not found:", planError);
      return new Response(
        JSON.stringify({ success: false, error: "Data plan not found" }),
        { status: 404, headers: { ...CORS_HEADERS, "Content-Type": "application/json" } },
      );
    }

    if ((dataPlan.provider || "smeplug") !== "vtpass") {
      return new Response(
        JSON.stringify({ success: false, error: "Selected plan is not configured for VTpass" }),
        { status: 400, headers: { ...CORS_HEADERS, "Content-Type": "application/json" } },
      );
    }

    if (!dataPlan.api_code) {
      return new Response(
        JSON.stringify({ success: false, error: "Data plan is missing a variation code" }),
        { status: 400, headers: { ...CORS_HEADERS, "Content-Type": "application/json" } },
      );
    }

    const { data: profile, error: profileError } = await supabase
      .from("profiles")
      .select("balance, full_name, email")
      .eq("id", user.id)
      .single();

    if (profileError || !profile) {
      console.error("Failed to fetch profile:", profileError);
      return new Response(
        JSON.stringify({ success: false, error: "Failed to fetch profile" }),
        { status: 500, headers: { ...CORS_HEADERS, "Content-Type": "application/json" } },
      );
    }

    const balanceBefore = Number(profile.balance) || 0;
    const planPrice = Number(dataPlan.price) || 0;

    if (balanceBefore < planPrice) {
      return new Response(
        JSON.stringify({ success: false, error: "Insufficient balance" }),
        { status: 400, headers: { ...CORS_HEADERS, "Content-Type": "application/json" } },
      );
    }

    const resolvedNetwork =
      typeof network_name === "string"
        ? network_name
        : (typeof network_id === "string" ? network_id : dataPlan.network);

    const serviceId = resolveServiceId(
      resolvedNetwork,
      typeof explicit_service_id === "string" ? explicit_service_id : null,
    );

    const vtpassRequestId =
      typeof request_id === "string" && request_id.trim().length >= 6
        ? request_id.trim()
        : generateRequestId();

    const baseUrl = VTPASS_MODE === "sandbox"
      ? "https://sandbox.vtpass.com"
      : "https://vtpass.com";

    const headers: HeadersInit = {
      "api-key": VTPASS_API_KEY || VTPASS_PUBLIC_KEY,
      "public-key": VTPASS_PUBLIC_KEY,
      "Content-Type": "application/json",
    };
    if (VTPASS_SECRET_KEY) {
      headers["secret-key"] = VTPASS_SECRET_KEY;
    }

    const payPayload = {
      request_id: vtpassRequestId,
      serviceID: serviceId,
      billersCode: sanitizedPhone,
      variation_code: String(dataPlan.api_code),
      amount: planPrice,
      phone: sanitizedPhone,
    };

    console.log("purchase-vtpass-data -> pay payload:", { ...payPayload, amount: planPrice, mode: VTPASS_MODE });

    const payResponse = await fetch(`${baseUrl}/api/pay`, {
      method: "POST",
      headers,
      body: JSON.stringify(payPayload),
    });

    const payText = await payResponse.text();
    if (!payResponse.ok) {
      console.error("VTpass pay API error:", payResponse.status, payText);
      return new Response(
        JSON.stringify({
          success: false,
          error: `VTpass API error: ${payResponse.status}`,
          details: payText,
        }),
        { status: payResponse.status, headers: { ...CORS_HEADERS, "Content-Type": "application/json" } },
      );
    }

    let payJson: any = null;
    try {
      payJson = JSON.parse(payText);
    } catch (error) {
      console.error("Unable to parse VTpass response:", payText, error);
      return new Response(
        JSON.stringify({ success: false, error: "Invalid response from VTpass" }),
        { status: 500, headers: { ...CORS_HEADERS, "Content-Type": "application/json" } },
      );
    }

    let transaction = payJson?.content?.transactions || null;
    let status = transaction?.status || payJson?.status || "";

    if ((!transaction || REQUERY_STATUSES.has(status?.toLowerCase?.() ?? "")) && vtpassRequestId) {
      console.log("VTpass status pending, requerying...");
      const requeryResponse = await fetch(`${baseUrl}/api/requery`, {
        method: "POST",
        headers,
        body: JSON.stringify({ request_id: vtpassRequestId }),
      });

      if (requeryResponse.ok) {
        const requeryJson = await requeryResponse.json();
        if (requeryJson?.content?.transactions) {
          transaction = requeryJson.content.transactions;
          status = transaction?.status || status;
        }
        payJson.requery = requeryJson;
      } else {
        console.warn(
          "VTpass requery failed:",
          requeryResponse.status,
          await requeryResponse.text(),
        );
      }
    }

    if (!transaction) {
      return new Response(
        JSON.stringify({
          success: false,
          error: "VTpass did not return transaction details",
          details: payJson,
        }),
        { status: 502, headers: { ...CORS_HEADERS, "Content-Type": "application/json" } },
      );
    }

    if (!isDelivered(status)) {
      return new Response(
        JSON.stringify({
          success: false,
          error: `Transaction status: ${status || "unknown"}`,
          details: transaction,
        }),
        { status: 200, headers: { ...CORS_HEADERS, "Content-Type": "application/json" } },
      );
    }

    const reference = vtpassRequestId;
    
    // Debit wallet first
    const debitResult = await debitUserWallet({
      supabase,
      userId: user.id,
      amount: planPrice,
      transactionType: "data_purchase",
      description: `VTpass data purchase - ${dataPlan.plan_name} for ${sanitizedPhone}`,
      reference,
      performedBy: user.id,
      balanceBefore,
      notification: {
        title: "Data purchase successful",
        message: `₦${planPrice.toFixed(2)} VTpass data bundle (${dataPlan.plan_name}) purchased for ${sanitizedPhone}. Reference: ${reference}.`,
      },
    });

    // Record transaction - CRITICAL: This must succeed
    const { data: insertedTransaction, error: dataTxnError } = await supabase
      .from("data_transactions")
      .insert({
        user_id: user.id,
        phone_number: sanitizedPhone,
        network: dataPlan.network || serviceId,
        plan_name: dataPlan.plan_name,
        plan_validity: dataPlan.validity || "N/A",
        amount: planPrice,
        balance_before: debitResult.balanceBefore,
        balance_after: debitResult.balanceAfter,
        status: "success",
        reference,
        api_response: payJson,
        performed_by: user.id,
        provider: "vtpass",
      })
      .select()
      .single();

    if (dataTxnError || !insertedTransaction) {
      console.error("CRITICAL: Failed to record data transaction after wallet debit:", dataTxnError);
      // This is a critical error - wallet was debited but transaction not recorded
      // We still return success to user since VTpass delivered, but log the issue
      // In production, you might want to implement a reconciliation job
      console.error("Data consistency issue: Wallet debited but transaction not recorded", {
        userId: user.id,
        amount: planPrice,
        reference,
        error: dataTxnError,
      });
      
      // Return error so the frontend knows something went wrong
      return new Response(
        JSON.stringify({
          success: false,
          error: "Transaction completed but failed to record. Please contact support with reference: " + reference,
          reference,
          details: {
            message: "Your wallet was debited and data was delivered, but the transaction record failed. Please contact support.",
            error: dataTxnError?.message || "Unknown error",
          },
        }),
        { status: 500, headers: { ...CORS_HEADERS, "Content-Type": "application/json" } },
      );
    }

    return new Response(
      JSON.stringify({
        success: true,
        message: "Data purchased successfully via VTpass",
        request_id: reference,
        data: {
          reference,
          plan_name: dataPlan.plan_name,
          amount: planPrice,
          phone_number: sanitizedPhone,
          network: dataPlan.network,
          validity: dataPlan.validity,
          balance_before: debitResult.balanceBefore,
          balance_after: debitResult.balanceAfter,
          status: transaction.status,
          product_name: transaction.product_name,
        },
      }),
      { status: 200, headers: { ...CORS_HEADERS, "Content-Type": "application/json" } },
    );
  } catch (error) {
    console.error("Error in purchase-vtpass-data function:", error);
    const message = error instanceof Error ? error.message : "Unknown error occurred";
    return new Response(
      JSON.stringify({ success: false, error: message }),
      { status: 500, headers: { ...CORS_HEADERS, "Content-Type": "application/json" } },
    );
  }
});

