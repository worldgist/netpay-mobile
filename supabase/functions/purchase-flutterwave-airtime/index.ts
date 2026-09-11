import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import {
  getFlutterwaveSecretKeyOptional,
  getFlutterwaveNgnBalance,
  normalizePhoneForFlutterwave,
  parseFlutterwaveApiCode,
  payFlutterwaveAirtimeBill,
  resolveFlutterwaveAirtimeBillCodes,
} from "../_shared/flutterwave-bills.ts";
import { creditUserWallet, debitUserWallet } from "../_shared/wallet.ts";

const CORS_HEADERS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const resolveNetworkName = (networkId: unknown, networkName: unknown): string => {
  if (typeof networkName === "string" && networkName.trim()) return networkName.trim();
  const id = String(networkId ?? "").trim().toLowerCase();
  const map: Record<string, string> = {
    "1": "MTN",
    "2": "Airtel",
    "3": "9Mobile",
    "4": "Glo",
    mtn: "MTN",
    airtel: "Airtel",
    glo: "Glo",
    "9mobile": "9Mobile",
    t2: "9Mobile",
    etisalat: "9Mobile",
  };
  return map[id] || String(networkId || "MTN");
};

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: CORS_HEADERS });
  }

  try {
    if (!getFlutterwaveSecretKeyOptional()) {
      return new Response(JSON.stringify({
        success: false,
        error: "Flutterwave credentials are not configured",
      }), {
        status: 200,
        headers: { ...CORS_HEADERS, "Content-Type": "application/json" },
      });
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

    const body = await req.json();
    const phone_number = body?.phone_number ?? body?.phone;
    const amount = Number(body?.amount);
    const network_id = body?.network_id ?? body?.service_id;
    const network_name = body?.network_name ?? body?.network;
    const provider_id = body?.provider_id;
    const item_code = body?.item_code ?? body?.api_code;

    const sanitizedPhone = normalizePhoneForFlutterwave(String(phone_number || ""));
    if (!sanitizedPhone || sanitizedPhone.length < 10) {
      return new Response(JSON.stringify({ success: false, error: "Please enter a valid phone number." }), {
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
    const purchaseAmount = Math.round(amount);

    let configuredApiCode = typeof item_code === "string" ? item_code.trim() : "";
    if (!configuredApiCode && provider_id) {
      const { data: providerRow } = await supabase
        .from("airtime_providers")
        .select("api_code, network_name")
        .eq("id", provider_id)
        .maybeSingle();
      configuredApiCode = String(providerRow?.api_code || "").trim();
    }

    if (!configuredApiCode) {
      const lookupNetwork = displayNetwork;
      const { data: providerRows } = await supabase
        .from("airtime_providers")
        .select("api_code, network_name")
        .ilike("network_name", lookupNetwork)
        .eq("is_active", true)
        .limit(1);

      configuredApiCode = String(providerRows?.[0]?.api_code || "").trim();
    }

    const parsedApiCode = configuredApiCode ? parseFlutterwaveApiCode(configuredApiCode) : null;

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

    const balanceBefore = Number(profile.balance) || 0;
    const isDemoUser = profile.email === "demo@netppay.com";

    if (!isDemoUser && balanceBefore < purchaseAmount) {
      return new Response(JSON.stringify({ success: false, error: "Insufficient balance" }), {
        status: 200,
        headers: { ...CORS_HEADERS, "Content-Type": "application/json" },
      });
    }

    if (!isDemoUser) {
      const flutterwaveBalance = await getFlutterwaveNgnBalance();
      if (flutterwaveBalance !== null && flutterwaveBalance < purchaseAmount) {
        return new Response(JSON.stringify({
          success: false,
          error: `Airtime vending is temporarily unavailable. Flutterwave merchant balance (₦${flutterwaveBalance.toFixed(2)}) is too low for this ₦${purchaseAmount.toFixed(2)} purchase. Please fund your Flutterwave wallet.`,
        }), {
          status: 200,
          headers: { ...CORS_HEADERS, "Content-Type": "application/json" },
        });
      }
    }

    const reference = `AIRTIME-FLW-${Date.now()}-${user.id.slice(0, 8)}`;
    let debitResult: Awaited<ReturnType<typeof debitUserWallet>> | null = null;

    if (!isDemoUser) {
      try {
        debitResult = await debitUserWallet({
          supabase,
          userId: user.id,
          amount: purchaseAmount,
          transactionType: "airtime_purchase",
          description: `Airtime purchase (Flutterwave) — ${sanitizedPhone} (${displayNetwork})`,
          reference,
          performedBy: user.id,
          balanceBefore,
        });
      } catch (debitError) {
        const message = debitError instanceof Error ? debitError.message : "Unable to debit wallet";
        return new Response(JSON.stringify({ success: false, error: message }), {
          status: 200,
          headers: { ...CORS_HEADERS, "Content-Type": "application/json" },
        });
      }
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
        console.error("Flutterwave airtime refund failed:", refundError);
      }
    };

    let paymentResult = {
      success: true,
      status: "success" as const,
      reference,
      vendorResponse: { demo: true },
    };

    if (!isDemoUser) {
      let billerCode: string | undefined;
      let itemCode: string | undefined;

      try {
        ({ billerCode, itemCode } = await resolveFlutterwaveAirtimeBillCodes({
          network: displayNetwork,
          itemCodeOverride: parsedApiCode?.itemCode || configuredApiCode || undefined,
          billerCodeOverride: parsedApiCode?.billerCode,
        }));
      } catch (resolveError) {
        console.warn(
          "Flutterwave airtime bill code resolution failed; using POST /bills API:",
          resolveError instanceof Error ? resolveError.message : resolveError,
        );
      }

      paymentResult = await payFlutterwaveAirtimeBill({
        customerId: sanitizedPhone,
        amount: purchaseAmount,
        reference,
        network: displayNetwork,
        billerCode,
        itemCode,
      });

      if (!paymentResult.success) {
        await refundIfNeeded(paymentResult.error || "provider rejected transaction");
        await supabase.from("airtime_transactions").insert({
          user_id: user.id,
          phone_number: sanitizedPhone,
          network: displayNetwork,
          service_id: itemCode,
          amount: purchaseAmount,
          balance_before: debitResult?.balanceBefore ?? balanceBefore,
          balance_after: debitResult?.balanceBefore ?? balanceBefore,
          status: "failed",
          reference,
          api_response: paymentResult.vendorResponse || { error: paymentResult.error },
          performed_by: user.id,
        });

        return new Response(JSON.stringify({
          success: false,
          error: paymentResult.error || "Flutterwave airtime purchase failed",
        }), {
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
      service_id: parsedApiCode?.itemCode || configuredApiCode || displayNetwork,
      amount: purchaseAmount,
      balance_before: debitResult?.balanceBefore ?? balanceBefore,
      balance_after: balanceAfter,
      status: "success",
      reference: paymentResult.reference || reference,
      api_response: paymentResult.vendorResponse || {},
      performed_by: user.id,
    });

    // Push is sent once from the mobile payment-success screen ("Purchase Successful").

    return new Response(JSON.stringify({
      success: true,
      data: {
        reference: paymentResult.reference || reference,
        phone_number: sanitizedPhone,
        network: displayNetwork,
        amount: purchaseAmount,
        vendor: "flutterwave",
        balance_before: debitResult?.balanceBefore ?? balanceBefore,
        balance_after: balanceAfter,
      },
      message: "Airtime purchased successfully via Flutterwave",
    }), {
      status: 200,
      headers: { ...CORS_HEADERS, "Content-Type": "application/json" },
    });
  } catch (error) {
    console.error("purchase-flutterwave-airtime error:", error);
    return new Response(JSON.stringify({
      success: false,
      error: error instanceof Error ? error.message : "Unknown error occurred",
    }), {
      status: 200,
      headers: { ...CORS_HEADERS, "Content-Type": "application/json" },
    });
  }
});
