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

    const { phone_number, plan_id, network_id } = await req.json();

    if (!phone_number || !plan_id || !network_id) {
      return new Response(
        JSON.stringify({ success: false, error: 'phone_number, plan_id, and network_id are required' }),
        { status: 400, headers: { ...CORS_HEADERS, 'Content-Type': 'application/json' } }
      );
    }

    // Fetch data plan details from database
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
    const planPrice = Number(dataPlan.price);

    if (balanceBefore < planPrice) {
      return new Response(
        JSON.stringify({ success: false, error: 'Insufficient balance' }),
        { status: 400, headers: { ...CORS_HEADERS, 'Content-Type': 'application/json' } }
      );
    }

    const reference = `DATA-${Date.now()}-${user.id.slice(0, 8)}`;

    console.log(`Purchasing data: ${dataPlan.plan_name} for ${phone_number}`);

    // Purchase data via SMEPLUG API
    const response = await fetch('https://smeplug.ng/api/v1/data/purchase', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${SECRET_KEY}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        network_id: parseInt(network_id),
        plan_id: parseInt(dataPlan.api_code),
        phone: phone_number,
        customer_reference: reference
      }),
    });

    const apiResponse = await response.json();
    console.log('SMEPLUG data purchase response:', JSON.stringify(apiResponse, null, 2));

    if (!response.ok || !apiResponse.success) {
      return new Response(
        JSON.stringify({ 
          success: false, 
          error: apiResponse.message || 'Data purchase failed'
        }),
        { status: response.status, headers: { ...CORS_HEADERS, 'Content-Type': 'application/json' } }
      );
    }

    const balanceAfter = balanceBefore - planPrice;

    // Update user balance
    const { error: updateError } = await supabase
      .from('profiles')
      .update({ balance: balanceAfter })
      .eq('id', user.id);

    if (updateError) {
      console.error('Error updating balance:', updateError);
    }

    // Log transaction
    await supabase.from('data_transactions').insert({
      user_id: user.id,
      phone_number,
      network: network_id,
      plan_name: dataPlan.plan_name,
      plan_validity: dataPlan.validity,
      amount: planPrice,
      balance_before: balanceBefore,
      balance_after: balanceAfter,
      status: 'success',
      reference,
      api_response: apiResponse,
      performed_by: user.id
    });

    await supabase.from('user_transactions').insert({
      user_id: user.id,
      transaction_type: 'data_purchase',
      amount: planPrice,
      balance_before: balanceBefore,
      balance_after: balanceAfter,
      reference,
      description: `Data purchase - ${dataPlan.plan_name} for ${phone_number}`,
      performed_by: user.id
    });

    return new Response(
      JSON.stringify({ 
        success: true,
        message: 'Data purchased successfully',
        data: {
          reference,
          plan_name: dataPlan.plan_name,
          amount: planPrice,
          phone_number,
          network: network_id,
          validity: dataPlan.validity,
          balance_before: balanceBefore,
          balance_after: balanceAfter
        }
      }),
      { status: 200, headers: { ...CORS_HEADERS, 'Content-Type': 'application/json' } }
    );

  } catch (error) {
    console.error('Error in purchase-smeplug-data function:', error);
    
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
