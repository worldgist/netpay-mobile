import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import {
  getEBillsToken,
  getEBillsServiceId,
  purchaseEBillsCableTV,
} from "../_shared/ebills-api.ts";
import { debitUserWallet } from "../_shared/wallet.ts";
import { sendPushNotification } from "../_shared/push-notifications.ts";

const CORS_HEADERS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
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
    const { data: { user }, error: authError } = await supabase.auth.getUser(token);

    if (authError || !user) {
      return new Response(
        JSON.stringify({ success: false, error: 'Unauthorized' }),
        { status: 401, headers: { ...CORS_HEADERS, 'Content-Type': 'application/json' } }
      );
    }

    let body: Record<string, unknown> = {};
    try {
      const bodyText = await req.text();
      if (bodyText && bodyText.trim().length > 0) {
        body = JSON.parse(bodyText);
      }
    } catch {
      return new Response(
        JSON.stringify({ success: false, error: 'Invalid request body format' }),
        { status: 400, headers: { ...CORS_HEADERS, 'Content-Type': 'application/json' } }
      );
    }

    const card_number = String(body.card_number || body.billersCode || body.smartcard_number || '').trim();
    const provider = String(body.provider || '').trim();
    const customer_name = String(body.customer_name || '').trim();
    const package_name = String(body.package_name || `${provider} Package`).trim();
    const api_code = String(body.api_code || body.variation_code || body.plan_id || '').trim();
    const parsedPrice = typeof body.price === 'string' ? parseFloat(body.price) : Number(body.price || body.amount || 0);

    if (!card_number || !provider) {
      return new Response(
        JSON.stringify({ success: false, error: 'Missing required fields: card_number and provider' }),
        { status: 400, headers: { ...CORS_HEADERS, 'Content-Type': 'application/json' } }
      );
    }

    if (!api_code) {
      return new Response(
        JSON.stringify({ success: false, error: 'Package variation ID (api_code) is required' }),
        { status: 400, headers: { ...CORS_HEADERS, 'Content-Type': 'application/json' } }
      );
    }

    if (!parsedPrice || parsedPrice <= 0 || Number.isNaN(parsedPrice)) {
      return new Response(
        JSON.stringify({ success: false, error: 'Plan price is required and must be a valid number' }),
        { status: 400, headers: { ...CORS_HEADERS, 'Content-Type': 'application/json' } }
      );
    }

    const CHARGE_FEE_RATE = 0.02;
    const purchaseAmount = parsedPrice;
    const chargeFee = purchaseAmount * CHARGE_FEE_RATE;
    const totalAmount = purchaseAmount + chargeFee;

    const { data: profile, error: profileError } = await supabase
      .from('profiles')
      .select('balance, email')
      .eq('id', user.id)
      .single();

    if (profileError || !profile) {
      return new Response(
        JSON.stringify({ success: false, error: 'User profile not found' }),
        { status: 404, headers: { ...CORS_HEADERS, 'Content-Type': 'application/json' } }
      );
    }

    const isDemoUser = profile.email === 'demo@netppay.com';
    const balanceBefore = Number(profile.balance) || 0;

    if (balanceBefore < totalAmount) {
      return new Response(
        JSON.stringify({ success: false, error: 'Insufficient balance' }),
        { status: 400, headers: { ...CORS_HEADERS, 'Content-Type': 'application/json' } }
      );
    }

    const reference = `CABLE-EBILLS-${Date.now()}-${user.id.substring(0, 8)}`;
    const serviceId = getEBillsServiceId(provider);

    if (isDemoUser) {
      const debitResult = await debitUserWallet({
        supabase,
        userId: user.id,
        amount: totalAmount,
        transactionType: 'cable_purchase',
        description: `Cable TV purchase (eBills Demo) - ${package_name}`,
        reference,
        performedBy: user.id,
        balanceBefore,
        notification: {
          title: 'Cable TV purchase successful (Demo)',
          message: `${package_name} subscription purchased. Reference: ${reference}.`,
        },
      });

      await supabase.from('cable_tv_transactions').insert({
        user_id: user.id,
        smartcard_number: card_number,
        provider,
        plan_name: package_name,
        amount: totalAmount,
        purchase_amount: purchaseAmount,
        charge_fee: chargeFee,
        balance_before: debitResult.balanceBefore,
        balance_after: debitResult.balanceAfter,
        status: 'success',
        reference,
        performed_by: user.id,
      });

      return new Response(
        JSON.stringify({
          success: true,
          data: {
            reference,
            smartcard_number: card_number,
            provider,
            package_name,
            amount: totalAmount,
            purchase_amount: purchaseAmount,
            charge_fee: chargeFee,
            vendor: 'ebills',
            balance_before: debitResult.balanceBefore,
            balance_after: debitResult.balanceAfter,
          },
          message: 'Cable TV subscription purchased successfully (Demo)',
        }),
        { status: 200, headers: { ...CORS_HEADERS, 'Content-Type': 'application/json' } }
      );
    }

    const ebillsToken = await getEBillsToken();
    const purchaseResult = await purchaseEBillsCableTV(
      ebillsToken,
      card_number,
      serviceId,
      api_code,
      purchaseAmount,
    );

    const debitResult = await debitUserWallet({
      supabase,
      userId: user.id,
      amount: totalAmount,
      transactionType: 'purchase',
      description: `${provider} - ${package_name} - ${card_number}`,
      reference,
      performedBy: user.id,
      balanceBefore,
      notification: {
        title: 'Cable TV purchase successful',
        message: `₦${totalAmount.toFixed(2)} paid for ${provider} (${package_name}) smart card ${card_number}. Reference: ${reference}.`,
      },
    });

    await supabase.from('cable_tv_transactions').insert({
      user_id: user.id,
      smartcard_number: card_number,
      provider,
      plan_name: package_name,
      customer_name: customer_name || purchaseResult.data?.customer_name || null,
      amount: totalAmount,
      purchase_amount: purchaseAmount,
      charge_fee: chargeFee,
      balance_before: debitResult.balanceBefore,
      balance_after: debitResult.balanceAfter,
      status: purchaseResult.data?.status || 'success',
      reference,
      api_response: purchaseResult,
      performed_by: user.id,
    });

    await sendPushNotification(
      supabase,
      user.id,
      'Cable TV Subscription Successful',
      `₦${totalAmount.toFixed(2)} ${package_name} subscription successful for ${provider} (Card: ${card_number}). Your new balance is ₦${debitResult.balanceAfter.toFixed(2)}.`,
      {
        type: 'cable_tv_subscription',
        reference,
        amount: totalAmount,
        provider,
        package_name,
        card_number,
      }
    );

    return new Response(
      JSON.stringify({
        success: true,
        data: {
          reference,
          amount: totalAmount,
          purchase_amount: purchaseAmount,
          charge_fee: chargeFee,
          balance_after: debitResult.balanceAfter,
          provider,
          package: package_name,
          card_number,
          customer_name: customer_name || purchaseResult.data?.customer_name,
          status: purchaseResult.data?.status,
          vendor: 'ebills',
          api_response: purchaseResult.data,
        },
      }),
      { status: 200, headers: { ...CORS_HEADERS, 'Content-Type': 'application/json' } }
    );
  } catch (error) {
    console.error('purchase-ebills-cable error:', error);
    return new Response(
      JSON.stringify({
        success: false,
        error: error instanceof Error ? error.message : 'Cable TV purchase failed',
      }),
      { status: 500, headers: { ...CORS_HEADERS, 'Content-Type': 'application/json' } }
    );
  }
});
