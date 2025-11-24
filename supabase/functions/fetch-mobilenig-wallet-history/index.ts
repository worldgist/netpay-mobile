import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

// Helper function to ensure number
function ensureNumber(value: any, defaultValue: number): number {
  if (typeof value === 'number' && !isNaN(value) && value > 0) {
    return Math.floor(value);
  }
  if (typeof value === 'string') {
    const parsed = parseInt(value, 10);
    if (!isNaN(parsed) && parsed > 0) {
      return parsed;
    }
  }
  return defaultValue;
}

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseKey = Deno.env.get('SUPABASE_ANON_KEY')!;
    const mobilenigPublicKey = Deno.env.get('MOBILENIG_PUBLIC_KEY');

    if (!mobilenigPublicKey) {
      console.error('MOBILENIG_PUBLIC_KEY not configured');
      return new Response(
        JSON.stringify({ success: false, error: 'Service configuration error: MOBILENIG_PUBLIC_KEY not set' }),
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

    // Parse request body safely
    let page = 1;
    let per_page = 10;
    let trans_id: string | undefined;
    
    try {
      const contentType = req.headers.get('content-type') || '';
      if (contentType.includes('application/json')) {
        const body = await req.json();
        if (body && typeof body === 'object') {
          page = ensureNumber(body.page, 1);
          per_page = ensureNumber(body.per_page, 10);
          trans_id = body.trans_id || body.transId;
        }
      }
    } catch (parseError) {
      // If body parsing fails or no body, use defaults
      console.log('No request body or invalid format, using defaults');
    }
    
    console.log('Request params:', { page, per_page, trans_id });

    let url: string;
    if (trans_id) {
      url = `https://enterprise.mobilenig.com/api/v2/control/search_wallet_history?trans_id=${trans_id}`;
      console.log('Searching wallet history for transaction:', trans_id);
    } else {
      url = `https://enterprise.mobilenig.com/api/v2/control/wallet_history?page=${page}&per_page=${per_page}`;
      console.log('Fetching wallet history - page:', page, 'per_page:', per_page);
    }

    console.log('Calling MobileNig wallet history API:', url);
    console.log('API Key configured:', mobilenigPublicKey ? 'Yes (masked)' : 'No');

    const response = await fetch(url, {
      method: 'GET',
      headers: {
        'Authorization': `Bearer ${mobilenigPublicKey}`,
        'Content-Type': 'application/json',
        'Accept': 'application/json',
      },
    });

    console.log('Wallet history API response status:', response.status, response.statusText);
    console.log('Wallet history API response headers:', Object.fromEntries(response.headers.entries()));

    if (!response.ok) {
      const errorText = await response.text();
      console.error('MobileNig wallet history API error:', response.status, errorText);
      throw new Error(`MobileNig API returned ${response.status}: ${errorText}`);
    }

    let data;
    try {
      const responseText = await response.text();
      if (!responseText || !responseText.trim()) {
        throw new Error('Empty response from MobileNig API');
      }
      data = JSON.parse(responseText);
      console.log('MobileNig wallet history response:', data);
    } catch (parseError) {
      console.error('Error parsing MobileNig response:', parseError);
      throw new Error(`Failed to parse MobileNig API response: ${parseError instanceof Error ? parseError.message : 'Unknown error'}`);
    }

    const responseData = {
      success: true,
      transactions: trans_id ? [data.details] : data.details || [],
      message: data.message,
      statusCode: data.statusCode,
    };

    return new Response(
      JSON.stringify(responseData),
      { 
        status: 200,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' } 
      }
    );

  } catch (error) {
    console.error('Error in fetch-mobilenig-wallet-history function:', error);
    console.error('Error stack:', error instanceof Error ? error.stack : 'No stack trace');
    console.error('Error details:', JSON.stringify(error, Object.getOwnPropertyNames(error)));
    
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    const errorDetails = process.env.NODE_ENV === 'development' 
      ? { message: errorMessage, stack: error instanceof Error ? error.stack : undefined }
      : { message: 'Internal server error' };
    
    return new Response(
      JSON.stringify({ 
        success: false,
        error: errorMessage,
        ...errorDetails
      }),
      { 
        status: 500,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' } 
      }
    );
  }
});
