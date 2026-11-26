import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import {
  isProviderConfigError,
  isProviderTemporarilyUnavailable,
} from "../_shared/airtime-flow.ts";
import {
  forwardPurchaseFields,
  forwardPurchaseHeaders,
  purchaseReference,
  queuedUserId,
} from "../_shared/purchase-queue.ts";
import { handlePurchase as purchaseSmeplugData } from "../purchase-smeplug-data/handler.ts";
import { handlePurchase as purchaseEbillsData } from "../purchase-ebills-data/handler.ts";
import { handlePurchase as purchaseMobilenigData } from "../purchase-mobilenig-data/handler.ts";
import { handlePurchase as purchaseFlutterwaveData } from "../purchase-flutterwave-data/handler.ts";
import { getFlutterwaveSecretKeyFromEnv } from "../_shared/flutterwave-secrets.ts";

function normalizeDataNetworkKey(value: string): string {
  let key = value.trim().toUpperCase().replace(/[^A-Z0-9]/g, "");
  if (key === "T2" || key === "ETISALAT") key = "9MOBILE";
  return key || "MTN";
}

/** Only fall back to vendors that already have usable codes/secrets for this plan. */
function dataPlanSupportsProvider(provider: string, plan: Record<string, unknown>): boolean {
  const planProvider = String(plan.provider || "").toLowerCase();
  const api = String(plan.api_code || "").trim();
  const mn = String(plan.mobilenig_code || "").trim();
  const sme = String(plan.smeplug_code || "").trim();

  switch (provider) {
    case "mobilenig":
      return Boolean(mn || planProvider.includes("mobilenig") || api);
    case "smeplug":
      return Boolean(sme || planProvider.includes("smeplug") || /^\d+$/.test(api));
    case "ebills":
      return Boolean(planProvider.includes("ebill") && api);
    case "flutterwave": {
      if (!getFlutterwaveSecretKeyFromEnv()) return false;
      const network = normalizeDataNetworkKey(String(plan.network || "MTN"));
      return Boolean(Deno.env.get(`FLUTTERWAVE_DATA_${network}_BILLER`)?.trim());
    }
    default:
      return false;
  }
}

