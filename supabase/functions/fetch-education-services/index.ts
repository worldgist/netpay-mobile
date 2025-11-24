import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const CORS_HEADERS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

// Exam type to VTpass service ID mapping
const EXAM_TO_VTPASS_SERVICE_ID: Record<string, string> = {
  'WAEC': 'waec',
  'NECO': 'neco',
  'JAMB': 'jamb',
};

// Exam type to Mobilenig service ID mapping
const EXAM_TO_MOBILENIG_SERVICE_ID: Record<string, string> = {
  'WAEC': 'AJA',
  'NECO': 'AJC',
  'JAMB': 'AJB',
};

const formatServiceRow = (row: any) => {
  const examTypeRaw = row.exam_type ?? row.service_name ?? row.id;
  const examType = typeof examTypeRaw === 'string' ? examTypeRaw.toUpperCase().trim() : 'EDUCATION';
  const defaultServiceIdMap: Record<string, string> = {
    'WAEC': 'AJA',
    'NECO': 'AJC',
    'JAMB': 'AJB',
  };
  const price =
    (typeof row.custom_price === 'number' ? row.custom_price : null) ??
    (typeof row.price === 'number' ? row.price : null) ??
    (typeof row.original_price === 'number' ? row.original_price : null) ??
    0;

  const serviceId =
    (typeof row.service_id === 'string' && row.service_id.trim().length > 0 ? row.service_id.trim() : null) ??
    (typeof row.api_code === 'string' && row.api_code.trim().length > 0 ? row.api_code.trim() : null) ??
    (typeof row.id === 'string' && row.id.trim().length > 0 ? row.id.trim() : null) ??
    defaultServiceIdMap[examType] ??
    null;

  return {
    id: row.id,
    exam_type: examType,
    service_name: row.service_name ?? examType,
    price,
    original_price:
      (typeof row.original_price === 'number' ? row.original_price : null) ??
      price,
    custom_price: typeof row.custom_price === 'number' ? row.custom_price : null,
    api_code: row.api_code,
    service_id: serviceId,
    is_active: row.is_active,
    logo_url: row.logo_url ?? null,
    metadata: row.metadata ?? null,
  };
};

