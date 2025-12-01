import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const CORS_HEADERS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
};

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: CORS_HEADERS });
  }

  try {
    const MOBILENIG_PUBLIC_KEY = Deno.env.get("MOBILENIG_PUBLIC_KEY");
    const MOBILENIG_SECRET_KEY = Deno.env.get("MOBILENIG_SECRET_KEY");
    const SUPABASE_URL = Deno.env.get("SUPABASE_URL") ?? "";
    const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";

    if (!MOBILENIG_PUBLIC_KEY && !MOBILENIG_SECRET_KEY) {
      return new Response(
        JSON.stringify({ error: "MOBILENIG_PUBLIC_KEY or MOBILENIG_SECRET_KEY not configured" }),
        { status: 500, headers: { ...CORS_HEADERS, "Content-Type": "application/json" } }
      );
    }

    // Use public key for this endpoint (as per documentation)
    const apiKey = MOBILENIG_PUBLIC_KEY || MOBILENIG_SECRET_KEY;

    // Initialize Supabase client
    const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

    // Get authentication token (optional - can be used for user tracking)
    const authHeader = req.headers.get("Authorization");
    let user = null;
    
    if (authHeader) {
      const token = authHeader.replace("Bearer ", "");
      const { data: userData } = await supabase.auth.getUser(token);
      user = userData?.user;
    }

    // Parse request body
    const body = await req.json();
    const { card_number, provider, smartcard_number } = body;

    // Use card_number or smartcard_number
    const smartCard = card_number || smartcard_number;
    
    if (!smartCard) {
      return new Response(
        JSON.stringify({ error: "card_number or smartcard_number is required" }),
        { status: 400, headers: { ...CORS_HEADERS, "Content-Type": "application/json" } }
      );
    }

    if (!provider) {
      return new Response(
        JSON.stringify({ error: "provider is required (DSTV, GOTV, or STARTIMES)" }),
        { status: 400, headers: { ...CORS_HEADERS, "Content-Type": "application/json" } }
      );
    }

    // Map provider to service ID
    const serviceIdMap: Record<string, string> = {
      'GOTV': 'AKA',
      'STARTIMES': 'AKB',
      'DSTV': 'AKC'
    };

    const service_id = serviceIdMap[provider.toUpperCase()];
    
    if (!service_id) {
      return new Response(
        JSON.stringify({ error: "Invalid provider. Must be DSTV, GOTV, or STARTIMES" }),
        { status: 400, headers: { ...CORS_HEADERS, "Content-Type": "application/json" } }
      );
    }

    // Clean smart card number (remove non-numeric characters)
    const customerAccountId = String(smartCard).replace(/\D/g, '');

    if (!customerAccountId || customerAccountId.length < 10) {
      return new Response(
        JSON.stringify({ error: "Invalid smart card number" }),
        { status: 400, headers: { ...CORS_HEADERS, "Content-Type": "application/json" } }
      );
    }

    // Build API payload
    const apiPayload = {
      service_id: service_id,
      customerAccountId: customerAccountId,
      requestType: "GET_DUE_DATE_AND_AMOUNT"
    };

    console.log('Calling MobileNig proxy endpoint:', {
      url: 'https://enterprise.mobilenig.com/api/v2/services/proxy',
      payload: apiPayload,
      key_type: MOBILENIG_PUBLIC_KEY ? 'PUBLIC_KEY' : 'SECRET_KEY'
    });

    // Call MobileNig API
    const apiResponse = await fetch('https://enterprise.mobilenig.com/api/v2/services/proxy', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${apiKey}`,
      },
      body: JSON.stringify(apiPayload),
    });

    // Read response as text first
    const responseText = await apiResponse.text();
    console.log('MobileNig API response status:', apiResponse.status);
    console.log('MobileNig API response text (first 1000 chars):', responseText.substring(0, 1000));

    // Check if response is HTML (error page)
    if (responseText.trim().startsWith('<!DOCTYPE') || responseText.trim().startsWith('<html')) {
      return new Response(
        JSON.stringify({ 
          success: false, 
          error: 'Invalid response from MobileNig API. Please check your API credentials.',
          details: {
            status: apiResponse.status,
            response_preview: responseText.substring(0, 500)
          }
        }),
        { status: 400, headers: { ...CORS_HEADERS, 'Content-Type': 'application/json' } }
      );
    }

    // Parse JSON response
    let apiResult: any;
    try {
      apiResult = JSON.parse(responseText);
    } catch (parseError) {
      return new Response(
        JSON.stringify({ 
          success: false, 
          error: 'Invalid JSON response from MobileNig API',
          details: {
            parse_error: parseError instanceof Error ? parseError.message : String(parseError),
            response_preview: responseText.substring(0, 500)
          }
        }),
        { status: 400, headers: { ...CORS_HEADERS, 'Content-Type': 'application/json' } }
      );
    }

    console.log('MobileNig API response:', JSON.stringify(apiResult, null, 2));

    // Check for success
    const isSuccess = apiResponse.ok && (
      apiResult.statusCode === '200' || 
      apiResult.statusCode === 200 ||
      (apiResult.message && apiResult.message.toLowerCase() === 'success')
    );

    if (!isSuccess) {
      // Extract error message
      let errorMessage = apiResult.message || 'Failed to get due date information';
      const errorDetails = apiResult.details || '';
      
      if (typeof errorDetails === 'string' && errorDetails) {
        errorMessage = errorDetails;
      } else if (errorDetails && errorDetails.message) {
        errorMessage = errorDetails.message;
      }

      return new Response(
        JSON.stringify({ 
          success: false, 
          error: errorMessage,
          details: apiResult
        }),
        { status: 400, headers: { ...CORS_HEADERS, 'Content-Type': 'application/json' } }
      );
    }

    // Extract details
    const details = apiResult.details || {};
    
    // Format customer name
    const firstName = details.firstName || '';
    const lastName = details.lastName || '';
    const customerName = firstName && lastName 
      ? `${firstName} ${lastName}`.trim()
      : firstName || lastName || 'Customer';

    // Format response
    const responseData = {
      success: true,
      data: {
        due_date: details.dueDate || null,
        due_amount: details.dueAmount || details.amount || null,
        customer_name: customerName,
        first_name: firstName,
        last_name: lastName,
        customer_number: details.customerNumber || null,
        customer_type: details.customerType || null,
        account_status: details.accountStatus || null,
        invoice_period: details.invoicePeriod || null,
        smart_card_number: customerAccountId,
        provider: provider,
        service_id: service_id
      }
    };

    return new Response(
      JSON.stringify(responseData),
      { status: 200, headers: { ...CORS_HEADERS, 'Content-Type': 'application/json' } }
    );

  } catch (error) {
    console.error('Error in get-cable-due-date function:', error);
    return new Response(
      JSON.stringify({
        success: false,
        error: 'Internal server error',
        details: error instanceof Error ? error.message : String(error),
      }),
      { status: 500, headers: { ...CORS_HEADERS, 'Content-Type': 'application/json' } }
    );
  }
});

