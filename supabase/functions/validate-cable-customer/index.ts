import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Content-Type': 'application/json',
};

// Provider to service ID mapping for MobileNig API
// Based on fetch-cable-packages and purchase-cable-tv functions:
// AKA returns GOTV packages, AKB returns StarTimes packages, AKC returns DSTV packages
const PROVIDER_SERVICE_MAP: Record<string, string> = {
  'GOTV': 'AKA',
  'STARTIMES': 'AKB',
  'DSTV': 'AKC',
};

// VTpass service ID mapping
const VTPASS_SERVICE_MAP: Record<string, string> = {
  'DSTV': 'dstv',
  'GOTV': 'gotv',
  'STARTIMES': 'startimes',
};

// Normalize smartcard number
const normalizeSmartcard = (value: unknown): string => {
  if (typeof value === "string") return value.replace(/[^\d]/g, "").trim();
  if (typeof value === "number") return value.toString().replace(/[^\d]/g, "").trim();
  return "";
};

// Verify with VTpass merchant-verify endpoint
async function verifyWithVTpass(
  cardNumber: unknown,
  provider: string,
  corsHeaders: Record<string, string>
): Promise<Response> {
  const VTPASS_API_KEY = Deno.env.get("VTPASS_API_KEY");
  const VTPASS_PUBLIC_KEY = Deno.env.get("VTPASS_PUBLIC_KEY");
  const VTPASS_SECRET_KEY = Deno.env.get("VTPASS_SECRET_KEY");
  const VTPASS_MODE = (Deno.env.get("VTPASS_MODE") || "live").toLowerCase();

  if (!VTPASS_API_KEY || !VTPASS_PUBLIC_KEY) {
    console.error("VTpass credentials missing:", {
      hasApiKey: !!VTPASS_API_KEY,
      hasPublicKey: !!VTPASS_PUBLIC_KEY,
      hasSecretKey: !!VTPASS_SECRET_KEY,
    });
    return new Response(
      JSON.stringify({
        success: false,
        error: "VTpass credentials not configured",
      }),
      { status: 200, headers: corsHeaders }
    );
  }

  const sanitizedSmartcard = normalizeSmartcard(cardNumber);
  if (!sanitizedSmartcard) {
    return new Response(
      JSON.stringify({
        success: false,
        error: "Smartcard number (billersCode) is required",
      }),
      { status: 200, headers: corsHeaders }
    );
  }

  const serviceId = VTPASS_SERVICE_MAP[provider.toUpperCase()] || 'dstv';
  const baseUrl = VTPASS_MODE === "sandbox"
    ? "https://sandbox.vtpass.com"
    : "https://vtpass.com";

  // For POST requests to VTpass merchant-verify, we need api-key, public-key, and secret-key
  // Note: VTpass requires all three headers for POST requests
  const headers: HeadersInit = {
    "api-key": VTPASS_API_KEY,
    "public-key": VTPASS_PUBLIC_KEY,
    "Content-Type": "application/json",
  };
  
  // Add secret-key for POST requests (required for merchant-verify endpoint)
  if (VTPASS_SECRET_KEY) {
    headers["secret-key"] = VTPASS_SECRET_KEY;
  } else {
    console.error("VTPASS_SECRET_KEY is missing - this will cause 401 errors");
  }
  
  // Log header presence (without values) for debugging
  console.log("VTpass authentication headers:", {
    hasApiKey: !!VTPASS_API_KEY,
    apiKeyLength: VTPASS_API_KEY?.length || 0,
    hasPublicKey: !!VTPASS_PUBLIC_KEY,
    publicKeyLength: VTPASS_PUBLIC_KEY?.length || 0,
    hasSecretKey: !!VTPASS_SECRET_KEY,
    secretKeyLength: VTPASS_SECRET_KEY?.length || 0,
    mode: VTPASS_MODE,
  });

  const verifyPayload = {
    billersCode: sanitizedSmartcard,
    serviceID: serviceId,
  };

  console.log("VTpass merchant-verify request:", {
    ...verifyPayload,
    mode: VTPASS_MODE,
    baseUrl: `${baseUrl}/api/merchant-verify`,
    hasApiKey: !!VTPASS_API_KEY,
    hasPublicKey: !!VTPASS_PUBLIC_KEY,
    hasSecretKey: !!VTPASS_SECRET_KEY,
    headers: {
      "api-key": VTPASS_API_KEY ? `${VTPASS_API_KEY.substring(0, 10)}...` : 'not set',
      "public-key": VTPASS_PUBLIC_KEY ? `${VTPASS_PUBLIC_KEY.substring(0, 10)}...` : 'not set',
      "secret-key": VTPASS_SECRET_KEY ? "***" : 'not set',
    },
  });

  try {
    const response = await fetch(`${baseUrl}/api/merchant-verify`, {
      method: "POST",
      headers,
      body: JSON.stringify(verifyPayload),
    });

    const responseText = await response.text();
    console.log("VTpass merchant-verify response status:", response.status);
    console.log("VTpass merchant-verify response:", responseText);

    if (!response.ok) {
      console.error("VTpass API error:", {
        status: response.status,
        statusText: response.statusText,
        response: responseText,
        requestUrl: `${baseUrl}/api/merchant-verify`,
        payload: verifyPayload,
      });
      
      // Parse error response if possible
      let errorMessage = `VTpass API error: ${response.status}`;
      try {
        const errorJson = JSON.parse(responseText);
        errorMessage = errorJson.response_description || errorJson.message || errorJson.error || errorMessage;
      } catch (e) {
        // Keep default error message
      }
      
      return new Response(
        JSON.stringify({
          success: false,
          error: errorMessage,
          status: response.status,
          details: responseText,
        }),
        { status: 200, headers: corsHeaders }
      );
    }

    let responseJson: any = null;
    try {
      responseJson = JSON.parse(responseText);
    } catch (error) {
      console.error("Unable to parse VTpass response:", responseText, error);
      return new Response(
        JSON.stringify({ success: false, error: "Invalid response from VTpass" }),
        { status: 200, headers: corsHeaders }
      );
    }

    // Check if verification was successful (code "000" per VTpass spec)
    if (responseJson.code === "000" && responseJson.content) {
      const content = responseJson.content;
      
      // Map VTpass response fields exactly as per specification:
      // Customer_Name, Status, Due_Date, Customer_Number, Customer_Type
      // Also includes Renewal_Amount for bouquet renewal
      return new Response(
        JSON.stringify({
          success: true,
          data: {
            customer_name: content.Customer_Name || content.customer_name || null,
            status: content.Status || content.status || null,
            due_date: content.Due_Date || content.due_date || null,
            customer_number: content.Customer_Number || content.customer_number || null,
            customer_type: content.Customer_Type || content.customer_type || null,
            renewal_amount: content.Renewal_Amount || content.renewal_amount || null,
            card_number: sanitizedSmartcard,
            smartcard_number: sanitizedSmartcard,
            service_id: serviceId,
            // Include commission details if available
            commission_details: content.commission_details || null,
          },
        }),
        { status: 200, headers: corsHeaders }
      );
    }

    // Verification failed or invalid smartcard
    const errorMessage = responseJson.response_description || 
                        responseJson.message || 
                        "Invalid smartcard number. Please check and try again.";

    // Check if it's an invalid card error
    const lowerCaseError = errorMessage.toLowerCase();
    const isInvalidCard = 
      lowerCaseError.includes('invalid') ||
      lowerCaseError.includes('card number') ||
      lowerCaseError.includes('smartcard') ||
      lowerCaseError.includes('smart card') ||
      lowerCaseError.includes('customer not found') ||
      lowerCaseError.includes('not found') ||
      responseJson.code !== '000';

    return new Response(
      JSON.stringify({
        success: false,
        error: errorMessage,
        code: responseJson.code,
        errorType: isInvalidCard ? 'invalid_card' : 'api_error',
      }),
      { status: 200, headers: corsHeaders }
    );
  } catch (error) {
    console.error("Error in VTpass verification:", error);
    const message = error instanceof Error ? error.message : "Unknown error occurred";
    const lowerCaseError = message.toLowerCase();
    const isInvalidCard = 
      lowerCaseError.includes('invalid') ||
      lowerCaseError.includes('card number') ||
      lowerCaseError.includes('smartcard') ||
      lowerCaseError.includes('smart card') ||
      lowerCaseError.includes('customer not found') ||
      lowerCaseError.includes('not found');
    
    return new Response(
      JSON.stringify({ 
        success: false, 
        error: message,
        errorType: isInvalidCard ? 'invalid_card' : 'api_error',
      }),
      { status: 200, headers: corsHeaders }
    );
  }
}

