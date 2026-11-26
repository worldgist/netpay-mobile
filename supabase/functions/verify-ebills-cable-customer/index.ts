import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { getEBillsToken, verifyEBillsCableCustomer, getEBillsServiceId } from "../_shared/ebills-api.ts";

const CORS_HEADERS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
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
      console.error('verify-ebills-cable-customer: unable to parse request body:', error);
      return new Response(
        JSON.stringify({ success: false, error: 'Invalid request body' }),
        { status: 400, headers: { ...CORS_HEADERS, 'Content-Type': 'application/json' } }
      );
    }

    const card_number = (parsedBody.card_number || parsedBody.billersCode || parsedBody.smartcard_number || parsedBody.customer_id) as string;
    const provider = parsedBody.provider as string;

    if (!card_number) {
      return new Response(
        JSON.stringify({ success: false, error: 'card_number (smartcard number) is required' }),
        { status: 200, headers: { ...CORS_HEADERS, 'Content-Type': 'application/json' } }
      );
    }

    if (!provider) {
      return new Response(
        JSON.stringify({ success: false, error: 'provider is required (e.g., DSTV, GOTV, STARTIMES)' }),
        { status: 200, headers: { ...CORS_HEADERS, 'Content-Type': 'application/json' } }
      );
    }

    // Normalize smartcard number (remove spaces, keep only digits)
    const sanitizedSmartcard = card_number.replace(/[^\d]/g, '').trim();

    if (!sanitizedSmartcard) {
      return new Response(
        JSON.stringify({ success: false, error: 'Invalid smartcard number' }),
        { status: 200, headers: { ...CORS_HEADERS, 'Content-Type': 'application/json' } }
      );
    }

    // Get eBills service ID from provider
    const serviceId = getEBillsServiceId(provider);

    console.log('Verifying cable customer with eBills:', {
      customer_id: sanitizedSmartcard,
      provider,
      service_id: serviceId,
    });

    try {
      // Get eBills token and verify customer
      const token = await getEBillsToken();
      const verificationData = await verifyEBillsCableCustomer(token, sanitizedSmartcard, serviceId);

      // Map eBills response to our standard format
      return new Response(
        JSON.stringify({
          success: true,
          data: {
            customer_name: verificationData.data.customer_name,
            status: verificationData.data.status,
            due_date: verificationData.data.due_date,
            customer_number: verificationData.data.customer_id,
            smartcard_number: sanitizedSmartcard,
            card_number: sanitizedSmartcard,
            balance: verificationData.data.balance,
            current_bouquet: verificationData.data.current_bouquet,
            renewal_amount: verificationData.data.renewal_amount,
            service_name: verificationData.data.service_name,
            service_id: serviceId,
            provider: provider.toUpperCase(),
          },
        }),
        { status: 200, headers: { ...CORS_HEADERS, 'Content-Type': 'application/json' } }
      );
    } catch (ebillsError) {
      console.error('eBills API error:', ebillsError);
      
      const errorMessage = ebillsError instanceof Error ? ebillsError.message : 'Customer verification failed';
      
      // Check if it's an invalid card error
      const lowerCaseError = errorMessage.toLowerCase();
      const isInvalidCard = 
        lowerCaseError.includes('invalid') ||
        lowerCaseError.includes('not found') ||
        lowerCaseError.includes('customer not found') ||
        lowerCaseError.includes('failure');

      return new Response(
        JSON.stringify({
          success: false,
          error: errorMessage,
          errorType: isInvalidCard ? 'invalid_card' : 'verification_error',
        }),
        { status: 200, headers: { ...CORS_HEADERS, 'Content-Type': 'application/json' } }
      );
    }
  } catch (error) {
    console.error('verify-ebills-cable-customer error:', error);
    return new Response(
      JSON.stringify({
        success: false,
        error: error instanceof Error ? error.message : 'Unexpected error',
      }),
      { status: 500, headers: { ...CORS_HEADERS, 'Content-Type': 'application/json' } }
    );
  }
});









