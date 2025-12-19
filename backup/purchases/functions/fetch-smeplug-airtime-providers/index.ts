import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const CORS_HEADERS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

serve(async (req) => {
  // Handle CORS preflight requests
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: CORS_HEADERS });
  }

  try {
    const SECRET_KEY = Deno.env.get('SMEPLUG_SECRET_KEY');
    
    if (!SECRET_KEY) {
      throw new Error('SMEPLUG_SECRET_KEY not configured');
    }

    // Initialize Supabase client
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const supabase = createClient(supabaseUrl, supabaseKey);

    // Get authenticated user
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

    // Check if user is admin
    const { data: roles, error: roleError } = await supabase
      .from('user_roles')
      .select('role')
      .eq('user_id', user.id)
      .eq('role', 'admin')
      .single();

    if (roleError || !roles) {
      console.log(`Access denied for user ${user.id}: Not an admin`);
      return new Response(
        JSON.stringify({ success: false, error: 'Admin access required' }),
        { status: 403, headers: { ...CORS_HEADERS, 'Content-Type': 'application/json' } }
      );
    }

    console.log('Fetching networks from SMEPLUG API for airtime providers...');

    // Fetch networks from SMEPLUG API (airtime uses same networks)
    const response = await fetch('https://smeplug.ng/api/v1/networks', {
      method: 'GET',
      headers: {
        'Authorization': `Bearer ${SECRET_KEY}`,
        'Content-Type': 'application/json',
      },
    });

    if (!response.ok) {
      const errorText = await response.text();
      console.error('SMEPLUG API error:', errorText);
      throw new Error(`SMEPLUG API error: ${response.status} - ${errorText}`);
    }

    const data = await response.json();
    console.log('SMEPLUG networks response for airtime:', JSON.stringify(data, null, 2));

    // Map networks to airtime providers using numeric network IDs for api_code
    console.log('Preparing airtime providers with numeric api_code from SMEPLUG networks');

    const providersArray: any[] = [];
    
    if (data.networks && typeof data.networks === 'object') {
      for (const [networkId, networkName] of Object.entries(data.networks)) {
        const idNum = Number(networkId);
        const name = String(networkName);
        providersArray.push({
          network_id: idNum,
          network: name,
          name: name,
          code: idNum,              // numeric code required by SMEPLUG airtime
          api_code: String(idNum),  // store numeric as string in DB
          min_amount: 50,
          max_amount: 50000,
          commission: 0,
          is_active: true
        });
      }
    }

    return new Response(
      JSON.stringify({ 
        success: true,
        data: providersArray,
        metadata: {
          total_providers: providersArray.length,
          source: 'smeplug'
        }
      }),
      { 
        status: 200, 
        headers: { ...CORS_HEADERS, 'Content-Type': 'application/json' } 
      }
    );

  } catch (error) {
    console.error('Error in fetch-smeplug-airtime-providers function:', error);
    
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
