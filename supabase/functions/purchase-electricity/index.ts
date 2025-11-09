import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { debitUserWallet } from "../_shared/wallet.ts";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const mobilenigPublicKey = Deno.env.get('MOBILENIG_PUBLIC_KEY');
    const mobilenigSecretKey = Deno.env.get('MOBILENIG_SECRET_KEY');

    if (!mobilenigPublicKey || !mobilenigSecretKey) {
      console.error('MobileNig credentials not configured');
      return new Response(
        JSON.stringify({ error: 'Service configuration error' }),
        { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const authHeader = req.headers.get('Authorization');
    if (!authHeader) {
      return new Response(
        JSON.stringify({ error: 'Missing authorization header' }),
        { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const supabase = createClient(supabaseUrl, supabaseServiceKey, {
      global: {
        headers: { Authorization: authHeader },
      },
    });

    const { data: { user }, error: userError } = await supabase.auth.getUser();
    if (userError || !user) {
      console.error('Authentication error:', userError);
      return new Response(
        JSON.stringify({ error: 'Unauthorized' }),
        { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const rawBody = await req.json();
    const { meter_number, provider, meter_type, amount, phone } = rawBody ?? {};

    console.log('Incoming electricity purchase payload:', JSON.stringify(rawBody, null, 2));

    const sanitizedMeter =
      typeof meter_number === 'string' ? meter_number.replace(/\s+/g, '').trim() : '';
    const sanitizedPhone =
      typeof phone === 'string' ? phone.replace(/\s+/g, '').trim() : '';
    const providerCode = typeof provider === 'string' ? provider.trim().toUpperCase() : '';
    const meterKind = typeof meter_type === 'string' ? meter_type.trim().toLowerCase() : '';
    const purchaseAmount = Number(amount);
    const requestedCustomerName =
      typeof customer_name === 'string' ? customer_name.trim() : '';
    const requestedCustomerAddress =
      typeof customer_address === 'string' ? customer_address.trim() : '';

    if (!sanitizedMeter || !providerCode || !meterKind || !sanitizedPhone || !Number.isFinite(purchaseAmount)) {
      return new Response(
        JSON.stringify({
          success: false,
          error: 'meter_number, provider, meter_type, phone, and amount are required',
          details: {
            meter_number: Boolean(sanitizedMeter),
            provider: providerCode,
            meter_type: meterKind,
            phone: Boolean(sanitizedPhone),
            amount: purchaseAmount,
          },
        }),
        { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    if (purchaseAmount <= 0) {
      return new Response(
        JSON.stringify({ success: false, error: 'Invalid amount' }),
        { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    console.log('Processing electricity purchase:', {
      user_id: user.id,
      meter_number: sanitizedMeter,
      provider: providerCode,
      meter_type: meterKind,
      amount: purchaseAmount,
    });

    // Get user balance
    const { data: profile, error: profileError } = await supabase
      .from('profiles')
      .select('balance')
      .eq('id', user.id)
      .single();

    if (profileError || !profile) {
      throw new Error('Failed to fetch user profile');
    }

    if (Number(profile.balance) < purchaseAmount) {
      return new Response(
        JSON.stringify({ success: false, error: 'Insufficient balance' }),
        { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Map provider to service IDs
    const providerServiceMap: { [key: string]: { prepaid: string; postpaid: string } } = {
      IKEJA: { prepaid: 'AMA', postpaid: 'AMB' },
      IKEDC: { prepaid: 'AMA', postpaid: 'AMB' },
      EKO: { prepaid: 'ANA', postpaid: 'ANB' },
      EKEDC: { prepaid: 'ANA', postpaid: 'ANB' },
      ABUJA: { prepaid: 'AHB', postpaid: 'AHA' },
      AEDC: { prepaid: 'AHB', postpaid: 'AHA' },
      KADUNA: { prepaid: 'AGB', postpaid: 'AGA' },
      KAEDCO: { prepaid: 'AGB', postpaid: 'AGA' },
      IBADAN: { prepaid: 'AEA', postpaid: 'AEB' },
      IBEDC: { prepaid: 'AEA', postpaid: 'AEB' },
      KANO: { prepaid: 'AFA', postpaid: 'AFB' },
      KEDCO: { prepaid: 'AFA', postpaid: 'AFB' },
      PORTHARCOURT: { prepaid: 'ADB', postpaid: 'ADA' },
      PHEDC: { prepaid: 'ADB', postpaid: 'ADA' },
      JOS: { prepaid: 'ACB', postpaid: 'ACA' },
      JED: { prepaid: 'ACB', postpaid: 'ACA' },
    };

    const serviceIds = providerServiceMap[providerCode];
    if (!serviceIds) {
      return new Response(
        JSON.stringify({
          success: false,
          error: 'Invalid provider',
          details: { provider: providerCode },
        }),
        { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const serviceId = meterKind === 'postpaid' ? serviceIds.postpaid : serviceIds.prepaid;
    const reference = `ELEC-${Date.now()}-${user.id.substring(0, 8)}`;

    // Purchase electricity via MobileNig
    const transId = Date.now().toString();

    const purchasePayload: Record<string, unknown> = {
      service_id: serviceId,
      trans_id: Number(transId),
      customerReference: sanitizedMeter,
      amount: purchaseAmount,
      customerName: requestedCustomerName || sanitizedMeter,
      customerAddress: requestedCustomerAddress || 'Not Provided',
    };

    if (sanitizedPhone) {
      purchasePayload.phone = sanitizedPhone;
    }

    const purchaseResponse = await fetch('https://enterprise.mobilenig.com/api/v2/services/', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${mobilenigSecretKey}`,
      },
      body: JSON.stringify(purchasePayload),
    });

    const purchaseText = await purchaseResponse.text();
    let purchaseData;
    try {
      purchaseData = JSON.parse(purchaseText);
    } catch (parseError) {
      console.error('Failed to parse MobileNig response:', purchaseText);
      return new Response(
        JSON.stringify({
          success: false,
          error: `Invalid response from electricity provider: ${purchaseText.substring(0, 120)}`,
        }),
        { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }
    console.log('Purchase response:', JSON.stringify(purchaseData, null, 2));

    if (!purchaseResponse.ok || purchaseData.statusCode !== '200') {
      const providerError =
        purchaseData.message ||
        purchaseData.error ||
        purchaseData.details?.message ||
        'Purchase failed';
      return new Response(
        JSON.stringify({
          success: false,
          error: providerError,
          details: purchaseData,
        }),
        { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const providerCustomerAddress =
      purchaseData.details?.details?.customerAddress ||
      purchaseData.details?.customerAddress ||
      requestedCustomerAddress ||
      '';

    const formattedAmount = `₦${purchaseAmount.toFixed(2)}`;
    const meterLabel = meterKind ? meterKind.toUpperCase() : 'METER';

    const debitResult = await debitUserWallet({
      supabase,
      userId: user.id,
      amount: purchaseAmount,
      transactionType: 'electricity',
      description: `Electricity purchase - ${providerCode} (${meterKind}) - ${sanitizedMeter}`,
      reference,
      performedBy: user.id,
      balanceBefore: Number(profile.balance) || 0,
      notification: {
        title: 'Electricity purchase successful',
        message: `${formattedAmount} electricity token purchased for meter ${sanitizedMeter} (${meterLabel}) on ${providerCode}. Reference: ${reference}.`,
      },
    });

    // Record transaction in electricity_transactions
    const { error: elecTxnError } = await supabase
      .from('electricity_transactions')
      .insert({
        user_id: user.id,
        amount: purchaseAmount,
        balance_before: debitResult.balanceBefore,
        balance_after: debitResult.balanceAfter,
        meter_number: sanitizedMeter,
        provider: providerCode,
        meter_type: meterKind,
        customer_name:
          purchaseData.details?.customerName ||
          purchaseData.data?.customerName ||
          requestedCustomerName ||
          '',
        token:
          purchaseData.details?.details?.token ||
          purchaseData.details?.details?.energyToken ||
          purchaseData.data?.token ||
          purchaseData.details?.creditToken ||
          null,
        status: 'completed',
        reference: reference,
        api_response: purchaseData,
      });

    if (elecTxnError) {
      console.error('Failed to record electricity transaction:', elecTxnError);
    }

    return new Response(
      JSON.stringify({
        success: true,
        data: {
          reference: reference,
          amount: purchaseAmount,
          balance_after: debitResult.balanceAfter,
          trans_id: purchaseData.details?.trans_id || transId,
          token:
            purchaseData.details?.details?.token ||
            purchaseData.details?.details?.energyToken ||
            purchaseData.data?.token ||
            purchaseData.details?.creditToken ||
            null,
          meter_number: sanitizedMeter,
          provider: providerCode,
          meter_type: meterKind,
          customer_name:
            purchaseData.details?.customerName ||
            purchaseData.data?.customerName ||
            requestedCustomerName ||
            '',
          customer_address: providerCustomerAddress,
        }
      }),
      { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );

  } catch (error) {
    console.error('Error in purchase-electricity function:', error);
    return new Response(
      JSON.stringify({
        success: false,
        error: 'Purchase failed',
        details: error instanceof Error ? error.message : 'Unknown error'
      }),
      { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});