async function fetchFromVTpass(examType: string) {
  const VTPASS_API_KEY = Deno.env.get('VTPASS_API_KEY');
  const VTPASS_PUBLIC_KEY = Deno.env.get('VTPASS_PUBLIC_KEY');
  const VTPASS_MODE = Deno.env.get('VTPASS_MODE') || 'live';
  
  if (!VTPASS_API_KEY || !VTPASS_PUBLIC_KEY) {
    return new Response(
      JSON.stringify({
        success: false,
        error: 'VTpass credentials not configured. Please set VTPASS_API_KEY and VTPASS_PUBLIC_KEY environment variables.',
      }),
      { status: 500, headers: { ...CORS_HEADERS, 'Content-Type': 'application/json' } }
    );
  }

  const serviceId = EXAM_TO_VTPASS_SERVICE_ID[examType];
  if (!serviceId) {
    return new Response(
      JSON.stringify({
        success: false,
        error: `Unsupported exam type for VTpass: ${examType}. Supported types: WAEC, NECO, JAMB`,
      }),
      { status: 400, headers: { ...CORS_HEADERS, 'Content-Type': 'application/json' } }
    );
  }

  const baseUrl = VTPASS_MODE === 'sandbox' 
    ? 'https://sandbox.vtpass.com/api'
    : 'https://vtpass.com/api';
  
  // Encode the service ID to handle any special characters
  const encodedServiceId = encodeURIComponent(serviceId);
  const apiUrl = `${baseUrl}/service-variations?serviceID=${encodedServiceId}`;
  
  console.log('Fetching VTpass variations from:', apiUrl);
  console.log('Exam type:', examType, 'Service ID:', serviceId, 'Encoded:', encodedServiceId);
  console.log('VTpass API Key configured:', VTPASS_API_KEY ? 'Yes (length: ' + VTPASS_API_KEY.length + ')' : 'No');
  console.log('VTpass Public Key configured:', VTPASS_PUBLIC_KEY ? 'Yes (length: ' + VTPASS_PUBLIC_KEY.length + ')' : 'No');

  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), 30000); // 30 second timeout

  try {
    const response = await fetch(apiUrl, {
      method: 'GET',
      headers: {
        'api-key': VTPASS_API_KEY,
        'public-key': VTPASS_PUBLIC_KEY,
        'Content-Type': 'application/json',
      },
      signal: controller.signal,
    });

    clearTimeout(timeoutId);

    console.log('VTpass API HTTP response status:', response.status, response.statusText);
    console.log('VTpass API response headers:', Object.fromEntries(response.headers.entries()));

    if (!response.ok) {
      const errorText = await response.text();
      console.error('VTpass API HTTP error:', response.status, errorText);
      return new Response(
        JSON.stringify({
          success: false,
          error: `VTpass API HTTP error: ${response.status} - ${errorText}`,
          http_status: response.status,
          http_status_text: response.statusText,
        }),
        { status: response.status, headers: { ...CORS_HEADERS, 'Content-Type': 'application/json' } }
      );
    }

    let data: any;
    try {
      const responseText = await response.text();
      console.log('VTpass API raw response text (first 500 chars):', responseText.substring(0, 500));
      
      if (!responseText || !responseText.trim()) {
        return new Response(
          JSON.stringify({
            success: false,
            error: 'Empty response from VTpass API',
          }),
          { status: 200, headers: { ...CORS_HEADERS, 'Content-Type': 'application/json' } }
        );
      }
      
      data = JSON.parse(responseText);
    } catch (parseError: any) {
      console.error('Failed to parse VTpass API response as JSON:', parseError);
      return new Response(
        JSON.stringify({
          success: false,
          error: 'Invalid JSON response from VTpass API',
          details: parseError.message,
        }),
        { status: 200, headers: { ...CORS_HEADERS, 'Content-Type': 'application/json' } }
      );
    }
    
    // Log the full response for debugging
    console.log('VTpass API parsed response:', JSON.stringify(data, null, 2));
    console.log('Response keys:', Object.keys(data));
    console.log('response_description:', data.response_description);
    console.log('code:', data.code);
    console.log('content:', data.content ? 'exists' : 'missing');
    console.log('variations:', data.content?.variations ? `${data.content.variations.length} found` : 'missing');
    
    // Check if response indicates success
    // According to VTpass documentation, variations endpoint returns response_description: "000" for success
    const responseDesc = String(data.response_description || '').trim();
    const responseCode = String(data.code || '').trim();
    const isSuccess = responseDesc === '000' || responseCode === '000';
    
    if (!isSuccess) {
      // Extract error message - VTpass typically provides response_description or message
      let errorMsg = data.response_description || data.message || data.error;
      
      // If no specific message, create a user-friendly error based on the code
      if (!errorMsg) {
        if (responseCode === '001') {
          errorMsg = 'Invalid request or service not available. Please check your VTpass API credentials and service ID.';
        } else if (responseCode) {
          errorMsg = `VTpass API error (code: ${responseCode}). Please check your configuration.`;
        } else {
          errorMsg = `Failed to fetch variations. Response code: ${responseDesc || 'unknown'}`;
        }
      }
      
      // Add code information to the error message if it's a known error code
      if (responseCode && responseCode !== '000') {
        errorMsg = `[Code ${responseCode}] ${errorMsg}`;
      }
      
      console.error('VTpass API error response:', errorMsg);
      console.error('Error code:', responseCode);
      console.error('Response description:', responseDesc);
      console.error('Full error response:', JSON.stringify(data, null, 2));
      
      return new Response(
        JSON.stringify({
          success: false,
          error: errorMsg,
          code: responseCode || responseDesc,
          details: {
            response_description: data.response_description,
            code: data.code,
            message: data.message,
            error: data.error,
            content: data.content,
            // Only include full_response in development/sandbox mode
            ...(VTPASS_MODE === 'sandbox' ? { full_response: data } : {}),
          },
        }),
        { status: 200, headers: { ...CORS_HEADERS, 'Content-Type': 'application/json' } }
      );
    }

    // Try multiple ways to get variations array
    let variations: any[] = [];
    if (data.content?.variations && Array.isArray(data.content.variations)) {
      variations = data.content.variations;
    } else if (data.variations && Array.isArray(data.variations)) {
      variations = data.variations;
    } else if (Array.isArray(data.content)) {
      variations = data.content;
    } else if (Array.isArray(data)) {
      variations = data;
    }
    
    console.log('Extracted variations count:', variations.length);
    
    // Check if variations array is empty
    if (variations.length === 0) {
      console.warn('No variations found in VTpass response for exam type:', examType);
      console.warn('Response structure:', {
        has_content: !!data.content,
        content_keys: data.content ? Object.keys(data.content) : [],
        data_keys: Object.keys(data),
      });
      return new Response(
        JSON.stringify({
          success: false,
          error: `No variations found for ${examType}. The service may not be available or the serviceID may be incorrect.`,
          details: {
            response_description: data.response_description,
            code: data.code,
            content_structure: data.content ? Object.keys(data.content) : [],
            full_response: data,
          },
        }),
        { status: 200, headers: { ...CORS_HEADERS, 'Content-Type': 'application/json' } }
      );
    }
    
    // Map VTpass variations to education services format
    const services = variations.map((variation: any) => {
      const price = parseFloat(variation.variation_amount || '0');
      const variationCode = variation.variation_code || '';
      const name = variation.name || `${examType} ${variationCode}`;

      // Use VTpass service ID (waec, neco, jamb) instead of Mobilenig IDs (AJA, AJC, AJB)
      // The service_id should match the VTpass service ID when importing from VTpass
      // serviceId is already set from EXAM_TO_VTPASS_SERVICE_ID mapping above
      // Keep variationCode in lowercase for VTpass API (e.g., "utme-mock", "utme-no-mock", "waecdirect")

      return {
        exam_type: examType,
        service_name: name,
        price: price,
        original_price: price,
        vendor_price: price,
        user_price: price,
        api_code: variationCode.toLowerCase(), // Store in lowercase for VTpass API compatibility
        vtpass_code: variationCode.toLowerCase(), // Store VTpass variation code in lowercase (e.g., "utme-mock", "utme-no-mock")
        service_id: serviceId, // Use VTpass service ID (waec, neco, jamb) - NOT Mobilenig IDs (AJA, AJC, AJB)
        is_active: true,
      };
    });

    return new Response(
      JSON.stringify({
        success: true,
        data: services,
        metadata: {
          total: services.length,
          exam_type: examType,
          provider: 'vtpass',
          service_id: serviceId,
        },
      }),
      { status: 200, headers: { ...CORS_HEADERS, 'Content-Type': 'application/json' } }
    );
  } catch (fetchError: any) {
    clearTimeout(timeoutId);
    
    console.error('Error fetching from VTpass API:', fetchError);
    console.error('Error details:', {
      name: fetchError?.name,
      message: fetchError?.message,
      stack: fetchError?.stack,
    });
    
    if (fetchError.name === 'AbortError' || fetchError.message?.includes('aborted')) {
      console.error('VTpass API request timed out');
      return new Response(
        JSON.stringify({
          success: false,
          error: 'Request to VTpass API timed out. The API may be slow or unavailable. Please try again.',
        }),
        { status: 504, headers: { ...CORS_HEADERS, 'Content-Type': 'application/json' } }
      );
    }
    
    // Handle network errors
    if (fetchError.message?.includes('fetch') || fetchError.message?.includes('network')) {
      return new Response(
        JSON.stringify({
          success: false,
          error: `Network error connecting to VTpass API: ${fetchError.message}. Please check your internet connection and try again.`,
        }),
        { status: 500, headers: { ...CORS_HEADERS, 'Content-Type': 'application/json' } }
      );
    }
    
    // Generic error response
    return new Response(
      JSON.stringify({
        success: false,
        error: fetchError.message || 'Failed to fetch variations from VTpass API',
        details: fetchError.name || 'Unknown error',
      }),
      { status: 500, headers: { ...CORS_HEADERS, 'Content-Type': 'application/json' } }
    );
  }
}

