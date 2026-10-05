import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { debitUserWallet } from "../_shared/wallet.ts";
import { purchaseReference, queuedUserId } from "../_shared/purchase-queue.ts";

const CORS_HEADERS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const CABLE_SERVICE_MAP: Record<string, string> = {
  "DSTV": "dstv",
  "GOTV": "gotv",
  "STARTIMES": "startimes",
};

const REQUERY_STATUSES = new Set(["pending", "processing", "PROCESSING", "queued", "PENDING"]);

const normalizeSmartcard = (value: unknown) => {
  if (typeof value === "string") return value.replace(/[^\d]/g, "").trim();
  if (typeof value === "number") return value.toString().replace(/[^\d]/g, "").trim();
  return "";
};

const normalizePhone = (value: unknown) => {
  if (typeof value === "string") return value.replace(/[^\d]/g, "").trim();
  if (typeof value === "number") return value.toString().replace(/[^\d]/g, "").trim();
  return "";
};

const resolveServiceId = (provider?: string | null) => {
  if (!provider) return "dstv";
  const upper = provider.toUpperCase().trim();
  return CABLE_SERVICE_MAP[upper] || "dstv";
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
    const replayUserId = queuedUserId(req);
    let user: { id: string };
    if (replayUserId) {
      user = { id: replayUserId };
    } else {
      const { data: { user: authUser }, error: authError } = await supabase.auth.getUser(token);
      if (authError || !authUser) {
        return new Response(JSON.stringify({ success: false, error: "Unauthorized" }), {
          status: 401,
          headers: { ...CORS_HEADERS, "Content-Type": "application/json" },
        });
      }
      user = authUser;
    }

    let parsedBody: Record<string, unknown> | null = null;
    try {
      const bodyText = await req.text();
      if (bodyText && bodyText.trim().length > 0) {
        parsedBody = JSON.parse(bodyText);
      }
    } catch (error) {
      console.error("purchase-vtpass-cable: unable to parse request body:", error);
      parsedBody = null;
    }

    const billersCode = parsedBody?.billersCode || parsedBody?.card_number || parsedBody?.smartcard_number;
    const plan_id = parsedBody?.plan_id;
    const provider = parsedBody?.provider;
    const phone_number = parsedBody?.phone_number || parsedBody?.phone;
    const subscription_type = parsedBody?.subscription_type || "change"; // "change" or "renew"
    const variation_code = parsedBody?.variation_code || parsedBody?.api_code;
    const amount = parsedBody?.amount;
    const price = parsedBody?.price;
    const package_name = parsedBody?.package_name;
    const quantity = parsedBody?.quantity || 1;
    const request_id = parsedBody?.request_id;

    const sanitizedSmartcard = normalizeSmartcard(billersCode);
    const sanitizedPhone = normalizePhone(phone_number);

    if (!sanitizedSmartcard || typeof plan_id !== "string") {
      return new Response(
        JSON.stringify({
          success: false,
          error: "billersCode (smartcard number) and plan_id are required",
        }),
        { status: 400, headers: { ...CORS_HEADERS, "Content-Type": "application/json" } },
      );
    }

    if (!sanitizedPhone) {
      return new Response(
        JSON.stringify({
          success: false,
          error: "phone_number is required",
        }),
        { status: 400, headers: { ...CORS_HEADERS, "Content-Type": "application/json" } },
      );
    }

    // Plan details should come from request body (packages are fetched from API now)
    // If not provided, return error
    const planPrice = typeof price === "number" ? price : (typeof amount === "number" ? amount : 0);
    if (!planPrice || planPrice <= 0) {
      return new Response(
        JSON.stringify({ success: false, error: "Plan price is required" }),
        { status: 400, headers: { ...CORS_HEADERS, "Content-Type": "application/json" } },
      );
    }

    // Create plan object from request body
    const cablePlan = {
      id: plan_id || `plan-${Date.now()}`,
      package_name: package_name || `${provider} Package`,
      price: planPrice,
      custom_price: planPrice,
      original_price: planPrice,
      api_code: variation_code || plan_id,
      provider: provider || "DSTV",
      vending_provider: "vtpass"
    };

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
    const purchaseAmount = planPrice;
    
    // Calculate 2% charge fee
    const CHARGE_FEE_RATE = 0.02; // 2%
    const chargeFee = purchaseAmount * CHARGE_FEE_RATE;
    const totalAmount = purchaseAmount + chargeFee;

    if (balanceBefore < totalAmount) {
      return new Response(
        JSON.stringify({ success: false, error: "Insufficient balance" }),
        { status: 400, headers: { ...CORS_HEADERS, "Content-Type": "application/json" } },
      );
    }

    const resolvedProvider = typeof provider === "string" ? provider : cablePlan.provider;
    const serviceId = resolveServiceId(resolvedProvider);

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

    // Build pay payload based on subscription type
    const payPayload: any = {
      request_id: vtpassRequestId,
      serviceID: serviceId,
      billersCode: sanitizedSmartcard,
      phone: sanitizedPhone,
      subscription_type: subscription_type, // "change" or "renew"
    };

    // For bouquet change, include variation_code and quantity
    if (subscription_type === "change") {
      payPayload.variation_code = variation_code || cablePlan.api_code;
      payPayload.quantity = Number(quantity) || 1;
      if (typeof amount === "number") {
        payPayload.amount = amount;
      }
    } else if (subscription_type === "renew") {
      // For renewal, use the amount (should be renewal_amount from verification)
      if (typeof amount === "number") {
        payPayload.amount = amount;
      } else {
        payPayload.amount = planPrice;
      }
    }

    console.log("purchase-vtpass-cable -> pay payload:", {
      ...payPayload,
      amount: planPrice,
      mode: VTPASS_MODE,
    });

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

    // If status is pending, requery
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

    const reference = purchaseReference(req, parsedBody, vtpassRequestId);

    // Debit wallet (debit total amount including fee)
    const debitResult = await debitUserWallet({
      supabase,
      userId: user.id,
      amount: totalAmount,
      transactionType: "cable_tv",
      description: `VTpass ${resolvedProvider} ${subscription_type} - ${cablePlan.package_name} for ${sanitizedSmartcard}`,
      reference,
      performedBy: user.id,
      balanceBefore,
      notification: {
        title: "Cable TV subscription successful",
        message: `₦${totalAmount.toFixed(2)} VTpass ${resolvedProvider} (${cablePlan.package_name}) ${subscription_type} for smartcard ${sanitizedSmartcard}. Reference: ${reference}.`,
      },
    });

    // Record transaction in cable_tv_transactions with charge fee
    const { data: insertedTransaction, error: txnError } = await supabase
      .from("cable_tv_transactions")
      .insert({
        user_id: user.id,
        smartcard_number: sanitizedSmartcard,
        provider: resolvedProvider,
        plan_name: cablePlan.package_name,
        subscription_type: subscription_type,
        amount: totalAmount,
        purchase_amount: purchaseAmount,
        charge_fee: chargeFee,
        balance_before: debitResult.balanceBefore,
        balance_after: debitResult.balanceAfter,
        status: transaction.status?.toLowerCase() || 'success',
        reference,
        api_response: payJson,
        performed_by: user.id,
      })
      .select()
      .single();

    if (txnError || !insertedTransaction) {
      console.error("CRITICAL: Failed to record cable transaction after wallet debit:", txnError);
      console.error("Data consistency issue: Wallet debited but transaction not recorded", {
        userId: user.id,
        amount: planPrice,
        reference,
        error: txnError,
      });

      return new Response(
        JSON.stringify({
          success: false,
          error: "Transaction completed but failed to record. Please contact support with reference: " + reference,
          reference,
          details: {
            message: "Your wallet was debited and subscription was delivered, but the transaction record failed. Please contact support.",
            error: txnError?.message || "Unknown error",
          },
        }),
        { status: 500, headers: { ...CORS_HEADERS, "Content-Type": "application/json" } },
      );
    }

    return new Response(
      JSON.stringify({
        success: true,
        message: `Cable TV ${subscription_type} successful via VTpass`,
        request_id: reference,
        data: {
          reference,
          package_name: cablePlan.package_name,
          amount: totalAmount,
          purchase_amount: purchaseAmount,
          charge_fee: chargeFee,
          smartcard_number: sanitizedSmartcard,
          provider: resolvedProvider,
          subscription_type,
          balance_before: debitResult.balanceBefore,
          balance_after: debitResult.balanceAfter,
          status: transaction.status,
          product_name: transaction.product_name,
        },
      }),
      { status: 200, headers: { ...CORS_HEADERS, "Content-Type": "application/json" } },
    );
  } catch (error) {
    console.error("Error in purchase-vtpass-cable function:", error);
    const message = error instanceof Error ? error.message : "Unknown error occurred";
    return new Response(
      JSON.stringify({ success: false, error: message }),
      { status: 500, headers: { ...CORS_HEADERS, "Content-Type": "application/json" } },
    );
  }
});

