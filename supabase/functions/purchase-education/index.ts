import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { debitUserWallet } from "../_shared/wallet.ts";

const CORS_HEADERS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

const buildMobilenigHeaders = (secretKey: string) => ({
  'Content-Type': 'application/json',
  Authorization: `Bearer ${secretKey}`,
});

const ensureNumber = (value: unknown, fallback = 0): number => {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
};

const normalizePinEntries = (payload: any): Array<Record<string, unknown>> => {
  if (!payload) return [];
  if (Array.isArray(payload)) return payload;
  return [payload];
};

// Exam type to VTpass service ID mapping
const EXAM_TO_VTPASS_SERVICE_ID: Record<string, string> = {
  'WAEC': 'waec',
  'NECO': 'neco',
  'JAMB': 'jamb',
};

// Generate VTpass request ID
const generateVTpassRequestId = () => {
  const pad = (value: number) => `${value}`.padStart(2, '0');
  const now = new Date();
  const lagos = new Date(
    now.toLocaleString('en-US', { timeZone: 'Africa/Lagos' })
  );
  return (
    lagos.getFullYear().toString() +
    pad(lagos.getMonth() + 1) +
    pad(lagos.getDate()) +
    pad(lagos.getHours()) +
    pad(lagos.getMinutes())
  ) + '-' + crypto.randomUUID().replace(/-/g, '').slice(0, 12);
};

// Verify JAMB Profile ID with VTpass
async function verifyJAMBProfileId(profileId: string, variationCode: string): Promise<{ success: boolean; customerName?: string; error?: string }> {
  const VTPASS_API_KEY = Deno.env.get('VTPASS_API_KEY');
  const VTPASS_PUBLIC_KEY = Deno.env.get('VTPASS_PUBLIC_KEY');
  const VTPASS_MODE = Deno.env.get('VTPASS_MODE') || 'live';

  if (!VTPASS_API_KEY || !VTPASS_PUBLIC_KEY) {
    return { success: false, error: 'VTpass credentials not configured' };
  }

  const baseUrl = VTPASS_MODE === 'sandbox'
    ? 'https://sandbox.vtpass.com'
    : 'https://vtpass.com';

  const apiUrl = `${baseUrl}/api/merchant-verify`;

  try {
    const response = await fetch(apiUrl, {
      method: 'POST',
      headers: {
        'api-key': VTPASS_API_KEY,
        'public-key': VTPASS_PUBLIC_KEY,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        billersCode: profileId,
        serviceID: 'jamb',
        type: variationCode,
      }),
    });

    const data = await response.json();

    if (data.code === '000' && data.content?.Customer_Name) {
      return {
        success: true,
        customerName: data.content.Customer_Name,
      };
    }

    return {
      success: false,
      error: data.response_description || 'Failed to verify Profile ID',
    };
  } catch (error: any) {
    return {
      success: false,
      error: error.message || 'Profile ID verification failed',
    };
  }
}

