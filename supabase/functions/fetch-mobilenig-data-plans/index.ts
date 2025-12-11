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
    const PUBLIC_KEY = Deno.env.get('MOBILENIG_PUBLIC_KEY');
    
    if (!PUBLIC_KEY) {
      return new Response(
        JSON.stringify({ success: false, error: 'MOBILENIG_PUBLIC_KEY not configured' }),
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

    // Parse request body
    const { network } = await req.json();

    if (!network) {
      return new Response(
        JSON.stringify({ success: false, error: 'network is required' }),
        { status: 400, headers: { ...CORS_HEADERS, 'Content-Type': 'application/json' } }
      );
    }

    console.log(`Fetching data plans for network: ${network}`);

    // Normalize network name
    const normalizedNetwork = network.trim().toUpperCase();

    // Map network to MobileNig service_id for data bundles
    // BCA = MTN, ACA = Airtel, GCA = Glo, 9CA = 9Mobile
    const networkServiceMap: Record<string, string> = {
      'MTN': 'BCA',
      'MTN NIGERIA': 'BCA',
      'AIRTEL': 'ACA',
      'AIRTEL NIGERIA': 'ACA',
      'GLO': 'GCA',
      'GLOBACOM': 'GCA',
      '9MOBILE': '9CA',
      '9 MOBILE': '9CA',
      '9MOB': '9CA',
      'ETISALAT': '9CA',
    };

    const serviceId = networkServiceMap[normalizedNetwork] || 'BCA';
    console.log(`Using service_id: ${serviceId} for network: ${normalizedNetwork}`);

    // Try both SME and GIFTING requestTypes
    const requestTypes = ['SME', 'GIFTING'];
    let result: any = null;
    let successfulRequestType: string | null = null;

    for (const requestType of requestTypes) {
      try {
        console.log(`Trying requestType: ${requestType} for service_id: ${serviceId}`);

        // Call MobileNig API exactly as documented
        const response = await fetch('https://enterprise.mobilenig.com/api/v2/services/packages', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${PUBLIC_KEY}`,
          },
          body: JSON.stringify({
            service_id: serviceId,
            requestType: requestType
          }),
        });

        const responseText = await response.text();
        console.log(`Response status: ${response.status}`);
        console.log(`Response text (first 1000 chars):`, responseText.substring(0, 1000));

        if (!response.ok) {
          console.warn(`HTTP ${response.status} for requestType ${requestType}`);
          continue;
        }

        try {
          const parsed = JSON.parse(responseText);
          console.log(`Parsed response for ${requestType}:`, JSON.stringify(parsed, null, 2));
          
          // Store response for debugging
          allResponses.push({
            requestType,
            status: response.status,
            response: parsed
          });

          // Check for success
          if (parsed.statusCode === '200' || parsed.message === 'success') {
            // Check if we have data plans
            let plansArray: any[] = [];

            // Check different possible locations for plans
            if (Array.isArray(parsed.details)) {
              plansArray = parsed.details;
            } else if (Array.isArray(parsed.data)) {
              plansArray = parsed.data;
            } else if (parsed.details && typeof parsed.details === 'object') {
              if (Array.isArray(parsed.details.packages)) {
                plansArray = parsed.details.packages;
              } else if (Array.isArray(parsed.details.data)) {
                plansArray = parsed.details.data;
              } else if (Array.isArray(parsed.details.plans)) {
                plansArray = parsed.details.plans;
              } else {
                // Try to find any array in details
                const values = Object.values(parsed.details);
                const arrays = values.filter(v => Array.isArray(v)) as any[][];
                if (arrays.length > 0) {
                  plansArray = arrays[0];
                }
              }
            }

            if (plansArray.length > 0) {
              result = parsed;
              successfulRequestType = requestType;
              console.log(`✓ Success with requestType ${requestType} - Found ${plansArray.length} plans`);
              break;
            } else {
              console.log(`✗ requestType ${requestType}: Success response but no plans found`);
            }
          } else {
            console.log(`✗ requestType ${requestType}: API returned non-success - statusCode: ${parsed.statusCode}, message: ${parsed.message || parsed.details || 'Unknown error'}`);
          }
        } catch (parseError) {
          console.error(`Parse error for requestType ${requestType}:`, parseError);
          continue;
        }
      } catch (error) {
        console.error(`Error with requestType ${requestType}:`, error);
        continue;
      }
    }

    if (!result) {
      // Return all responses for debugging
      let debugInfo: any = {
        service_id: serviceId,
        network: normalizedNetwork,
        all_responses: allResponses,
        public_key_configured: !!PUBLIC_KEY
      };

      return new Response(
        JSON.stringify({ 
          success: false, 
          error: 'No data plans found from MobileNig API',
          data: [],
          debug: debugInfo,
          note: 'MobileNig may not return data plans via this endpoint. Check the debug info for the actual API response. Try importing from VTpass or SMEPlug, then manually add mobilenig_code to each plan.'
        }),
        { 
          status: 200, 
          headers: { ...CORS_HEADERS, 'Content-Type': 'application/json' } 
        }
      );
    }

    console.log(`Successfully fetched data using requestType: ${successfulRequestType}`);
    console.log('MobileNig API result:', JSON.stringify(result, null, 2));

    // Extract plans from result
    let plansArray: any[] = [];
    
    if (Array.isArray(result.details)) {
      plansArray = result.details;
      console.log(`Found ${plansArray.length} plans in result.details array`);
    } else if (Array.isArray(result.data)) {
      plansArray = result.data;
      console.log(`Found ${plansArray.length} plans in result.data array`);
    } else if (result.details && typeof result.details === 'object') {
      if (Array.isArray(result.details.packages)) {
        plansArray = result.details.packages;
        console.log(`Found ${plansArray.length} plans in result.details.packages`);
      } else if (Array.isArray(result.details.data)) {
        plansArray = result.details.data;
        console.log(`Found ${plansArray.length} plans in result.details.data`);
      } else if (Array.isArray(result.details.plans)) {
        plansArray = result.details.plans;
        console.log(`Found ${plansArray.length} plans in result.details.plans`);
      } else {
        // Try to find any array in the details object
        const values = Object.values(result.details);
        const arrays = values.filter(v => Array.isArray(v)) as any[][];
        if (arrays.length > 0) {
          plansArray = arrays[0];
          console.log(`Found ${plansArray.length} plans in first array within result.details`);
        }
      }
    }

    if (!plansArray || plansArray.length === 0) {
      return new Response(
        JSON.stringify({ 
          success: false, 
          error: 'No data plans found in MobileNig response',
          data: [],
          details: result
        }),
        { 
          status: 200, 
          headers: { ...CORS_HEADERS, 'Content-Type': 'application/json' } 
        }
      );
    }

    console.log(`Processing ${plansArray.length} plans from MobileNig API`);
    if (plansArray.length > 0) {
      console.log('Sample plan structure (first plan):', JSON.stringify(plansArray[0], null, 2));
    }

    // Transform the data to match our data_plans schema
    const plans = plansArray.map((plan: any, index: number) => {
      // Extract plan information - try multiple field names
      const productCode = plan.productCode || plan.code || plan.id || plan.plan_id || plan.variation_code || '';
      const name = plan.name || plan.planName || plan.description || plan.title || plan.plan || plan.variation_name || 'Unknown Plan';
      const amount = parseFloat(plan.amount || plan.price || plan.cost || plan.variation_amount || 0);
      const validity = plan.validity || plan.duration || plan.expiry || plan.validity_period || 'N/A';
      const size = plan.size || plan.dataSize || plan.volume || '';

      if (index < 3) {
        console.log(`Plan ${index + 1} mapping:`, {
          raw: plan,
          extracted: { productCode, name, amount, validity, size }
        });
      }

      // Return in format expected by DataPlans.tsx
      return {
        variation_code: productCode,
        code: productCode,
        id: productCode,
        plan_id: productCode,
        plan: name,
        name: name,
        variation_name: name,
        amount: amount,
        price: amount,
        variation_amount: amount,
        validity: validity,
        duration: validity,
        validity_period: validity,
        size: size,
        network: normalizedNetwork,
        productCode: productCode,
        planName: name,
      };
    });

    // Filter out invalid plans
    const validPlans = plans.filter((plan: any) => {
      const isValid = plan.code && plan.amount > 0;
      if (!isValid && plans.indexOf(plan) < 3) {
        console.warn(`Filtering out invalid plan:`, plan);
      }
      return isValid;
    });

    console.log(`Mapped ${validPlans.length} valid plans from ${plansArray.length} total plans`);

    if (validPlans.length === 0) {
      console.error('No valid plans after mapping. Sample raw plans:', JSON.stringify(plansArray.slice(0, 3), null, 2));
      return new Response(
        JSON.stringify({ 
          success: false, 
          error: 'No valid data plans found after processing. Plans may be missing required fields (code, amount).',
          data: [],
          details: result,
          sample_plans: plansArray.slice(0, 3),
          mapped_plans: plans.slice(0, 3)
        }),
        { 
          status: 200, 
          headers: { ...CORS_HEADERS, 'Content-Type': 'application/json' } 
        }
      );
    }

    // Store plans in database
    let imported = 0;
    let updated = 0;
    const errors: string[] = [];

    for (const plan of validPlans) {
      try {
        // Map to database schema
        const planPrice = parseFloat(String(plan.amount || plan.price || 0));
        const planName = String(plan.name || plan.plan || 'Unknown Plan').trim();
        const productCode = String(plan.code || plan.productCode || '');
        const validity = String(plan.validity || plan.duration || 'N/A').trim();

        // Extract size from plan name if available
        const sizeMatch = planName.match(/(\d+\s*(GB|MB|TB))/i);
        const size = sizeMatch ? sizeMatch[1] : (plan.size || null);

        const dbPlan: any = {
          network: normalizedNetwork,
          plan_name: planName,
          price: planPrice,
          original_price: planPrice,
          validity: validity,
          api_code: productCode,
          mobilenig_code: productCode,
          provider: 'mobilenig',
          is_active: true,
          plan_type: successfulRequestType || 'SME',
        };

        if (size) {
          dbPlan.size = size;
        }

        // Check if plan already exists (match by network and api_code or mobilenig_code)
        let existing: any = null;
        
        if (productCode) {
          // First try to find by api_code or mobilenig_code
          const { data: byCode } = await supabase
            .from('data_plans')
            .select('id, mobilenig_code, api_code, plan_name, price')
            .eq('network', normalizedNetwork)
            .or(`api_code.eq.${productCode},mobilenig_code.eq.${productCode}`)
            .maybeSingle();
          
          existing = byCode;
        }
        
        // If not found by code, try to find by similar name and price
        if (!existing && planName) {
          const { data: similar } = await supabase
            .from('data_plans')
            .select('id, mobilenig_code, api_code, plan_name, price')
            .eq('network', normalizedNetwork)
            .ilike('plan_name', `%${planName.substring(0, 20)}%`)
            .maybeSingle();
          
          if (similar && similar.price && planPrice && 
              Math.abs(similar.price - planPrice) / Math.max(similar.price, planPrice) < 0.1) {
            existing = similar;
          }
        }

        if (existing) {
          // Update existing plan - add mobilenig_code if missing
          const updateData: any = {};
          if (!existing.mobilenig_code && productCode) {
            updateData.mobilenig_code = productCode;
          }
          if (!existing.api_code && productCode) {
            updateData.api_code = productCode;
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

    return new Response(
      JSON.stringify({ 
        success: true,
        data: validPlans,
        metadata: {
          total_plans: validPlans.length,
          imported: imported,
          updated: updated,
          errors: errors.length,
          network: normalizedNetwork,
          service_id: serviceId,
          request_type: successfulRequestType,
          source: 'mobilenig'
        },
        errors: errors.length > 0 ? errors : undefined
      }),
      { 
        status: 200, 
        headers: { ...CORS_HEADERS, 'Content-Type': 'application/json' } 
      }
    );

  } catch (error) {
    console.error('Error in fetch-mobilenig-data-plans function:', error);
    
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
