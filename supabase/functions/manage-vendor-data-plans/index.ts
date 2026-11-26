import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const CORS_HEADERS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

const inferPlanType = (planName: string, explicitType?: string | null) => {
  if (explicitType && explicitType.trim()) {
    return explicitType.trim();
  }

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
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: CORS_HEADERS });
  }

  try {
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
    const { data: roles } = await supabase
      .from('user_roles')
      .select('role')
      .eq('user_id', user.id)
      .eq('role', 'admin')
      .single();

    if (!roles) {
      return new Response(
        JSON.stringify({ success: false, error: 'Admin access required' }),
        { status: 403, headers: { ...CORS_HEADERS, 'Content-Type': 'application/json' } }
      );
    }

    const { method } = req;
    const url = new URL(req.url);
    const action = url.searchParams.get('action') || 'list';

    // Handle different actions
    switch (method) {
      case 'GET':
        return await handleGet(supabase, action, url.searchParams);
      
      case 'POST':
        const body = await req.json();
        return await handlePost(supabase, action, body);
      
      case 'PUT':
        const updateBody = await req.json();
        return await handlePut(supabase, updateBody);
      
      case 'DELETE':
        const deleteId = url.searchParams.get('id');
        return await handleDelete(supabase, deleteId);
      
      default:
        return new Response(
          JSON.stringify({ success: false, error: 'Method not allowed' }),
          { status: 405, headers: { ...CORS_HEADERS, 'Content-Type': 'application/json' } }
        );
    }
  } catch (error) {
    console.error('Error in manage-vendor-data-plans:', error);
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

// GET - List plans or get single plan
async function handleGet(supabase: any, action: string, params: URLSearchParams) {
  if (action === 'single') {
    const id = params.get('id');
    if (!id) {
      return new Response(
        JSON.stringify({ success: false, error: 'Plan ID required' }),
        { status: 400, headers: { ...CORS_HEADERS, 'Content-Type': 'application/json' } }
      );
    }

    const { data, error } = await supabase
      .from('data_plans')
      .select('*')
      .eq('id', id)
      .single();

    if (error) {
      return new Response(
        JSON.stringify({ success: false, error: error.message }),
        { status: 500, headers: { ...CORS_HEADERS, 'Content-Type': 'application/json' } }
      );
    }

    return new Response(
      JSON.stringify({ success: true, data }),
      { status: 200, headers: { ...CORS_HEADERS, 'Content-Type': 'application/json' } }
    );
  }

  // List plans with filters
  const network = params.get('network');
  const isActive = params.get('is_active');
  const vendor = params.get('vendor'); // Filter by vendor code availability

  let query = supabase
    .from('vendor_data_plans')
    .select('*')
    .order('network', { ascending: true })
    .order('base_price', { ascending: true });

  if (network) {
    query = query.eq('network', network.toUpperCase());
  }

  if (isActive !== null) {
    query = query.eq('is_active', isActive === 'true');
  }

  if (vendor) {
    const vendorLower = vendor.toLowerCase();
    if (vendorLower === 'mobilenig') {
      query = query.not('mobilenig_code', 'is', null);
    } else if (vendorLower === 'vtpass') {
      query = query.not('vtpass_code', 'is', null);
    } else if (vendorLower === 'smeplug') {
      query = query.not('smeplug_code', 'is', null);
    }
  }

  const { data, error } = await query;

  if (error) {
    return new Response(
      JSON.stringify({ success: false, error: error.message }),
      { status: 500, headers: { ...CORS_HEADERS, 'Content-Type': 'application/json' } }
    );
  }

  return new Response(
    JSON.stringify({ success: true, data, count: data?.length || 0 }),
    { status: 200, headers: { ...CORS_HEADERS, 'Content-Type': 'application/json' } }
  );
}

// POST - Create new plan or import from vendor
async function handlePost(supabase: any, action: string, body: any) {
  if (action === 'import') {
    return await handleImport(supabase, body);
  }

  // Create new plan
  const {
    network,
    plan_name,
    price,
    mobilenig_code,
    vtpass_code,
    smeplug_code,
    api_code,
    custom_price,
    user_price,
    original_price,
    plan_type,
    size,
    validity,
    is_active
  } = body;

  if (!network || !plan_name || !price) {
    return new Response(
      JSON.stringify({ success: false, error: 'network, plan_name, and price are required' }),
      { status: 400, headers: { ...CORS_HEADERS, 'Content-Type': 'application/json' } }
    );
  }

  // Check if at least one vendor code is provided
  if (!mobilenig_code && !vtpass_code && !smeplug_code && !api_code) {
    return new Response(
      JSON.stringify({ success: false, error: 'At least one vendor code (mobilenig_code, vtpass_code, smeplug_code, or api_code) is required' }),
      { status: 400, headers: { ...CORS_HEADERS, 'Content-Type': 'application/json' } }
    );
  }

  const { data, error } = await supabase
    .from('data_plans')
    .insert({
      network: network.toUpperCase(),
      plan_name,
      price: parseFloat(price),
      mobilenig_code: mobilenig_code || null,
      vtpass_code: vtpass_code || null,
      smeplug_code: smeplug_code || null,
      api_code: api_code || null,
      custom_price: custom_price ? parseFloat(custom_price) : null,
      user_price: user_price ? parseFloat(user_price) : null,
      original_price: original_price ? parseFloat(original_price) : null,
      plan_type: plan_type || 'SME',
      size: size || null,
      validity: validity || null,
      is_active: is_active !== undefined ? is_active : true,
      provider: 'anyone' // Default when multiple vendors supported
    })
    .select()
    .single();

  if (error) {
    return new Response(
      JSON.stringify({ success: false, error: error.message }),
      { status: 500, headers: { ...CORS_HEADERS, 'Content-Type': 'application/json' } }
    );
  }

  return new Response(
    JSON.stringify({ success: true, data }),
    { status: 201, headers: { ...CORS_HEADERS, 'Content-Type': 'application/json' } }
  );
}

// PUT - Update plan
async function handlePut(supabase: any, body: any) {
  const { id, ...updates } = body;

  if (!id) {
    return new Response(
      JSON.stringify({ success: false, error: 'Plan ID is required' }),
      { status: 400, headers: { ...CORS_HEADERS, 'Content-Type': 'application/json' } }
    );
  }

      // Convert price fields to numbers if provided
      if (updates.price) updates.price = parseFloat(updates.price);
      if (updates.custom_price) updates.custom_price = parseFloat(updates.custom_price);
      if (updates.user_price) updates.user_price = parseFloat(updates.user_price);
      if (updates.original_price) updates.original_price = parseFloat(updates.original_price);

  // Normalize network to uppercase
  if (updates.network) {
    updates.network = updates.network.toUpperCase();
  }

  const { data, error } = await supabase
    .from('vendor_data_plans')
    .update(updates)
    .eq('id', id)
    .select()
    .single();

  if (error) {
    return new Response(
      JSON.stringify({ success: false, error: error.message }),
      { status: 500, headers: { ...CORS_HEADERS, 'Content-Type': 'application/json' } }
    );
  }

  return new Response(
    JSON.stringify({ success: true, data }),
    { status: 200, headers: { ...CORS_HEADERS, 'Content-Type': 'application/json' } }
  );
}

// DELETE - Delete plan
async function handleDelete(supabase: any, id: string | null) {
  if (!id) {
    return new Response(
      JSON.stringify({ success: false, error: 'Plan ID is required' }),
      { status: 400, headers: { ...CORS_HEADERS, 'Content-Type': 'application/json' } }
    );
  }

  const { error } = await supabase
    .from('vendor_data_plans')
    .delete()
    .eq('id', id);

  if (error) {
    return new Response(
      JSON.stringify({ success: false, error: error.message }),
      { status: 500, headers: { ...CORS_HEADERS, 'Content-Type': 'application/json' } }
    );
  }

  return new Response(
    JSON.stringify({ success: true, message: 'Plan deleted successfully' }),
    { status: 200, headers: { ...CORS_HEADERS, 'Content-Type': 'application/json' } }
  );
}

// Import plans from vendor APIs
async function handleImport(supabase: any, body: any) {
  const { vendor, network } = body;

  if (!vendor || !network) {
    return new Response(
      JSON.stringify({ success: false, error: 'vendor and network are required' }),
      { status: 400, headers: { ...CORS_HEADERS, 'Content-Type': 'application/json' } }
    );
  }

  // Call the appropriate fetch function
  let fetchFunction = '';
  let requestBody: any = {};

  if (vendor === 'mobilenig') {
    fetchFunction = 'fetch-mobilenig-cable-packages';
    requestBody = { action: 'data-plans', network };
  } else if (vendor === 'vtpass') {
    fetchFunction = 'fetch-vtpass-data-plans';
    requestBody = { network };
  } else if (vendor === 'smeplug') {
    fetchFunction = 'fetch-smeplug-data-plans';
    // SMEPlug needs network_id, but we'll handle that in the function
    requestBody = { network };
  } else {
    return new Response(
      JSON.stringify({ success: false, error: 'Invalid vendor. Supported: mobilenig, vtpass, smeplug' }),
      { status: 400, headers: { ...CORS_HEADERS, 'Content-Type': 'application/json' } }
    );
  }

  // Fetch plans from vendor API
  const fetchUrl = `${Deno.env.get('SUPABASE_URL')}/functions/v1/${fetchFunction}`;
  const fetchResponse = await fetch(fetchUrl, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')}`,
    },
    body: JSON.stringify(requestBody),
  });

  const fetchData = await fetchResponse.json();

  if (!fetchData.success || !fetchData.data) {
    return new Response(
      JSON.stringify({ success: false, error: fetchData.error || 'Failed to fetch plans from vendor' }),
      { status: 500, headers: { ...CORS_HEADERS, 'Content-Type': 'application/json' } }
    );
  }

  const plans = Array.isArray(fetchData.data) ? fetchData.data : [];
  let imported = 0;
  let updated = 0;
  const errors: string[] = [];

  // Process each plan
  for (const plan of plans) {
    try {
      // Map vendor response to our schema
      const planPrice = parseFloat(plan.amount || plan.price || plan.variation_amount || 0);
      const mappedPlan: any = {
        network: network.toUpperCase(),
        plan_name: plan.name || plan.plan_name || plan.variation_name || 'Unknown Plan',
        price: planPrice,
        original_price: planPrice,
        plan_type: inferPlanType(
          plan.name || plan.plan_name || plan.variation_name || 'Unknown Plan',
          plan.plan_type,
        ),
        size: plan.size || null,
        validity: plan.validity || 'N/A',
        provider: vendor,
      };

      // Set vendor-specific code fields
      if (vendor === 'mobilenig') {
        mappedPlan.mobilenig_code = plan.code || plan.productCode || plan.id || '';
        mappedPlan.api_code = mappedPlan.mobilenig_code;
      } else if (vendor === 'vtpass') {
        mappedPlan.vtpass_code = plan.variation_code || plan.code || plan.id || '';
        mappedPlan.api_code = mappedPlan.vtpass_code;
      } else if (vendor === 'smeplug') {
        mappedPlan.smeplug_code = plan.id || plan.code || plan.plan_id || '';
        mappedPlan.api_code = mappedPlan.smeplug_code;
      }

      // Set api_code as fallback if not set
      if (!mappedPlan.api_code) {
        mappedPlan.api_code = mappedPlan.mobilenig_code || mappedPlan.vtpass_code || mappedPlan.smeplug_code;
      }

      // Check if plan already exists (match by network, name, and similar price within 5%)
      const { data: existing } = await supabase
        .from('data_plans')
        .select('id, mobilenig_code, vtpass_code, smeplug_code, api_code')
        .eq('network', mappedPlan.network)
        .eq('plan_name', mappedPlan.plan_name)
        .maybeSingle();

      if (existing) {
        // Update existing plan - add vendor code if missing
        const updateData: any = {};
        if (vendor === 'mobilenig' && mappedPlan.mobilenig_code && !existing.mobilenig_code) {
          updateData.mobilenig_code = mappedPlan.mobilenig_code;
        } else if (vendor === 'vtpass' && mappedPlan.vtpass_code && !existing.vtpass_code) {
          updateData.vtpass_code = mappedPlan.vtpass_code;
        } else if (vendor === 'smeplug' && mappedPlan.smeplug_code && !existing.smeplug_code) {
          updateData.smeplug_code = mappedPlan.smeplug_code;
        }
        
        // Update api_code if missing
        if (!existing.api_code && mappedPlan.api_code) {
          updateData.api_code = mappedPlan.api_code;
        }

        if (Object.keys(updateData).length > 0) {
          await supabase
            .from('data_plans')
            .update(updateData)
            .eq('id', existing.id);
          updated++;
        }
      } else {
        // Insert new plan
        await supabase
          .from('data_plans')
          .insert(mappedPlan);
        imported++;
      }
    } catch (error) {
      errors.push(`Failed to process plan: ${error instanceof Error ? error.message : String(error)}`);
    }
  }

  return new Response(
    JSON.stringify({
      success: true,
      data: {
        imported,
        updated,
        total: plans.length,
        errors: errors.length > 0 ? errors : undefined
      }
    }),
    { status: 200, headers: { ...CORS_HEADERS, 'Content-Type': 'application/json' } }
  );
}