// Purchase via VTpass
async function purchaseViaVTpass(
  examType: string,
  variationCode: string,
  phone: string,
  billersCode?: string, // Required for JAMB
  amount?: number
): Promise<{ success: boolean; data?: any; error?: string; pins?: Array<Record<string, unknown>> }> {
  const VTPASS_API_KEY = Deno.env.get('VTPASS_API_KEY');
  const VTPASS_PUBLIC_KEY = Deno.env.get('VTPASS_PUBLIC_KEY');
  const VTPASS_SECRET_KEY = Deno.env.get('VTPASS_SECRET_KEY');
  const VTPASS_MODE = Deno.env.get('VTPASS_MODE') || 'live';

  if (!VTPASS_API_KEY || !VTPASS_PUBLIC_KEY) {
    return { success: false, error: 'VTpass credentials not configured' };
  }

  const serviceId = EXAM_TO_VTPASS_SERVICE_ID[examType];
  if (!serviceId) {
    return { success: false, error: `Unsupported exam type for VTpass: ${examType}` };
  }

  // For JAMB, billersCode (Profile ID) is required
  if (examType === 'JAMB' && !billersCode) {
    return { success: false, error: 'JAMB Profile ID (billersCode) is required for JAMB purchases' };
  }

  const baseUrl = VTPASS_MODE === 'sandbox'
    ? 'https://sandbox.vtpass.com'
    : 'https://vtpass.com';

  const requestId = generateVTpassRequestId();
  const headers: HeadersInit = {
    'api-key': VTPASS_API_KEY,
    'public-key': VTPASS_PUBLIC_KEY,
    'Content-Type': 'application/json',
  };

  if (VTPASS_SECRET_KEY) {
    headers['secret-key'] = VTPASS_SECRET_KEY;
  }

  const payload: any = {
    request_id: requestId,
    serviceID: serviceId,
    variation_code: variationCode,
    phone: phone.replace(/[^\d]/g, ''),
  };

  if (amount) {
    payload.amount = amount;
  }

  if (billersCode) {
    payload.billersCode = billersCode;
  }

  try {
    const response = await fetch(`${baseUrl}/api/pay`, {
      method: 'POST',
      headers,
      body: JSON.stringify(payload),
    });

    const responseText = await response.text();
    let responseJson: any;

    try {
      responseJson = JSON.parse(responseText);
    } catch {
      return {
        success: false,
        error: 'Invalid response from VTpass',
      };
    }

    if (responseJson.code !== '000') {
      return {
        success: false,
        error: responseJson.response_description || 'Purchase failed',
      };
    }

    const transaction = responseJson.content?.transactions || {};
    const status = transaction.status?.toLowerCase() || '';

    if (status === 'delivered' || status === 'success') {
      // Extract PIN from response
      // VTpass returns PIN in format "Pin : 3678251321392432" or just the number
      const purchasedCodeRaw = responseJson.purchased_code || responseJson.Pin || '';
      const purchasedCode = purchasedCodeRaw.replace(/^Pin\s*:\s*/i, '').trim();
      const cards = responseJson.cards || [];
      
      let pins: Array<Record<string, unknown>> = [];
      
      if (cards.length > 0) {
        pins = cards.map((card: any) => ({
          Serial: card.Serial || '',
          Pin: (card.Pin || '').replace(/^Pin\s*:\s*/i, '').trim(),
        }));
      } else if (purchasedCode) {
        pins = [{ Pin: purchasedCode }];
      }

      return {
        success: true,
        data: {
          requestId: responseJson.requestId || requestId,
          transactionId: transaction.transactionId,
          purchased_code: purchasedCode,
          cards,
        },
        pins,
      };
    }

    return {
      success: false,
      error: responseJson.response_description || `Transaction status: ${status}`,
    };
  } catch (error: any) {
    return {
      success: false,
      error: error.message || 'VTpass API call failed',
    };
  }
}

