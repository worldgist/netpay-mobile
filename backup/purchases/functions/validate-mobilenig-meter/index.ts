import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const CORS_HEADERS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

// MobileNig Service IDs for Electricity Providers
const MOBILENIG_SERVICE_IDS: Record<string, { prepaid: string; postpaid: string }> = {
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

// Provider aliases
const PROVIDER_ALIASES: Record<string, string> = {
  IKEDC: 'IKEJA',
  EKEDC: 'EKO',
  AEDC: 'ABUJA',
  KAEDCO: 'KADUNA',
  IBEDC: 'IBADAN',
  KEDCO: 'KANO',
  PHEDC: 'PORTHARCOURT',
  JED: 'JOS',
  BEDC: 'BENIN',
  YEDC: 'YOLA',
};

interface ValidateMeterRequest {
  meter_number: string;
  provider: string;
  meter_type: 'prepaid' | 'postpaid';
}

// Normalize meter number
const normalizeMeter = (meterNumber: string): string => {
  return meterNumber.replace(/[^\d]/g, '').trim();
};

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: CORS_HEADERS });
  }

  try {
    // Get authorization header
    const authHeader = req.headers.get('Authorization');
    if (!authHeader) {
      return new Response(
        JSON.stringify({ success: false, error: 'Missing authorization header' }),
        { status: 401, headers: { ...CORS_HEADERS, 'Content-Type': 'application/json' } }
      );
    }

    // Create Supabase client for authentication
    const supabaseClient = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_ANON_KEY') ?? '',
      {
        global: {
          headers: { Authorization: authHeader },
        },
      }
    );

    // Verify authentication
    const { data: { user }, error: authError } = await supabaseClient.auth.getUser();
    if (authError || !user) {
      return new Response(
        JSON.stringify({ success: false, error: 'Unauthorized' }),
        { status: 401, headers: { ...CORS_HEADERS, 'Content-Type': 'application/json' } }
      );
    }

    // Parse request body
    const body: ValidateMeterRequest = await req.json();
    const { meter_number, provider, meter_type } = body;

    // Validate inputs
    if (!meter_number || !provider || !meter_type) {
      return new Response(
        JSON.stringify({
          success: false,
          error: 'meter_number, provider, and meter_type are required',
        }),
        { status: 400, headers: { ...CORS_HEADERS, 'Content-Type': 'application/json' } }
      );
    }

    // Normalize meter number
    const sanitizedMeter = normalizeMeter(meter_number);
    if (!sanitizedMeter) {
      return new Response(
        JSON.stringify({
          success: false,
          error: 'Invalid meter number',
        }),
        { status: 400, headers: { ...CORS_HEADERS, 'Content-Type': 'application/json' } }
      );
    }

    // Get MobileNig public key (required for validation)
    const mobilenigPublicKey = Deno.env.get('MOBILENIG_PUBLIC_KEY');
    if (!mobilenigPublicKey) {
      return new Response(
        JSON.stringify({
          success: false,
          error: 'MobileNig credentials not configured',
        }),
        { status: 500, headers: { ...CORS_HEADERS, 'Content-Type': 'application/json' } }
      );
    }

    // Normalize provider and get service ID
    const normalizedProvider = provider.toUpperCase().replace(/[^A-Z]/g, '');
    const canonicalProvider = PROVIDER_ALIASES[normalizedProvider] || normalizedProvider;
    const serviceIds = MOBILENIG_SERVICE_IDS[canonicalProvider];

    if (!serviceIds) {
      return new Response(
        JSON.stringify({
          success: false,
          error: `Unsupported electricity provider: ${provider}. Supported providers: ${Object.keys(MOBILENIG_SERVICE_IDS).join(', ')}`,
        }),
        { status: 400, headers: { ...CORS_HEADERS, 'Content-Type': 'application/json' } }
      );
    }

    const serviceId = meter_type === 'prepaid' ? serviceIds.prepaid : serviceIds.postpaid;
    console.log('Validating meter with MobileNig:', {
      meter_number: sanitizedMeter.substring(0, 4) + '***',
      provider: canonicalProvider,
      meter_type,
      service_id: serviceId,
    });

    // Call MobileNig API: POST /api/v2/services/proxy
    // Required fields: service_id, customerAccountId
    // Authorization: Bearer {{public_key}}
    const requestBody = {
      service_id: serviceId,
      customerAccountId: sanitizedMeter,
    };

    const response = await fetch('https://enterprise.mobilenig.com/api/v2/services/proxy', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${mobilenigPublicKey}`,
      },
      body: JSON.stringify(requestBody),
    });

    const responseText = await response.text();
    console.log('MobileNig API response status:', response.status);
    console.log('MobileNig API response (first 500 chars):', responseText.substring(0, 500));

    // Check if response is empty
    if (!responseText || !responseText.trim()) {
      return new Response(
        JSON.stringify({
          success: false,
          error: 'Invalid meter number. Please check the meter number and try again.',
        }),
        { status: 200, headers: { ...CORS_HEADERS, 'Content-Type': 'application/json' } }
      );
    }

    // Parse JSON response
    let data: any;
    try {
      data = JSON.parse(responseText);
    } catch (parseError) {
      console.error('Failed to parse MobileNig API response:', parseError);
      return new Response(
        JSON.stringify({
          success: false,
          error: 'Invalid response from service provider. Please try again later.',
        }),
        { status: 200, headers: { ...CORS_HEADERS, 'Content-Type': 'application/json' } }
      );
    }

    // Check for success: statusCode "200" and message "success"
    if (response.ok && data.statusCode === '200' && data.message === 'success') {
      const details = data.details || {};

      // Extract customer information from response
      const responseData = {
        customer_name: details.customerName || 'Customer',
        address: details.customerAddress || '',
        meter_number: details.customerReference || sanitizedMeter,
        tariff: details.tariff || '',
        minimum_vend: Number(details.minimumVend || 0),
        outstanding_amount: Number(details.outstandingAmount || 0),
        customer_category: details.customerCategory || '',
        business_unit: details.businessUnit || '',
        utility_account: details.utilityAccount || '',
        response_message: details.responseMessage || '',
        response_code: details.responseCode || null,
      };

      console.log('Meter validation successful:', {
        customer_name: responseData.customer_name,
        meter_number: responseData.meter_number.substring(0, 4) + '***',
        minimum_vend: responseData.minimum_vend,
      });

      return new Response(
        JSON.stringify({
          success: true,
          data: responseData,
        }),
        { status: 200, headers: { ...CORS_HEADERS, 'Content-Type': 'application/json' } }
      );
    } else {
      // Extract error message
      const statusCode = data.statusCode;
      let errorMessage = 'Validation failed';

      if (statusCode === 'EXC010') {
        errorMessage = 'Invalid meter number. Please check the meter number and try again.';
      } else if (typeof data.details === 'string') {
        errorMessage = data.details;
      } else if (data.details?.details) {
        errorMessage = typeof data.details.details === 'string' 
          ? data.details.details 
          : (data.details.details?.message || errorMessage);
      } else if (data.details?.responseMessage) {
        errorMessage = data.details.responseMessage;
      } else if (data.details?.message) {
        errorMessage = data.details.message;
      } else if (data.message) {
        errorMessage = data.message;
      } else if (data.error) {
        errorMessage = data.error;
      }

      console.log('Meter validation failed:', {
        statusCode,
        errorMessage,
      });

      return new Response(
        JSON.stringify({
          success: false,
          error: errorMessage,
          statusCode,
        }),
        { status: 200, headers: { ...CORS_HEADERS, 'Content-Type': 'application/json' } }
      );
    }
  } catch (error: any) {
    console.error('Error validating meter:', error);
    return new Response(
      JSON.stringify({
        success: false,
        error: error.message || 'Failed to validate meter number',
      }),
      { status: 500, headers: { ...CORS_HEADERS, 'Content-Type': 'application/json' } }
    );
  }
});


