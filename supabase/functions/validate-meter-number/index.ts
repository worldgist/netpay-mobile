import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseKey = Deno.env.get('SUPABASE_ANON_KEY')!;
    const mobilenigPublicKey = Deno.env.get('MOBILENIG_PUBLIC_KEY');

    if (!mobilenigPublicKey) {
      console.error('MOBILENIG_PUBLIC_KEY not configured');
      return new Response(
        JSON.stringify({ error: 'Service configuration error' }),
        { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const authHeader = req.headers.get('Authorization');
    if (!authHeader) {
      return new Response(
        JSON.stringify({ error: 'Missing authorization header' }),
        { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const supabase = createClient(supabaseUrl, supabaseKey, {
      global: {
        headers: { Authorization: authHeader },
      },
    });

    const { data: { user }, error: userError } = await supabase.auth.getUser();
    if (userError || !user) {
      console.error('Authentication error:', userError);
      return new Response(
        JSON.stringify({ error: 'Unauthorized' }),
        { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const { meter_number, provider, meter_type } = await req.json();

    if (!meter_number || !provider || !meter_type) {
      return new Response(
        JSON.stringify({ error: 'Meter number, provider, and meter type are required' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    console.log('Validating meter:', { meter_number, provider, meter_type });

    // Map provider to service IDs
    const providerServiceMap: { [key: string]: { prepaid: string; postpaid: string } } = {
      IKEJA: { prepaid: 'AMA', postpaid: 'AMB' },
      IKEDC: { prepaid: 'AMA', postpaid: 'AMB' },
      EKO: { prepaid: 'ANA', postpaid: 'ANB' },
      EKEDC: { prepaid: 'ANA', postpaid: 'ANB' },
      ABUJA: { prepaid: 'AHB', postpaid: 'AHA' },
      AEDC: { prepaid: 'AHB', postpaid: 'AHA' },
      KADUNA: { prepaid: 'AGB', postpaid: 'AGA' },
      KAEDCO: { prepaid: 'AGB', postpaid: 'AGA' },
      IBADAN: { prepaid: 'AEA', postpaid: 'AEB' },
      IBEDC: { prepaid: 'AEA', postpaid: 'AEB' },
      KANO: { prepaid: 'AFA', postpaid: 'AFB' },
      KEDCO: { prepaid: 'AFA', postpaid: 'AFB' },
      PORTHARCOURT: { prepaid: 'ADB', postpaid: 'ADA' },
      PHEDC: { prepaid: 'ADB', postpaid: 'ADA' },
      JOS: { prepaid: 'ACB', postpaid: 'ACA' },
      JED: { prepaid: 'ACB', postpaid: 'ACA' },
    };

    const serviceIds = providerServiceMap[provider.toUpperCase()];
    if (!serviceIds) {
      console.error('Invalid provider:', provider);
      return new Response(
        JSON.stringify({ error: 'Invalid provider', success: false }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const serviceId = meter_type === 'prepaid' ? serviceIds.prepaid : serviceIds.postpaid;
    console.log('Using service ID:', serviceId);

    // Validate meter with MobileNig API using proxy endpoint
    const response = await fetch('https://enterprise.mobilenig.com/api/v2/services/proxy', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${mobilenigPublicKey}`,
      },
      body: JSON.stringify({
        service_id: serviceId,
        customerAccountId: meter_number,
      }),
    });

    const data = await response.json();
    console.log('Validation response:', data);

    if (response.ok && data.statusCode === '200' && data.message === 'success') {
      const details = data.details || {};
      return new Response(
        JSON.stringify({
          success: true,
          data: {
            customer_name: details.customerName || 'Customer',
            address: details.customerAddress || '',
            meter_number: details.customerReference || meter_number,
            tariff: details.tariff || '',
            minimum_vend: details.minimumVend || 0,
          }
        }),
        { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    } else {
      const message =
        typeof data.details === 'string'
          ? data.details
          : (data.details?.responseMessage || data.message || 'Validation failed');
      return new Response(
        JSON.stringify({ success: false, error: message }),
        { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }
 
  } catch (error) {
    console.error('Error in validate-meter-number function:', error);
    return new Response(
      JSON.stringify({
        error: 'Validation failed',
        details: error instanceof Error ? error.message : 'Unknown error'
      }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});