const CORS_HEADERS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, idempotency-key',
};

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: CORS_HEADERS });
  }

  try {
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const supabase = createClient(supabaseUrl, supabaseKey);

    const authHeader = req.headers.get('Authorization');
    if (!authHeader) {
      return new Response(
        JSON.stringify({ success: false, error: 'Unauthorized' }),
        { status: 401, headers: { ...CORS_HEADERS, 'Content-Type': 'application/json' } }
      );
    }

    const token = authHeader.replace('Bearer ', '');
    const replayUserId = queuedUserId(req);
    let user: { id: string };
    if (replayUserId) {
      user = { id: replayUserId };
    } else {
      const { data: { user: authUser }, error: authError } = await supabase.auth.getUser(token);
      if (authError || !authUser) {
        return new Response(
          JSON.stringify({ success: false, error: 'Unauthorized' }),
          { status: 401, headers: { ...CORS_HEADERS, 'Content-Type': 'application/json' } }
        );
      }
      user = authUser;
    }

    // Parse request body
    const bodyText = await req.text();
    let requestBody: Record<string, unknown> = {};
    
    if (bodyText && bodyText.trim().length > 0) {
      try {
        requestBody = JSON.parse(bodyText);
      } catch (parseError) {
        console.error('Unable to parse request body:', parseError);
        return new Response(
          JSON.stringify({ success: false, error: 'Invalid request body' }),
          { status: 400, headers: { ...CORS_HEADERS, 'Content-Type': 'application/json' } }
        );
      }
    }

    const phone_number = typeof requestBody.phone_number === "string" ? requestBody.phone_number : "";
    const plan_id = typeof requestBody.plan_id === "string" ? requestBody.plan_id : "";

    if (!phone_number || !plan_id) {
      return new Response(
        JSON.stringify({ success: false, error: 'phone_number and plan_id are required' }),
        { status: 400, headers: { ...CORS_HEADERS, 'Content-Type': 'application/json' } }
      );
    }

    // Check if user is demo user - get profile to check email
    const { data: profile, error: profileError } = await supabase
      .from('profiles')
      .select('email, balance')
      .eq('id', user.id)
      .single();

    if (profileError || !profile) {
      return new Response(
        JSON.stringify({ success: false, error: 'Failed to fetch user profile' }),
        { status: 200, headers: { ...CORS_HEADERS, 'Content-Type': 'application/json' } }
      );
    }

    const isDemoUser = profile.email === 'demo@netppay.com';

    // For demo users, return mock successful response
    if (isDemoUser) {
      console.log('Demo user detected - using mock API response for data purchase');
      
      // Fetch data plan for reference
      const { data: dataPlan } = await supabase
        .from('data_plans')
        .select('*')
        .eq('id', plan_id)
        .single();

      const reference = purchaseReference(req, requestBody, `DATA-${Date.now()}-${user.id.slice(0, 8)}`);
      const planName = dataPlan?.plan_name || 'Data Plan';
      const planAmount = dataPlan?.price || 0;

      // Check balance
      const balanceBefore = Number(profile.balance) || 0;
      if (balanceBefore < planAmount) {
        return new Response(
          JSON.stringify({ success: false, error: 'Insufficient balance' }),
          { status: 200, headers: { ...CORS_HEADERS, 'Content-Type': 'application/json' } }
        );
      }

      // Debit wallet using shared function
      const { debitUserWallet } = await import('../_shared/wallet.ts');
      const debitResult = await debitUserWallet({
        supabase,
        userId: user.id,
        amount: planAmount,
        transactionType: 'data_purchase',
        description: `Data purchase - ${planName}`,
        reference,
        performedBy: user.id,
        balanceBefore,
        notification: {
          title: 'Data purchase successful (Demo)',
          message: `${planName} purchased for ${phone_number}. Reference: ${reference}.`,
        },
      });

      // Record transaction
      await supabase.from('data_transactions').insert({
        user_id: user.id,
        phone_number: phone_number,
        plan_id: plan_id,
        plan_name: planName,
        amount: planAmount,
        balance_before: debitResult.balanceBefore,
        balance_after: debitResult.balanceAfter,
        status: 'success',
        reference,
        vendor: 'demo',
        performed_by: user.id
      });

      return new Response(
        JSON.stringify({
          success: true,
          data: {
            reference,
            phone_number,
            plan_name: planName,
            amount: planAmount,
            vendor: 'demo',
            balance_before: debitResult.balanceBefore,
            balance_after: debitResult.balanceAfter
          },
          message: 'Data purchased successfully (Demo)',
        }),
        { status: 200, headers: { ...CORS_HEADERS, 'Content-Type': 'application/json' } }
      );
    }

    const { fetchVendingProvider } = await import("../_shared/vending-settings.ts");
    const preferredProvider = await fetchVendingProvider(supabase, "data_provider");

    // Fetch data plan to determine which provider to use
    const { data: dataPlan, error: planError } = await supabase
      .from('data_plans')
      .select('*')
      .eq('id', plan_id)
      .single();

    if (planError || !dataPlan) {
      console.error('Error fetching data plan:', planError);
      return new Response(
        JSON.stringify({ success: false, error: 'Data plan not found' }),
        { status: 404, headers: { ...CORS_HEADERS, 'Content-Type': 'application/json' } }
      );
    }

    // Use the configured vendor first. Only fall back when that vendor is offline
    // (or misconfigured) and another vendor already has usable codes/secrets for this plan.
    const fallbackOrder = ["mobilenig", "ebills", "smeplug", "flutterwave"];
    const providers = [
      preferredProvider,
      ...fallbackOrder.filter(
        (name) => name !== preferredProvider && dataPlanSupportsProvider(name, dataPlan as Record<string, unknown>),
      ),
    ];

    const providerHandlers: Record<string, (request: Request) => Promise<Response>> = {
      smeplug: purchaseSmeplugData,
      ebills: purchaseEbillsData,
      mobilenig: purchaseMobilenigData,
      flutterwave: purchaseFlutterwaveData,
    };

    let lastError: string | null = null;
    let lastResponse: any = null;
    let primaryError: string | null = null;
    const attempts: Array<{ provider: string; error: string }> = [];

    for (let index = 0; index < providers.length; index++) {
      const provider = providers[index];
      console.log(`Attempting purchase via ${provider}...`);

      try {
        const handler = providerHandlers[provider] || purchaseSmeplugData;
        const response = await handler(new Request("https://netpay.internal/purchase", {
          method: "POST",
          headers: forwardPurchaseHeaders(req, `Bearer ${token}`),
          body: JSON.stringify(forwardPurchaseFields(req, requestBody, {
            phone_number,
            plan_id,
          })),
        }));

        const responseData = await response.json();
        lastResponse = responseData;

        if (response.ok && responseData?.success === true) {
          return new Response(
            JSON.stringify({
              success: true,
              data: {
                ...responseData.data,
                vendor: provider,
              },
              message: responseData.message || 'Data purchased successfully',
            }),
            { status: 200, headers: { ...CORS_HEADERS, 'Content-Type': 'application/json' } }
          );
        }

        if (response.ok && responseData?.pending === true) {
          return new Response(
            JSON.stringify({
              success: false,
              pending: true,
              message: responseData.message || 'Data purchase is being processed',
              data: {
                ...responseData.data,
                vendor: provider,
              },
            }),
            { status: 200, headers: { ...CORS_HEADERS, 'Content-Type': 'application/json' } }
          );
        }

        const errorMessage = String(
          responseData?.error || responseData?.message || `HTTP ${response.status}`,
        );
        attempts.push({ provider, error: errorMessage });
        console.log(`${provider} purchase failed:`, errorMessage);

        if (index === 0) {
          primaryError = errorMessage;
          lastError = errorMessage;
          const allowFallback =
            providers.length > 1 &&
            (isProviderTemporarilyUnavailable(errorMessage, responseData) ||
              isProviderConfigError(errorMessage, responseData));
          if (!allowFallback) break;
          continue;
        }

        // Keep preferred / live vendor errors ahead of fallback config noise.
        if (!isProviderConfigError(errorMessage, responseData)) {
          lastError = errorMessage;
        }
      } catch (error) {
        const errorMessage = error instanceof Error ? error.message : 'Unknown error';
        attempts.push({ provider, error: errorMessage });
        console.error(`Error calling ${provider} function:`, error);
        if (index === 0) {
          primaryError = errorMessage;
          lastError = errorMessage;
          const allowFallback =
            providers.length > 1 &&
            (isProviderTemporarilyUnavailable(errorMessage) || isProviderConfigError(errorMessage));
          if (!allowFallback) break;
        } else if (!isProviderConfigError(errorMessage)) {
          lastError = errorMessage;
        }
      }
    }

    const finalError =
      (lastError && !isProviderConfigError(lastError) ? lastError : null) ||
      primaryError ||
      lastError ||
      'Unable to complete data purchase';

    return new Response(
      JSON.stringify({
        success: false,
        error: finalError,
        details: {
          error_summary: `Attempted ${attempts.map((a) => a.provider).join(' and ') || preferredProvider}, all failed`,
          primary_error: primaryError,
          attempts,
          last_response: lastResponse,
        },
      }),
      { status: 200, headers: { ...CORS_HEADERS, 'Content-Type': 'application/json' } }
    );
  } catch (error) {
    console.error('Error in purchase-data function:', error);
    const message = error instanceof Error ? error.message : 'Unknown error occurred';
    return new Response(
      JSON.stringify({ success: false, error: message }),
      { status: 500, headers: { ...CORS_HEADERS, 'Content-Type': 'application/json' } }
    );
  }
});