// Verify with MobileNig API
async function verifyWithMobileNig(
  cardNumber: unknown,
  provider: string,
  corsHeaders: Record<string, string>
): Promise<Response> {
  const cardNumberStr = typeof cardNumber === 'string' ? cardNumber.trim() : String(cardNumber || '').trim();
  
  if (!cardNumberStr) {
    return new Response(
      JSON.stringify({ success: false, error: 'card_number is required' }),
      { status: 200, headers: corsHeaders }
    );
  }

  // Get service ID from provider
  const normalizedProvider = provider.toUpperCase().trim();
  const service_id = PROVIDER_SERVICE_MAP[normalizedProvider];
  
  console.log('Provider mapping:', {
    received: provider,
    normalized: normalizedProvider,
    service_id: service_id || 'NOT FOUND',
    availableProviders: Object.keys(PROVIDER_SERVICE_MAP),
  });
  
  if (!service_id) {
    return new Response(
      JSON.stringify({
        success: false,
        error: `Invalid provider "${provider}". Supported providers: DSTV, GOTV, STARTIMES`,
        errorType: 'invalid_provider',
      }),
      { status: 200, headers: corsHeaders }
    );
  }

  // Get public key from environment variables
  const API_KEY = Deno.env.get('MOBILENIG_PUBLIC_KEY');

  if (!API_KEY) {
    return new Response(
      JSON.stringify({ success: false, error: 'Missing MOBILENIG_PUBLIC_KEY env variable' }),
      { status: 200, headers: corsHeaders }
    );
  }

  // Mobilenig API URL
  const url = 'https://enterprise.mobilenig.com/api/v2/services/proxy';

  // Body we send to Mobilenig
  const body = {
    service_id: service_id,
    customerAccountId: cardNumberStr,
  };

  console.log('Calling MobileNig API:', { url, body, service_id, provider });

  try {
    // Call the external API
    const response = await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${API_KEY}`,
      },
      body: JSON.stringify(body),
    });

    // Read response text first
    const responseText = await response.text();
    console.log('API response status:', response.status);
    console.log('API response text length:', responseText?.length || 0);

    // Check if response is empty
    if (!responseText || responseText.trim().length === 0) {
      console.log('Empty response detected - treating as invalid card');
      return new Response(
        JSON.stringify({
          success: false,
          error: 'Invalid smart card number. Please check the card number and try again.',
          errorType: 'invalid_card',
        }),
        { status: 200, headers: corsHeaders }
      );
    }

    // Parse JSON response
    let data;
    try {
      data = JSON.parse(responseText);
      console.log('Parsed API response data:', JSON.stringify(data).substring(0, 500));
    } catch (parseError) {
      console.error('Failed to parse API response:', parseError);
      return new Response(
        JSON.stringify({
          success: false,
          error: 'Invalid response from service provider. Please try again later.',
          errorType: 'api_error',
        }),
        { status: 200, headers: corsHeaders }
      );
    }

    // Check if validation was successful
    const statusCode = data.statusCode || data.status_code || data.status;
    const message = data.message || data.msg || '';
    const details = data.details || data.data || {};

    // Check for success
    const isSuccess = (
      response.ok && 
      (statusCode === '200' || statusCode === 200) && 
      message.toLowerCase() === 'success'
    ) || (
      details.firstName || details.lastName || details.customerName || details.name
    );

    if (isSuccess) {
      // Extract customer name - prioritize full name, then combine first and last
      let customerName = details.customerName || 
                        details.name || 
                        details.fullName ||
                        details.full_name ||
                        data.customerName ||
                        data.name ||
                        data.fullName ||
                        data.full_name ||
                        '';
      
      // If no full name, try to construct from first and last name
      if (!customerName || customerName.trim() === '') {
        const firstName = details.firstName || details.first_name || '';
        const lastName = details.lastName || details.last_name || '';
        if (firstName && lastName) {
          customerName = `${firstName} ${lastName}`.trim();
        } else if (firstName) {
          customerName = firstName.trim();
        } else if (lastName) {
          customerName = lastName.trim();
        }
      }
      
      // Clean up the name - remove extra spaces, ensure proper capitalization
      if (customerName) {
        customerName = customerName.trim().replace(/\s+/g, ' ');
        // Capitalize first letter of each word for better display
        customerName = customerName.split(' ').map(word => {
          if (word.length === 0) return word;
          return word.charAt(0).toUpperCase() + word.slice(1).toLowerCase();
        }).join(' ');
      }
      
      if (!customerName || customerName.trim() === '') {
        customerName = 'Customer';
      }
      
      console.log('Extracted customer name:', {
        original: details.customerName || details.name,
        firstName: details.firstName || details.first_name,
        lastName: details.lastName || details.last_name,
        final: customerName
      });

      return new Response(
        JSON.stringify({
          success: true,
          data: {
            customer_name: customerName,
            card_number: cardNumberStr,
            customer_type: details.customerType || details.customer_type || null,
            account_status: details.accountStatus || details.account_status || null,
            due_date: details.dueDate || details.due_date || null,
            invoice_period: details.invoicePeriod || details.invoice_period || null,
            customer_number: details.customerNumber || details.customer_number || null,
          },
        }),
        { status: 200, headers: corsHeaders }
      );
    } else {
      // Extract error message
      let errorMessage = '';
      
      if (typeof data.details === 'string') {
        errorMessage = data.details;
      } else if (data.details?.responseMessage) {
        errorMessage = data.details.responseMessage;
      } else if (data.details?.message) {
        errorMessage = data.details.message;
      } else if (data.message) {
        errorMessage = data.message;
      } else if (data.error) {
        errorMessage = data.error;
      } else {
        errorMessage = 'Invalid smart card number. Please check the card number and try again.';
      }

      const lowerCaseError = errorMessage.toLowerCase();
      const isInvalidCard = 
        lowerCaseError.includes('invalid') ||
        lowerCaseError.includes('card number') ||
        lowerCaseError.includes('smart card') ||
        lowerCaseError.includes('customer not found') ||
        lowerCaseError.includes('not found');

      return new Response(
        JSON.stringify({
          success: false,
          error: errorMessage,
          errorType: isInvalidCard ? 'invalid_card' : 'api_error',
        }),
        { status: 200, headers: corsHeaders }
      );
    }
  } catch (err: any) {
    console.error('Error in MobileNig verification:', err);
    return new Response(
      JSON.stringify({
        success: false,
        error: err?.message || 'Service temporarily unavailable. Please try again later.',
      }),
      { status: 200, headers: corsHeaders }
    );
  }
}

serve(async (req) => {
  // Handle CORS preflight requests
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    // Only allow POST
    if (req.method !== 'POST') {
      return new Response(
        JSON.stringify({ success: false, error: 'Only POST method allowed' }),
        { status: 405, headers: corsHeaders }
      );
    }

    // Initialize Supabase client for optional user authentication
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    
    // Get authorization header from request
    // Note: Authentication is optional for card validation - we log it but don't block if it fails
    const authHeader = req.headers.get('Authorization');
    let authenticatedUserId: string | null = null;
    
    // If auth header is present, try to verify user authentication (optional)
    if (authHeader) {
      try {
        const supabase = createClient(supabaseUrl, supabaseServiceKey);
        // Extract token - handle both "Bearer token" and just "token" formats
        const token = authHeader.startsWith('Bearer ') 
          ? authHeader.substring(7).trim() 
          : authHeader.trim();
        
        if (token) {
          const { data: { user }, error: userError } = await supabase.auth.getUser(token);
          
          if (!userError && user) {
            authenticatedUserId = user.id;
            console.log('User authenticated:', user.id);
          } else {
            console.warn('Authentication check failed (non-blocking):', userError?.message || 'No user');
          }
        }
      } catch (authErr) {
        // Log but don't block - validation doesn't require authentication
        console.warn('Authentication check error (non-blocking):', authErr);
      }
    }

    // Parse request body
    let parsedBody: Record<string, unknown> = {};
    try {
      const bodyText = await req.text();
      if (bodyText && bodyText.trim().length > 0) {
        parsedBody = JSON.parse(bodyText);
      }
    } catch (error) {
      console.error("validate-cable-customer: unable to parse request body:", error);
    }

    const card_number = (parsedBody.card_number || parsedBody.billersCode || parsedBody.smartcard_number) as string;
    const provider = parsedBody.provider as string;

    if (!card_number) {
      return new Response(
        JSON.stringify({ success: false, error: 'card_number (smartcard number) is required' }),
        { status: 200, headers: corsHeaders }
      );
    }

    if (!provider) {
      return new Response(
        JSON.stringify({ success: false, error: 'provider is required' }),
        { status: 200, headers: corsHeaders }
      );
    }

    // Get the active cable vending provider from app_settings
    const supabaseService = createClient(
      supabaseUrl,
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
    );

    const { data: providerSetting } = await supabaseService
      .from('app_settings')
      .select('setting_value')
      .eq('setting_key', 'cable_provider')
      .maybeSingle();

    const vendingProvider = providerSetting?.setting_value?.provider || 'mobilenig';
    console.log('Cable vending provider:', vendingProvider, 'for cable provider:', provider);

    // Route to appropriate verification based on vending provider
    if (vendingProvider === 'vtpass') {
      return await verifyWithVTpass(card_number, provider, corsHeaders);
    }

    // Default to MobileNig verification
    return await verifyWithMobileNig(card_number, provider, corsHeaders);

  } catch (err: any) {
    console.error('Error in validate-cable-customer:', err);
    return new Response(
      JSON.stringify({
        success: false,
        error: err?.message || 'Service temporarily unavailable. Please try again later.',
      }),
      { status: 200, headers: corsHeaders }
    );
  }
});
