import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
};

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { status: 204, headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get('SUPABASE_URL');
    const supabaseKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
    const payvesselApiKey = Deno.env.get('PAYVESSEL_API_KEY');
    const payvesselSecretKey = Deno.env.get('PAYVESSEL_SECRET_KEY');
    const payvesselBusinessId = Deno.env.get('PAYVESSEL_BUSINESS_ID');

    if (!supabaseUrl || !supabaseKey) {
      console.error('Supabase configuration missing:', { 
        hasUrl: !!supabaseUrl, 
        hasKey: !!supabaseKey 
      });
      return new Response(
        JSON.stringify({ 
          success: false,
          error: 'Supabase configuration error. SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY must be set.',
          details: 'Please ensure the Edge Function has access to Supabase environment variables.'
        }),
        { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    if (!payvesselApiKey || !payvesselSecretKey || !payvesselBusinessId) {
      console.error('PayVessel credentials not configured:', {
        hasApiKey: !!payvesselApiKey,
        hasSecretKey: !!payvesselSecretKey,
        hasBusinessId: !!payvesselBusinessId
      });
      return new Response(
        JSON.stringify({ 
          success: false,
          error: 'PayVessel credentials not configured. Please set PAYVESSEL_API_KEY, PAYVESSEL_SECRET_KEY, and PAYVESSEL_BUSINESS_ID environment variables.'
        }),
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

    const supabase = createClient(supabaseUrl, supabaseKey);
    const token = authHeader.replace('Bearer ', '');
    const { data: { user }, error: userError } = await supabase.auth.getUser(token);
    if (userError || !user) {
      console.error('Authentication error:', userError);
      return new Response(
        JSON.stringify({ error: 'Unauthorized' }),
        { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const { data: roleData, error: roleError } = await supabase
      .from('user_roles')
      .select('role')
      .eq('user_id', user.id)
      .eq('role', 'admin')
      .maybeSingle();

    if (roleError) {
      console.error('Error checking user role:', roleError);
      return new Response(
        JSON.stringify({ error: 'Error verifying permissions' }),
        { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    if (!roleData) {
      return new Response(
        JSON.stringify({ error: 'Unauthorized - Admin access required' }),
        { status: 403, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    console.log('Fetching PayVessel account balance...');

    // Fetch balance from PayVessel API
    // Note: Adjust the endpoint based on PayVessel API documentation
    const balanceResponse = await fetch('https://api.payvessel.com/pms/api/external/account/balance', {
      method: 'GET',
      headers: {
        'api-key': payvesselApiKey,
        'api-secret': `Bearer ${payvesselSecretKey}`,
        'Content-Type': 'application/json',
      },
    });

    const responseText = await balanceResponse.text();
    let balanceData;
    
    try {
      balanceData = JSON.parse(responseText);
    } catch (parseError) {
      console.error('Failed to parse PayVessel response:', responseText);
      return new Response(
        JSON.stringify({ 
          success: false,
          error: `Invalid response from PayVessel API: ${responseText.substring(0, 200)}`
        }),
        { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    console.log('PayVessel balance response:', balanceData);

    // Check if API returned an error
    if (!balanceResponse.ok || balanceData.success === false) {
      const errorMsg = balanceData.message || balanceData.error || 'Failed to fetch balance from PayVessel';
      console.error('PayVessel API error:', errorMsg, balanceData);
      return new Response(
        JSON.stringify({ 
          success: false,
          error: errorMsg,
          details: balanceData
        }),
        { status: balanceResponse.status || 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const responseData = {
      success: true,
      balance: {
        amount: parseFloat(balanceData.balance || balanceData.availableBalance || balanceData.data?.balance || '0'),
        currency: balanceData.currency || balanceData.data?.currency || 'NGN',
      },
      account: {
        businessName: balanceData.businessName || balanceData.data?.businessName || 'PayVessel Account',
        businessId: payvesselBusinessId,
      },
    };

    return new Response(
      JSON.stringify(responseData),
      { 
        status: 200,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' } 
      }
    );

  } catch (error) {
    console.error('Error in fetch-payvessel-balance function:', error);
    console.error('Error stack:', error instanceof Error ? error.stack : 'No stack trace');
    console.error('Error name:', error instanceof Error ? error.name : 'Unknown');
    
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    const errorDetails = error instanceof Error ? {
      message: error.message,
      name: error.name,
      stack: error.stack
    } : { error: String(error) };
    
    return new Response(
      JSON.stringify({ 
        success: false,
        error: 'Internal server error',
        message: errorMessage,
        details: errorDetails
      }),
      { 
        status: 500,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' } 
      }
    );
  }
});

