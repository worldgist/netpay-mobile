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

    if (!payvesselApiKey || !payvesselSecretKey) {
      console.error('PayVessel credentials not configured:', {
        hasApiKey: !!payvesselApiKey,
        hasSecretKey: !!payvesselSecretKey
      });
      return new Response(
        JSON.stringify({ 
          success: false,
          error: 'PayVessel credentials not configured. Please set PAYVESSEL_API_KEY and PAYVESSEL_SECRET_KEY environment variables.'
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

    // Parse request body - handle empty body case
    let body = { page: 1, per_page: 10 };
    try {
      const requestBody = await req.json();
      body = { ...body, ...requestBody };
    } catch (e) {
      // Body is empty or invalid JSON, use defaults
    }
    const { page = 1, per_page = 10, trans_id } = body;

    let url: string;
    if (trans_id) {
      // Search by transaction ID
      url = `https://api.payvessel.com/pms/api/external/transactions?transaction_id=${trans_id}`;
      console.log('Searching transaction history for transaction:', trans_id);
    } else {
      // Get paginated transactions
      url = `https://api.payvessel.com/pms/api/external/transactions?page=${page}&limit=${per_page}`;
      console.log('Fetching transaction history - page:', page, 'per_page:', per_page);
    }

    const response = await fetch(url, {
      method: 'GET',
      headers: {
        'api-key': payvesselApiKey,
        'api-secret': `Bearer ${payvesselSecretKey}`,
        'Content-Type': 'application/json',
      },
    });

    const responseText = await response.text();
    let data;
    
    try {
      data = JSON.parse(responseText);
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

    console.log('PayVessel transaction history response:', data);

    // Check if API returned an error
    if (!response.ok || data.success === false) {
      const errorMsg = data.message || data.error || 'Failed to fetch transactions from PayVessel';
      console.error('PayVessel API error:', errorMsg, data);
      return new Response(
        JSON.stringify({ 
          success: false,
          error: errorMsg,
          details: data
        }),
        { status: response.status || 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Transform PayVessel response to match expected format
    let transactions = [];
    if (data.success && data.data) {
      if (Array.isArray(data.data)) {
        transactions = data.data;
      } else if (trans_id) {
        transactions = [data.data];
      }
    } else if (data.transactions && Array.isArray(data.transactions)) {
      transactions = data.transactions;
    } else if (Array.isArray(data)) {
      transactions = data;
    }

    const responseData = {
      success: true,
      transactions: transactions,
      message: data.message || 'Success',
      statusCode: data.statusCode || 200,
    };

    return new Response(
      JSON.stringify(responseData),
      { 
        status: 200,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' } 
      }
    );

  } catch (error) {
    console.error('Error in fetch-payvessel-transactions function:', error);
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

