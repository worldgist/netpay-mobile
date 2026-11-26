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

const inferPlanType = (planName: string) => {
  const normalized = planName.toUpperCase();
  if (normalized.includes('T2')) return 'T2';
  if (normalized.includes('GIFTING') || normalized.includes('GIFT')) return 'Gifting';
  if (normalized.includes('VTU')) return 'VTU';
  if (normalized.includes('CORPORATE')) return 'Corporate';
  if (normalized.includes('DIRECT')) return 'Direct';
  if (normalized.includes('SME')) return 'SME';
  return 'SME';
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
      // According to VTpass docs: content.variations (note: API sometimes returns "variations" and sometimes "varations" - typo)
      if (data.content) {
        if (Array.isArray(data.content)) {
          // Format: { content: [...] }
          plans = data.content;
        } else if (data.content.variations && Array.isArray(data.content.variations)) {
          // Format: { content: { variations: [...] } } - correct spelling (preferred)
          plans = data.content.variations;
          console.log(`Found ${plans.length} plans in content.variations`);
        } else if (data.content.varations && Array.isArray(data.content.varations)) {
          // Format: { content: { varations: [...] } } - typo in some responses (fallback)
          plans = data.content.varations;
          console.log(`Found ${plans.length} plans in content.varations (typo)`);
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
      
      console.log(`Extracted ${plans.length} plans from VTpass response`);
      
      if (plans.length === 0) {
        return new Response(
          JSON.stringify({ 
            success: false, 
            error: 'No data plans found in VTpass response',
            data: [],
            details: data
          }),
          { 
            status: 200, 
            headers: { ...CORS_HEADERS, 'Content-Type': 'application/json' } 
          }
        );
      }

      // Determine network name
      const networkName = network || serviceID.replace('-data', '').toUpperCase();
      console.log(`Processing ${plans.length} plans for network: ${networkName}`);

      // Store plans in database
      let imported = 0;
      let updated = 0;
      const errors: string[] = [];

      for (const plan of plans) {
        try {
          // Extract plan information from VTpass response
          const variationCode = String(plan.variation_code || plan.variationCode || plan.code || '');
          const planName = String(plan.name || plan.variation_name || plan.title || 'Unknown Plan').trim();
          const planPrice = parseFloat(plan.variation_amount || plan.variationAmount || plan.amount || plan.fixedPrice || plan.price || 0);

          // Extract validity from plan name (e.g., "24 hrs", "30 days", "1 Month")
          let validity = 'N/A';
          const validityMatch = planName.match(/(\d+\s*(hrs?|days?|months?|years?))/i);
          if (validityMatch) {
            validity = validityMatch[1];
          } else if (planName.includes('24 hrs') || planName.includes('24hrs')) {
            validity = '24 hrs';
          } else if (planName.includes('30 days') || planName.includes('30days')) {
            validity = '30 days';
          } else if (planName.includes('7 days') || planName.includes('7days')) {
            validity = '7 days';
          } else if (planName.includes('2 days') || planName.includes('2days')) {
            validity = '2 days';
          } else if (planName.includes('Month')) {
            validity = '1 Month';
          } else if (planName.includes('Months')) {
            const monthsMatch = planName.match(/(\d+)\s*Months?/i);
            if (monthsMatch) {
              validity = `${monthsMatch[1]} Months`;
            }
          } else if (planName.includes('Year')) {
            validity = '1 Year';
          }

          // Extract size from plan name (e.g., "100MB", "1.5GB", "10GB")
          const sizeMatch = planName.match(/(\d+(?:\.\d+)?\s*(GB|MB|TB))/i);
          const size = sizeMatch ? sizeMatch[1] : null;

          const dbPlan: any = {
            network: networkName,
            plan_name: planName,
            price: planPrice,
            original_price: planPrice,
            validity: validity.trim(),
            api_code: variationCode,
            vtpass_code: variationCode,
            provider: 'vtpass',
            is_active: true,
            plan_type: inferPlanType(planName),
          };

          if (size) {
            dbPlan.size = size;
          }

          // Check if plan already exists (match by network and api_code or vtpass_code)
          let existing: any = null;
          
          if (variationCode) {
            // First try to find by api_code or vtpass_code
            const { data: byCode } = await supabase
              .from('data_plans')
              .select('id, vtpass_code, api_code, plan_name, price')
              .eq('network', networkName)
              .or(`api_code.eq.${variationCode},vtpass_code.eq.${variationCode}`)
              .maybeSingle();
            
            existing = byCode;
          }
          
          // If not found by code, try to find by similar name and price
          if (!existing && planName) {
            const { data: similar } = await supabase
              .from('data_plans')
              .select('id, vtpass_code, api_code, plan_name, price')
              .eq('network', networkName)
              .ilike('plan_name', `%${planName.substring(0, 20)}%`)
              .maybeSingle();
            
            if (similar && similar.price && planPrice && 
                Math.abs(similar.price - planPrice) / Math.max(similar.price, planPrice) < 0.1) {
              existing = similar;
            }
          }

          if (existing) {
            // Update existing plan - add vtpass_code if missing
            const updateData: any = {};
            if (!existing.vtpass_code && variationCode) {
              updateData.vtpass_code = variationCode;
            }
            if (!existing.api_code && variationCode) {
              updateData.api_code = variationCode;
            }
            // Update price if significantly different (more than 10%)
            if (existing.price && planPrice && 
                Math.abs(existing.price - planPrice) / Math.max(existing.price, planPrice) > 0.1) {
              updateData.price = planPrice;
              updateData.original_price = planPrice;
            }

            if (Object.keys(updateData).length > 0) {
              const { error: updateError } = await supabase
                .from('data_plans')
                .update(updateData)
                .eq('id', existing.id);

              if (updateError) {
                errors.push(`Failed to update plan ${planName}: ${updateError.message}`);
                console.error(`Update error for ${planName}:`, updateError);
              } else {
                updated++;
                console.log(`Updated plan: ${planName}`);
              }
            }
          } else {
            // Insert new plan
            const { error: insertError } = await supabase
              .from('data_plans')
              .insert(dbPlan);

            if (insertError) {
              errors.push(`Failed to insert plan ${planName}: ${insertError.message}`);
              console.error(`Insert error for ${planName}:`, insertError);
            } else {
              imported++;
              console.log(`Imported plan: ${planName}`);
            }
          }
        } catch (error) {
          const errorMsg = error instanceof Error ? error.message : String(error);
          errors.push(`Failed to process plan: ${errorMsg}`);
          console.error('Error processing plan:', error);
        }
      }

      // Map plans to consistent format for response (for backward compatibility)
      const mappedPlans = plans.map((plan: any) => ({
        id: plan.variation_code || plan.variationCode || plan.code || plan.id || '',
        name: plan.name || plan.variation_name || plan.title || plan.plan || 'Unknown Plan',
        variation_code: plan.variation_code || plan.variationCode || plan.code || '',
        variation_name: plan.name || plan.variation_name || plan.title || '',
        variation_amount: parseFloat(plan.variation_amount || plan.variationAmount || plan.amount || plan.fixedPrice || plan.price || 0),
        fixedPrice: parseFloat(plan.fixedPrice || plan.variation_amount || plan.variationAmount || plan.amount || plan.price || 0),
        fixedPriceDescription: plan.fixedPriceDescription || plan.name || plan.variation_name || '',
        serviceID: plan.serviceID || serviceID,
        network: networkName,
      }));
      
      console.log(`Mapped ${mappedPlans.length} plans from VTpass response`);

      return new Response(
        JSON.stringify({ 
          success: true,
          data: mappedPlans,
          metadata: {
            total_plans: mappedPlans.length,
            imported: imported,
            updated: updated,
            errors: errors.length,
            serviceID,
            network: networkName,
            source: 'vtpass',
            mode: VTPASS_MODE,
            response_description: data.response_description || data.message || 'Success',
          },
          errors: errors.length > 0 ? errors : undefined
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

