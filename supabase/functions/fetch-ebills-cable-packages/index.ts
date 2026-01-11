import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { getEBillsTVVariations, getEBillsServiceId } from "../_shared/ebills-api.ts";
import { validateDSTVPackage } from "../_shared/dstv-prices.ts";

const CORS_HEADERS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

// Mapping of variation IDs to package names for eBills cable TV providers
// eBills API only returns variation IDs and amounts, not package names
const CABLE_PACKAGE_NAMES: Record<string, Record<string | number, string>> = {
  DSTV: {
    // DSTV packages - common variation IDs
    'dstv-padi': 'DSTV Padi',
    'dstv-yanga': 'DSTV Yanga',
    'dstv-confam': 'DSTV Confam',
    'dstv-compact': 'DSTV Compact',
    'dstv-compact-plus': 'DSTV Compact Plus',
    'dstv-premium': 'DSTV Premium',
    'dstv-premium-asia': 'DSTV Premium + Asia',
    'dstv-premium-french': 'DSTV Premium + French',
    // Additional DSTV variation IDs (numeric)
    3715: 'DSTV Compact',
    3713: 'DSTV Confam',
    3717: 'DSTV Compact Plus',
    3708: 'DSTV Yanga',
    2694: 'DSTV Compact',
    13802: 'DSTV Premium',
    354075: 'DSTV Compact Plus',
  },
  GOTV: {
    // GOTV packages - common variation IDs
    'gotv-smallie': 'GOtv Smallie',
    'gotv-jinja': 'GOtv Jinja',
    'gotv-jolli': 'GOtv Jolli',
    'gotv-max': 'GOtv Max',
    // Additional GOTV variation IDs (numeric)
    3715: 'GOtv Max',
    3713: 'GOtv Jolli',
    3717: 'GOtv Jinja',
    3708: 'GOtv Smallie',
    2694: 'GOtv Jinja',
    13802: 'GOtv Max',
    354075: 'GOtv Jolli',
  },
  STARTIMES: {
    // STARTIMES packages - variation IDs from logs
    2693: 'Nova',
    2692: 'Basic',
    2691: 'Smart',
    2690: 'Classic',
    2689: 'Smart',
    354076: 'Nova',
    354077: 'Smart',
    354078: 'Classic',
    // Additional STARTIMES variation IDs
    3715: 'Nova',
    3713: 'Basic',
    3717: 'Smart',
    3708: 'Classic',
    2694: 'Basic',
    13802: 'Classic',
    354075: 'Nova',
  },
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

    // Parse request body
    let parsedBody: Record<string, unknown> = {};
    try {
      const bodyText = await req.text();
      if (bodyText && bodyText.trim().length > 0) {
        parsedBody = JSON.parse(bodyText);
      }
    } catch (error) {
      console.error('fetch-ebills-cable-packages: unable to parse request body:', error);
    }

    const provider = String(parsedBody.provider || 'DSTV');
    const providerUpper = provider.toUpperCase();

    console.log('Fetching eBills cable packages:', { provider: providerUpper });

    // Get eBills service ID from provider
    const serviceId = getEBillsServiceId(provider);

    console.log('eBills service ID:', serviceId, 'for provider:', providerUpper);

    try {
      // Fetch variations from eBills (no auth required for variations endpoint)
      console.log('Calling getEBillsTVVariations with serviceId:', serviceId);
      const variationsData = await getEBillsTVVariations(serviceId);

      console.log('eBills variations response:', {
        code: variationsData.code,
        message: variationsData.message,
        dataLength: variationsData.data?.length || 0,
      });

      // Check if we have data
      if (!variationsData.data || variationsData.data.length === 0) {
        console.warn(`No variations found for ${providerUpper} (service_id: ${serviceId})`);
        return new Response(
          JSON.stringify({
            success: false,
            error: `No packages available for ${providerUpper}`,
          }),
          { status: 200, headers: { ...CORS_HEADERS, 'Content-Type': 'application/json' } }
        );
      }

      // Log the raw response structure to debug
      console.log('Raw eBills variations data (first item):', JSON.stringify(variationsData.data[0], null, 2));
      console.log('All variation keys:', variationsData.data[0] ? Object.keys(variationsData.data[0]) : 'No data');

      // Get package name mapping for this provider
      const packageNameMap = CABLE_PACKAGE_NAMES[providerUpper] || {};
      
      // Transform eBills response to match our cable_tv_plans schema
      const packages = variationsData.data.map((variation: any) => {
        const variationId = variation.variation_id;
        const variationCode = variation.variation_code || variationId;
        
        // Normalize variation ID for lookup (handle both string and number)
        const variationIdStr = String(variationId || '');
        const variationIdNum = typeof variationId === 'number' ? variationId : (Number(variationIdStr) || null);
        const variationCodeStr = String(variationCode || '');
        const variationCodeNum = typeof variationCode === 'number' ? variationCode : (Number(variationCodeStr) || null);
        
        // Try to get package name from mapping, or use variation code/ID as fallback
        let packageName = 
          variation.name || 
          variation.variation_name || 
          variation.title ||
          variation.package_name ||
          variation.description ||
          packageNameMap[variationIdStr] ||
          (variationIdNum !== null ? packageNameMap[variationIdNum] : null) ||
          packageNameMap[variationCodeStr] ||
          (variationCodeNum !== null ? packageNameMap[variationCodeNum] : null) ||
          null;
        
        // Extract price first (needed for both name inference and return value)
        const price = variation.variation_amount || variation.amount || variation.price || variation.cost || variation.fee || 0;
        
        // If no name found, try to infer from price (common package prices)
        if (!packageName) {
          
          // DSTV package price mappings (more comprehensive)
          if (providerUpper === 'DSTV') {
            if (price >= 24000 && price <= 26000) packageName = 'DSTV Premium';
            else if (price >= 29000 && price <= 31000) packageName = 'DSTV Premium + Asia';
            else if (price >= 32000 && price <= 34000) packageName = 'DSTV Premium + French';
            else if (price >= 12000 && price <= 14000) packageName = 'DSTV Compact Plus';
            else if (price >= 7000 && price <= 9000) packageName = 'DSTV Compact';
            else if (price >= 4000 && price <= 6000) packageName = 'DSTV Confam';
            else if (price >= 2000 && price <= 3500) packageName = 'DSTV Yanga';
            else if (price >= 1000 && price <= 2500) packageName = 'DSTV Padi';
            else if (price >= 3500 && price <= 4500) packageName = 'DSTV Confam';
          }
          // GOTV package price mappings (more comprehensive)
          else if (providerUpper === 'GOTV') {
            if (price >= 5000 && price <= 6500) packageName = 'GOtv Max';
            else if (price >= 3000 && price <= 4500) packageName = 'GOtv Jolli';
            else if (price >= 2000 && price <= 3500) packageName = 'GOtv Jinja';
            else if (price >= 1000 && price <= 2500) packageName = 'GOtv Smallie';
            else if (price >= 2500 && price <= 3000) packageName = 'GOtv Jinja';
          }
          // STARTIMES package price mappings (more comprehensive)
          else if (providerUpper === 'STARTIMES') {
            if (price >= 9000 && price <= 11000) packageName = 'Classic';
            else if (price >= 7000 && price <= 8500) packageName = 'Nova';
            else if (price >= 5000 && price <= 6500) packageName = 'Smart';
            else if (price >= 4000 && price <= 5500) packageName = 'Smart';
            else if (price >= 2000 && price <= 3500) packageName = 'Basic';
            else if (price >= 9500 && price <= 10000) packageName = 'Classic';
            else if (price >= 7400 && price <= 7600) packageName = 'Nova';
            else if (price >= 5100 && price <= 5300) packageName = 'Classic';
            else if (price >= 2100 && price <= 2200) packageName = 'Basic';
          }
        }
        
        // Final fallback - try to create a more user-friendly name from variation ID
        if (!packageName) {
          const fallbackId = String(variationCode || variationId || 'Unknown');
          // If it's a numeric ID, use "Package {ID}"
          // If it's an alphanumeric ID (like Z3713), try to extract meaningful info
          if (/^[A-Z]\d+$/.test(fallbackId)) {
            // Alphanumeric ID like Z3713 - use just the ID without "Package" prefix
            packageName = fallbackId;
          } else if (/^\d+$/.test(fallbackId)) {
            // Numeric ID - use "Package {ID}"
            packageName = `Package ${fallbackId}`;
          } else {
            // Other format - use as-is
            packageName = fallbackId;
          }
        }

        // Log if we couldn't find a proper package name (price already extracted above)
        if (packageName.startsWith('Package ') || (!packageName.includes(' ') && /^[A-Z]?\d+$/.test(packageName))) {
          console.warn('Using fallback package name:', {
            provider: providerUpper,
            variation_id: variationId,
            variation_code: variationCode,
            price: price,
            mappedName: packageName,
            allVariationKeys: Object.keys(variation),
            rawVariation: JSON.stringify(variation),
          });
        }

        console.log('Variation mapping:', {
          variation_id: variationId,
          variation_code: variationCode,
          variation_amount: variation.variation_amount,
          mappedName: packageName,
          mappedPrice: price,
        });

        const packageData = {
          provider: providerUpper,
          package_name: packageName,
          price: typeof price === 'number' ? price : parseFloat(String(price)) || 0,
          api_code: variationId,
          variation_code: variationCode,
          variation_id: variationId,
        };

        // Validate and correct DSTV prices
        if (providerUpper === 'DSTV') {
          const validated = validateDSTVPackage(packageData);
          return validated;
        }

        return packageData;
      });

      // Deduplicate packages by package name (normalized) and variation_id
      // After price validation, multiple variation IDs might map to the same package name
      const seenIds = new Set<string | number>();
      const seenPackageNames = new Set<string>();
      const uniquePackages = packages.filter((pkg) => {
        const id = pkg.variation_id || pkg.api_code;
        const normalizedName = (pkg.package_name || '').toLowerCase().trim();
        
        // Check for duplicate by ID first
        if (seenIds.has(id)) {
          console.log(`Removing duplicate package by ID: ${pkg.package_name} (ID: ${id})`);
          return false;
        }
        
        // Check for duplicate by normalized package name (for DSTV after price validation)
        if (providerUpper === 'DSTV' && normalizedName && seenPackageNames.has(normalizedName)) {
          console.log(`Removing duplicate package by name: ${pkg.package_name} (ID: ${id})`);
          return false;
        }
        
        seenIds.add(id);
        if (normalizedName) {
          seenPackageNames.add(normalizedName);
        }
        return true;
      });

      console.log(`Fetched ${packages.length} packages for ${providerUpper} from eBills (${uniquePackages.length} unique):`, uniquePackages.map(p => ({ name: p.package_name, price: p.price, id: p.variation_id })));

      return new Response(
        JSON.stringify({
          success: true,
          data: uniquePackages,
          metadata: {
            total_packages: packages.length,
            provider: providerUpper,
            service_id: serviceId,
            vending_provider: 'ebills',
            // Debug: Include raw first variation to see structure
            debug_raw_variation: variationsData.data[0] || null,
          },
        }),
        { status: 200, headers: { ...CORS_HEADERS, 'Content-Type': 'application/json' } }
      );
    } catch (ebillsError) {
      console.error('eBills API error:', {
        error: ebillsError,
        message: ebillsError instanceof Error ? ebillsError.message : String(ebillsError),
        provider: providerUpper,
        serviceId,
      });
      return new Response(
        JSON.stringify({
          success: false,
          error: ebillsError instanceof Error ? ebillsError.message : 'Failed to fetch cable packages from eBills',
        }),
        { status: 200, headers: { ...CORS_HEADERS, 'Content-Type': 'application/json' } }
      );
    }
  } catch (error) {
    console.error('fetch-ebills-cable-packages error:', error);
    return new Response(
      JSON.stringify({
        success: false,
        error: error instanceof Error ? error.message : 'Unexpected error',
      }),
      { status: 500, headers: { ...CORS_HEADERS, 'Content-Type': 'application/json' } }
    );
  }
});







