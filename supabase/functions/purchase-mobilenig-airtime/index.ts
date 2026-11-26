import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import {
  getMobilenigSecretKey,
  resolveMobilenigAirtimeServiceId,
} from "../_shared/mobilenig-api.ts";
import { creditUserWallet, debitUserWallet } from "../_shared/wallet.ts";

const CORS_HEADERS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const normalizePhone = (value: unknown): string => {
  if (typeof value !== "string") return "";
  let normalized = value.trim().replace(/\s+/g, "");
  if (normalized.startsWith("+234")) normalized = `0${normalized.slice(4)}`;
  else if (normalized.startsWith("234") && normalized.length === 13) normalized = `0${normalized.slice(3)}`;
  normalized = normalized.replace(/[^0-9]/g, "");
  if (/^[789]\d{9}$/.test(normalized)) normalized = `0${normalized}`;
  return normalized;
};

const resolveNetworkName = (networkId: unknown, networkName: unknown): string => {
  if (typeof networkName === "string" && networkName.trim()) return networkName.trim();
  const id = String(networkId ?? "").trim();
  const map: Record<string, string> = {
    "1": "MTN",
    "2": "Airtel",
    "3": "9Mobile",
    "4": "Glo",
    BAD: "MTN",
    BAA: "Airtel",
    BAC: "9Mobile",
    BAB: "Glo",
  };
  return map[id.toUpperCase()] || id || "Unknown";
};

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: CORS_HEADERS });
  }

  try {
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

    const body = await req.json();
    const phone_number = body?.phone_number ?? body?.phone;
    const amount = Number(body?.amount);
    const network_id = body?.network_id ?? body?.service_id ?? body?.api_code;
    const network_name = body?.network_name ?? body?.network;

    const sanitizedPhone = normalizePhone(String(phone_number || ""));
    if (!/^0\d{10}$/.test(sanitizedPhone)) {
      return new Response(JSON.stringify({ success: false, error: "Please enter a valid 11-digit Nigerian phone number." }), {
        status: 200,
        headers: { ...CORS_HEADERS, "Content-Type": "application/json" },
      });
    }

    if (!Number.isFinite(amount) || amount <= 0) {
      return new Response(JSON.stringify({ success: false, error: "Please enter a valid amount greater than 0" }), {
        status: 200,
        headers: { ...CORS_HEADERS, "Content-Type": "application/json" },
      });
    }

    const displayNetwork = resolveNetworkName(network_id, network_name);
    const serviceId = resolveMobilenigAirtimeServiceId(displayNetwork, String(network_id || ""));

    const { data: profile, error: profileError } = await supabase
      .from("profiles")
      .select("balance, email")
      .eq("id", user.id)
      .single();

    if (profileError || !profile) {
      return new Response(JSON.stringify({ success: false, error: "Failed to fetch user profile" }), {
        status: 200,
        headers: { ...CORS_HEADERS, "Content-Type": "application/json" },
      });
    }

    const purchaseAmount = Math.round(amount);
    const balanceBefore = Number(profile.balance) || 0;
    const isDemoUser = profile.email === "demo@netppay.com";

    if (!isDemoUser && balanceBefore < purchaseAmount) {
      return new Response(JSON.stringify({ success: false, error: "Insufficient balance" }), {
        status: 200,
        headers: { ...CORS_HEADERS, "Content-Type": "application/json" },
      });
    }

    const reference = `AIRTIME-MN-${Date.now()}-${user.id.slice(0, 8)}`;
    const transId = Date.now();

    let debitResult: Awaited<ReturnType<typeof debitUserWallet>> | null = null;
    if (!isDemoUser) {
      debitResult = await debitUserWallet({
        supabase,
        userId: user.id,
        amount: purchaseAmount,
        transactionType: "airtime_purchase",
        description: `Airtime purchase (MobileNig) — ${sanitizedPhone} (${displayNetwork})`,
        reference,
        performedBy: user.id,
        balanceBefore,
      });
    }

    const refundIfNeeded = async (reason: string) => {
      if (!debitResult) return;
      try {
        await creditUserWallet({
          supabase,
          userId: user.id,
          amount: purchaseAmount,
          transactionType: "refund",
          description: `Airtime refund — ${reason}`,
          reference: `${reference}-REF`,
          performedBy: user.id,
        });
      } catch (refundError) {
        console.error("MobileNig airtime refund failed:", refundError);
      }
    };

    let apiResponse: Record<string, unknown> = {
      success: true,
      message: "Airtime purchase successful (Demo)",
      details: { status: "approved" },
    };

    if (!isDemoUser) {
      const secretKey = getMobilenigSecretKey();
      const requestBody = {
        service_id: serviceId,
        service_type: "STANDARD",
        beneficiary: sanitizedPhone.replace(/[^0-9]/g, ""),
        trans_id: transId,
        amount: String(purchaseAmount),
      };

      const response = await fetch("https://enterprise.mobilenig.com/api/v2/services/", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${secretKey}`,
        },
        body: JSON.stringify(requestBody),
      });

      const responseText = await response.text();
      try {
        apiResponse = JSON.parse(responseText) as Record<string, unknown>;
      } catch {
        await refundIfNeeded("invalid provider response");
        return new Response(JSON.stringify({ success: false, error: "Invalid response from MobileNig" }), {
          status: 200,
          headers: { ...CORS_HEADERS, "Content-Type": "application/json" },
        });
      }

      const details = (apiResponse.details && typeof apiResponse.details === "object")
        ? apiResponse.details as Record<string, unknown>
        : {};
      const status = String(details.status || "").toLowerCase();
      const isSuccess = apiResponse.statusCode === "200" &&
        apiResponse.message === "success" &&
        (status === "approved" || status === "success" || status === "completed");

      if (!isSuccess) {
        await refundIfNeeded("provider rejected transaction");
        await supabase.from("airtime_transactions").insert({
          user_id: user.id,
          phone_number: sanitizedPhone,
          network: displayNetwork,
          service_id: serviceId,
          amount: purchaseAmount,
          balance_before: debitResult?.balanceBefore ?? balanceBefore,
          balance_after: debitResult?.balanceBefore ?? balanceBefore,
          status: "failed",
          reference,
          api_response: apiResponse,
          performed_by: user.id,
        });

        const errorMessage = String(details.details || details.message || apiResponse.message || "MobileNig airtime purchase failed");
        return new Response(JSON.stringify({ success: false, error: errorMessage }), {
          status: 200,
          headers: { ...CORS_HEADERS, "Content-Type": "application/json" },
        });
      }
    }

    const balanceAfter = debitResult?.balanceAfter ?? balanceBefore - purchaseAmount;

    await supabase.from("airtime_transactions").insert({
      user_id: user.id,
      phone_number: sanitizedPhone,
      network: displayNetwork,
      service_id: serviceId,
      amount: purchaseAmount,
      balance_before: debitResult?.balanceBefore ?? balanceBefore,
      balance_after: balanceAfter,
      status: "success",
      reference,
      api_response: apiResponse,
      performed_by: user.id,
    });

    // Push is sent once from the mobile payment-success screen ("Purchase Successful").

    return new Response(JSON.stringify({
      success: true,
      data: {
        reference,
        phone_number: sanitizedPhone,
        network: displayNetwork,
        amount: purchaseAmount,
        vendor: "mobilenig",
        balance_before: debitResult?.balanceBefore ?? balanceBefore,
        balance_after: balanceAfter,
      },
      message: "Airtime purchased successfully via MobileNig",
    }), {
      status: 200,
      headers: { ...CORS_HEADERS, "Content-Type": "application/json" },
    });
  } catch (error) {
    console.error("purchase-mobilenig-airtime error:", error);
    return new Response(JSON.stringify({
      success: false,
      error: error instanceof Error ? error.message : "Unknown error occurred",
    }), {
      status: 500,
      headers: { ...CORS_HEADERS, "Content-Type": "application/json" },
    });
  }
});
