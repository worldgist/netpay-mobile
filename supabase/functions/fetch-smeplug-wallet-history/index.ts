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
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseKey = Deno.env.get('SUPABASE_ANON_KEY')!;
    const smeplugSecretKey = Deno.env.get('SMEPLUG_SECRET_KEY');

    if (!smeplugSecretKey) {
      console.error('SMEPLUG_SECRET_KEY not configured');
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

    const supabase = createClient(supabaseUrl, supabaseKey, {
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

    const { page = 1, per_page = 10, trans_id } = await req.json().catch(() => ({ page: 1, per_page: 10 }));

    let url: string;
    if (trans_id) {
      // Search by transaction ID
      url = `https://smeplug.ng/api/v1/transactions?transaction_id=${trans_id}`;
      console.log('Searching wallet history for transaction:', trans_id);
    } else {
      // Get paginated transactions
      url = `https://smeplug.ng/api/v1/transactions?page=${page}&limit=${per_page}`;
      console.log('Fetching wallet history - page:', page, 'per_page:', per_page);
    }

    const response = await fetch(url, {
      method: 'GET',
      headers: {
        'Authorization': `Bearer ${smeplugSecretKey}`,
        'Content-Type': 'application/json',
      },
    });

    const data = await response.json();
    console.log('SMEPLUG wallet history response:', data);

    // Transform SMEPLUG response to match expected format
    let transactions = [];
    if (data.success && data.data) {
      if (Array.isArray(data.data)) {
        transactions = data.data;
      } else if (trans_id) {
        transactions = [data.data];
      }
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
    console.error('Error in fetch-smeplug-wallet-history function:', error);
    return new Response(
      JSON.stringify({ 
        error: 'Internal server error',
        details: error instanceof Error ? error.message : 'Unknown error'
      }),
      { 
        status: 500,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' } 
      }
    );
  }
});

