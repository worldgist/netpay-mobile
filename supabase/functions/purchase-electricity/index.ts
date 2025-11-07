import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

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

    const { meter_number, provider, meter_type, amount, phone } = await req.json();

    if (!meter_number || !provider || !meter_type || !amount || !phone) {
      return new Response(
        JSON.stringify({ error: 'All fields are required' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    console.log('Processing electricity purchase:', { user_id: user.id, meter_number, provider, meter_type, amount });

    // Get user balance
    const { data: profile, error: profileError } = await supabase
      .from('profiles')
      .select('balance')
      .eq('id', user.id)
      .single();

    if (profileError || !profile) {
      throw new Error('Failed to fetch user profile');
    }

    if (profile.balance < amount) {
      return new Response(
        JSON.stringify({ error: 'Insufficient balance' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Map provider to service IDs
    const providerServiceMap: { [key: string]: { prepaid: string; postpaid: string } } = {
      'IKEDC': { prepaid: 'AMA', postpaid: 'AMB' },
      'EKEDC': { prepaid: 'ANA', postpaid: 'ANB' },
      'AEDC': { prepaid: 'AHB', postpaid: 'AHA' },
      'KAEDCO': { prepaid: 'AGB', postpaid: 'AGA' },
      'IBEDC': { prepaid: 'AEA', postpaid: 'AEB' },
      'KEDCO': { prepaid: 'AFA', postpaid: 'AFB' },
      'PHEDC': { prepaid: 'ADB', postpaid: 'ADA' },
      'JED': { prepaid: 'ACB', postpaid: 'ACA' },
      'BEDC': { prepaid: 'ADA', postpaid: 'ADB' },
      'YEDC': { prepaid: 'ALA', postpaid: 'ALB' },
    };

    const serviceIds = providerServiceMap[provider.toUpperCase()];
    if (!serviceIds) {
      return new Response(
        JSON.stringify({ error: 'Invalid provider' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const serviceId = meter_type === 'prepaid' ? serviceIds.prepaid : serviceIds.postpaid;
    const reference = `ELEC-${Date.now()}-${user.id.substring(0, 8)}`;

    // Purchase electricity via MobileNig
    const purchaseResponse = await fetch('https://enterprise.mobilenig.com/api/v2/services/purchase', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${mobilenigSecretKey}`,
      },
      body: JSON.stringify({
        service_id: serviceId,
        account_number: meter_number,
        amount: amount,
        phone: phone,
        reference: reference,
      }),
    });

    const purchaseData = await purchaseResponse.json();
    console.log('Purchase response:', purchaseData);

    if (!purchaseResponse.ok || purchaseData.statusCode !== '200') {
      throw new Error(purchaseData.message || 'Purchase failed');
    }

    // Debit user balance
    const newBalance = profile.balance - amount;
    const { error: updateError } = await supabase
      .from('profiles')
      .update({ balance: newBalance })
      .eq('id', user.id);

    if (updateError) {
      console.error('Failed to update balance:', updateError);
      throw new Error('Failed to update balance');
    }

    // Record transaction in electricity_transactions
    const { error: elecTxnError } = await supabase
      .from('electricity_transactions')
      .insert({
        user_id: user.id,
        amount: amount,
        balance_before: profile.balance,
        balance_after: newBalance,
        meter_number: meter_number,
        provider: provider,
        meter_type: meter_type,
        customer_name: purchaseData.data?.customerName || '',
        token: purchaseData.data?.token || purchaseData.details?.creditToken || null,
        status: 'completed',
        reference: reference,
        api_response: purchaseData,
      });

    if (elecTxnError) {
      console.error('Failed to record electricity transaction:', elecTxnError);
    }

    // Record transaction in user_transactions for history
    const { error: txnError } = await supabase
      .from('user_transactions')
      .insert({
        user_id: user.id,
        transaction_type: 'electricity',
        amount: -amount,
        balance_before: profile.balance,
        balance_after: newBalance,
        reference: reference,
        description: `Electricity purchase - ${provider} (${meter_type}) - ${meter_number}`,
      });

    if (txnError) {
      console.error('Failed to record transaction:', txnError);
    }

    return new Response(
      JSON.stringify({
        success: true,
        data: {
          reference: reference,
          amount: amount,
          balance_after: newBalance,
          token: purchaseData.data?.token || purchaseData.details?.creditToken || null,
          meter_number: meter_number,
          provider: provider,
          meter_type: meter_type,
          customer_name: purchaseData.data?.customerName || '',
        }
      }),
      { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );

  } catch (error) {
    console.error('Error in purchase-electricity function:', error);
    return new Response(
      JSON.stringify({
        error: 'Purchase failed',
        details: error instanceof Error ? error.message : 'Unknown error'
      }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});
