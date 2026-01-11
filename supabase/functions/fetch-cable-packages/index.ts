import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { validateDSTVPackage } from "../_shared/dstv-prices.ts";

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
    const PUBLIC_KEY = Deno.env.get('MOBILENIG_PUBLIC_KEY');
    
    if (!PUBLIC_KEY) {
      throw new Error('MOBILENIG_PUBLIC_KEY not configured');
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

    // Allow any authenticated user to fetch packages (packages are public information)

    // Parse request body
    let body: Record<string, unknown> = {};
    try {
      const bodyText = await req.text();
      if (bodyText && bodyText.trim().length > 0) {
        body = JSON.parse(bodyText);
      }
    } catch (error) {
      console.error("fetch-cable-packages: unable to parse request body:", error);
      body = {};
    }
    
    const provider = String(body.provider || 'DSTV');
    const vendingProvider = String(body.vending_provider || 'mobilenig');
    const providerUpper = provider.toUpperCase();

    console.log('Fetching cable packages:', { provider, vendingProvider });

    // Check if vending provider is supported
    const supportedProviders = ['mobilenig'];
    const vendingProviderLower = vendingProvider.toLowerCase();
    if (!supportedProviders.includes(vendingProviderLower)) {
      return new Response(
        JSON.stringify({ 
          success: false, 
          error: `Vending provider '${vendingProvider}' is not yet supported for cable TV. Supported providers: ${supportedProviders.join(', ')}`,
          vending_provider: vendingProvider
        }),
        { status: 200, headers: { ...CORS_HEADERS, 'Content-Type': 'application/json' } }
      );
    }

    // Map provider to service ID based on actual API responses
    // AKA returns GOTV packages, AKB returns StarTimes packages, AKC returns DSTV packages
    const serviceIdMap: Record<string, string> = {
      'GOTV': 'AKA',
      'STARTIMES': 'AKB',
      'DSTV': 'AKC'
    };

    const service_id = serviceIdMap[providerUpper];
    
    if (!service_id) {
      return new Response(
        JSON.stringify({ 
          success: false, 
          error: `Invalid provider: ${provider}. Valid providers are: DSTV, GOTV, STARTIMES`
        }),
        { status: 200, headers: { ...CORS_HEADERS, 'Content-Type': 'application/json' } }
      );
    }

    console.log('Request details:', {
      provider: providerUpper,
      service_id: service_id,
      vending_provider: vendingProvider,
      requestBody: body
    });

    // Fetch packages from MobileNig API
    let response: Response;
    let result: any;
    
    try {
      response = await fetch('https://enterprise.mobilenig.com/api/v2/services/packages', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${PUBLIC_KEY}`,
        },
        body: JSON.stringify({
          service_id: service_id
        }),
      });

      result = await response.json();
      
      console.log('MobileNig API response:', JSON.stringify(result, null, 2));

      if (!response.ok) {
        return new Response(
          JSON.stringify({ 
            success: false, 
            error: result.message || 'Failed to fetch cable packages',
            details: result
          }),
          { 
            status: response.status, 
            headers: { ...CORS_HEADERS, 'Content-Type': 'application/json' } 
          }
        );
      }
    } catch (fetchError: any) {
      // Check for SSL certificate errors
      const errorMessage = fetchError?.message || String(fetchError);
      if (errorMessage.includes('invalid peer certificate') || 
          errorMessage.includes('certificate') ||
          errorMessage.includes('SSL') ||
          errorMessage.includes('TLS')) {
        console.error('SSL certificate error from MobileNig API:', errorMessage);
        return new Response(
          JSON.stringify({ 
            success: false, 
            error: 'MobileNig API SSL certificate error. The vendor\'s certificate has expired. Please try again later or contact support.',
            error_type: 'ssl_certificate_error',
            suggestion: 'This is a temporary issue with the vendor\'s SSL certificate. Please try again later.'
          }),
          { 
            status: 200, 
            headers: { ...CORS_HEADERS, 'Content-Type': 'application/json' } 
          }
        );
      }
      // Re-throw if it's not an SSL error
      throw fetchError;
    }

    // Check if we got valid data
    if (result.statusCode !== '200' || !result.details || result.details.length === 0) {
      return new Response(
        JSON.stringify({ 
          success: false, 
          error: 'No packages available',
          data: [],
          service_status: result.service_status || null
        }),
        { 
          status: 200, 
          headers: { ...CORS_HEADERS, 'Content-Type': 'application/json' } 
        }
      );
    }

    // Transform the data to match our cable_tv_plans schema
    const packages = result.details.map((pkg: any) => {
      const packageData = {
        provider: providerUpper,
        package_name: pkg.name,
        price: parseFloat(pkg.price),
        api_code: pkg.productCode
      };

      // Validate and correct DSTV prices
      if (providerUpper === 'DSTV') {
        return validateDSTVPackage(packageData);
      }

      return packageData;
    });

    // Deduplicate packages by package name (normalized) and api_code
    // After price validation, multiple API codes might map to the same package name
    const seenIds = new Set<string>();
    const seenPackageNames = new Set<string>();
    const uniquePackages = packages.filter((pkg) => {
      const id = pkg.api_code || '';
      const normalizedName = (pkg.package_name || '').toLowerCase().trim();
      
      // Check for duplicate by ID first
      if (id && seenIds.has(id)) {
        console.log(`Removing duplicate package by ID: ${pkg.package_name} (ID: ${id})`);
        return false;
      }
      
      // Check for duplicate by normalized package name (for DSTV after price validation)
      if (providerUpper === 'DSTV' && normalizedName && seenPackageNames.has(normalizedName)) {
        console.log(`Removing duplicate package by name: ${pkg.package_name} (ID: ${id})`);
        return false;
      }
      
      if (id) seenIds.add(id);
      if (normalizedName) seenPackageNames.add(normalizedName);
      return true;
    });

    return new Response(
      JSON.stringify({ 
        success: true,
        data: uniquePackages,
        service_status: result.service_status || null,
        metadata: {
          total_packages: packages.length,
          unique_packages: uniquePackages.length,
          provider: providerUpper,
          service_id: service_id,
          vending_provider: vendingProvider
        }
      }),
      { 
        status: 200, 
        headers: { ...CORS_HEADERS, 'Content-Type': 'application/json' } 
      }
    );

  } catch (error) {
    console.error('Error in fetch-cable-packages function:', error);
    const errorMessage = error instanceof Error ? error.message : 'Unknown error occurred';
    
    // Always return valid JSON, even on errors
    try {
      return new Response(
        JSON.stringify({ 
          success: false, 
          error: errorMessage,
          details: error instanceof Error ? error.stack?.substring(0, 500) : String(error)
        }),
        { 
          status: 200, 
          headers: { ...CORS_HEADERS, 'Content-Type': 'application/json' } 
        }
      );
    } catch (jsonError) {
      // Fallback if JSON.stringify fails
      return new Response(
        JSON.stringify({ 
          success: false, 
          error: 'Failed to fetch cable packages'
        }),
        { 
          status: 200, 
          headers: { ...CORS_HEADERS, 'Content-Type': 'application/json' } 
        }
      );
    }
  }
});
