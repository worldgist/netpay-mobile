// Shared functions for calling different data vendor APIs

export interface VendorConfig {
  id: number;
  name: string;
  base_url: string;
  api_key?: string;
  secret?: string;
  status: string;
}

export interface DataPlan {
  id: string;
  network: string;
  plan_type?: string;
  size?: string;
  vendor_price?: number;
  user_price?: number;
  api_code?: string; // Generic API code (fallback for vendor-specific codes)
  vtpass_code?: string;
  smeplug_code?: string;
  mobilenig_code?: string;
}

export interface PurchaseResult {
  success: boolean;
  status: 'success' | 'pending' | 'failed';
  reference?: string;
  message?: string;
  error?: string;
  vendor_response?: any;
  transaction_id?: string;
}

/**
 * Call VTpass API to purchase data
 */
export async function purchaseViaVTpass(
  config: VendorConfig,
  plan: DataPlan,
  phone: string,
  requestId?: string
): Promise<PurchaseResult> {
  const VTPASS_API_KEY = Deno.env.get('VTPASS_API_KEY') || config.api_key;
  const VTPASS_PUBLIC_KEY = Deno.env.get('VTPASS_PUBLIC_KEY') || config.secret;
  const VTPASS_SECRET_KEY = Deno.env.get('VTPASS_SECRET_KEY');
  const VTPASS_MODE = (Deno.env.get('VTPASS_MODE') || 'live').toLowerCase();

  if (!VTPASS_API_KEY || !VTPASS_PUBLIC_KEY) {
    return {
      success: false,
      status: 'failed',
      error: 'VTpass credentials not configured',
    };
  }

  const baseUrl = VTPASS_MODE === 'sandbox'
    ? 'https://sandbox.vtpass.com'
    : 'https://vtpass.com';

  // Resolve service ID based on network
  const networkServiceMap: Record<string, string> = {
    'MTN': 'mtn-data',
    'MTN NIGERIA': 'mtn-data',
    'AIRTEL': 'airtel-data',
    'AIRTEL NIGERIA': 'airtel-data',
    'GLO': 'glo-data',
    'GLOBACOM': 'glo-data',
    '9MOBILE': '9mobile-data',
    '9 MOBILE': '9mobile-data',
    'ETISALAT': '9mobile-data',
  };

  const normalizedNetwork = plan.network.toUpperCase().trim();
  const serviceId = networkServiceMap[normalizedNetwork] || 'mtn-data';

  // Generate request ID if not provided
  const pad = (value: number) => `${value}`.padStart(2, '0');
  const buildTimestamp = () => {
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
    );
  };

  const vtpassRequestId = requestId || `${buildTimestamp()}${crypto.randomUUID().replace(/-/g, '').slice(0, 8).toUpperCase()}`;

  const headers: HeadersInit = {
    'api-key': VTPASS_API_KEY,
    'public-key': VTPASS_PUBLIC_KEY,
    'Content-Type': 'application/json',
  };
  if (VTPASS_SECRET_KEY) {
    headers['secret-key'] = VTPASS_SECRET_KEY;
  }

  const payload = {
    request_id: vtpassRequestId,
    serviceID: serviceId,
    billersCode: phone.replace(/[^\d]/g, ''),
    variation_code: plan.vtpass_code || '',
    amount: plan.vendor_price || 0,
    phone: phone.replace(/[^\d]/g, ''),
  };

  try {
    const response = await fetch(`${baseUrl}/api/pay`, {
      method: 'POST',
      headers,
      body: JSON.stringify(payload),
    });

    const responseText = await response.text();
    if (!response.ok) {
      return {
        success: false,
        status: 'failed',
        error: `VTpass API error: ${response.status}`,
        vendor_response: responseText,
      };
    }

    let responseJson: any;
    try {
      responseJson = JSON.parse(responseText);
    } catch (e) {
      return {
        success: false,
        status: 'failed',
        error: 'Invalid response from VTpass',
        vendor_response: responseText,
      };
    }

    const transaction = responseJson?.content?.transactions || null;
    const status = transaction?.status || responseJson?.status || '';
    const statusLower = status.toLowerCase();

    // Check if transaction is delivered
    if (statusLower === 'delivered' || statusLower === 'success') {
      return {
        success: true,
        status: 'success',
        reference: vtpassRequestId,
        transaction_id: transaction?.transactionId || transaction?.unique_element,
        message: responseJson?.response_description || 'Data purchased successfully',
        vendor_response: responseJson,
      };
    }

    // Check if pending
    if (statusLower === 'pending' || statusLower === 'processing' || statusLower === 'queued') {
      return {
        success: true,
        status: 'pending',
        reference: vtpassRequestId,
        transaction_id: transaction?.transactionId || transaction?.unique_element,
        message: 'Transaction is being processed',
        vendor_response: responseJson,
      };
    }

    // Failed
    return {
      success: false,
      status: 'failed',
      error: responseJson?.response_description || `Transaction failed with status: ${status}`,
      vendor_response: responseJson,
    };
  } catch (error) {
    return {
      success: false,
      status: 'failed',
      error: error instanceof Error ? error.message : 'Unknown error calling VTpass',
    };
  }
}

