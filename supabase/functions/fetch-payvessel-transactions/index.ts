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

    const apiKey = payvesselApiKey.trim().replace(/^['"]|['"]$/g, '');
    const apiSecret = payvesselSecretKey.trim().replace(/^['"]|['"]$/g, '').replace(/^Bearer\s+/i, '');

    const extractTransactions = (payload: any): any[] | null => {
      const nested = payload?.data;
      if (Array.isArray(payload)) return payload;
      if (Array.isArray(nested)) return nested;
      if (Array.isArray(nested?.transactions)) return nested.transactions;
      if (Array.isArray(nested?.results)) return nested.results;
      if (Array.isArray(payload?.transactions)) return payload.transactions;
      if (Array.isArray(payload?.results)) return payload.results;
      if (trans_id && nested && typeof nested === 'object') return [nested];
      return null;
    };

    const loadPayvessel = async (url: string, secretHeader: string) => {
      const response = await fetch(url, {
        method: 'GET',
        headers: {
          'api-key': apiKey,
          'api-secret': secretHeader,
          'Content-Type': 'application/json',
        },
      });
      const responseText = await response.text();
      let data: any = null;
      try {
        data = JSON.parse(responseText);
      } catch {
        data = null;
      }
      const failed = !response.ok || data?.success === false || data?.status === false || data?.status === 'error';
      return { failed, status: response.status, data, message: data?.message || data?.error || responseText.slice(0, 180) };
    };

    const walletResult = await loadPayvessel(
      'https://api.payvessel.com/pms/api/external/request/wallet/get-or-create/',
      `Bearer ${apiSecret}`,
    );
    const walletId = walletResult.data?.data?.id;
    const pageQuery = `page=${encodeURIComponent(String(page))}&per_page=${encodeURIComponent(String(per_page))}`;
    const referenceQuery = trans_id ? `&reference=${encodeURIComponent(String(trans_id))}` : '';
    const urls = [
      `https://api.payvessel.com/pms/api/external/request/wallet/transactions/?${pageQuery}${referenceQuery}`,
      walletId ? `https://api.payvessel.com/pms/wallets/${walletId}/statement` : '',
    ].filter(Boolean);

    let transactions: any[] | null = null;
    let lastError = 'Failed to fetch transactions from PayVessel';
    for (const url of urls) {
      for (const secretHeader of [`Bearer ${apiSecret}`, apiSecret]) {
        const result = await loadPayvessel(url, secretHeader);
        const extracted = extractTransactions(result.data);
        if (!result.failed && extracted) {
          transactions = extracted;
          break;
        }
        lastError = result.message || lastError;
        console.error('PayVessel transactions attempt failed:', { status: result.status, url: url.split('?')[0] });
      }
      if (transactions) break;
    }

    if (!transactions) {
      return new Response(
        JSON.stringify({ success: false, error: lastError }),
        { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const normalized = transactions.map((transaction) => ({
      ...transaction,
      id: transaction.id || transaction.transaction_id || transaction.trans_id,
      transaction_id: transaction.transaction_id || transaction.trans_id || transaction.id,
      reference: transaction.reference || transaction.trans_id || transaction.session_id || transaction.id,
      type: transaction.type || transaction.transaction_type || transaction.entry_type,
      description: transaction.description || transaction.narration || transaction.gateway_response || transaction.message,
      amount: transaction.amount,
      status: transaction.status || 'success',
      date: transaction.date || transaction.created_at || transaction.created_datetime || transaction.paid_at,
      created_at: transaction.created_at || transaction.created_datetime || transaction.date || transaction.paid_at,
    }));
    const filtered = trans_id
      ? normalized.filter((transaction) => {
          const needle = String(trans_id).toLowerCase();
          return [transaction.reference, transaction.transaction_id, transaction.id]
            .some((value) => String(value || '').toLowerCase().includes(needle));
        })
      : normalized;

    const responseData = {
      success: true,
      transactions: filtered,
      message: 'Success',
      statusCode: 200,
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