// Purchase via Mobilenig
async function purchaseViaMobilenig(
  serviceId: string,
  phone: string,
  amount: number,
  quantity: number,
  secretKey: string,
  reference: string,
  apiCode?: string, // Product code for JAMB (UTME, DE) or other variations
  examType?: string // Exam type to determine API structure (WAEC, NECO, JAMB)
): Promise<{ success: boolean; data?: any; error?: string; pins?: Array<Record<string, unknown>> }> {
  const transId = Date.now();
  let pins: Array<Record<string, unknown>> = [];
  let walletBalance: unknown = null;

  try {
    // Build request body for Mobilenig enterprise API
    const requestBody: any = {
      service_id: serviceId,
      trans_id: transId,
      amount,
    };

    // Normalize exam type for comparison (case-insensitive)
    const normalizedExamType = examType ? String(examType).toUpperCase().trim() : '';
    
    console.log('Exam type check:', { examType, normalizedExamType, serviceId, quantity, amount });
    
    // For NECO/WAEC: Use quantity-based purchase (no phone number required)
    // According to API docs: service_id, trans_id, quantity, amount (NO phoneNumber field)
    if (normalizedExamType === 'NECO' || normalizedExamType === 'WAEC') {
      // NECO/WAEC uses quantity-based purchase - exactly as per API docs
      // Request body: { service_id, trans_id, quantity, amount }
      requestBody.quantity = quantity;
      // Explicitly ensure phoneNumber is NOT in request body for NECO/WAEC
      delete requestBody.phoneNumber;
      console.log('NECO/WAEC purchase - using quantity-based format without phone number');
      console.log('Final request body:', JSON.stringify(requestBody, null, 2));
    } else {
      // For JAMB or other services, include phone if provided
      if (phone && phone.trim()) {
        requestBody.phoneNumber = phone.trim();
      }
      
      // Add product code if provided (for JAMB: UTME or DE)
      if (apiCode && apiCode.trim()) {
        requestBody.productCode = apiCode.trim().toUpperCase();
      }
      
      // Add quantity if > 1
      if (quantity > 1) {
        requestBody.quantity = quantity;
      }
    }

    console.log('Mobilenig purchase request:', JSON.stringify(requestBody, null, 2));
    console.log('Exam type:', examType, 'Service ID:', serviceId);

    const response = await fetch('https://enterprise.mobilenig.com/api/v2/services/', {
      method: 'POST',
      headers: buildMobilenigHeaders(secretKey),
      body: JSON.stringify(requestBody),
    });

    const payloadText = await response.text();
    console.log('Mobilenig API response status:', response.status);
    console.log('Mobilenig API response text:', payloadText.substring(0, 1000));
    
    let payload: any = null;
    try {
      payload = JSON.parse(payloadText);
      console.log('Mobilenig API parsed response:', JSON.stringify(payload, null, 2));
    } catch {
      payload = payloadText;
      console.error('Failed to parse Mobilenig response as JSON');
    }

    if (response.ok && payload?.statusCode === '200' && payload?.message === 'success') {
      // Extract PINs from response structure
      // For NECO/WAEC: payload.details.details.pins (array of {pin: "..."})
      // For JAMB: may be in different structure
      const pinsArray = payload?.details?.details?.pins || payload?.details?.pins || [];
      
      // Normalize PIN format: convert array of {pin: "..."} to standardized format
      if (Array.isArray(pinsArray)) {
        pins = pinsArray.map((pinEntry: any) => {
          if (typeof pinEntry === 'string') {
            return { pin: pinEntry, serial: null };
          } else if (pinEntry?.pin) {
            return { pin: pinEntry.pin, serial: pinEntry.serial || null };
          } else {
            return pinEntry;
          }
        });
      }
      
      walletBalance = payload?.details?.wallet_balance;
      
      console.log('Extracted PINs:', JSON.stringify(pins, null, 2));
      
      return {
        success: true,
        data: payload,
        pins,
      };
    }

    // Extract error message from response
    let errorMsg = payload?.message || payload?.error || payload?.response_description || 'Enterprise endpoint failed';
    
    // If statusCode is not 200, include it in the error
    if (payload?.statusCode && payload.statusCode !== '200') {
      errorMsg = `[${payload.statusCode}] ${errorMsg}`;
    }
    
    // Include full response details for debugging
    console.error('Mobilenig API error:', errorMsg);
    console.error('Full error response:', JSON.stringify(payload, null, 2));
    throw new Error(errorMsg);
  } catch (enterpriseError: any) {
    console.error('Mobilenig enterprise API error:', enterpriseError);
    console.error('Error details:', {
      message: enterpriseError?.message,
      name: enterpriseError?.name,
      stack: enterpriseError?.stack,
    });
    
    // For API errors (not network errors), still try legacy API as fallback
    // Only skip legacy fallback for very specific errors
    const errorMessage = enterpriseError?.message || '';
    const isNetworkError = errorMessage.includes('fetch') || 
                           errorMessage.includes('network') ||
                           errorMessage.includes('timeout') ||
                           enterpriseError?.name === 'TypeError';
    
    if (!isNetworkError) {
      // For non-network errors, log and return error
      console.log('Enterprise API returned error, not attempting legacy fallback');
      return {
        success: false,
        error: errorMessage || 'Mobilenig purchase failed',
        error_details: enterpriseError,
      };
    }
    
    // Fallback to legacy API for network errors
    console.log('Enterprise API network error, attempting legacy API fallback...');
    const legacyResults: Array<Record<string, unknown>> = [];

    for (let index = 0; index < quantity; index += 1) {
      const legacyReference = `${reference}-${index + 1}`;
      const legacyResponse = await fetch('https://mobilenig.com/API/services/exec_purchase', {
        method: 'POST',
        headers: buildMobilenigHeaders(secretKey),
        body: JSON.stringify({
          serviceID: serviceId,
          phone,
          amount: amount / quantity,
          request_id: legacyReference,
        }),
      });

      const legacyText = await legacyResponse.text();
      let legacyPayload: any = null;
      try {
        legacyPayload = JSON.parse(legacyText);
      } catch {
        legacyPayload = legacyText;
      }

      if (!legacyResponse.ok || (legacyPayload?.status ?? legacyPayload?.message) === 'Failed') {
        return {
          success: false,
          error: legacyPayload?.message || legacyPayload?.error || 'Education service purchase failed',
        };
      }

      legacyResults.push({ reference: legacyReference, response: legacyPayload });
      const legacyPins = normalizePinEntries(legacyPayload?.details?.pins ?? legacyPayload?.details);
      pins = pins.concat(legacyPins);
      walletBalance = walletBalance ?? legacyPayload?.details?.wallet_balance;
    }

    return {
      success: true,
      data: {
        endpoint: 'legacy',
        results: legacyResults,
      },
      pins,
    };
  }
}

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: CORS_HEADERS });
  }

  try {
    const supabaseUrl = Deno.env.get('SUPABASE_URL');
    const supabaseKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
    const mobilenigSecretKey =
      Deno.env.get('MOBILENIG_SECRET_KEY') ?? Deno.env.get('MOBILENIG_PUBLIC_KEY');

    if (!supabaseUrl || !supabaseKey) {
      throw new Error('Supabase credentials are not configured');
    }

    const supabase = createClient(supabaseUrl, supabaseKey);

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

    const payload = await req.json();
    const phone_number = payload?.phone_number;
    const exam_type = payload?.exam_type;
    const billers_code = payload?.billers_code || payload?.billersCode; // JAMB Profile ID
    const api_code = payload?.api_code;
    const variation_code = payload?.variation_code;
    const amount = payload?.amount;
    const quantityInput = payload?.quantity;
    const providerServiceIdInput = payload?.service_id ? String(payload.service_id) : undefined;
    const educationServiceIdInput = payload?.education_service_id ? String(payload.education_service_id) : undefined;

    const isUuid = (value: string | undefined) =>
      !!value && /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(value);

    const serviceRowId = educationServiceIdInput ?? (isUuid(providerServiceIdInput) ? providerServiceIdInput : undefined);

    if (!exam_type || !serviceRowId) {
      return new Response(
        JSON.stringify({ success: false, error: 'exam_type and education_service_id are required' }),
        { status: 400, headers: { ...CORS_HEADERS, 'Content-Type': 'application/json' } }
      );
    }

    const normalizedExam = String(exam_type).toUpperCase().trim();
    const quantity = Math.max(1, ensureNumber(quantityInput, 1));

    // Fetch service with vending_provider
    const { data: serviceRow, error: serviceError } = await supabase
      .from('education_services')
      .select('id, exam_type, service_name, price, original_price, custom_price, api_code, service_id, vending_provider, vtpass_code, metadata')
      .eq('id', serviceRowId)
      .maybeSingle();

    if (serviceError || !serviceRow) {
      return new Response(
        JSON.stringify({ success: false, error: 'Education service not found' }),
        { status: 404, headers: { ...CORS_HEADERS, 'Content-Type': 'application/json' } }
      );
    }

    // Determine vending provider
    const vendingProvider = serviceRow.vending_provider || 'mobilenig';
    
    // For VTpass, use vtpass_code; for others, use api_code
    // VTpass requires lowercase variation codes (e.g., "utme-mock", "utme-no-mock")
    let variationCode = variation_code;
    if (!variationCode) {
      if (vendingProvider === 'vtpass') {
        variationCode = (serviceRow.vtpass_code || serviceRow.api_code || '').toLowerCase();
      } else {
        variationCode = serviceRow.api_code || '';
      }
    } else if (vendingProvider === 'vtpass') {
      // Ensure variation code is lowercase for VTpass API
      variationCode = variationCode.toLowerCase();
    }

    // For JAMB via VTpass, verify Profile ID first
    if (normalizedExam === 'JAMB' && vendingProvider === 'vtpass' && billers_code) {
      if (!variationCode) {
        return new Response(
          JSON.stringify({ success: false, error: 'Variation code is required for JAMB purchase via VTpass' }),
          { status: 400, headers: { ...CORS_HEADERS, 'Content-Type': 'application/json' } }
        );
      }

      const verificationResult = await verifyJAMBProfileId(billers_code, variationCode);
      if (!verificationResult.success) {
        return new Response(
          JSON.stringify({
            success: false,
            error: `JAMB Profile ID verification failed: ${verificationResult.error}`,
          }),
          { status: 400, headers: { ...CORS_HEADERS, 'Content-Type': 'application/json' } }
        );
      }
    }

    const { data: profile, error: profileError } = await supabase
      .from('profiles')
      .select('balance, full_name, email')
      .eq('id', user.id)
      .maybeSingle();

    if (profileError || !profile) {
      console.error('Error fetching user profile:', profileError);
      return new Response(
        JSON.stringify({ success: false, error: 'Failed to fetch user profile' }),
        { status: 500, headers: { ...CORS_HEADERS, 'Content-Type': 'application/json' } }
      );
    }

    const balanceBefore = ensureNumber(profile.balance);

    const unitPrice =
      ensureNumber(serviceRow.price) || ensureNumber(serviceRow.original_price) || ensureNumber(amount);
    if (!unitPrice || unitPrice <= 0) {
      return new Response(
        JSON.stringify({ success: false, error: 'Invalid service price' }),
        { status: 400, headers: { ...CORS_HEADERS, 'Content-Type': 'application/json' } }
      );
    }

    const totalAmount = unitPrice * quantity;

    if (balanceBefore < totalAmount) {
      return new Response(
        JSON.stringify({ success: false, error: 'Insufficient balance' }),
        { status: 400, headers: { ...CORS_HEADERS, 'Content-Type': 'application/json' } }
      );
    }

    const reference = `EDU-${Date.now()}-${user.id.slice(0, 8)}`;

    let rechargePayload: Record<string, unknown> = {};
    let pins: Array<Record<string, unknown>> = [];
    let purchaseSuccess = false;
    let purchaseError = '';

    // Purchase based on vending provider
    if (vendingProvider === 'vtpass') {
      if (!variationCode) {
        return new Response(
          JSON.stringify({ success: false, error: 'Variation code is required for VTpass purchase' }),
          { status: 400, headers: { ...CORS_HEADERS, 'Content-Type': 'application/json' } }
        );
      }

      // purchaseViaVTpass derives serviceID from examType internally (waec, neco, jamb)
      const result = await purchaseViaVTpass(
        normalizedExam,
        variationCode,
        phone_number || '',
        billers_code,
        unitPrice
      );

      if (result.success) {
        purchaseSuccess = true;
        rechargePayload = result.data || {};
        pins = result.pins || [];
      } else {
        purchaseError = result.error || 'VTpass purchase failed';
      }
    } else if (vendingProvider === 'mobilenig') {
      if (!mobilenigSecretKey) {
        return new Response(
          JSON.stringify({ success: false, error: 'MOBILENIG_SECRET_KEY not configured' }),
          { status: 500, headers: { ...CORS_HEADERS, 'Content-Type': 'application/json' } }
        );
      }

      const providerServiceId =
        serviceRow.service_id ||
        providerServiceIdInput ||
        serviceRow.api_code ||
        api_code ||
        (serviceRow.metadata as Record<string, unknown>)?.service_id;

      if (!providerServiceId) {
          return new Response(
          JSON.stringify({ success: false, error: 'Service ID missing for education purchase' }),
          { status: 400, headers: { ...CORS_HEADERS, 'Content-Type': 'application/json' } }
        );
      }

      // Get API code/product code from service row (for JAMB: UTME/DE)
      const productCode = serviceRow.api_code || api_code || serviceRow.mobilenig_code;

      console.log('Calling purchaseViaMobilenig with:', {
        serviceId: providerServiceId,
        examType: normalizedExam,
        quantity,
        amount: totalAmount,
        hasPhone: !!phone_number,
        productCode,
      });

      const result = await purchaseViaMobilenig(
        providerServiceId,
        phone_number || '',
        totalAmount,
        quantity,
        mobilenigSecretKey,
        reference,
        productCode, // Pass product code for JAMB variations
        normalizedExam // Pass normalized exam type (NECO, WAEC, JAMB) to determine API structure
      );

      if (result.success) {
        purchaseSuccess = true;
        rechargePayload = result.data || {};
        pins = result.pins || [];
      } else {
        purchaseError = result.error || 'Mobilenig purchase failed';
      }
    } else {
      return new Response(
        JSON.stringify({ success: false, error: `Unsupported vending provider: ${vendingProvider}` }),
        { status: 400, headers: { ...CORS_HEADERS, 'Content-Type': 'application/json' } }
      );
    }

    if (!purchaseSuccess) {
      return new Response(
        JSON.stringify({ success: false, error: purchaseError }),
        { status: 400, headers: { ...CORS_HEADERS, 'Content-Type': 'application/json' } }
      );
    }

    const debitResult = await debitUserWallet({
      supabase,
      userId: user.id,
      amount: totalAmount,
      transactionType: 'education_purchase',
      description: `Education service purchase - ${normalizedExam}`,
      reference,
      performedBy: user.id,
      balanceBefore,
      notification: {
        title: 'Education purchase successful',
        message: `₦${totalAmount.toFixed(2)} paid for ${normalizedExam}. Ref: ${reference}.`,
      },
    });

    const { error: insertError } = await supabase.from('education_transactions').insert({
      user_id: user.id,
      phone_number,
      exam_type: normalizedExam,
      service_id: serviceRow.service_id || '',
      amount: totalAmount,
      unit_price: unitPrice,
      quantity,
      balance_before: debitResult.balanceBefore,
      balance_after: debitResult.balanceAfter,
      status: 'success',
      reference,
      api_response: rechargePayload,
      metadata: {
        pins,
        wallet_balance: rechargePayload.wallet_balance,
        provider: vendingProvider,
        provider_service_id: serviceRow.service_id || '',
        education_service_id: serviceRowId,
        variation_code,
        billers_code,
      },
      performed_by: user.id,
    });

    if (insertError) {
      console.error('Failed to record education transaction:', insertError);
    }

    return new Response(
      JSON.stringify({
        success: true,
        message: 'Education service purchased successfully',
        data: {
          reference,
          quantity,
          amount: totalAmount,
          unit_price: unitPrice,
          exam_type: normalizedExam,
          phone_number,
          pins,
          provider_response: rechargePayload,
          provider: vendingProvider,
        },
      }),
      { status: 200, headers: { ...CORS_HEADERS, 'Content-Type': 'application/json' } }
    );
  } catch (error: any) {
    console.error('Error in purchase-education function:', error);
    console.error('Error type:', typeof error);
    console.error('Error name:', error?.name);
    console.error('Error message:', error?.message);
    console.error('Error stack:', error?.stack);

    const errorMessage = error instanceof Error 
      ? error.message 
      : typeof error === 'string' 
        ? error 
        : error?.error || error?.message || 'Unknown error occurred';

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
