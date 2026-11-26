import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { getEBillsToken, verifyEBillsBettingCustomer, getEBillsBettingServiceId } from "../_shared/ebills-api.ts";

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

    // Check if user is demo user
    const { data: profile } = await supabase
      .from('profiles')
      .select('email')
      .eq('id', user.id)
      .maybeSingle();
    
    const isDemoUser = profile?.email === 'demo@netppay.com';
    
    // Demo account IDs that work for testing
    const DEMO_ACCOUNT_IDS = ['1234567890', 'demo123', 'testaccount', '9999999999'];

    // Parse request body
    let parsedBody: Record<string, unknown> = {};
    try {
      const bodyText = await req.text();
      if (bodyText && bodyText.trim().length > 0) {
        parsedBody = JSON.parse(bodyText);
      }
    } catch (error) {
      console.error('verify-ebills-betting-customer: unable to parse request body:', error);
      return new Response(
        JSON.stringify({ success: false, error: 'Invalid request body' }),
        { status: 400, headers: { ...CORS_HEADERS, 'Content-Type': 'application/json' } }
      );
    }

    const customer_id = (parsedBody.customer_id || parsedBody.account_id || parsedBody.account_number) as string;
    const betting_provider = parsedBody.betting_provider as string;

    if (!customer_id) {
      return new Response(
        JSON.stringify({ success: false, error: 'customer_id (Account ID / User ID) is required' }),
        { status: 200, headers: { ...CORS_HEADERS, 'Content-Type': 'application/json' } }
      );
    }

    if (!betting_provider) {
      return new Response(
        JSON.stringify({ success: false, error: 'betting_provider is required (e.g., Bet9ja, SportyBet, BetKing)' }),
        { status: 200, headers: { ...CORS_HEADERS, 'Content-Type': 'application/json' } }
      );
    }

    // Sanitize customer ID
    const sanitizedCustomerId = customer_id.trim();

    if (!sanitizedCustomerId) {
      return new Response(
        JSON.stringify({ success: false, error: 'Invalid customer ID' }),
        { status: 200, headers: { ...CORS_HEADERS, 'Content-Type': 'application/json' } }
      );
    }

    // Get eBills service ID from provider
    const serviceId = getEBillsBettingServiceId(betting_provider);

    console.log('Verifying betting customer with eBills:', {
      customer_id: sanitizedCustomerId.substring(0, 4) + '***', // Partial for privacy
      betting_provider,
      service_id: serviceId,
      provider_upper: betting_provider.toUpperCase(),
      provider_lower: betting_provider.toLowerCase(),
      isDemoUser,
    });

    // For demo users with demo account IDs, return mock verification data
    if (isDemoUser && DEMO_ACCOUNT_IDS.includes(sanitizedCustomerId)) {
      return new Response(
        JSON.stringify({
          success: true,
          data: {
            customer_name: `Demo Customer - ${betting_provider}`,
            customer_username: sanitizedCustomerId,
            customer_email_address: `demo${sanitizedCustomerId}@example.com`,
            customer_phone_number: '08012345678',
            minimum_amount: 100,
            maximum_amount: 100000,
            status: 'active',
            customer_id: sanitizedCustomerId,
            account_number: sanitizedCustomerId,
            service_name: betting_provider.toUpperCase(),
            service_id: serviceId,
            betting_provider: betting_provider.toUpperCase(),
          },
        }),
        { status: 200, headers: { ...CORS_HEADERS, 'Content-Type': 'application/json' } }
      );
    }

    try {
      // Get eBills token and verify customer
      const token = await getEBillsToken();
      const verificationData = await verifyEBillsBettingCustomer(token, sanitizedCustomerId, serviceId);

      // Map eBills response to our standard format
      return new Response(
        JSON.stringify({
          success: true,
          data: {
            customer_name: verificationData.data.customer_name,
            customer_username: verificationData.data.customer_username,
            customer_email_address: verificationData.data.customer_email_address,
            customer_phone_number: verificationData.data.customer_phone_number,
            status: verificationData.data.status,
            minimum_amount: verificationData.data.minimum_amount ?? 100,
            maximum_amount: verificationData.data.maximum_amount ?? 100000,
            customer_id: verificationData.data.customer_id,
            account_number: sanitizedCustomerId,
            service_name: verificationData.data.service_name,
            service_id: serviceId,
            betting_provider: betting_provider.toUpperCase(),
          },
        }),
        { status: 200, headers: { ...CORS_HEADERS, 'Content-Type': 'application/json' } }
      );
    } catch (ebillsError) {
      console.error('eBills API error:', ebillsError);
      
      let errorMessage = ebillsError instanceof Error ? ebillsError.message : 'Customer verification failed';
      
      // Try to extract JSON from error message if it's embedded
      try {
        if (errorMessage.includes('{') && errorMessage.includes('code')) {
          const jsonMatch = errorMessage.match(/\{[\s\S]*\}/);
          if (jsonMatch) {
            const parsedError = JSON.parse(jsonMatch[0]);
            if (parsedError.message) {
              errorMessage = parsedError.message;
            }
          }
        }
      } catch (parseError) {
        // If parsing fails, use original error message
        console.warn('Failed to parse embedded JSON in error:', parseError);
      }
      
      // Check error type - order matters! Check more specific errors first
      const lowerCaseError = errorMessage.toLowerCase();
      
      // Check if it's an invalid service_id error FIRST (before invalid customer)
      const isInvalidServiceId = 
        lowerCaseError.includes('invalid field') ||
        lowerCaseError.includes('invalid service') ||
        lowerCaseError.includes('invalid service_id') ||
        lowerCaseError.includes('enter a valid service_id') ||
        lowerCaseError.includes('valid service_id');
      
      // Check if it's a service unavailable error
      const isServiceUnavailable = 
        lowerCaseError.includes('service currently not available') ||
        lowerCaseError.includes('service not available') ||
        lowerCaseError.includes('service unavailable');
      
      // Check if it's an invalid customer error (only if not already categorized)
      const isInvalidCustomer = 
        !isInvalidServiceId && !isServiceUnavailable && (
          lowerCaseError.includes('customer not found') ||
          lowerCaseError.includes('account not found') ||
          lowerCaseError.includes('user not found') ||
          (lowerCaseError.includes('not found') && !lowerCaseError.includes('service')) ||
          (lowerCaseError.includes('failure') && !lowerCaseError.includes('service') && !lowerCaseError.includes('field'))
        );

      // Log detailed error for debugging
      console.error('eBills verification error details:', {
        errorMessage,
        betting_provider,
        service_id: getEBillsBettingServiceId(betting_provider),
        isInvalidCustomer,
        isInvalidServiceId,
        isServiceUnavailable,
        errorType: isInvalidCustomer ? 'invalid_customer' : (isInvalidServiceId ? 'invalid_service_id' : (isServiceUnavailable ? 'service_unavailable' : 'verification_error')),
        originalError: ebillsError instanceof Error ? {
          message: ebillsError.message,
          stack: ebillsError.stack,
        } : ebillsError,
      });

      // Determine error type
      let errorType = 'verification_error';
      if (isInvalidCustomer) {
        errorType = 'invalid_customer';
      } else if (isInvalidServiceId) {
        errorType = 'invalid_service_id';
      } else if (isServiceUnavailable) {
        errorType = 'service_unavailable';
      }

      return new Response(
        JSON.stringify({
          success: false,
          error: errorMessage,
          errorType,
          details: {
            betting_provider,
            service_id: getEBillsBettingServiceId(betting_provider),
          },
        }),
        { status: 200, headers: { ...CORS_HEADERS, 'Content-Type': 'application/json' } }
      );
    }
  } catch (error) {
    console.error('verify-ebills-betting-customer error:', error);
    return new Response(
      JSON.stringify({
        success: false,
        error: error instanceof Error ? error.message : 'Unexpected error',
      }),
      { status: 500, headers: { ...CORS_HEADERS, 'Content-Type': 'application/json' } }
    );
  }
});


