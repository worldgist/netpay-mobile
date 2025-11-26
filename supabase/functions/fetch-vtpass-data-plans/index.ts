import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const CORS_HEADERS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

// Network to VTpass service ID mapping
const NETWORK_SERVICE_MAP: Record<string, string> = {
  'MTN': 'mtn-data',
  'AIRTEL': 'airtel-data',
  'GLO': 'glo-data',
  '9MOBILE': '9mobile-data',
  '9MOB': '9mobile-data',
  'ETISALAT': '9mobile-data',
};

serve(async (req) => {
  // Handle CORS preflight requests
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: CORS_HEADERS });
  }

  try {
    // Get VTpass credentials from environment
    const VTPASS_API_KEY = Deno.env.get('VTPASS_API_KEY');
    const VTPASS_PUBLIC_KEY = Deno.env.get('VTPASS_PUBLIC_KEY');
    const VTPASS_SECRET_KEY = Deno.env.get('VTPASS_SECRET_KEY');
    const VTPASS_MODE = Deno.env.get('VTPASS_MODE') || 'live'; // 'live' or 'sandbox'
    
    // VTpass requires API key and public key for authentication
    console.log('VTpass credentials check:', {
      hasApiKey: !!VTPASS_API_KEY,
      hasPublicKey: !!VTPASS_PUBLIC_KEY,
      mode: VTPASS_MODE,
      apiKeyLength: VTPASS_API_KEY?.length || 0,
      publicKeyLength: VTPASS_PUBLIC_KEY?.length || 0,
    });
    
    if (!VTPASS_API_KEY || !VTPASS_PUBLIC_KEY) {
      console.error('VTpass credentials not configured');
      return new Response(
        JSON.stringify({ 
          success: false, 
          error: 'VTpass credentials not configured. Please set VTPASS_API_KEY and VTPASS_PUBLIC_KEY environment variables in Supabase project settings.',
          details: 'Go to Supabase Dashboard > Project Settings > Edge Functions > Secrets to add the credentials.'
        }),
        { status: 500, headers: { ...CORS_HEADERS, 'Content-Type': 'application/json' } }
      );
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

    console.log(`User ${user.id} authorized to fetch VTpass data plans`);

    // Parse request body
    let body: any = {};
    try {
      const bodyText = await req.text();
      if (bodyText && bodyText.trim()) {
        body = JSON.parse(bodyText);
      }
    } catch (parseError) {
      console.error('Error parsing request body:', parseError);
      return new Response(
        JSON.stringify({ 
          success: false, 
          error: 'Invalid request body. Expected JSON with network or network_id field.' 
        }),
        { status: 400, headers: { ...CORS_HEADERS, 'Content-Type': 'application/json' } }
      );
    }

    const { network, network_id } = body;
    console.log('Request body:', { network, network_id, body });

    // Determine service ID from network name or network_id
    let serviceID: string | null = null;
    
    if (network) {
      const normalizedNetwork = network.toUpperCase().trim();
      serviceID = NETWORK_SERVICE_MAP[normalizedNetwork] || null;
    } else if (network_id) {
      // If network_id is provided, try to map it
      // Common network IDs: 1=MTN, 2=Airtel, 3=Glo, 4=9Mobile
      const networkIdMap: Record<string, string> = {
        '1': 'mtn-data',
        '2': 'airtel-data',
        '3': 'glo-data',
        '4': '9mobile-data',
      };
      serviceID = networkIdMap[String(network_id)] || null;
    }

    if (!serviceID) {
      return new Response(
        JSON.stringify({ 
          success: false, 
          error: 'Network is required. Supported networks: MTN, Airtel, Glo, 9Mobile' 
        }),
        { status: 400, headers: { ...CORS_HEADERS, 'Content-Type': 'application/json' } }
      );
    }

    // Determine base URL based on mode
    const baseUrl = VTPASS_MODE === 'sandbox' 
      ? 'https://sandbox.vtpass.com'
      : 'https://vtpass.com';

    const apiUrl = `${baseUrl}/api/service-variations?serviceID=${serviceID}`;

    console.log(`Fetching VTpass data plans for ${serviceID} from ${baseUrl}...`);

    // Create AbortController for timeout
    const controller = new AbortController();
    const timeoutId = setTimeout(() => {
      console.error('VTpass API request timeout after 30 seconds');
      controller.abort();
    }, 30000); // 30 second timeout for VTpass API

    try {
      console.log(`Making request to VTpass API: ${apiUrl}`);
      
      // Fetch data plans from VTpass API
      // For GET requests, VTpass requires: api-key and public-key headers
      const response = await fetch(apiUrl, {
        method: 'GET',
        headers: {
          'api-key': VTPASS_API_KEY || VTPASS_PUBLIC_KEY, // Use API key if available, fallback to public key
          'public-key': VTPASS_PUBLIC_KEY,
          'Content-Type': 'application/json',
        },
        signal: controller.signal,
      });
      
      clearTimeout(timeoutId);
      console.log(`VTpass API response status: ${response.status}`);
      
      console.log('VTpass API request:', {
        url: apiUrl,
        method: 'GET',
        headers: {
          'api-key': VTPASS_API_KEY ? `${VTPASS_API_KEY.substring(0, 10)}...` : 'not set',
          'public-key': VTPASS_PUBLIC_KEY ? `${VTPASS_PUBLIC_KEY.substring(0, 10)}...` : 'not set',
        }
      });

      if (!response.ok) {
        const errorText = await response.text();
        console.error('VTpass API error:', response.status, errorText);
        return new Response(
          JSON.stringify({ 
            success: false, 
            error: `VTpass API error: ${response.status} - ${errorText}` 
          }),
          { status: response.status, headers: { ...CORS_HEADERS, 'Content-Type': 'application/json' } }
        );
      }

      let data: any;
      let responseText: string = '';
      try {
        responseText = await response.text();
        console.log('VTpass API raw response length:', responseText?.length || 0);
        console.log('VTpass API raw response (first 1000 chars):', responseText?.substring(0, 1000) || 'empty');
        
        if (!responseText || !responseText.trim()) {
          console.error('Empty response from VTpass API');
          return new Response(
            JSON.stringify({ 
              success: false, 
              error: 'Empty response from VTpass API. Please check API credentials and network configuration.' 
            }),
            { status: 500, headers: { ...CORS_HEADERS, 'Content-Type': 'application/json' } }
          );
        }
        
        data = JSON.parse(responseText);
        console.log('VTpass data plans response parsed successfully');
        console.log('Response structure:', {
          hasContent: !!data.content,
          contentIsArray: Array.isArray(data.content),
          hasVariations: !!(data.content && data.content.varations),
          responseDescription: data.response_description,
        });
      } catch (parseError) {
        console.error('Error parsing VTpass response:', parseError);
        console.error('Response text that failed to parse:', responseText?.substring(0, 500) || 'No response text');
        return new Response(
          JSON.stringify({ 
            success: false, 
            error: `Failed to parse response from VTpass API: ${parseError instanceof Error ? parseError.message : 'Unknown error'}. Please check API credentials and try again.` 
          }),
          { status: 500, headers: { ...CORS_HEADERS, 'Content-Type': 'application/json' } }
        );
      }

      // VTpass response structure can be:
      // 1. { content: { varations: [...] }, response_description: "..." }
      // 2. { content: [...], response_description: "..." }
      // 3. Direct array: [...]
      // Transform to match expected format
      let plans = [];
      
      // Check if response indicates an error
      if (data.response_description && data.response_description !== '000' && data.response_description !== 'success') {
        console.warn('VTpass API returned non-success response:', data.response_description);
        // Continue processing if content exists, otherwise return error
        if (!data.content || (Array.isArray(data.content) && data.content.length === 0)) {
          return new Response(
            JSON.stringify({ 
              success: false, 
              error: data.response_description || 'VTpass API returned an error',
              details: data
            }),
            { status: 400, headers: { ...CORS_HEADERS, 'Content-Type': 'application/json' } }
          );
        }
      }
      
      // Extract plans from various possible response structures
      if (data.content) {
        if (Array.isArray(data.content)) {
          // Format: { content: [...] }
          plans = data.content;
        } else if (data.content.varations && Array.isArray(data.content.varations)) {
          // Format: { content: { varations: [...] } }
          plans = data.content.varations;
        } else if (typeof data.content === 'object') {
          // Try to extract array from content object
          const contentValues = Object.values(data.content);
          const arrays = contentValues.filter(v => Array.isArray(v)) as any[][];
          if (arrays.length > 0) {
            plans = arrays[0]; // Use first array found
          }
        }
      } else if (Array.isArray(data)) {
        // If response is directly an array
        plans = data;
      } else if (data.data && Array.isArray(data.data)) {
        // Format: { data: [...] }
        plans = data.data;
      }
      
      // Map plans to consistent format
      plans = plans.map((plan: any) => ({
        id: plan.variation_code || plan.variationCode || plan.code || plan.id || '',
        name: plan.name || plan.variation_name || plan.title || plan.plan || 'Unknown Plan',
        variation_code: plan.variation_code || plan.variationCode || plan.code || '',
        variation_name: plan.name || plan.variation_name || plan.title || '',
        variation_amount: parseFloat(plan.variation_amount || plan.variationAmount || plan.amount || plan.fixedPrice || plan.price || 0),
        fixedPrice: parseFloat(plan.fixedPrice || plan.variation_amount || plan.variationAmount || plan.amount || plan.price || 0),
        fixedPriceDescription: plan.fixedPriceDescription || plan.name || plan.variation_name || '',
        // Additional fields that might be useful
        serviceID: plan.serviceID || serviceID,
        network: network || serviceID.replace('-data', '').toUpperCase(),
      }));
      
      console.log(`Mapped ${plans.length} plans from VTpass response`);

      return new Response(
        JSON.stringify({ 
          success: true,
          data: plans,
          metadata: {
            total_plans: plans.length,
            serviceID,
            network: network || serviceID.replace('-data', '').toUpperCase(),
            source: 'vtpass',
            mode: VTPASS_MODE,
            response_description: data.response_description || data.message || 'Success',
          }
        }),
        { 
          status: 200, 
          headers: { ...CORS_HEADERS, 'Content-Type': 'application/json' } 
        }
      );
    } catch (fetchError: any) {
      clearTimeout(timeoutId);
      
      // Handle timeout/abort errors
      if (fetchError.name === 'AbortError' || fetchError.message?.includes('aborted')) {
        console.error('VTpass API request timed out');
        return new Response(
          JSON.stringify({ 
            success: false, 
            error: 'Request to VTpass API timed out. The API may be slow or unavailable. Please try again.' 
          }),
          { status: 504, headers: { ...CORS_HEADERS, 'Content-Type': 'application/json' } }
        );
      }
      
      // Re-throw other errors to be caught by outer catch
      throw fetchError;
    }

  } catch (error) {
    console.error('Error in fetch-vtpass-data-plans function:', error);
    console.error('Error stack:', error instanceof Error ? error.stack : 'No stack trace');
    console.error('Error details:', JSON.stringify(error, Object.getOwnPropertyNames(error)));
    
    const errorMessage = error instanceof Error ? error.message : 'Unknown error occurred';
    const errorDetails = {
      message: errorMessage,
      stack: error instanceof Error ? error.stack : undefined,
    };
    
    return new Response(
      JSON.stringify({ 
        success: false, 
        error: errorMessage,
        details: process.env.NODE_ENV === 'development' ? errorDetails : undefined
      }),
      { 
        status: 500, 
        headers: { ...CORS_HEADERS, 'Content-Type': 'application/json' } 
      }
    );
  }
});

