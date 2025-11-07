import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

// Provider to service ID mapping for MobileNig API
const PROVIDER_SERVICE_MAP: Record<string, string> = {
  'DSTV': 'AKC',
  'GOTV': 'AKA',
  'STARTIMES': 'AKB',
};

serve(async (req) => {
  // Handle CORS preflight requests
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const { card_number, provider } = await req.json();

    console.log('Validating cable customer:', { card_number, provider });

    // Validate required fields
    if (!card_number || !provider) {
      return new Response(
        JSON.stringify({
          success: false,
          error: 'Missing required fields: card_number and provider',
        }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Get service ID from provider
    const service_id = PROVIDER_SERVICE_MAP[provider];
    if (!service_id) {
      return new Response(
        JSON.stringify({
          success: false,
          error: 'Invalid provider. Supported providers: DSTV, GOTV, STARTIMES',
        }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Get MobileNig API key from environment
    const mobilenigPublicKey = Deno.env.get('MOBILENIG_PUBLIC_KEY');
    if (!mobilenigPublicKey) {
      console.error('MOBILENIG_PUBLIC_KEY not configured');
      return new Response(
        JSON.stringify({
          success: false,
          error: 'Service configuration error',
        }),
        { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Call MobileNig validation API
    console.log('Calling MobileNig API for validation:', { service_id, card_number });
    
    const response = await fetch('https://enterprise.mobilenig.com/api/v2/services/proxy', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${mobilenigPublicKey}`,
      },
      body: JSON.stringify({
        service_id,
        customerAccountId: card_number,
      }),
    });

    const responseData = await response.json();
    console.log('MobileNig validation response:', responseData);

    if (!response.ok || responseData.statusCode !== '200' || responseData.message !== 'success') {
      return new Response(
        JSON.stringify({
          success: false,
          error: responseData.details || responseData.message || 'Invalid card number or customer not found',
        }),
        { status: 404, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Check if validation was successful
    if (responseData.statusCode === "200" && responseData.message === "success") {
      // Extract customer name from response
      const details = responseData.details || {};
      const firstName = details.firstName || '';
      const lastName = details.lastName || '';
      
      // Combine first and last name, or use a fallback
      let customerName = '';
      if (firstName && lastName) {
        customerName = `${firstName} ${lastName}`.trim();
      } else if (firstName) {
        customerName = firstName;
      } else if (lastName) {
        customerName = lastName;
      } else {
        // Try other possible field names
        customerName = details.customerName || 
                      details.name || 
                      responseData.customerName ||
                      responseData.name ||
                      'Customer';
      }

      return new Response(
        JSON.stringify({
          success: true,
          data: {
            customer_name: customerName,
            card_number: card_number,
          },
        }),
        { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    } else {
      return new Response(
        JSON.stringify({
          success: false,
          error: 'Invalid card number or customer not found',
        }),
        { status: 404, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

  } catch (error: any) {
    console.error('Error validating cable customer:', error);
    return new Response(
      JSON.stringify({
        success: false,
        error: error.message || 'Internal server error',
      }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});
