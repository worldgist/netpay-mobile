import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Content-Type': 'application/json',
};

// VTpass service ID mapping for electricity DISCOs
const VTPASS_ELECTRICITY_SERVICE_MAP: Record<string, string> = {
  'IKEJA': 'ikeja-electric',
  'EKO': 'eko-electric',
  'ABUJA': 'abuja-electric',
  'KADUNA': 'kaduna-electric',
  'IBADAN': 'ibadan-electric',
  'KANO': 'kano-electric',
  'PORTHARCOURT': 'portharcourt-electric',
  'JOS': 'jos-electric',
  'BENIN': 'benin-electric',
  'YOLA': 'yola-electric',
};

// Normalize meter number
const normalizeMeter = (value: unknown): string => {
  if (typeof value === "string") return value.replace(/[^\d]/g, "").trim();
  if (typeof value === "number") return value.toString().replace(/[^\d]/g, "").trim();
  return "";
};

// Verify with VTpass merchant-verify endpoint
async function verifyWithVTpass(
  meterNumber: string,
  provider: string,
  meterType: string,
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

  const sanitizedMeter = normalizeMeter(meterNumber);
  if (!sanitizedMeter) {
    return new Response(
      JSON.stringify({
        success: false,
        error: "Meter number (billersCode) is required",
      }),
      { status: 200, headers: corsHeaders }
    );
  }

  // Normalize provider and get VTpass service ID
  const normalizedProvider = provider.toUpperCase().replace(/[^A-Z]/g, '');
  const serviceId = VTPASS_ELECTRICITY_SERVICE_MAP[normalizedProvider];
  
  if (!serviceId) {
    return new Response(
      JSON.stringify({
        success: false,
        error: `Unsupported electricity provider: ${provider}. VTpass supports: ${Object.keys(VTPASS_ELECTRICITY_SERVICE_MAP).join(', ')}`,
      }),
      { status: 200, headers: corsHeaders }
    );
  }

  // Validate meter type
  const type = meterType?.toLowerCase() === 'postpaid' ? 'postpaid' : 'prepaid';

  const baseUrl = VTPASS_MODE === "sandbox"
    ? "https://sandbox.vtpass.com"
    : "https://vtpass.com";

  // For POST requests to VTpass merchant-verify, we need api-key, public-key, and secret-key
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

  // Build payload exactly as per VTpass documentation
  // Fields: billersCode (M), serviceID (M), type (M)
  const verifyPayload = {
    billersCode: sanitizedMeter,
    serviceID: serviceId,
    type: type, // "prepaid" or "postpaid"
  };
  
  // Log sandbox test numbers for reference
  if (VTPASS_MODE === "sandbox") {
    console.log("VTpass sandbox test numbers:", {
      prepaid: "1111111111111",
      postpaid: "1010101010101",
      "current_meter": sanitizedMeter,
      "current_type": type
    });
  }

  console.log("VTpass merchant-verify request:", {
    ...verifyPayload,
    mode: VTPASS_MODE,
    baseUrl: `${baseUrl}/api/merchant-verify`,
    hasApiKey: !!VTPASS_API_KEY,
    hasPublicKey: !!VTPASS_PUBLIC_KEY,
    hasSecretKey: !!VTPASS_SECRET_KEY,
  });

  try {
    const response = await fetch(`${baseUrl}/api/merchant-verify`, {
      method: "POST",
      headers,
      body: JSON.stringify(verifyPayload),
    });

    const responseText = await response.text();
    console.log("VTpass merchant-verify response status:", response.status);
    console.log("VTpass merchant-verify response length:", responseText?.length || 0);
    console.log("VTpass merchant-verify response:", responseText?.substring(0, 500) || '(empty)');

    // Check if response is empty
    if (!responseText || responseText.trim().length === 0) {
      console.error("Empty response from VTpass");
      return new Response(
        JSON.stringify({ 
          success: false, 
          error: "Empty response from VTpass API" 
        }),
        { status: 200, headers: corsHeaders }
      );
    }

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
        }),
        { status: 200, headers: corsHeaders }
      );
    }

    let responseJson: any = null;
    try {
      responseJson = JSON.parse(responseText);
    } catch (parseError) {
      console.error("Unable to parse VTpass response as JSON:", parseError);
      console.error("Response text (first 500 chars):", responseText?.substring(0, 500));
      console.error("Response text length:", responseText?.length);
      return new Response(
        JSON.stringify({ 
          success: false, 
          error: "Invalid JSON response from VTpass",
          details: responseText?.substring(0, 200) || "Empty response"
        }),
        { status: 200, headers: corsHeaders }
      );
    }

    // Check if verification was successful (code "000" per VTpass spec)
    if (responseJson.code === "000" && responseJson.content) {
      const content = responseJson.content;
      
      // Log sandbox test numbers for debugging
      if (VTPASS_MODE === "sandbox") {
        console.log("VTpass sandbox verification - using test meter numbers:", {
          prepaid: "1111111111111",
          postpaid: "1010101010101",
          received: sanitizedMeter,
          type: type
        });
      }
      
      // Map VTpass response fields exactly as per documentation
      // Expected fields: Customer_Name, Address, MeterNumber, Min_Purchase_Amount, 
      // Outstanding, Customer_Arrears, Meter_Type, WrongBillersCode, commission_details
      const responseData = {
        customer_name: content.Customer_Name || content.customer_name || 'Customer',
        address: content.Address || content.address || '',
        meter_number: content.MeterNumber || content.Meter_Number || sanitizedMeter,
        meter_type: content.Meter_Type || content.meter_type || type.toUpperCase(),
        minimum_vend: Number(content.Min_Purchase_Amount || content.min_purchase_amount || 0),
        outstanding_amount: Number(content.Outstanding || content.outstanding || 0),
        customer_arrears: content.Customer_Arrears !== undefined ? content.Customer_Arrears : (content.customer_arrears !== undefined ? content.customer_arrears : null),
        wrong_billers_code: content.WrongBillersCode !== undefined ? content.WrongBillersCode : (content.wrong_billers_code !== undefined ? content.wrong_billers_code : false),
        // Commission details if available
        commission_rate: content.commission_details?.rate || null,
        commission_rate_type: content.commission_details?.rate_type || null,
        // Additional fields for compatibility
        tariff: null, // VTpass doesn't provide tariff in merchant-verify
        customer_category: null,
        business_unit: null,
        utility_account: null,
        response_message: null,
      };
      
      console.log("VTpass verification successful:", {
        meter_number: responseData.meter_number,
        customer_name: responseData.customer_name,
        meter_type: responseData.meter_type,
        minimum_vend: responseData.minimum_vend,
        outstanding: responseData.outstanding_amount
      });
      
      return new Response(
        JSON.stringify({
          success: true,
          data: responseData,
        }),
        { status: 200, headers: corsHeaders }
      );
    }

    // Verification failed or invalid meter
    const errorMessage = responseJson.response_description || 
                        responseJson.message || 
                        "Invalid meter number. Please check and try again.";

    return new Response(
      JSON.stringify({
        success: false,
        error: errorMessage,
        code: responseJson.code,
      }),
      { status: 200, headers: corsHeaders }
    );
  } catch (error) {
    console.error("Error in VTpass verification:", error);
    const message = error instanceof Error ? error.message : "Unknown error occurred";
    return new Response(
      JSON.stringify({ success: false, error: message }),
      { status: 200, headers: corsHeaders }
    );
  }
}

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseKey = Deno.env.get('SUPABASE_ANON_KEY')!;

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

    // Parse request body
    let parsedBody: Record<string, unknown> = {};
    try {
      const bodyText = await req.text();
      console.log("Request body text:", bodyText);
      if (bodyText && bodyText.trim().length > 0) {
        try {
          parsedBody = JSON.parse(bodyText);
        } catch (parseError) {
          console.error("Failed to parse request body as JSON:", parseError, "Body:", bodyText);
          return new Response(
            JSON.stringify({ 
              success: false,
              error: 'Invalid request body format' 
            }),
            { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
          );
        }
      } else {
        console.warn("Empty request body received");
      }
    } catch (error) {
      console.error("validate-meter-number: unable to read request body:", error);
      return new Response(
        JSON.stringify({ 
          success: false,
          error: 'Failed to read request body' 
        }),
        { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const meter_number = parsedBody.meter_number || parsedBody.billersCode || parsedBody.meterNumber;
    const provider = parsedBody.provider;
    const meter_type = parsedBody.meter_type || parsedBody.type;

    if (!meter_number || !provider || !meter_type) {
      return new Response(
        JSON.stringify({ 
          success: false,
          error: 'Meter number, provider, and meter type are required' 
        }),
        { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    console.log('Validating meter:', { meter_number, provider, meter_type });

    // Use vending_provider from request, or check app_settings as fallback
    const requestedVendingProvider = parsedBody.vending_provider;
    let vendingProvider = requestedVendingProvider;
    
    // Only check app_settings if not specified in request (for backward compatibility)
    if (!vendingProvider) {
      console.log('No vending_provider in request, checking app_settings...');
      const supabaseService = createClient(
        supabaseUrl,
        Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
      );

      const { data: providerSetting } = await supabaseService
        .from('app_settings')
        .select('setting_value')
        .eq('setting_key', 'electricity_provider')
        .maybeSingle();

      vendingProvider = providerSetting?.setting_value?.provider || 'smeplug';
      
      if (!providerSetting) {
        console.warn('electricity_provider setting not found in app_settings, defaulting to smeplug');
      }
    } else {
      console.log('Using vending_provider from request:', vendingProvider);
    }
    
    console.log('Electricity vending provider:', vendingProvider, 'for provider:', provider, 'meter_type:', meter_type);

    // Route to appropriate verification based on vending provider
    if (vendingProvider === 'vtpass') {
      return await verifyWithVTpass(
        String(meter_number), 
        String(provider), 
        String(meter_type), 
        corsHeaders
      );
    }

    // Default to MobileNig/SMEPLUG verification
    return await verifyWithMobileNig(
      String(meter_number),
      String(provider),
      String(meter_type),
      corsHeaders
    );
  } catch (error) {
    console.error('Error in validate-meter-number function:', error);
    const errorMessage = error instanceof Error ? error.message : 'Unknown error occurred';
    const errorDetails = error instanceof Error ? error.stack : String(error);
    
    // Always return valid JSON, even on errors
    try {
      return new Response(
        JSON.stringify({
          success: false,
          error: `Validation failed: ${errorMessage}`,
          details: errorDetails?.substring(0, 500) || 'Unknown error'
        }),
        { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    } catch (jsonError) {
      // Fallback if JSON.stringify fails
      return new Response(
        JSON.stringify({
          success: false,
          error: 'Validation failed: Internal server error'
        }),
        { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }
  }
});

// Verify with MobileNig API
async function verifyWithMobileNig(
  meterNumber: string,
  provider: string,
  meterType: string,
  corsHeaders: Record<string, string>
): Promise<Response> {
  const mobilenigPublicKey = Deno.env.get('MOBILENIG_PUBLIC_KEY');

  if (!mobilenigPublicKey) {
    console.error('MOBILENIG_PUBLIC_KEY not configured');
    return new Response(
      JSON.stringify({ 
        success: false,
        error: 'MOBILENIG_PUBLIC_KEY not configured' 
      }),
      { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }

  const canonicalMap: Record<string, { prepaid: string; postpaid: string }> = {
    IKEJA: { prepaid: 'AMA', postpaid: 'AMB' },
    EKO: { prepaid: 'ANA', postpaid: 'ANB' },
    ABUJA: { prepaid: 'AHB', postpaid: 'AHA' },
    KADUNA: { prepaid: 'AGB', postpaid: 'AGA' },
    IBADAN: { prepaid: 'AEA', postpaid: 'AEB' },
    KANO: { prepaid: 'AFA', postpaid: 'AFB' },
    PORTHARCOURT: { prepaid: 'ADB', postpaid: 'ADA' },
    JOS: { prepaid: 'ACB', postpaid: 'ACA' },
    BENIN: { prepaid: 'AAB', postpaid: 'AAA' },
    YOLA: { prepaid: 'ALA', postpaid: 'ALB' },
  };

  const aliasMap: Record<string, string> = {
    IKEDC: 'IKEJA',
    IKEJAELECTRICITY: 'IKEJA',
    IKEJAELECTRICITYBILLS: 'IKEJA',
    IKEJAELECTRICITYTOKENPURCHASE: 'IKEJA',
    EKOELECTRICITY: 'EKO',
    EKOELECTRICITYPREPAID: 'EKO',
    EKOELECTRICITYPOSTPAID: 'EKO',
    EKEDC: 'EKO',
    ABUJAELECTRICITY: 'ABUJA',
    ABUJAELECTRICITYPREPAID: 'ABUJA',
    ABUJAELECTRICITYPOSTPAID: 'ABUJA',
    AEDC: 'ABUJA',
    KADUNAELECTRICITY: 'KADUNA',
    KADUNAELECTRICITYPREPAID: 'KADUNA',
    KADUNAELECTRICITYPOSTPAID: 'KADUNA',
    KAEDCO: 'KADUNA',
    IBADANELECTRICITY: 'IBADAN',
    IBADANELECTRICITYPREPAID: 'IBADAN',
    IBADANELECTRICITYPOSTPAID: 'IBADAN',
    IBEDC: 'IBADAN',
    KANOELECTRICITY: 'KANO',
    KANOELECTRICITYDISTRIBUTIONPREPAID: 'KANO',
    KANOELECTRICITYDISTRIBUTIONPOSTPAID: 'KANO',
    KEDCO: 'KANO',
    PORTHARCOURTELECTRICITY: 'PORTHARCOURT',
    PORTHARCOURTPREPAID: 'PORTHARCOURT',
    PORTHARCOURTPOSTPAID: 'PORTHARCOURT',
    PHEDC: 'PORTHARCOURT',
    JOSELECTRICITY: 'JOS',
    JOSELECTRICITYPREPAID: 'JOS',
    JOSELECTRICITYPOSTPAID: 'JOS',
    JED: 'JOS',
    BEDC: 'BENIN',
    BENINELECTRICITY: 'BENIN',
    YEDC: 'YOLA',
    YOLAELECTRICITY: 'YOLA',
  };

  const normalizedProvider = provider.toUpperCase().replace(/[^A-Z]/g, '');
  const canonicalKey = aliasMap[normalizedProvider] || normalizedProvider;
  const serviceIds = canonicalMap[canonicalKey];
  
  if (!serviceIds) {
    console.error('Invalid provider:', provider);
    return new Response(
      JSON.stringify({ 
        success: false,
        error: 'Invalid provider' 
      }),
      { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }

  const serviceId = meterType === 'prepaid' ? serviceIds.prepaid : serviceIds.postpaid;
  console.log('Using MobileNig service ID:', serviceId);

  try {
    // Validate meter with MobileNig API using proxy endpoint
    const response = await fetch('https://enterprise.mobilenig.com/api/v2/services/proxy', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${mobilenigPublicKey}`,
      },
      body: JSON.stringify({
        service_id: serviceId,
        customerAccountId: meterNumber,
        customerReference: meterNumber,
      }),
    });

    // Read response as text first to handle potential JSON parsing errors
    const responseText = await response.text();
    console.log('MobileNig API response status:', response.status);
    console.log('MobileNig API response text length:', responseText?.length || 0);
    console.log('MobileNig API response (first 500 chars):', responseText?.substring(0, 500) || '(empty)');

    // Check if response is empty
    if (!responseText || responseText.trim().length === 0) {
      console.log('Empty response from MobileNig - treating as invalid meter');
      return new Response(
        JSON.stringify({
          success: false,
          error: 'Invalid meter number. Please check the meter number and try again.',
          errorType: 'invalid_meter',
        }),
        { status: 200, headers: corsHeaders }
      );
    }

    // Parse JSON response
    let data;
    try {
      data = JSON.parse(responseText);
      console.log('Parsed MobileNig API response data:', JSON.stringify(data).substring(0, 500));
    } catch (parseError) {
      console.error('Failed to parse MobileNig API response as JSON:', parseError);
      console.error('Response text (first 500 chars):', responseText?.substring(0, 500));
      console.error('Response text length:', responseText?.length);
      return new Response(
        JSON.stringify({
          success: false,
          error: 'Invalid response from service provider. Please try again later.',
          errorType: 'api_error',
          details: responseText?.substring(0, 200) || 'Empty response'
        }),
        { status: 200, headers: corsHeaders }
      );
    }

    if (response.ok && data.statusCode === '200' && data.message === 'success') {
      const details = data.details || {};
      return new Response(
        JSON.stringify({
          success: true,
          data: {
            customer_name: details.customerName || 'Customer',
            address: details.customerAddress || '',
            meter_number: details.customerReference || meterNumber,
            tariff: details.tariff || '',
            minimum_vend: Number(details.minimumVend ?? 0),
            outstanding_amount: Number(details.outstandingAmount ?? 0),
            customer_category: details.customerCategory || '',
            business_unit: details.businessUnit || '',
            utility_account: details.utilityAccount || '',
            response_message: details.responseMessage || '',
          },
        }),
        { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    } else {
      // Extract error message from MobileNig response
      let errorMessage = 'Validation failed';
      
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
      } else if (data.response_description) {
        errorMessage = data.response_description;
      }
      
      console.log('MobileNig validation failed:', {
        statusCode: data.statusCode,
        message: errorMessage,
        fullResponse: data
      });
      
      return new Response(
        JSON.stringify({ 
          success: false, 
          error: errorMessage,
          details: data
        }),
        { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }
  } catch (err: any) {
    console.error('Error in MobileNig verification:', err);
    return new Response(
      JSON.stringify({
        success: false,
        error: err?.message || 'Service temporarily unavailable. Please try again later.',
      }),
      { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
}
