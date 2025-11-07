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

    // Parse request body
    const body = await req.json();
    const examType = body.exam_type || 'WAEC';

    // Map exam type to service ID (based on MobileNig API codes)
    const serviceIdMap: Record<string, string> = {
      'WAEC': 'AJA',
      'JAMB': 'AJB',
      'NECO': 'AJC'
    };

    const service_id = serviceIdMap[examType.toUpperCase()];
    
    if (!service_id) {
      return new Response(
        JSON.stringify({ 
          success: false, 
          error: `Invalid exam type: ${examType}. Valid types are: WAEC, JAMB, NECO`
        }),
        { status: 400, headers: { ...CORS_HEADERS, 'Content-Type': 'application/json' } }
      );
    }

    console.log('Fetching education services:', {
      examType: examType.toUpperCase(),
      service_id
    });

    // Fetch education services from MobileNig API
    const response = await fetch('https://enterprise.mobilenig.com/api/v2/services/packages', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${PUBLIC_KEY}`,
      },
      body: JSON.stringify({
        service_id: service_id
      }),
    });

    const result = await response.json();
    
    console.log('MobileNig API response:', JSON.stringify(result, null, 2));

    if (!response.ok) {
      return new Response(
        JSON.stringify({ 
          success: false, 
          error: result.message || 'Failed to fetch education services',
          details: result
        }),
        { 
          status: response.status, 
          headers: { ...CORS_HEADERS, 'Content-Type': 'application/json' } 
        }
      );
    }

    // Check if we got valid data
    if (result.statusCode !== '200' || !result.details) {
      return new Response(
        JSON.stringify({ 
          success: false, 
          error: 'No education services available',
          data: [],
          service_status: result.service_status || null
        }),
        { 
          status: 200, 
          headers: { ...CORS_HEADERS, 'Content-Type': 'application/json' } 
        }
      );
    }

    // Transform the data to match our education_services schema
    // Handle both single object and array responses
    const detailsArray = Array.isArray(result.details) ? result.details : [result.details];
    
    const services = detailsArray.map((service: any) => ({
      exam_type: examType.toUpperCase(),
      service_name: service.name,
      price: parseFloat(service.price),
      original_price: parseFloat(service.price),
      api_code: service.productCode || `${examType.toUpperCase()}-${service.name.replace(/\s+/g, '-').toUpperCase()}`
    }));

    return new Response(
      JSON.stringify({ 
        success: true,
        data: services,
        service_status: result.service_status || null,
        metadata: {
          total_services: services.length,
          exam_type: examType.toUpperCase(),
          service_id: service_id
        }
      }),
      { 
        status: 200, 
        headers: { ...CORS_HEADERS, 'Content-Type': 'application/json' } 
      }
    );

  } catch (error) {
    console.error('Error in fetch-education-services function:', error);
    
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
