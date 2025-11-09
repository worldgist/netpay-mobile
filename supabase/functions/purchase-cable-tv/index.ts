import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { debitUserWallet } from "../_shared/wallet.ts";

const CORS_HEADERS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: CORS_HEADERS });
  }

  try {
    const MOBILENIG_PUBLIC_KEY = Deno.env.get('MOBILENIG_PUBLIC_KEY');
    
    if (!MOBILENIG_PUBLIC_KEY) {
      throw new Error('MOBILENIG_PUBLIC_KEY not configured');
    }

    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    // Get authenticated user
    const authHeader = req.headers.get('Authorization');
    if (!authHeader) {
      return new Response(
        JSON.stringify({ success: false, error: 'Unauthorized' }),
        { status: 401, headers: { ...CORS_HEADERS, 'Content-Type': 'application/json' } }
      );
    }

    const token = authHeader.replace('Bearer ', '');
    const { data: { user }, error: authError } = await supabase.auth.getUser(token);
    
    if (authError || !user) {
      return new Response(
        JSON.stringify({ success: false, error: 'Unauthorized' }),
        { status: 401, headers: { ...CORS_HEADERS, 'Content-Type': 'application/json' } }
      );
    }

    const body = await req.json();
    const { card_number, plan_id, provider } = body;

    if (!card_number || !plan_id || !provider) {
      return new Response(
        JSON.stringify({ success: false, error: 'Missing required fields' }),
        { status: 400, headers: { ...CORS_HEADERS, 'Content-Type': 'application/json' } }
      );
    }

    // Get plan details
    const { data: plan, error: planError } = await supabase
      .from('cable_tv_plans')
      .select('*')
      .eq('id', plan_id)
      .single();

    if (planError || !plan) {
      return new Response(
        JSON.stringify({ success: false, error: 'Plan not found' }),
        { status: 404, headers: { ...CORS_HEADERS, 'Content-Type': 'application/json' } }
      );
    }

    // Get user balance
    const { data: profile, error: profileError } = await supabase
      .from('profiles')
      .select('balance')
      .eq('id', user.id)
      .single();

    if (profileError || !profile) {
      return new Response(
        JSON.stringify({ success: false, error: 'User profile not found' }),
        { status: 404, headers: { ...CORS_HEADERS, 'Content-Type': 'application/json' } }
      );
    }

    const effectivePrice = plan.custom_price || plan.original_price || plan.price;

    if (profile.balance < effectivePrice) {
      return new Response(
        JSON.stringify({ success: false, error: 'Insufficient balance' }),
        { status: 400, headers: { ...CORS_HEADERS, 'Content-Type': 'application/json' } }
      );
    }

    // Map provider to service ID
    const serviceIdMap: Record<string, string> = {
      'GOTV': 'AKA',
      'STARTIMES': 'AKB',
      'DSTV': 'AKC'
    };

    const service_id = serviceIdMap[provider.toUpperCase()];
    
    if (!service_id) {
      return new Response(
        JSON.stringify({ success: false, error: 'Invalid provider' }),
        { status: 400, headers: { ...CORS_HEADERS, 'Content-Type': 'application/json' } }
      );
    }

    const reference = `CABLE-${Date.now()}-${user.id.substring(0, 8)}`;

    // Call MobileNig API
    const apiResponse = await fetch('https://enterprise.mobilenig.com/api/v2/services/purchase', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${MOBILENIG_PUBLIC_KEY}`,
      },
      body: JSON.stringify({
        service_id: service_id,
        smart_card_number: card_number,
        product_code: plan.api_code,
        reference: reference
      }),
    });

    const apiResult = await apiResponse.json();
    
    console.log('MobileNig API response:', JSON.stringify(apiResult, null, 2));

    if (!apiResponse.ok || apiResult.statusCode !== '200') {
      // Create failed transaction record
      await supabase.from('user_transactions').insert({
        user_id: user.id,
        transaction_type: 'cable_tv',
        amount: effectivePrice,
        balance_before: profile.balance,
        balance_after: profile.balance,
        description: `Failed: ${provider} - ${plan.package_name} - ${card_number}`,
        reference: reference,
      });

      return new Response(
        JSON.stringify({ 
          success: false, 
          error: apiResult.message || 'Cable TV purchase failed',
          details: apiResult
        }),
        { status: 400, headers: { ...CORS_HEADERS, 'Content-Type': 'application/json' } }
      );
    }

    const formattedAmount = `₦${effectivePrice.toFixed(2)}`;

    const debitResult = await debitUserWallet({
      supabase,
      userId: user.id,
      amount: effectivePrice,
      transactionType: 'cable_tv',
      description: `${provider} - ${plan.package_name} - ${card_number}`,
      reference,
      performedBy: user.id,
      balanceBefore: Number(profile.balance) || 0,
      notification: {
        title: 'Cable TV purchase successful',
        message: `${formattedAmount} paid for ${provider} (${plan.package_name}) smart card ${card_number}. Reference: ${reference}.`,
      },
    });

    return new Response(
      JSON.stringify({ 
        success: true,
        data: {
          reference: reference,
          amount: effectivePrice,
          balance_after: debitResult.balanceAfter,
          provider: provider,
          package: plan.package_name,
          card_number: card_number,
          api_response: apiResult
        }
      }),
      { status: 200, headers: { ...CORS_HEADERS, 'Content-Type': 'application/json' } }
    );

  } catch (error) {
    console.error('Error in purchase-cable-tv function:', error);
    
    return new Response(
      JSON.stringify({ 
        success: false, 
        error: error instanceof Error ? error.message : 'Unknown error occurred'
      }),
      { status: 500, headers: { ...CORS_HEADERS, 'Content-Type': 'application/json' } }
    );
  }
});
