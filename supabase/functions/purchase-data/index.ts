import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import {
  beginBillPurchase,
  forwardPurchaseFields,
  forwardPurchaseHeaders,
  purchaseReference,
  queuedUserId,
} from "../_shared/purchase-queue.ts";

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

    const { data: queuedPlan } = await supabase
      .from('data_plans')
      .select('plan_name, network, validity, price, custom_price, original_price')
      .eq('id', plan_id)
      .maybeSingle();
    const queuedAmount = Number(queuedPlan?.custom_price ?? queuedPlan?.original_price ?? queuedPlan?.price) || 0;
    const { data: queuedProfile } = await supabase
      .from('profiles')
      .select('balance')
      .eq('id', user.id)
      .maybeSingle();
    const queuedBalance = Number(queuedProfile?.balance) || 0;
    if (requestBody.__process_now !== true && (!queuedPlan || queuedAmount <= 0)) {
      return new Response(
        JSON.stringify({ success: false, error: 'Data plan not found' }),
        { status: 404, headers: { ...CORS_HEADERS, 'Content-Type': 'application/json' } }
      );
    }
    const queuedResponse = await beginBillPurchase({
      req,
      supabase,
      userId: user.id,
      service: 'data',
      body: requestBody,
      amount: queuedAmount,
      pendingRow: queuedPlan ? {
        phone_number,
        network: queuedPlan.network || 'DATA',
        plan_name: queuedPlan.plan_name || 'Data',
        plan_validity: queuedPlan.validity || 'N/A',
        balance_before: queuedBalance,
        balance_after: queuedBalance,
        performed_by: user.id,
      } : null,
    });
    if (queuedResponse) return queuedResponse;

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

    // Get data provider preference from app_settings
    const { data: providerSetting } = await supabase
      .from('app_settings')
      .select('setting_value')
      .eq('setting_key', 'data_provider')
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle();

    let preferredProvider = 'smeplug'; // default
    if (providerSetting?.setting_value) {
      const providerValue = typeof providerSetting.setting_value === 'string' 
        ? providerSetting.setting_value 
        : (providerSetting.setting_value as any)?.provider;
      if (providerValue && ['smeplug', 'ebills', 'ebills.africa', 'mobilenig', 'flutterwave'].includes(providerValue.toLowerCase())) {
        preferredProvider = providerValue.toLowerCase();
      }
    }

    // Normalize ebills.africa alias
    if (preferredProvider === 'ebills.africa') {
      preferredProvider = 'ebills';
    }

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

    // Determine which provider to use based on preference and plan availability
    const providers = [preferredProvider];

    const providerFunctionMap: Record<string, string> = {
      smeplug: 'purchase-smeplug-data',
      ebills: 'purchase-ebills-data',
      mobilenig: 'purchase-mobilenig-data',
      flutterwave: 'purchase-flutterwave-data',
    };

    // Try each provider in order
    let lastError: any = null;
    let lastResponse: any = null;

    for (const provider of providers) {
      console.log(`Attempting purchase via ${provider}...`);
      
      try {
        // Call the appropriate purchase function
        const functionName = providerFunctionMap[provider] || 'purchase-smeplug-data';
        const functionUrl = `${supabaseUrl}/functions/v1/${functionName}`;

        const response = await fetch(functionUrl, {
          method: 'POST',
          headers: forwardPurchaseHeaders(req, `Bearer ${token}`),
          body: JSON.stringify(forwardPurchaseFields(req, requestBody, {
            phone_number,
            plan_id,
          })),
        });

        const responseData = await response.json();
        lastResponse = responseData;

        if (response.ok && responseData?.success === true) {
          // Success - return the result
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
        } else if (response.ok && responseData?.pending === true) {
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
        } else if (response.ok && responseData?.success === false) {
          // Provider returned an error - save it and try next provider if available
          lastError = responseData.error || responseData.message || 'Purchase failed';
          console.log(`${provider} purchase failed:`, lastError);
          continue; // Try next provider
        } else {
          // HTTP error
          lastError = responseData?.error || responseData?.message || `HTTP ${response.status}`;
          console.log(`${provider} HTTP error:`, lastError);
          continue; // Try next provider
        }
      } catch (error) {
        lastError = error instanceof Error ? error.message : 'Unknown error';
        console.error(`Error calling ${provider} function:`, error);
        continue; // Try next provider
      }
    }

    // All providers failed
    return new Response(
      JSON.stringify({
        success: false,
        error: lastError || 'All vendors failed to process the purchase',
        details: {
          error_summary: `Attempted ${providers.join(' and ')}, all failed`,
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






