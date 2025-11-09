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
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const mobilenigPublicKey = Deno.env.get('MOBILENIG_PUBLIC_KEY');
    
    if (!mobilenigPublicKey) {
      throw new Error('MOBILENIG_PUBLIC_KEY not configured');
    }

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

    const { phone_number, exam_type, service_id, api_code, amount } = await req.json();

    if (!phone_number || !exam_type || !service_id || !api_code || !amount) {
      return new Response(
        JSON.stringify({ success: false, error: 'phone_number, exam_type, service_id, api_code, and amount are required' }),
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

    const reference = `EDU-${Date.now()}-${user.id.slice(0, 8)}`;

    console.log(`Purchasing education service: ${exam_type} for ${phone_number}, amount: ${amount}`);

    // Purchase education service via MobileNig API
    const response = await fetch('https://mobilenig.com/API/services/exec_purchase', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${mobilenigPublicKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        serviceID: api_code,
        phone: phone_number,
        amount: purchaseAmount,
        request_id: reference
      }),
    });

    const responseText = await response.text();
    let apiResponse;
    try {
      apiResponse = JSON.parse(responseText);
    } catch (parseError) {
      console.error('Failed to parse MobileNig response:', responseText);
      return new Response(
        JSON.stringify({ 
          success: false, 
          error: `Invalid response from education provider: ${responseText.substring(0, 100)}`
        }),
        { status: 500, headers: { ...CORS_HEADERS, 'Content-Type': 'application/json' } }
      );
    }
    
    console.log('MobileNig education purchase response:', JSON.stringify(apiResponse, null, 2));

    if (!response.ok || apiResponse.status !== 'success') {
      const errorMessage = apiResponse.message || apiResponse.error || 'Education service purchase failed';
      console.error('MobileNig API error:', errorMessage, 'Full response:', apiResponse);
      return new Response(
        JSON.stringify({ 
          success: false, 
          error: errorMessage,
          details: apiResponse
        }),
        { status: response.status || 400, headers: { ...CORS_HEADERS, 'Content-Type': 'application/json' } }
      );
    }

    const formattedAmount = `₦${purchaseAmount.toFixed(2)}`;

    const debitResult = await debitUserWallet({
      supabase,
      userId: user.id,
      amount: purchaseAmount,
      transactionType: 'education_purchase',
      description: `Education service purchase - ${exam_type}`,
      reference,
      performedBy: user.id,
      balanceBefore,
      notification: {
        title: 'Education purchase successful',
        message: `${formattedAmount} paid for ${exam_type} education service using phone ${phone_number}. Reference: ${reference}.`,
      },
    });

    await supabase.from('education_transactions').insert({
      user_id: user.id,
      phone_number,
      exam_type,
      service_id,
      amount: purchaseAmount,
      balance_before: debitResult.balanceBefore,
      balance_after: debitResult.balanceAfter,
      status: 'success',
      reference,
      api_response: apiResponse,
      performed_by: user.id
    });

    return new Response(
      JSON.stringify({ 
        success: true,
        message: 'Education service purchased successfully',
        data: {
          reference,
          amount: purchaseAmount,
          phone_number,
          exam_type,
          balance_before: debitResult.balanceBefore,
          balance_after: debitResult.balanceAfter
        }
      }),
      { status: 200, headers: { ...CORS_HEADERS, 'Content-Type': 'application/json' } }
    );

  } catch (error) {
    console.error('Error in purchase-education function:', error);
    
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

