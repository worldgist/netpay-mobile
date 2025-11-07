import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const CORS_HEADERS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: CORS_HEADERS });
  }

  try {
    const SECRET_KEY = Deno.env.get('SMEPLUG_SECRET_KEY');
    
    if (!SECRET_KEY) {
      throw new Error('SMEPLUG_SECRET_KEY not configured');
    }

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

    const { phone_number, amount, network_id } = await req.json();

    if (!phone_number || !amount || !network_id) {
      return new Response(
        JSON.stringify({ success: false, error: 'phone_number, amount, and network_id are required' }),
        { status: 400, headers: { ...CORS_HEADERS, 'Content-Type': 'application/json' } }
      );
    }

    // Fetch user's balance
    const { data: profile, error: profileError } = await supabase
      .from('profiles')
      .select('balance, full_name, email')
      .eq('id', user.id)
      .single();

    if (profileError || !profile) {
      console.error('Error fetching user profile:', profileError);
      return new Response(
        JSON.stringify({ success: false, error: 'Failed to fetch user profile' }),
        { status: 500, headers: { ...CORS_HEADERS, 'Content-Type': 'application/json' } }
      );
    }

    const balanceBefore = Number(profile.balance) || 0;
    const purchaseAmount = Number(amount);

    if (balanceBefore < purchaseAmount) {
      return new Response(
        JSON.stringify({ success: false, error: 'Insufficient balance' }),
        { status: 400, headers: { ...CORS_HEADERS, 'Content-Type': 'application/json' } }
      );
    }

    const reference = `AIRTIME-${Date.now()}-${user.id.slice(0, 8)}`;

    console.log(`Purchasing airtime: ${amount} for ${phone_number} on network ${network_id}`);

    // Purchase airtime via SMEPLUG API
    const response = await fetch('https://smeplug.ng/api/v1/airtime/purchase', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${SECRET_KEY}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        network_id: parseInt(network_id),
        phone: phone_number,
        amount: purchaseAmount,
        customer_reference: reference
      }),
    });

    const responseText = await response.text();
    let apiResponse;
    try {
      apiResponse = JSON.parse(responseText);
    } catch (parseError) {
      console.error('Failed to parse SMEPLUG response:', responseText);
      return new Response(
        JSON.stringify({ 
          success: false, 
          error: `Invalid response from airtime provider: ${responseText.substring(0, 100)}`
        }),
        { status: 500, headers: { ...CORS_HEADERS, 'Content-Type': 'application/json' } }
      );
    }
    
    console.log('SMEPLUG airtime purchase response:', JSON.stringify(apiResponse, null, 2));

    if (!response.ok || !apiResponse.success) {
      const errorMessage = apiResponse.message || apiResponse.error || apiResponse.data?.message || 'Airtime purchase failed';
      console.error('SMEPLUG API error:', errorMessage, 'Full response:', apiResponse);
      return new Response(
        JSON.stringify({ 
          success: false, 
          error: errorMessage,
          details: apiResponse
        }),
        { status: response.status || 400, headers: { ...CORS_HEADERS, 'Content-Type': 'application/json' } }
      );
    }

    const balanceAfter = balanceBefore - purchaseAmount;

    // Update user balance
    const { error: updateError } = await supabase
      .from('profiles')
      .update({ balance: balanceAfter })
      .eq('id', user.id);

    if (updateError) {
      console.error('Error updating balance:', updateError);
    }

    // Log transaction
    await supabase.from('airtime_transactions').insert({
      user_id: user.id,
      phone_number,
      network: network_id,
      amount: purchaseAmount,
      balance_before: balanceBefore,
      balance_after: balanceAfter,
      status: 'success',
      reference,
      api_response: apiResponse,
      performed_by: user.id
    });

    await supabase.from('user_transactions').insert({
      user_id: user.id,
      transaction_type: 'airtime_purchase',
      amount: purchaseAmount,
      balance_before: balanceBefore,
      balance_after: balanceAfter,
      reference,
      description: `Airtime purchase - ${phone_number}`,
      performed_by: user.id
    });

    return new Response(
      JSON.stringify({ 
        success: true,
        message: 'Airtime purchased successfully',
        data: {
          reference,
          amount: purchaseAmount,
          phone_number,
          network: network_id,
          balance_before: balanceBefore,
          balance_after: balanceAfter
        }
      }),
      { status: 200, headers: { ...CORS_HEADERS, 'Content-Type': 'application/json' } }
    );

  } catch (error) {
    console.error('Error in purchase-smeplug-airtime function:', error);
    
    return new Response(
      JSON.stringify({ 
        success: false, 
        error: error instanceof Error ? error.message : 'Unknown error occurred'
      }),
      { 
        status: 500, 
        headers: { ...CORS_HEADERS, 'Content-Type': 'application/json' } 
      }
    );
  }
});
