import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import {
  getEBillsToken,
  getEBillsElectricityServiceId,
  verifyEBillsElectricityCustomer,
  normalizeEBillsElectricityVariationId,
} from "../_shared/ebills-api.ts";

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
      
      // Log full VTpass response for debugging
      console.log("VTpass merchant-verify full response:", JSON.stringify(responseJson, null, 2));
      console.log("VTpass content object:", JSON.stringify(content, null, 2));
      console.log("VTpass content keys:", Object.keys(content || {}));
      console.log("Checking for Customer_Name:", content.Customer_Name, "Address:", content.Address);
      
      // Per VTpass API documentation, merchant-verify SHOULD return Customer_Name and Address
      // However, when WrongBillersCode is true, these fields may not be present
      
      // Check for wrong billers code flag - this indicates invalid meter number
      const wrongBillersCode = 
        content.WrongBillersCode !== undefined ? content.WrongBillersCode : 
        (content.wrong_billers_code !== undefined ? content.wrong_billers_code : 
        (content.WrongBillersCode !== undefined ? content.WrongBillersCode : false));
      
      // If WrongBillersCode is true, treat as invalid meter and return error
      if (wrongBillersCode) {
        console.warn("VTpass flagged WrongBillersCode: true - meter number is invalid");
        return new Response(
          JSON.stringify({
            success: false,
            error: 'Invalid meter number. Please check the meter number and try again.',
            errorType: 'invalid_meter',
          }),
          { status: 200, headers: corsHeaders }
        );
      }
      
      // Map VTpass response fields as per API documentation
      // VTpass merchant-verify DOES return Customer_Name and Address per documentation
      // Response structure: { code: "000", content: { Customer_Name, Address, MeterNumber, ... } }
      const customerName = 
        content.Customer_Name ||  // Primary field name per VTpass docs
        content.customer_name || 
        content.Name || 
        content.name ||
        content.CustomerName ||
        content.customerName ||
        responseJson.Customer_Name ||
        responseJson.customer_name ||
        responseJson.Name ||
        responseJson.name ||
        null; // Use null to indicate details not available
      
      const address = 
        content.Address ||  // Primary field name per VTpass docs
        content.address || 
        content.Customer_Address ||
        content.customer_address ||
        content.CustomerAddress ||
        content.customerAddress ||
        responseJson.Address ||
        responseJson.address ||
        null; // Use null to indicate details not available
      
      // Extract fields as per VTpass API documentation
      const meterNumberFromResponse = 
        content.MeterNumber ||  // Primary field name per VTpass docs
        content.Meter_Number || 
        content.meter_number ||
        content.meterNumber ||
        sanitizedMeter;
      
      const meterTypeFromResponse = 
        content.Meter_Type ||  // Primary field name per VTpass docs
        content.meter_type || 
        content.MeterType ||
        content.meterType ||
        type.toUpperCase();
      
      const minimumVend = Number(
        content.Min_Purchase_Amount ||  // Primary field name per VTpass docs
        content.min_purchase_amount || 
        content.MinPurchaseAmount ||
        content.minPurchaseAmount ||
        content.Minimum_Purchase ||
        content.minimum_purchase ||
        0
      );
      
      const outstandingAmount = Number(
        content.Outstanding ||  // Primary field name per VTpass docs
        content.outstanding || 
        content.Outstanding_Amount ||
        content.outstanding_amount ||
        content.OutstandingAmount ||
        content.outstandingAmount ||
        0
      );
      
      const customerArrears = 
        content.Customer_Arrears !== undefined ? content.Customer_Arrears :  // Primary field name per VTpass docs
        (content.customer_arrears !== undefined ? content.customer_arrears : 
        (content.CustomerArrears !== undefined ? content.CustomerArrears : null));
      
      // Additional fields that might be in the response
      const tariff = 
        content.Tariff || 
        content.tariff || 
        content.Tariff_Rate ||
        content.tariff_rate ||
        null;
      
      const customerCategory = 
        content.Customer_Category || 
        content.customer_category || 
        content.CustomerCategory ||
        content.customerCategory ||
        null;
      
      const businessUnit = 
        content.Business_Unit || 
        content.business_unit || 
        content.BusinessUnit ||
        content.businessUnit ||
        null;
      
      const utilityAccount = 
        content.Utility_Account || 
        content.utility_account || 
        content.UtilityAccount ||
        content.utilityAccount ||
        null;
      
      // Per VTpass API documentation, merchant-verify SHOULD return Customer_Name and Address
      // If both are missing, it likely means the meter number is invalid
      // However, some providers may legitimately not return these fields, so we'll check but not fail
      
      // Determine warning/note messages
      let warningMessage = null;
      if (!customerName && !address) {
        // If no customer details are returned, this might indicate an invalid meter
        // But we'll still allow it with a warning since some providers may not return details
        warningMessage = 'Customer details not returned by provider. Please verify the meter number is correct.';
      }
      
      // Log what we extracted
      console.log("Extracted customer details:", {
        customerName: customerName || 'NOT FOUND',
        address: address || 'NOT FOUND',
        hasCustomerName: !!customerName,
        hasAddress: !!address,
      });
      
      const responseData = {
        customer_name: customerName || `Meter ${meterNumberFromResponse}`, // Fallback to meter number if name not available
        address: address || '', // Empty string if not available
        meter_number: meterNumberFromResponse,
        meter_type: meterTypeFromResponse,
        minimum_vend: minimumVend,
        outstanding_amount: outstandingAmount,
        customer_arrears: customerArrears,
        // Commission details if available
        commission_rate: content.commission_details?.rate || null,
        commission_rate_type: content.commission_details?.rate_type || null,
        // Additional fields
        tariff: tariff,
        customer_category: customerCategory,
        business_unit: businessUnit,
        utility_account: utilityAccount,
        response_message: content.response_message || content.Response_Message || null,
        // Flag to indicate customer details availability
        customer_details_available: !!(customerName && address),
        // Warning/note message
        warning: warningMessage,
        note: warningMessage, // Keep for backward compatibility
      };
      
      console.log("VTpass verification successful - extracted data:", {
        meter_number: responseData.meter_number,
        customer_name: responseData.customer_name,
        address: responseData.address,
        meter_type: responseData.meter_type,
        minimum_vend: responseData.minimum_vend,
        outstanding: responseData.outstanding_amount,
        tariff: responseData.tariff,
        customer_category: responseData.customer_category,
        business_unit: responseData.business_unit,
        utility_account: responseData.utility_account,
        customer_details_available: responseData.customer_details_available,
        note: responseData.note,
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

async function verifyWithEBills(
  meterNumber: string,
  provider: string,
  meterType: string,
  corsHeaders: Record<string, string>,
): Promise<Response> {
  const sanitizedMeter = normalizeMeter(meterNumber);

  if (!sanitizedMeter) {
    return new Response(
      JSON.stringify({
        success: false,
        error: 'Meter number is required',
      }),
      { status: 200, headers: corsHeaders },
    );
  }

  let variationId: 'prepaid' | 'postpaid';
  try {
    variationId = normalizeEBillsElectricityVariationId(meterType);
  } catch {
    return new Response(
      JSON.stringify({
        success: false,
        error: 'Invalid meter type. Use prepaid or postpaid.',
      }),
      { status: 200, headers: corsHeaders },
    );
  }

  const serviceId = getEBillsElectricityServiceId(provider);

  console.log('Verifying electricity meter with eBills:', {
    provider,
    service_id: serviceId,
    variation_id: variationId,
    meter_number: sanitizedMeter.substring(0, 4) + '***',
  });

  try {
    const token = await getEBillsToken();
    const verification = await verifyEBillsElectricityCustomer(
      token,
      sanitizedMeter,
      serviceId,
      variationId,
    );

    const details = verification.data;
    const responseData = {
      customer_name: details.customer_name || `Meter ${sanitizedMeter}`,
      address: details.customer_address || '',
      meter_number: details.meter_number || sanitizedMeter,
      meter_type: variationId,
      minimum_vend: Number(details.min_purchase_amount ?? 0),
      max_purchase_amount: Number(details.max_purchase_amount ?? 100000),
      outstanding_amount: Number(details.outstanding ?? 0),
      customer_arrears: Number(details.customer_arrears ?? 0),
      account_number: details.account_number || null,
      service_name: details.service_name || provider,
      service_band: details.service_band || null,
      business_unit: details.business_unit || null,
      district: details.district || null,
      customer_account_type: details.customer_account_type || null,
      customer_details_available: !!(details.customer_name && details.customer_address),
    };

    console.log('eBills meter verification successful:', {
      meter_number: responseData.meter_number,
      customer_name: responseData.customer_name,
      minimum_vend: responseData.minimum_vend,
      customer_arrears: responseData.customer_arrears,
    });

    return new Response(
      JSON.stringify({
        success: true,
        data: responseData,
      }),
      { status: 200, headers: corsHeaders },
    );
  } catch (error) {
    console.error('eBills meter verification error:', error);
    const errorMessage = error instanceof Error ? error.message : 'Meter verification failed';
    const lowerMessage = errorMessage.toLowerCase();

    const isInvalidMeter =
      lowerMessage.includes('verification failed') ||
      lowerMessage.includes('invalid customer') ||
      lowerMessage.includes('invalid meter') ||
      lowerMessage.includes('not found') ||
      lowerMessage.includes('failure');

    return new Response(
      JSON.stringify({
        success: false,
        error: errorMessage,
        errorType: isInvalidMeter ? 'invalid_meter' : 'verification_error',
      }),
      { status: 200, headers: corsHeaders },
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
      console.error('Missing authorization header in validate-meter-number request');
      return new Response(
        JSON.stringify({ 
          success: false,
          error: 'Missing authorization header. Please sign in and try again.' 
        }),
        { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const supabase = createClient(supabaseUrl, supabaseKey, {
      global: {
        headers: { Authorization: authHeader },
      },
    });

    const { data: { user }, error: userError } = await supabase.auth.getUser();
    if (userError || !user) {
      console.error('Authentication error in validate-meter-number:', {
        error: userError,
        hasAuthHeader: !!authHeader,
        authHeaderPrefix: authHeader?.substring(0, 20),
        userId: user?.id
      });
      return new Response(
        JSON.stringify({ 
          success: false,
          error: 'Session expired. Please sign in again and try again.' 
        }),
        { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }
    
    console.log('Meter validation request authenticated for user:', user.id, user.email);

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

    if (vendingProvider === 'ebills') {
      return await verifyWithEBills(
        String(meter_number),
        String(provider),
        String(meter_type),
        corsHeaders,
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
  // Normalize meter number - remove all non-digits and trim
  const sanitizedMeter = normalizeMeter(meterNumber);
  
  if (!sanitizedMeter) {
    return new Response(
      JSON.stringify({
        success: false,
        error: "Meter number is required",
      }),
      { status: 200, headers: corsHeaders }
    );
  }
  
  // Per MobileNig API documentation, validation endpoint requires public_key
  // POST /api/v2/services/proxy requires: Authorization: Bearer {{public_key}}
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
  
  console.log('Using MobileNig PUBLIC_KEY for validation (as per API documentation)');

  // MobileNig Service IDs for Electricity Providers
  // Per MobileNig API documentation:
  // - Ikeja Electricity Token Purchase (Prepaid): AMA
  // - Ikeja Electricity Bills (Postpaid): AMB
  // - Eko Electricity Prepaid: ANA
  // - Eko Electricity Postpaid: ANB
  // - Abuja Electricity Prepaid: AHB
  // - Abuja Electricity Postpaid: AHA
  // - Kaduna Electricity Prepaid: AGB
  // - Kaduna Electricity Postpaid: AGA
  // - Ibadan Electricity Prepaid: AEA
  // - Ibadan Electricity Postpaid: AEB
  // - Kano Electricity Distribution Prepaid: AFA
  // - Kano Electricity Distribution Postpaid: AFB
  // - Port-Harcourt Prepaid: ADB
  // - Port-Harcourt Postpaid: ADA
  // - Jos Electricity Prepaid: ACB
  // - Jos Electricity Postpaid: ACA
  const canonicalMap: Record<string, { prepaid: string; postpaid: string }> = {
    IKEJA: { prepaid: 'AMA', postpaid: 'AMB' }, // Token Purchase / Bills
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
    // Per MobileNig API documentation: POST /api/v2/services/proxy
    // Required fields: service_id, customerAccountId (ONLY - do not include customerReference)
    // Authorization: Bearer {{public_key}}
    const requestBody = {
      service_id: serviceId,
      customerAccountId: sanitizedMeter,
    };
    
    console.log('MobileNig validation request:', {
      service_id: serviceId,
      customerAccountId: sanitizedMeter,
      provider: provider,
      meterType: meterType,
      endpoint: 'https://enterprise.mobilenig.com/api/v2/services/proxy',
      using_key: 'PUBLIC_KEY',
    });
    
    console.log('MobileNig validation request body:', JSON.stringify(requestBody, null, 2));
    
    const response = await fetch('https://enterprise.mobilenig.com/api/v2/services/proxy', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${mobilenigPublicKey}`,
      },
      body: JSON.stringify(requestBody),
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

    // Check for success: statusCode "200" and message "success"
    // Per MobileNig API response structure:
    // { message: "success", statusCode: "200", details: { customerName, customerAddress, customerReference, minimumVend, tariff, responseMessage, responseCode } }
    if (response.ok && data.statusCode === '200' && data.message === 'success') {
      const details = data.details || {};
      
      // Extract all fields from MobileNig response
      const responseData = {
            customer_name: details.customerName || 'Customer',
            address: details.customerAddress || '',
            meter_number: details.customerReference || sanitizedMeter,
            tariff: details.tariff || '',
            minimum_vend: Number(details.minimumVend ?? 0),
            outstanding_amount: Number(details.outstandingAmount ?? 0),
            customer_category: details.customerCategory || '',
            business_unit: details.businessUnit || '',
            utility_account: details.utilityAccount || '',
            response_message: details.responseMessage || '',
        response_code: details.responseCode || null,
      };
      
      console.log('MobileNig validation successful - extracted data:', {
        customer_name: responseData.customer_name,
        address: responseData.address,
        meter_number: responseData.meter_number,
        tariff: responseData.tariff,
        minimum_vend: responseData.minimum_vend,
        response_message: responseData.response_message,
        response_code: responseData.response_code,
      });
      
      return new Response(
        JSON.stringify({
          success: true,
          data: responseData,
        }),
        { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    } else {
      // Extract error message from MobileNig response
      // MobileNig error structure can be:
      // 1. { message: "failure", statusCode: "EXC010", details: "error message string" }
      // 2. { details: { details: "...", message: "...", statusCode: "..." }, error: "..." }
      let errorMessage = 'Validation failed';
      const statusCode = data.statusCode || data.details?.statusCode;
      
      // Log full response for debugging
      console.log('MobileNig validation failed - full response:', JSON.stringify(data, null, 2));
      
      // Check for EXC010 - "The data you are looking for cannot be found"
      if (statusCode === 'EXC010') {
        // EXC010 means the meter number was not found in the provider's database
        // The error message can be in multiple locations:
        // 1. data.details.details (nested object)
        // 2. data.details (string)
        // 3. data.error (top-level error field)
        const detailsMsg = 
          (data.details && typeof data.details === 'object' && data.details.details) ||
          (typeof data.details === 'string' ? data.details : null) ||
          data.error ||
          null;
        
        // Use a user-friendly message for EXC010
        if (detailsMsg && typeof detailsMsg === 'string' && 
            (detailsMsg.includes('cannot be found') || detailsMsg.includes('data you are looking for'))) {
          errorMessage = 'Invalid meter number. Please check the meter number and try again.';
        } else if (detailsMsg && typeof detailsMsg === 'string') {
          errorMessage = detailsMsg;
        } else {
          errorMessage = 'Invalid meter number. Please check the meter number and try again.';
        }
      } else {
        // Try multiple locations for error message
        if (typeof data.details === 'string') {
          errorMessage = data.details;
        } else if (data.details?.details) {
          // Nested details field (common in MobileNig responses)
          const detailsMsg = data.details.details;
          errorMessage = typeof detailsMsg === 'string' ? detailsMsg : (detailsMsg?.message || detailsMsg);
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
      }
      
      console.log('MobileNig validation failed:', {
        statusCode: statusCode,
        message: errorMessage,
        detailsType: typeof data.details,
        detailsValue: typeof data.details === 'string' ? data.details : JSON.stringify(data.details),
        fullResponse: JSON.stringify(data, null, 2)
      });
      
      // Check if it's an invalid meter error
      const isInvalidMeter = 
        statusCode === 'EXC010' ||
        errorMessage.toLowerCase().includes('cannot be found') ||
        errorMessage.toLowerCase().includes('not found') ||
        errorMessage.toLowerCase().includes('invalid') ||
        errorMessage.toLowerCase().includes('meter number') ||
        (typeof data.details === 'string' && data.details.toLowerCase().includes('cannot be found'));
      
      return new Response(
        JSON.stringify({ 
          success: false, 
          error: errorMessage,
          errorType: isInvalidMeter ? 'invalid_meter' : 'api_error',
          statusCode: statusCode,
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
