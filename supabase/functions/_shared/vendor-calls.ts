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
 */
export async function purchaseViaMobilenig(
  config: VendorConfig,
  plan: DataPlan,
  phone: string,
  requestId?: string
): Promise<PurchaseResult> {
  const API_KEY = Deno.env.get('MOBILENIG_API_KEY') || config.api_key;
  const API_USERNAME = Deno.env.get('MOBILENIG_USERNAME') || config.secret;

  if (!API_KEY || !API_USERNAME) {
    return {
      success: false,
      status: 'failed',
      error: 'Mobilenig credentials not configured',
    };
  }

  const reference = requestId || `MB-${Date.now()}-${Math.random().toString(36).slice(2, 10).toUpperCase()}`;

  try {
    const response = await fetch(`${config.base_url}v2/services/proxy`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${API_KEY}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        service: 'databundle',
        coded: plan.mobilenig_code || '',
        phone: phone.replace(/[^\d]/g, ''),
      }),
    });

    const responseText = await response.text();
    let apiResponse: any;

    try {
      apiResponse = JSON.parse(responseText);
    } catch (e) {
      return {
        success: false,
        status: 'failed',
        error: 'Invalid response from Mobilenig',
        vendor_response: responseText,
      };
    }

    if (apiResponse?.status === 'successful' || apiResponse?.status === 'success') {
      return {
        success: true,
        status: 'success',
        reference: apiResponse.transaction_id || reference,
        transaction_id: apiResponse.transaction_id,
        message: apiResponse.message || 'Data purchased successfully',
        vendor_response: apiResponse,
      };
    }

    if (apiResponse?.status === 'pending' || apiResponse?.status === 'processing') {
      return {
        success: true,
        status: 'pending',
        reference: apiResponse.transaction_id || reference,
        transaction_id: apiResponse.transaction_id,
        message: 'Transaction is being processed',
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