/**
 * Call SMEPlug API to purchase data
 */
export async function purchaseViaSMEPlug(
  config: VendorConfig,
  plan: DataPlan,
  phone: string,
  requestId?: string
): Promise<PurchaseResult> {
  const SECRET_KEY = Deno.env.get('SMEPLUG_SECRET_KEY') || config.secret;

  if (!SECRET_KEY) {
    return {
      success: false,
      status: 'failed',
      error: 'SMEPlug credentials not configured',
    };
  }

  // Resolve network ID
  const networkIdMap: Record<string, number> = {
    'MTN': 1,
    'MTN NIGERIA': 1,
    'AIRTEL': 2,
    'AIRTEL NIGERIA': 2,
    '9MOBILE': 3,
    '9 MOBILE': 3,
    'ETISALAT': 3,
    'GLO': 4,
    'GLOBACOM': 4,
  };

  const normalizedNetwork = plan.network.toUpperCase().trim();
  const networkId = networkIdMap[normalizedNetwork];

  if (!networkId) {
    return {
      success: false,
      status: 'failed',
      error: `Unable to resolve network ID for ${plan.network}`,
    };
  }

  const reference = requestId || `DATA-${Date.now()}-${Math.random().toString(36).slice(2, 10).toUpperCase()}`;

  try {
    const response = await fetch(`${config.base_url}data/purchase`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${SECRET_KEY}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        network_id: networkId,
        plan_id: parseInt(plan.smeplug_code || '0'),
        phone: phone.replace(/[^\d]/g, ''),
        customer_reference: reference,
      }),
    });

    const responseText = await response.text();
    let apiResponse: any;

    try {
      if (responseText.trim().length === 0) {
        throw new Error('Empty response from SMEPlug');
      }
      apiResponse = JSON.parse(responseText);
    } catch (e) {
      return {
        success: false,
        status: 'failed',
        error: 'Invalid response from SMEPlug',
        vendor_response: responseText,
      };
    }

    const apiStatus =
      apiResponse?.success === true ||
      apiResponse?.status === true ||
      apiResponse?.data?.status === true ||
      apiResponse?.data?.success === true ||
      apiResponse?.status === 'success';

    if (response.ok && apiStatus) {
      return {
        success: true,
        status: 'success',
        reference,
        message: apiResponse.message || 'Data purchased successfully',
        vendor_response: apiResponse,
      };
    }

    return {
      success: false,
      status: 'failed',
      error: apiResponse.message || apiResponse.error || 'Data purchase failed',
      vendor_response: apiResponse,
    };
  } catch (error) {
    return {
      success: false,
      status: 'failed',
      error: error instanceof Error ? error.message : 'Unknown error calling SMEPlug',
    };
  }
}

