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

    // Allow any authenticated user to fetch data plans (removed admin-only restriction)
    console.log(`User ${user.id} authorized to fetch data plans`);

    const { network_id } = await req.json();

    if (!network_id) {
      return new Response(
        JSON.stringify({ success: false, error: 'network_id is required' }),
        { status: 400, headers: { ...CORS_HEADERS, 'Content-Type': 'application/json' } }
      );
    }

    console.log(`Fetching data plans for network ${network_id} from SMEPLUG API...`);

    // Fetch data plans from SMEPLUG API
    const response = await fetch(`https://smeplug.ng/api/v1/data/plans?network_id=${network_id}`, {
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
    console.log('SMEPLUG data plans response:', JSON.stringify(data, null, 2));

    return new Response(
      JSON.stringify({ 
        success: true,
        data: data.data || data,
        metadata: {
          total_plans: Array.isArray(data.data) ? data.data.length : 0,
          network_id,
          source: 'smeplug'
        }
      }),
      { 
        status: 200, 
        headers: { ...CORS_HEADERS, 'Content-Type': 'application/json' } 
      }
    );

  } catch (error) {
    console.error('Error in fetch-smeplug-data-plans function:', error);
    
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
