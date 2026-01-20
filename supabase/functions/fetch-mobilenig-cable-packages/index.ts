import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const CORS_HEADERS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

// MobileNig Cable TV Service IDs
const MOBILENIG_CABLE_SERVICES: Record<string, string> = {
  'DSTV': 'dstv',
  'GOTV': 'gotv',
  'STARTIMES': 'startimes',
};

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: CORS_HEADERS });
  }

  try {
    // Get authorization header for user authentication
    const authHeader = req.headers.get('Authorization');
    if (!authHeader) {
      return new Response(
        JSON.stringify({ success: false, error: 'Missing authorization header' }),
        { status: 401, headers: { ...CORS_HEADERS, 'Content-Type': 'application/json' } }
      );
    }

    // Create Supabase client
    const supabaseUrl = Deno.env.get('SUPABASE_URL') ?? '';
    const supabaseKey = Deno.env.get('SUPABASE_ANON_KEY') ?? '';
    const supabase = createClient(supabaseUrl, supabaseKey, {
      global: {
        headers: { Authorization: authHeader },
      },
    });

    // Verify authentication
    const { data: { user }, error: authError } = await supabase.auth.getUser();
    if (authError || !user) {
      return new Response(
        JSON.stringify({ success: false, error: 'Unauthorized' }),
        { status: 401, headers: { ...CORS_HEADERS, 'Content-Type': 'application/json' } }
      );
    }

    // Get request body
    const body = await req.json();
    const { provider } = body;

    if (!provider) {
      return new Response(
        JSON.stringify({ success: false, error: 'Provider is required' }),
        { status: 400, headers: { ...CORS_HEADERS, 'Content-Type': 'application/json' } }
      );
    }

    console.log('Fetching MobileNig cable packages for provider:', provider);

    // Get MobileNig API credentials from Supabase
    const mobilenigPublicKey = Deno.env.get('MOBILENIG_PUBLIC_KEY');
    const mobilenigSecretKey = Deno.env.get('MOBILENIG_SECRET_KEY');

    if (!mobilenigPublicKey || !mobilenigSecretKey) {
      return new Response(
        JSON.stringify({ success: false, error: 'MobileNig API credentials not configured' }),
        { status: 500, headers: { ...CORS_HEADERS, 'Content-Type': 'application/json' } }
      );
    }

    // Get service ID for the provider
    const serviceId = MOBILENIG_CABLE_SERVICES[provider.toUpperCase()];
    if (!serviceId) {
      return new Response(
        JSON.stringify({ success: false, error: `Unsupported cable TV provider: ${provider}` }),
        { status: 400, headers: { ...CORS_HEADERS, 'Content-Type': 'application/json' } }
      );
    }

    // Fetch packages from MobileNig API
    const mobilenigUrl = 'https://enterprise.mobilenig.com/api/v2/services/packages';
    
    console.log('Calling MobileNig API:', mobilenigUrl, 'with service_id:', serviceId);

    const mobilenigResponse = await fetch(mobilenigUrl, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${mobilenigPublicKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        service_id: serviceId
      }),
    });

    if (!mobilenigResponse.ok) {
      const errorText = await mobilenigResponse.text();
      console.error('MobileNig API error:', errorText);
      return new Response(
        JSON.stringify({ 
          success: false, 
          error: `MobileNig API error: ${mobilenigResponse.statusText}` 
        }),
        { status: mobilenigResponse.status, headers: { ...CORS_HEADERS, 'Content-Type': 'application/json' } }
      );
    }

    const mobilenigData = await mobilenigResponse.json();
    console.log('MobileNig API response:', JSON.stringify(mobilenigData).substring(0, 500));

    // Parse MobileNig response format
    // MobileNig returns: { statusCode: '200', message: 'success', details: [...] }
    if (!mobilenigData.statusCode || mobilenigData.statusCode !== '200') {
      return new Response(
        JSON.stringify({ 
          success: false, 
          error: mobilenigData.message || 'Invalid response from MobileNig API',
          details: mobilenigData 
        }),
        { status: 500, headers: { ...CORS_HEADERS, 'Content-Type': 'application/json' } }
      );
    }

    const packages = mobilenigData.details || [];
    
    if (!Array.isArray(packages) || packages.length === 0) {
      console.warn('No packages found in MobileNig response');
      return new Response(
        JSON.stringify({ 
          success: true, 
          data: [],
          message: 'No packages available for this provider' 
        }),
        { status: 200, headers: { ...CORS_HEADERS, 'Content-Type': 'application/json' } }
      );
    }

    // Transform MobileNig packages to our standard format
    const transformedPackages = packages
      .filter((pkg: any) => pkg.name && pkg.price && pkg.productCode)
      .map((pkg: any) => ({
        package_name: pkg.name?.trim() || 'Unknown Package',
        price: parseFloat(pkg.price) || 0,
        api_code: pkg.productCode,
        variation_code: pkg.productCode,
        provider: provider.toUpperCase(),
        description: pkg.description || '',
      }))
      .filter((pkg: any) => pkg.price > 0) // Filter out invalid prices
      .sort((a: any, b: any) => a.price - b.price); // Sort by price

    console.log(`Successfully fetched ${transformedPackages.length} packages from MobileNig for ${provider}`);

    return new Response(
      JSON.stringify({
        success: true,
        data: transformedPackages,
        count: transformedPackages.length,
        provider: provider.toUpperCase(),
        source: 'mobilenig'
      }),
      { status: 200, headers: { ...CORS_HEADERS, 'Content-Type': 'application/json' } }
    );

  } catch (error: any) {
    console.error('Error in fetch-mobilenig-cable-packages:', error);
    return new Response(
      JSON.stringify({ 
        success: false, 
        error: error.message || 'Internal server error',
        details: error.toString()
      }),
      { status: 500, headers: { ...CORS_HEADERS, 'Content-Type': 'application/json' } }
    );
  }
});