/**
 * Call Mobilenig API to purchase data
 * Uses the new API format: POST /api/v2/services/
 */
export async function purchaseViaMobilenig(
  config: VendorConfig,
  plan: DataPlan,
  phone: string,
  requestId?: string
): Promise<PurchaseResult> {
  const SECRET_KEY = Deno.env.get('MOBILENIG_SECRET_KEY') || config.secret;

  if (!SECRET_KEY) {
    return {
      success: false,
      status: 'failed',
      error: 'Mobilenig credentials not configured',
    };
  }

  // Map network to service_id
  // BCA = MTN, ACA = Airtel, GCA = Glo, 9CA = 9Mobile
  const networkServiceMap: Record<string, string> = {
    'MTN': 'BCA',
    'MTN NIGERIA': 'BCA',
    'AIRTEL': 'ACA',
    'AIRTEL NIGERIA': 'ACA',
    'GLO': 'GCA',
    'GLOBACOM': 'GCA',
    '9MOBILE': '9CA',
    '9 MOBILE': '9CA',
    'ETISALAT': '9CA',
  };

  const normalizedNetwork = plan.network.toUpperCase().trim();
  const serviceId = networkServiceMap[normalizedNetwork] || 'BCA';

  // Determine service_type based on plan_type
  // If plan_type contains "GIFTING" or "Gifting", use "GIFTING", otherwise "SME"
  const planTypeUpper = (plan.plan_type || '').toUpperCase();
  const serviceType = planTypeUpper.includes('GIFTING') ? 'GIFTING' : 'SME';

  // Get plan code (prefer mobilenig_code, fallback to api_code)
  const planCode = plan.mobilenig_code || plan.api_code || '';
  if (!planCode) {
    return {
      success: false,
      status: 'failed',
      error: 'Data plan missing MobileNig code',
    };
  }

  // Get amount (prefer vendor_price, fallback to user_price)
  const amount = plan.vendor_price || plan.user_price || 0;
  if (amount <= 0) {
    return {
      success: false,
      status: 'failed',
      error: 'Invalid plan amount',
    };
  }

  // Generate transaction ID
  const transId = requestId 
    ? parseInt(requestId.replace(/[^\d]/g, '')) || Date.now()
    : Date.now();

  // Normalize phone number
  const beneficiary = phone.replace(/[^\d]/g, '');

  const reference = requestId || `MB-${transId}`;

  try {
    const requestBody = {
      service_id: serviceId,
      service_type: serviceType,
      beneficiary: beneficiary,
      trans_id: transId,
      code: planCode,
      amount: amount.toString(),
    };

    console.log('MobileNig data purchase request:', JSON.stringify(requestBody, null, 2));

    const response = await fetch('https://enterprise.mobilenig.com/api/v2/services/', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${SECRET_KEY}`,
      },
      body: JSON.stringify(requestBody),
    });

    const responseText = await response.text();
    console.log('MobileNig API response status:', response.status);
    console.log('MobileNig API response text (first 1000 chars):', responseText.substring(0, 1000));

    let apiResponse: any;

    try {
      apiResponse = JSON.parse(responseText);
    } catch (e) {
      // Check if response is HTML (error page)
      if (responseText.trim().startsWith('<!DOCTYPE') || responseText.trim().startsWith('<html')) {
        return {
          success: false,
          status: 'failed',
          error: 'MobileNig API returned an error page',
          vendor_response: responseText.substring(0, 500),
        };
      }
      return {
        success: false,
        status: 'failed',
        error: 'Invalid response from Mobilenig',
        vendor_response: responseText,
      };
    }

    // Check response format
    // Success response: { message: "success", statusCode: "200", details: { trans_id, service, status, details, wallet_balance } }
    if (apiResponse?.statusCode === '200' && apiResponse?.message === 'success') {
      const details = apiResponse.details || {};
      const status = details.status || '';
      const statusLower = status.toLowerCase();

      // Check if transaction is approved/successful
      if (statusLower === 'approved' || statusLower === 'success') {
        return {
          success: true,
          status: 'success',
          reference: details.trans_id?.toString() || transId.toString(),
          transaction_id: details.trans_id?.toString(),
          message: `Data purchased successfully: ${details.details?.description || ''}`,
          vendor_response: apiResponse,
        };
      }

      // Check if pending/processing
      if (statusLower === 'pending' || statusLower === 'processing') {
        return {
          success: true,
          status: 'pending',
          reference: details.trans_id?.toString() || transId.toString(),
          transaction_id: details.trans_id?.toString(),
          message: 'Transaction is being processed',
          vendor_response: apiResponse,
        };
      }

      // Other statuses (failed, cancelled, etc.)
      return {
        success: false,
        status: 'failed',
        error: details.details?.message || apiResponse.details?.details?.description || `Transaction ${status}`,
        vendor_response: apiResponse,
      };
    }

    // Error response: { message: "failure", statusCode: "XXX", details: "error message" }
    if (apiResponse?.statusCode && apiResponse?.statusCode !== '200') {
      return {
        success: false,
        status: 'failed',
        error: apiResponse.details || apiResponse.message || 'Data purchase failed',
        vendor_response: apiResponse,
      };
    }

    return {
      success: false,
      status: 'failed',
      error: apiResponse.message || apiResponse.error || 'Data purchase failed',
      vendor_response: apiResponse,
    };
  } catch (error) {
    return {
      success: false,
      status: 'failed',
      error: error instanceof Error ? error.message : 'Unknown error calling Mobilenig',
    };
  }
}

/**
 * Query MobileNig transaction status
 * GET /api/v2/services/query?trans_id={trans_id}
 */
export async function queryMobilenigTransaction(
  transId: string | number,
  secretKey?: string
): Promise<{ success: boolean; status?: string; details?: any; error?: string }> {
  const SECRET_KEY = secretKey || Deno.env.get('MOBILENIG_SECRET_KEY');

  if (!SECRET_KEY) {
    return {
      success: false,
      error: 'MobileNig secret key not configured',
    };
  }

  try {
    const queryUrl = `https://enterprise.mobilenig.com/api/v2/services/query?trans_id=${transId}`;
    const queryResponse = await fetch(queryUrl, {
      method: 'GET',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${SECRET_KEY}`,
      },
    });

    if (!queryResponse.ok) {
      const errorText = await queryResponse.text();
      return {
        success: false,
        error: `Failed to query transaction: ${errorText.substring(0, 200)}`,
      };
    }

    const queryText = await queryResponse.text();
    let queryResult: any;

    try {
      queryResult = JSON.parse(queryText);
    } catch (e) {
      return {
        success: false,
        error: 'Invalid response from MobileNig',
      };
    }

    if (queryResult.statusCode === '200' && queryResult.message === 'success') {
      const details = queryResult.details || {};
      return {
        success: true,
        status: details.status,
        details: details,
      };
    }

    return {
      success: false,
      error: queryResult.details || queryResult.message || 'Query failed',
      details: queryResult,
    };
  } catch (error) {
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error querying transaction',
    };
  }
}

/**
 * Purchase data via a specific vendor
 */
export async function purchaseViaVendor(
  vendorName: string,
  config: VendorConfig,
  plan: DataPlan,
  phone: string,
  requestId?: string
): Promise<PurchaseResult> {
  switch (vendorName.toLowerCase()) {
    case 'vtpass':
      return await purchaseViaVTpass(config, plan, phone, requestId);
    case 'smeplug':
      return await purchaseViaSMEPlug(config, plan, phone, requestId);
    case 'mobilenig':
      return await purchaseViaMobilenig(config, plan, phone, requestId);
    default:
      return {
        success: false,
        status: 'failed',
        error: `Unknown vendor: ${vendorName}`,
      };
  }
}