async function fetchFromMobilenig(examType: string) {
  // Try public key first, then secret key as fallback
  const MOBILENIG_PUBLIC_KEY = Deno.env.get('MOBILENIG_PUBLIC_KEY');
  const MOBILENIG_SECRET_KEY = Deno.env.get('MOBILENIG_SECRET_KEY');
  const API_KEY = MOBILENIG_PUBLIC_KEY || MOBILENIG_SECRET_KEY;
  
  if (!API_KEY) {
    return new Response(
      JSON.stringify({
        success: false,
        error: 'Mobilenig credentials not configured. Please set MOBILENIG_PUBLIC_KEY or MOBILENIG_SECRET_KEY environment variable.',
      }),
      { status: 500, headers: { ...CORS_HEADERS, 'Content-Type': 'application/json' } }
    );
  }

  const serviceId = EXAM_TO_MOBILENIG_SERVICE_ID[examType];
  if (!serviceId) {
    return new Response(
      JSON.stringify({
        success: false,
        error: `Unsupported exam type for Mobilenig: ${examType}. Supported types: WAEC, NECO, JAMB`,
      }),
      { status: 400, headers: { ...CORS_HEADERS, 'Content-Type': 'application/json' } }
    );
  }

  const apiUrl = 'https://enterprise.mobilenig.com/api/v2/services/packages';
  
  console.log('Fetching Mobilenig packages from:', apiUrl);
  console.log('Exam type:', examType, 'Service ID:', serviceId);
  console.log('Using API Key:', MOBILENIG_PUBLIC_KEY ? 'Public Key' : 'Secret Key');
  console.log('API Key configured:', API_KEY ? 'Yes (length: ' + API_KEY.length + ')' : 'No');

  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), 30000); // 30 second timeout

  try {
    const response = await fetch(apiUrl, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${API_KEY}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        service_id: serviceId,
      }),
      signal: controller.signal,
    });

    clearTimeout(timeoutId);

    console.log('Mobilenig API HTTP response status:', response.status, response.statusText);

    // Check response status first
    console.log('Mobilenig API response headers:', Object.fromEntries(response.headers.entries()));
    console.log('Mobilenig API response content-type:', response.headers.get('content-type'));
    
    let data: any;
    try {
      // Try to get response text first to see what we're dealing with
      const responseText = await response.clone().text();
      console.log('Mobilenig API raw response text length:', responseText.length);
      console.log('Mobilenig API raw response text (first 1000 chars):', responseText.substring(0, 1000));
      
      if (!responseText || !responseText.trim()) {
        console.error('Empty response body from Mobilenig API');
        return new Response(
          JSON.stringify({
            success: false,
            error: 'Empty response from Mobilenig API',
            debug: {
              http_status: response.status,
              http_status_text: response.statusText,
              content_length: response.headers.get('content-length'),
              content_type: response.headers.get('content-type'),
            },
          }),
          { status: 200, headers: { ...CORS_HEADERS, 'Content-Type': 'application/json' } }
        );
      }
      
      // Now parse as JSON
      data = JSON.parse(responseText);
    } catch (parseError: any) {
      console.error('Failed to parse Mobilenig API response as JSON:', parseError);
      console.error('Parse error details:', {
        name: parseError?.name,
        message: parseError?.message,
        stack: parseError?.stack,
      });
      
      // Try to get the response text for debugging
      let errorResponseText = '';
      try {
        errorResponseText = await response.text();
        console.error('Response text that failed to parse:', errorResponseText.substring(0, 500));
      } catch (e) {
        console.error('Could not read response text for debugging');
      }
      
      return new Response(
        JSON.stringify({
          success: false,
          error: 'Invalid JSON response from Mobilenig API',
          details: parseError.message,
          debug: {
            http_status: response.status,
            http_status_text: response.statusText,
            response_preview: errorResponseText.substring(0, 200),
          },
        }),
        { status: 200, headers: { ...CORS_HEADERS, 'Content-Type': 'application/json' } }
      );
    }
    
    if (!response.ok) {
      console.error('Mobilenig API HTTP error:', response.status, data);
      return new Response(
        JSON.stringify({
          success: false,
          error: `Mobilenig API HTTP error: ${response.status}`,
          details: data,
          http_status: response.status,
          http_status_text: response.statusText,
        }),
        { status: response.status, headers: { ...CORS_HEADERS, 'Content-Type': 'application/json' } }
      );
    }
    
    // Log the full response for debugging
    console.log('Mobilenig API parsed response:', JSON.stringify(data, null, 2));
    console.log('Response keys:', Object.keys(data || {}));
    console.log('Response statusCode:', data.statusCode);
    console.log('Response message:', data.message);
    console.log('Response has details:', 'details' in data);
    console.log('Response details type:', typeof data.details);
    console.log('Response details value:', data.details);
    
    // Check if response indicates success
    // Mobilenig typically returns statusCode '200' or message 'success'
    const isSuccess = data.statusCode === '200' || 
                      data.statusCode === 200 || 
                      data.message === 'success' || 
                      data.message === 'Success' ||
                      (response.ok && data.details);
    
    console.log('Is success?', isSuccess, {
      statusCode: data.statusCode,
      statusCodeType: typeof data.statusCode,
      message: data.message,
      responseOk: response.ok,
      hasDetails: !!data.details,
    });
    
    if (!isSuccess) {
      const errorMsg = data.message || 
                       data.error || 
                       data.response_description || 
                       `Failed to fetch packages from Mobilenig API. Status: ${data.statusCode || 'unknown'}`;
      console.error('Mobilenig API error response:', errorMsg);
      console.error('Full error response:', JSON.stringify(data, null, 2));
      return new Response(
        JSON.stringify({
          success: false,
          error: errorMsg,
          details: data,
          debug: {
            statusCode: data.statusCode,
            message: data.message,
            response_keys: Object.keys(data || {}),
            hasDetails: 'details' in data,
            detailsType: typeof data.details,
            httpStatus: response.status,
            httpStatusText: response.statusText,
          },
        }),
        { status: 200, headers: { ...CORS_HEADERS, 'Content-Type': 'application/json' } }
      );
    }
    
    // Check if details exists even if success
    if (!data.details) {
      console.error('API returned success but no details field. Full response:', JSON.stringify(data, null, 2));
      return new Response(
        JSON.stringify({
          success: false,
          error: `Mobilenig API returned success status but no 'details' field in response for ${examType}`,
          details: {
            response: data,
            responseKeys: Object.keys(data || {}),
            message: 'The API response indicates success but is missing the expected data structure.',
          },
        }),
        { status: 200, headers: { ...CORS_HEADERS, 'Content-Type': 'application/json' } }
      );
    }

    // Handle different response structures
    // For NECO/WAEC: details is a single object with { name, price }
    // For JAMB: details is an array of packages
    let services: any[] = [];
    
    if (examType === 'NECO' || examType === 'WAEC') {
      // NECO/WAEC returns single object: { name: "Neco Result Checker Pin", price: 800 }
      console.log('Processing NECO/WAEC response. Full data:', JSON.stringify(data, null, 2));
      
      const details = data.details;
      console.log('Details extracted:', details);
      console.log('Details type:', typeof details);
      console.log('Details keys:', details ? Object.keys(details) : 'null/undefined');
      
      // Check if details exists and is an object
      if (!details) {
        console.error(`No 'details' field in response for ${examType}`);
        console.error('Response structure:', {
          hasDetails: 'details' in data,
          keys: Object.keys(data || {}),
          data: data
        });
        return new Response(
          JSON.stringify({
            success: false,
            error: `No data returned from Mobilenig API for ${examType}. The 'details' field is missing in the response.`,
            details: {
              response: data,
              responseKeys: Object.keys(data || {}),
              message: 'The API response does not contain the expected "details" field with price information.'
            },
          }),
          { status: 200, headers: { ...CORS_HEADERS, 'Content-Type': 'application/json' } }
        );
      }
      
      if (typeof details !== 'object' || Array.isArray(details)) {
        console.error('Invalid NECO/WAEC response structure - details is not a plain object:', typeof details, Array.isArray(details));
        return new Response(
          JSON.stringify({
            success: false,
            error: `Invalid response structure for ${examType}. Expected 'details' to be an object with name and price, but got ${typeof details}${Array.isArray(details) ? ' (array)' : ''}.`,
            details: {
              response: data,
              detailsValue: details,
              detailsType: typeof details,
            },
          }),
          { status: 200, headers: { ...CORS_HEADERS, 'Content-Type': 'application/json' } }
        );
      }
      
      const price = parseFloat(String(details.price || '0'));
      const name = String(details.name || `${examType} Result Checker Pin`);
      
      console.log(`Extracted price: ${price}, name: ${name}`);
      
      if (!price || price <= 0 || isNaN(price)) {
        console.error(`Invalid price in ${examType} response:`, details.price);
        return new Response(
          JSON.stringify({
            success: false,
            error: `Invalid or missing price in ${examType} response. Expected a positive number, but got: ${details.price}`,
            details: {
              response: data,
              details: details,
              priceValue: details.price,
              priceType: typeof details.price,
            },
          }),
          { status: 200, headers: { ...CORS_HEADERS, 'Content-Type': 'application/json' } }
        );
      }
      
      services = [{
        exam_type: examType,
        service_name: name,
        price: price,
        original_price: price,
        vendor_price: price,
        user_price: price,
        api_code: serviceId, // Use service ID as api_code for NECO/WAEC
        service_id: serviceId,
        is_active: true,
      }];
    } else {
      // JAMB returns array of packages
      const packages = data.details || data.data || data.packages || [];
      
      if (!Array.isArray(packages)) {
        console.error('Invalid JAMB response structure. Expected array, got:', typeof packages);
        return new Response(
          JSON.stringify({
            success: false,
            error: `Invalid response structure from Mobilenig API. Expected array in 'details' field for JAMB, got: ${typeof packages}`,
            details: data,
          }),
          { status: 200, headers: { ...CORS_HEADERS, 'Content-Type': 'application/json' } }
        );
      }
      
      if (packages.length === 0) {
        console.warn('No packages found in Mobilenig response for exam type:', examType);
        return new Response(
          JSON.stringify({
            success: false,
            error: `No packages found for ${examType}. The service may not be available.`,
            details: data,
          }),
          { status: 200, headers: { ...CORS_HEADERS, 'Content-Type': 'application/json' } }
        );
      }
      
      // Map JAMB packages to education services format
      services = packages.map((pkg: any) => {
        const price = parseFloat(pkg.price || '0');
        const productCode = pkg.productCode || '';
        const name = pkg.name || `${examType} ${productCode}`;
        const apiCode = productCode || examType;

        return {
          exam_type: examType,
          service_name: name,
          price: price,
          original_price: price,
          vendor_price: price,
          user_price: price,
          api_code: apiCode.toUpperCase(),
          mobilenig_code: productCode,
          service_id: serviceId,
          is_active: true,
        };
      });
    }

    return new Response(
      JSON.stringify({
        success: true,
        data: services,
        metadata: {
          total: services.length,
          exam_type: examType,
          provider: 'mobilenig',
          service_id: serviceId,
        },
      }),
      { status: 200, headers: { ...CORS_HEADERS, 'Content-Type': 'application/json' } }
    );
  } catch (fetchError: any) {
    clearTimeout(timeoutId);
    
    console.error('Error fetching from Mobilenig API:', fetchError);
    console.error('Error details:', {
      name: fetchError?.name,
      message: fetchError?.message,
      stack: fetchError?.stack,
    });
    
    if (fetchError.name === 'AbortError' || fetchError.message?.includes('aborted')) {
      console.error('Mobilenig API request timed out');
      return new Response(
        JSON.stringify({
          success: false,
          error: 'Request to Mobilenig API timed out. The API may be slow or unavailable. Please try again.',
        }),
        { status: 504, headers: { ...CORS_HEADERS, 'Content-Type': 'application/json' } }
      );
    }
    
    // Handle network errors
    if (fetchError.message?.includes('fetch') || fetchError.message?.includes('network')) {
      return new Response(
        JSON.stringify({
          success: false,
          error: `Network error connecting to Mobilenig API: ${fetchError.message}. Please check your internet connection and try again.`,
        }),
        { status: 500, headers: { ...CORS_HEADERS, 'Content-Type': 'application/json' } }
      );
    }
    
    // Generic error response
    return new Response(
      JSON.stringify({
        success: false,
        error: fetchError.message || 'Failed to fetch packages from Mobilenig API',
        details: fetchError.name || 'Unknown error',
      }),
      { status: 500, headers: { ...CORS_HEADERS, 'Content-Type': 'application/json' } }
    );
  }
}

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: CORS_HEADERS });
  }

  try {
    const supabaseUrl = Deno.env.get('SUPABASE_URL');
    const supabaseKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');

    if (!supabaseUrl || !supabaseKey) {
      throw new Error('Supabase credentials are not configured');
    }

    const supabase = createClient(supabaseUrl, supabaseKey, {
      auth: {
        persistSession: false,
        autoRefreshToken: false,
      },
    });

    console.log('Supabase client initialized with service role key');

    const authHeader = req.headers.get('Authorization');
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return new Response(
        JSON.stringify({ success: false, error: 'Unauthorized' }),
        { status: 401, headers: { ...CORS_HEADERS, 'Content-Type': 'application/json' } }
      );
    }

    const token = authHeader.replace('Bearer ', '');
    const {
      data: { user },
      error: authError,
    } = await supabase.auth.getUser(token);

    if (authError || !user) {
      return new Response(
        JSON.stringify({ success: false, error: 'Unauthorized' }),
        { status: 401, headers: { ...CORS_HEADERS, 'Content-Type': 'application/json' } }
      );
    }

    const { data: roleRow } = await supabase
      .from('user_roles')
      .select('role')
      .eq('user_id', user.id)
      .eq('role', 'admin')
      .maybeSingle();

    if (!roleRow) {
      return new Response(
        JSON.stringify({ success: false, error: 'Admin access required' }),
        { status: 403, headers: { ...CORS_HEADERS, 'Content-Type': 'application/json' } }
      );
    }

    let examTypeFilter: string | null = null;
    let provider: string | null = null;
    let fetchFromAPI: boolean = false;
    
    try {
      const contentType = req.headers.get('content-type') || '';
      if (contentType.includes('application/json')) {
        try {
        const payload = await req.json();
        if (payload?.exam_type) {
          examTypeFilter = String(payload.exam_type).toUpperCase().trim();
          }
          if (payload?.provider) {
            provider = String(payload.provider).toLowerCase().trim();
          }
          if (payload?.fetch_from_api !== undefined) {
            fetchFromAPI = Boolean(payload.fetch_from_api);
          }
        } catch (jsonError: any) {
          console.error('Error parsing request body as JSON:', jsonError);
          // Continue with null values - not critical
        }
      }
    } catch (parseError: any) {
      console.error('Error reading request body:', parseError);
      // Continue with null values - not critical for GET requests
    }
    
    console.log('Request parameters:', { examTypeFilter, provider, fetchFromAPI });

    // If provider is specified and it's VTpass, fetch from VTpass API
    if (provider === 'vtpass' && examTypeFilter) {
      try {
        return await fetchFromVTpass(examTypeFilter);
      } catch (vtpassError: any) {
        console.error('Error in fetchFromVTpass:', vtpassError);
        console.error('Error stack:', vtpassError?.stack);
        return new Response(
          JSON.stringify({
            success: false,
            error: vtpassError?.message || 'Failed to fetch from VTpass API',
            details: vtpassError?.name || 'Unknown error',
          }),
          { status: 500, headers: { ...CORS_HEADERS, 'Content-Type': 'application/json' } }
        );
      }
    }

    // If provider is specified and it's Mobilenig, fetch from API directly (no database fallback)
    if (provider === 'mobilenig' && examTypeFilter) {
      // For NECO, always fetch directly from API, never from database
      // For other exam types, fetch from API if fetchFromAPI flag is set
      if (fetchFromAPI || examTypeFilter === 'NECO') {
        try {
          console.log('Fetching from Mobilenig API (direct, no database fallback) for:', examTypeFilter);
          const apiResponse = await fetchFromMobilenig(examTypeFilter);
          
          // Check if API call was successful
          if (apiResponse.ok) {
            const apiData = await apiResponse.json();
            console.log('Mobilenig API response data:', JSON.stringify(apiData, null, 2));
            console.log('API response success:', apiData.success);
            console.log('API response data:', apiData.data);
            console.log('API response data length:', apiData.data?.length);
            
            if (apiData.success && apiData.data && Array.isArray(apiData.data) && apiData.data.length > 0) {
              console.log('Successfully fetched from Mobilenig API:', apiData.data.length, 'services');
              return apiResponse; // Return the API response directly
            }
            
            // Check if there's an error message in the response
            if (!apiData.success && apiData.error) {
              console.error('Mobilenig API returned error:', apiData.error);
              return new Response(
                JSON.stringify({
                  success: false,
                  error: apiData.error || `Failed to fetch from Mobilenig API for ${examTypeFilter}`,
                  details: apiData.details || apiData,
                }),
                { status: 200, headers: { ...CORS_HEADERS, 'Content-Type': 'application/json' } }
              );
            }
            
            console.error('Mobilenig API returned empty data. Full response:', JSON.stringify(apiData, null, 2));
            // Return error if API returned empty data
            return new Response(
              JSON.stringify({
                success: false,
                error: `No data returned from Mobilenig API for ${examTypeFilter}. The API response was successful but contained no service data.`,
                details: {
                  apiResponse: apiData,
                  hasSuccess: 'success' in apiData,
                  hasData: 'data' in apiData,
                  dataType: typeof apiData.data,
                  dataIsArray: Array.isArray(apiData.data),
                  dataLength: apiData.data?.length,
                  fullResponse: apiData,
                },
              }),
              { status: 200, headers: { ...CORS_HEADERS, 'Content-Type': 'application/json' } }
            );
          } else {
            console.error('Mobilenig API returned error status:', apiResponse.status);
            const errorData = await apiResponse.text().catch(() => 'Unable to read error response');
            console.error('Error response body:', errorData);
            return new Response(
              JSON.stringify({
                success: false,
                error: `Mobilenig API returned HTTP ${apiResponse.status}: ${apiResponse.statusText}`,
                details: {
                  status: apiResponse.status,
                  statusText: apiResponse.statusText,
                  errorBody: errorData,
                },
              }),
              { status: 200, headers: { ...CORS_HEADERS, 'Content-Type': 'application/json' } }
            );
          }
        } catch (apiError: any) {
          console.error('Mobilenig API fetch failed:', apiError?.message);
          return new Response(
            JSON.stringify({
              success: false,
              error: `Failed to fetch from Mobilenig API: ${apiError?.message || 'Unknown error'}`,
              details: apiError?.name || 'Unknown error',
            }),
            { status: 500, headers: { ...CORS_HEADERS, 'Content-Type': 'application/json' } }
          );
        }
      }
      
      // For other exam types without fetchFromAPI flag, try API first, then fallback to database
      try {
        console.log('Attempting to fetch from Mobilenig API for:', examTypeFilter);
        const apiResponse = await fetchFromMobilenig(examTypeFilter);
        
        // Check if API call was successful
        if (apiResponse.ok) {
          const apiData = await apiResponse.json();
          if (apiData.success && apiData.data && apiData.data.length > 0) {
            console.log('Successfully fetched from Mobilenig API:', apiData.data.length, 'services');
            return apiResponse; // Return the API response directly
          }
          console.log('Mobilenig API returned empty data');
        } else {
          console.log('Mobilenig API returned error status:', apiResponse.status);
        }
        
        // API returned empty or failed, fallback to database
        console.log('Mobilenig API returned no data, checking database...');
      } catch (apiError: any) {
        console.warn('Mobilenig API fetch failed, falling back to database:', apiError?.message);
        // Continue to database query
      }
      
      // Fallback: Query from database
      try {
        console.log('Querying Mobilenig education services from database for exam type:', examTypeFilter);
        
        // Select all columns - Supabase will only return columns that exist
        let query = supabase
          .from('education_services')
          .select('*')
          .eq('exam_type', examTypeFilter)
          .order('exam_type', { ascending: true });
        
        const { data: services, error: dbError } = await query;
        
        if (dbError) {
          console.error('Database error querying Mobilenig services:', dbError);
          return new Response(
            JSON.stringify({
              success: false,
              error: `Database error: ${dbError.message}. Also, Mobilenig API returned no data. Services may need to be added manually.`,
              details: {
                code: dbError.code,
                message: dbError.message,
              },
            }),
            { status: 500, headers: { ...CORS_HEADERS, 'Content-Type': 'application/json' } }
          );
        }
        
        // Filter by vending_provider in memory if the column exists
        let filteredServices = services || [];
        if (filteredServices.length > 0 && 'vending_provider' in filteredServices[0]) {
          filteredServices = filteredServices.filter((s: any) => 
            !s.vending_provider || s.vending_provider === 'mobilenig'
          );
        }
        
        if (filteredServices.length === 0) {
          console.warn('No Mobilenig services found in database for exam type:', examTypeFilter);
          
          // Create default service structure based on exam type
          // These are placeholder services that need to be configured with actual prices
          const defaultService = {
            exam_type: examTypeFilter,
            service_name: `${examTypeFilter} Result Checker PIN`,
            service_id: EXAM_TO_MOBILENIG_SERVICE_ID[examTypeFilter] || examTypeFilter,
            api_code: EXAM_TO_MOBILENIG_SERVICE_ID[examTypeFilter] || examTypeFilter,
            mobilenig_code: null, // Will be set when packages are fetched
            price: 0, // Needs to be set manually or from API
            original_price: 0,
            vending_provider: 'mobilenig',
            is_active: true,
          };
          
          // Return default structures so admin can configure them
          const formattedDefaults = defaultServices.map(formatServiceRow);
          return new Response(
            JSON.stringify({
              success: true,
              data: formattedDefaults,
              metadata: {
                total: formattedDefaults.length,
                exam_type: examTypeFilter,
                provider: 'mobilenig',
                source: 'default',
                message: `Default service structure(s) created. Please configure the prices manually. The Mobilenig API did not return data, and no services exist in the database for ${examTypeFilter}.`,
              },
            }),
            { status: 200, headers: { ...CORS_HEADERS, 'Content-Type': 'application/json' } }
          );
        }
        
        const formattedServices = filteredServices.map(formatServiceRow);
        
        return new Response(
          JSON.stringify({
            success: true,
            data: formattedServices,
            metadata: {
              total: formattedServices.length,
              exam_type: examTypeFilter,
              provider: 'mobilenig',
              source: 'database',
            },
          }),
          { status: 200, headers: { ...CORS_HEADERS, 'Content-Type': 'application/json' } }
        );
      } catch (dbError: any) {
        console.error('Error querying Mobilenig services from database:', dbError);
        return new Response(
          JSON.stringify({
            success: false,
            error: `Failed to fetch from Mobilenig API and database query failed: ${dbError?.message || 'Unknown error'}. Please add services manually.`,
            details: dbError?.name || 'Unknown error',
          }),
          { status: 500, headers: { ...CORS_HEADERS, 'Content-Type': 'application/json' } }
        );
      }
    }

    // Otherwise, fetch from database (for mobilenig, smeplug, or default)
    // Select core columns - vending_provider will be included if it exists in the table
    let query = supabase
      .from('education_services')
      .select('id, exam_type, service_name, price, custom_price, original_price, api_code, service_id, is_active, logo_url, metadata, vending_provider')
      .eq('is_active', true);

    // Use exact match for exam_type
    if (examTypeFilter) {
      query = query.eq('exam_type', examTypeFilter);
    }

    // Filter by vending provider if specified
    if (provider) {
      query = query.eq('vending_provider', provider);
    }

    query = query.order('exam_type', { ascending: true });

    console.log('Executing database query with filters:', { examTypeFilter, provider });

    const { data: rows, error } = await query;

    if (error) {
      console.error('Database query error:', error);
      console.error('Error code:', error.code);
      console.error('Error message:', error.message);
      console.error('Error details:', error.details);
      console.error('Error hint:', error.hint);
      console.error('Query parameters:', { examTypeFilter, provider });
      
      // Check if it's a column doesn't exist error
      if (error.message?.includes('column') && error.message?.includes('does not exist')) {
        return new Response(
          JSON.stringify({
            success: false,
            error: `Database column missing: ${error.message}. Please run the migration to add required columns.`,
            error_code: error.code,
            migration_file: '20251203000000_add_vtpass_to_education_services.sql',
          }),
          { status: 500, headers: { ...CORS_HEADERS, 'Content-Type': 'application/json' } }
        );
      }
      
      // Check if it's a permission/RLS error
      if (error.code === '42501' || error.message?.includes('permission') || error.message?.includes('policy')) {
        return new Response(
          JSON.stringify({
            success: false,
            error: `Database permission error: ${error.message}. Check RLS policies.`,
            error_code: error.code,
          }),
          { status: 500, headers: { ...CORS_HEADERS, 'Content-Type': 'application/json' } }
        );
      }
      
      return new Response(
        JSON.stringify({
          success: false,
          error: `Database query failed: ${error.message || 'Unknown error'}`,
          error_code: error.code,
          error_details: error.details,
          error_hint: error.hint,
        }),
        { status: 500, headers: { ...CORS_HEADERS, 'Content-Type': 'application/json' } }
      );
    }

    console.log('Query successful, found', rows?.length || 0, 'services');

    const services = (rows ?? []).map(formatServiceRow);

    // If no services found and a filter was applied, provide a helpful message
    if (services.length === 0 && (examTypeFilter || provider)) {
      return new Response(
        JSON.stringify({
          success: true,
          data: [],
          message: `No ${examTypeFilter || 'education'} services found${provider ? ` for provider: ${provider}` : ''}. Services may need to be imported first.`,
          metadata: {
            total: 0,
            exam_type: examTypeFilter,
            provider: provider || 'database',
          },
        }),
        { status: 200, headers: { ...CORS_HEADERS, 'Content-Type': 'application/json' } }
      );
    }

    return new Response(
      JSON.stringify({
        success: true,
        data: services,
        metadata: {
          total: services.length,
          exam_type: examTypeFilter,
          provider: provider || 'database',
        },
      }),
      { status: 200, headers: { ...CORS_HEADERS, 'Content-Type': 'application/json' } }
    );
  } catch (error: any) {
    console.error('Error in fetch-education-services function:', error);
    console.error('Error type:', typeof error);
    console.error('Error name:', error?.name);
    console.error('Error message:', error?.message);
    console.error('Error stack:', error?.stack);
    console.error('Full error object:', JSON.stringify(error, Object.getOwnPropertyNames(error)));

    const errorMessage = error instanceof Error 
      ? error.message 
      : typeof error === 'string' 
        ? error 
        : 'Unknown error occurred';

    return new Response(
      JSON.stringify({
        success: false,
        error: errorMessage,
        error_type: error?.name || typeof error,
        details: error instanceof Error ? {
          name: error.name,
          message: error.message,
        } : String(error),
      }),
      { status: 500, headers: { ...CORS_HEADERS, 'Content-Type': 'application/json' } }
    );
  }
});
