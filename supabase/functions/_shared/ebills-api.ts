/**
 * eBills API Integration Helper
 * Documentation: https://ebills.africa
 */

const EBILLS_BASE_URL = 'https://ebills.africa/wp-json';

export interface EBillsAuthResponse {
  token: string;
  user_email: string;
  user_nicename: string;
  user_display_name: string;
}

export interface EBillsBalanceResponse {
  code: string;
  message: string;
  data: {
    balance: number;
    currency: string;
  };
}

export interface EBillsErrorResponse {
  code: string;
  message: string;
  data?: {
    status: number;
  };
}

/**
 * Authenticate with eBills API and get JWT token
 * Token expires after 7 days - should be refreshed regularly
 */
export async function authenticateEBills(
  username: string,
  password: string
): Promise<EBillsAuthResponse> {
  const response = await fetch(`${EBILLS_BASE_URL}/jwt-auth/v1/token`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      username,
      password,
    }),
  });

  if (!response.ok) {
    const errorData: EBillsErrorResponse = await response.json();
    throw new Error(errorData.message || `Authentication failed: ${response.status}`);
  }

  const data: EBillsAuthResponse = await response.json();
  
  if (!data.token) {
    throw new Error('No token received from eBills API');
  }

  return data;
}

/**
 * Check eBills wallet balance
 * Requires valid JWT token
 */
export async function getEBillsBalance(token: string): Promise<EBillsBalanceResponse> {
  const response = await fetch(`${EBILLS_BASE_URL}/api/v2/balance`, {
    method: 'GET',
    headers: {
      'Authorization': `Bearer ${token}`,
      'Content-Type': 'application/json',
    },
  });

  if (!response.ok) {
    const errorData: EBillsErrorResponse = await response.json();
    throw new Error(errorData.message || `Failed to get balance: ${response.status}`);
  }

  const data: EBillsBalanceResponse = await response.json();
  
  if (data.code !== 'success') {
    throw new Error(data.message || 'Failed to retrieve balance');
  }

  return data;
}

/**
 * Get eBills credentials from environment variables
 */
export function getEBillsCredentials(): { username: string; password: string } {
  const username = Deno.env.get('EBILLS_USERNAME');
  const password = Deno.env.get('EBILLS_PASSWORD');

  if (!username || !password) {
    throw new Error('EBILLS_USERNAME and EBILLS_PASSWORD environment variables are required');
  }

  return { username, password };
}

/**
 * Authenticate and get token (convenience function)
 * Gets credentials from environment variables
 */
export async function getEBillsToken(): Promise<string> {
  const { username, password } = getEBillsCredentials();
  const authResponse = await authenticateEBills(username, password);
  return authResponse.token;
}

export interface EBillsCableCustomerResponse {
  code: string;
  message: string;
  data: {
    service_name: string;
    customer_id: string;
    customer_name: string;
    status: string;
    due_date: string;
    balance: number;
    current_bouquet: string;
    renewal_amount: number;
  };
}

/**
 * Verify cable TV customer using eBills API
 * Requires valid JWT token
 */
export async function verifyEBillsCableCustomer(
  token: string,
  customerId: string,
  serviceId: string
): Promise<EBillsCableCustomerResponse> {
  const requestBody = {
    customer_id: customerId,
    service_id: serviceId,
  };

  console.log('eBills cable customer verification request:', {
    service_id: serviceId,
    customer_id: customerId.substring(0, 4) + '***', // Log partial customer ID for privacy
    url: `${EBILLS_BASE_URL}/api/v2/verify-customer`,
  });

  const response = await fetch(`${EBILLS_BASE_URL}/api/v2/verify-customer`, {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${token}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(requestBody),
  });

  const responseText = await response.text();
  const contentType = response.headers.get('content-type') || '';
  const isJsonResponse = contentType.includes('application/json');

  // Check if response is empty
  if (!responseText || responseText.trim().length === 0) {
    console.error('eBills API returned empty response:', {
      status: response.status,
      statusText: response.statusText,
      contentType,
      service_id: serviceId,
    });
    throw new Error(`eBills API returned empty response (Status: ${response.status})`);
  }

  // Check if response is HTML (error page) instead of JSON
  if (!isJsonResponse && (responseText.trim().startsWith('<!') || responseText.trim().startsWith('<html'))) {
    console.error('eBills API returned HTML instead of JSON:', {
      status: response.status,
      statusText: response.statusText,
      contentType,
      service_id: serviceId,
      responsePreview: responseText.substring(0, 200),
    });
    throw new Error(`eBills API returned an error page (Status: ${response.status}). Service may be unavailable.`);
  }

  let errorData: EBillsErrorResponse | null = null;
  let data: EBillsCableCustomerResponse | null = null;

  try {
    if (!response.ok) {
      try {
        errorData = JSON.parse(responseText) as EBillsErrorResponse;
        console.error('eBills cable verification error:', {
          status: response.status,
          error: errorData,
          service_id: serviceId,
        });
        let errorMessage = errorData.message || `Verification failed: ${response.status}`;
        const lowerMessage = errorMessage.toLowerCase();
        if (lowerMessage.includes('service currently not available') || lowerMessage.includes('service not available')) {
          errorMessage = `Service currently not available for ${serviceId}. Please try again later or contact support.`;
        } else if (lowerMessage.includes('invalid') && lowerMessage.includes('service')) {
          errorMessage = `Invalid service ID: ${serviceId}. Please contact support.`;
        }
        throw new Error(errorMessage);
      } catch (jsonError) {
        console.error('Failed to parse eBills error response:', {
          error: jsonError,
          responseText: responseText.substring(0, 200),
          status: response.status,
        });
        throw new Error(`eBills API error (Status: ${response.status}): ${responseText.substring(0, 200)}`);
      }
    }

    try {
      data = JSON.parse(responseText) as EBillsCableCustomerResponse;
    } catch (jsonError) {
      console.error('Failed to parse eBills cable verification response:', {
        error: jsonError,
        responseText: responseText.substring(0, 200),
        status: response.status,
      });
      throw new Error(`Invalid JSON response from eBills API: ${jsonError instanceof Error ? jsonError.message : String(jsonError)}`);
    }

    if (data.code !== 'success') {
      console.error('eBills cable verification failed:', {
        code: data.code,
        message: data.message,
        service_id: serviceId,
      });
      throw new Error(data.message || 'Customer verification failed');
    }

    console.log('eBills cable customer verified successfully:', {
      customer_name: data.data?.customer_name,
      service_id: serviceId,
    });

    return data;
  } catch (error) {
    // Re-throw custom errors
    if (error instanceof Error && (error.message.includes('eBills API') || error.message.includes('Service currently not available') || error.message.includes('Invalid service ID'))) {
      throw error;
    }
    // Wrap other errors
    throw new Error(`Failed to verify cable customer: ${error instanceof Error ? error.message : String(error)}`);
  }
}

/**
 * Map provider names to eBills service IDs
 * According to eBills API docs:
 * - Cable TV: dstv, gotv, startimes
 * - Electricity: ikeja-electric, eko-electric, kano-electric, portharcourt-electric, jos-electric, ibadan-electric, kaduna-electric, abuja-electric, enugu-electric, benin-electric, aba-electric, yola-electric
 * - Betting: 1xBet, BangBet, Bet9ja, BetKing, BetLand, BetLion, BetWay, CloudBet, LiveScoreBet, MerryBet, NaijaBet, NairaBet, SupaBet
 */
export function getEBillsServiceId(provider: string): string {
  const providerUpper = provider.toUpperCase().trim();
  const serviceIdMap: Record<string, string> = {
    // Cable TV
    'DSTV': 'dstv',
    'D-STV': 'dstv',
    'GOTV': 'gotv',
    'GO-TV': 'gotv',
    'STARTIMES': 'startimes',
    'STAR TIMES': 'startimes',
    // Electricity (for reference)
    'IKEJA ELECTRIC': 'ikeja-electric',
    'EKO ELECTRIC': 'eko-electric',
    'KANO ELECTRIC': 'kano-electric',
    'PORT HARCOURT ELECTRIC': 'portharcourt-electric',
    'JOS ELECTRIC': 'jos-electric',
    'IBADAN ELECTRIC': 'ibadan-electric',
    'KADUNA ELECTRIC': 'kaduna-electric',
    'ABUJA ELECTRIC': 'abuja-electric',
    'ENUGU ELECTRIC': 'enugu-electric',
    'BENIN ELECTRIC': 'benin-electric',
    'ABA ELECTRIC': 'aba-electric',
    'YOLA ELECTRIC': 'yola-electric',
    // Betting (for reference)
    '1XBET': '1xBet',
    'BANGBET': 'BangBet',
    'BET9JA': 'Bet9ja',
    'BETKING': 'BetKing',
    'BETLAND': 'BetLand',
    'BETLION': 'BetLion',
    'BETWAY': 'BetWay',
    'CLOUDBET': 'CloudBet',
    'LIVESCOREBET': 'LiveScoreBet',
    'MERRYBET': 'MerryBet',
    'NAIJABET': 'NaijaBet',
    'NAIRABET': 'NairaBet',
    'SUPABET': 'SupaBet',
  };
  
  return serviceIdMap[providerUpper] || provider.toLowerCase().trim();
}

export interface EBillsTVVariationsResponse {
  code: string;
  message: string;
  data: Array<{
    variation_id: string;
    name?: string;
    variation_name?: string;
    variation_amount: number;
    variation_code?: string;
    [key: string]: any; // Allow additional fields
  }>;
}

/**
 * Fetch cable TV packages/variations from eBills API
 * This endpoint does NOT require authentication
 */
export async function getEBillsTVVariations(
  serviceId: string
): Promise<EBillsTVVariationsResponse> {
  const response = await fetch(`${EBILLS_BASE_URL}/api/v2/variations/tv?service_id=${serviceId}`, {
    method: 'GET',
    headers: {
      'Content-Type': 'application/json',
    },
  });

  if (!response.ok) {
    const errorData: EBillsErrorResponse = await response.json().catch(() => ({
      code: 'fetch_error',
      message: `Failed to fetch TV variations: ${response.status}`,
    }));
    throw new Error(errorData.message || `Failed to fetch TV variations: ${response.status}`);
  }

  const data: EBillsTVVariationsResponse = await response.json();
  
  // Log the first variation to see the structure
  if (data.data && data.data.length > 0) {
    console.log('eBills TV variations sample (first item):', JSON.stringify(data.data[0], null, 2));
  }
  
  if (data.code !== 'success') {
    throw new Error(data.message || 'Failed to retrieve TV variations');
  }

  return data;
}

export interface EBillsPurchaseResponse {
  code: string;
  message: string;
  data: {
    transaction_id: string;
    customer_id: string;
    customer_name: string;
    service_name: string;
    variation_name: string;
    amount: number;
    status: string;
    reference?: string;
  };
}

/**
 * Purchase cable TV subscription using eBills API
 * Requires valid JWT token
 */
export async function purchaseEBillsCableTV(
  token: string,
  customerId: string,
  serviceId: string,
  variationId: string,
  amount: number
): Promise<EBillsPurchaseResponse> {
  const response = await fetch(`${EBILLS_BASE_URL}/api/v2/purchase`, {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${token}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      customer_id: customerId,
      service_id: serviceId,
      variation_id: variationId,
      amount: amount,
    }),
  });

  if (!response.ok) {
    const errorData: EBillsErrorResponse = await response.json();
    throw new Error(errorData.message || `Purchase failed: ${response.status}`);
  }

  const data: EBillsPurchaseResponse = await response.json();
  
  if (data.code !== 'success') {
    throw new Error(data.message || 'Cable TV purchase failed');
  }

  return data;
}

export interface EBillsElectricityPurchaseResponse {
  code: string;
  message: string;
  data: {
    order_id: number;
    status: string;
    product_name: string;
    service_name: string;
    customer_id: string;
    customer_name: string;
    customer_address: string;
    token: string | null;
    units: string | null;
    band: string;
    amount: number;
    amount_charged: string;
    discount: string;
    initial_balance: string;
    final_balance: string;
    request_id: string;
  };
}

/**
 * Purchase electricity units using eBills API
 * Requires valid JWT token
 * Note: variation_id is optional for electricity purchases
 */
export async function purchaseEBillsElectricity(
  token: string,
  requestId: string,
  customerId: string,
  serviceId: string,
  amount: number,
  variationId?: string
): Promise<EBillsElectricityPurchaseResponse> {
  const requestBody: any = {
    request_id: requestId,
    customer_id: customerId,
    service_id: serviceId,
    amount: amount,
  };

  // Only include variation_id if provided (not required for electricity)
  if (variationId) {
    requestBody.variation_id = variationId;
  }

  console.log('eBills electricity purchase request:', {
    request_id: requestId,
    customer_id: customerId.substring(0, 4) + '***', // Log partial for privacy
    service_id: serviceId,
    amount: amount,
    variation_id: variationId || 'not provided',
    url: `${EBILLS_BASE_URL}/api/v2/electricity`,
  });

  const response = await fetch(`${EBILLS_BASE_URL}/api/v2/electricity`, {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${token}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(requestBody),
  });

  const responseText = await response.text();
  const contentType = response.headers.get('content-type') || '';
  const isJsonResponse = contentType.includes('application/json');

  // Check if response is empty
  if (!responseText || responseText.trim().length === 0) {
    console.error('eBills API returned empty response:', {
      status: response.status,
      statusText: response.statusText,
      contentType,
      service_id: serviceId,
    });
    throw new Error(`eBills API returned empty response (Status: ${response.status})`);
  }

  // Check if response is HTML (error page) instead of JSON
  if (!isJsonResponse && (responseText.trim().startsWith('<!') || responseText.trim().startsWith('<html'))) {
    console.error('eBills API returned HTML instead of JSON:', {
      status: response.status,
      statusText: response.statusText,
      contentType,
      service_id: serviceId,
      responsePreview: responseText.substring(0, 200),
    });
    throw new Error(`eBills API returned an error page (Status: ${response.status}). Service may be unavailable.`);
  }

  let errorData: EBillsErrorResponse | null = null;
  let data: EBillsElectricityPurchaseResponse | null = null;

  try {
    if (!response.ok) {
      try {
        errorData = JSON.parse(responseText) as EBillsErrorResponse;
        console.error('eBills electricity purchase error:', {
          status: response.status,
          errorCode: errorData.code,
          errorMessage: errorData.message,
          service_id: serviceId,
          fullResponse: responseText,
        });
        
        let errorMessage = errorData.message || `Electricity purchase failed: ${response.status}`;
        
        // Handle specific error cases
        if (response.status === 400) {
          if (errorData.code === 'missing_fields') {
            errorMessage = 'Required parameters missing';
          } else if (errorData.code === 'invalid_service_id') {
            errorMessage = `Invalid service ID: ${serviceId}`;
          } else if (errorData.code === 'invalid_customer_id') {
            errorMessage = 'Invalid meter number';
          }
        } else if (response.status === 402) {
          if (errorData.code === 'insufficient_funds') {
            errorMessage = 'Insufficient wallet balance';
          }
        } else if (response.status === 409) {
          if (errorData.code === 'duplicate_request_id') {
            errorMessage = 'Duplicate request ID';
          }
        }
        
        throw new Error(errorMessage);
      } catch (jsonError) {
        console.error('Failed to parse eBills error response:', {
          jsonError,
          responseText: responseText.substring(0, 500),
          status: response.status,
          service_id: serviceId,
        });
        throw new Error(`eBills API error (Status: ${response.status}): ${responseText.substring(0, 200)}`);
      }
    }

    try {
      data = JSON.parse(responseText) as EBillsElectricityPurchaseResponse;
    } catch (jsonError) {
      console.error('Failed to parse eBills electricity purchase response:', {
        jsonError,
        responseText: responseText.substring(0, 500),
        status: response.status,
        service_id: serviceId,
        contentType,
      });
      throw new Error(`Invalid JSON response from eBills API: ${jsonError instanceof Error ? jsonError.message : String(jsonError)}`);
    }
    
    if (data.code !== 'success') {
      console.error('eBills electricity purchase failed:', {
        code: data.code,
        message: data.message,
        service_id: serviceId,
        fullResponse: responseText,
      });
      throw new Error(data.message || 'Electricity purchase failed');
    }

    console.log('eBills electricity purchase successful:', {
      order_id: data.data?.order_id,
      status: data.data?.status,
      token: data.data?.token ? 'provided' : 'not provided',
      service_id: serviceId,
    });

    return data;
  } catch (error) {
    // Re-throw if it's already our custom error
    if (error instanceof Error && error.message.includes('eBills')) {
      throw error;
    }
    // Otherwise, wrap in a more descriptive error
    console.error('Unexpected error parsing eBills electricity response:', {
      error,
      responseText: responseText.substring(0, 500),
      status: response.status,
      service_id: serviceId,
      contentType,
    });
    throw new Error(`Failed to parse eBills API response: ${error instanceof Error ? error.message : String(error)}`);
  }
}

/**
 * Map electricity provider names to eBills service IDs
 */
export function getEBillsElectricityServiceId(provider: string): string {
  const providerLower = provider.toLowerCase().trim();
  const serviceIdMap: Record<string, string> = {
    'ikeja': 'ikeja-electric',
    'ikedc': 'ikeja-electric',
    'eko': 'eko-electric',
    'ekedc': 'eko-electric',
    'kano': 'kano-electric',
    'kedco': 'kano-electric',
    'portharcourt': 'portharcourt-electric',
    'ph': 'portharcourt-electric',
    'phed': 'portharcourt-electric',
    'jos': 'jos-electric',
    'jed': 'jos-electric',
    'ibadan': 'ibadan-electric',
    'ibedc': 'ibadan-electric',
    'kaduna': 'kaduna-electric',
    'kaedco': 'kaduna-electric',
    'abuja': 'abuja-electric',
    'aedc': 'abuja-electric',
    'enugu': 'enugu-electric',
    'eedc': 'enugu-electric',
    'benin': 'benin-electric',
    'bedc': 'benin-electric',
    'aba': 'aba-electric',
    'abedc': 'aba-electric',
    'yola': 'yola-electric',
    'yedc': 'yola-electric',
  };
  
  return serviceIdMap[providerLower] || providerLower.replace(/\s+/g, '-') + '-electric';
}

export interface EBillsBettingCustomerResponse {
  code: string;
  message: string;
  data: {
    service_name: string;
    customer_id: string;
    customer_name: string;
    customer_username?: string;
    customer_email_address?: string;
    customer_phone_number?: string;
    status: string;
  };
}

/**
 * Verify betting customer using eBills API
 * Requires valid JWT token
 */
export async function verifyEBillsBettingCustomer(
  token: string,
  customerId: string,
  serviceId: string
): Promise<EBillsBettingCustomerResponse> {
  const requestBody = {
    customer_id: customerId,
    service_id: serviceId,
  };
  
  console.log('eBills betting verification request:', {
    service_id: serviceId,
    customer_id: customerId.substring(0, 4) + '***', // Log partial customer ID for privacy
    url: `${EBILLS_BASE_URL}/api/v2/verify-customer`,
  });

  const response = await fetch(`${EBILLS_BASE_URL}/api/v2/verify-customer`, {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${token}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(requestBody),
  });

  const responseText = await response.text();
  const contentType = response.headers.get('content-type') || '';
  const isJsonResponse = contentType.includes('application/json');

  // Check if response is empty
  if (!responseText || responseText.trim().length === 0) {
    console.error('eBills API returned empty response:', {
      status: response.status,
      statusText: response.statusText,
      contentType,
      service_id: serviceId,
    });
    throw new Error(`eBills API returned empty response (Status: ${response.status})`);
  }

  // Check if response is HTML (error page) instead of JSON
  if (!isJsonResponse && (responseText.trim().startsWith('<!') || responseText.trim().startsWith('<html'))) {
    console.error('eBills API returned HTML instead of JSON:', {
      status: response.status,
      statusText: response.statusText,
      contentType,
      service_id: serviceId,
      responsePreview: responseText.substring(0, 200),
    });
    throw new Error(`eBills API returned an error page (Status: ${response.status}). Service may be unavailable.`);
  }

  let errorData: EBillsErrorResponse | null = null;
  let data: EBillsBettingCustomerResponse | null = null;

  try {
    // Try to parse as JSON
    if (!isJsonResponse) {
      console.warn('eBills API response is not JSON, attempting to parse anyway:', {
        contentType,
        responsePreview: responseText.substring(0, 200),
      });
    }

    if (!response.ok) {
      try {
        errorData = JSON.parse(responseText) as EBillsErrorResponse;
        console.error('eBills API error response:', {
          status: response.status,
          statusText: response.statusText,
          errorCode: errorData.code,
          errorMessage: errorData.message,
          service_id: serviceId,
          fullResponse: responseText,
        });
        
        // Extract the actual error message
        let errorMessage = errorData.message || `Verification failed: ${response.status}`;
        
        // Handle "Service currently not available" specifically
        const lowerMessage = errorMessage.toLowerCase();
        if (lowerMessage.includes('service currently not available') || 
            lowerMessage.includes('service not available')) {
          errorMessage = `Service currently not available for ${serviceId}. Please try again later or contact support.`;
        } else if (lowerMessage.includes('invalid') && lowerMessage.includes('service')) {
          errorMessage = `Invalid service ID: ${serviceId}. Please contact support.`;
        }
        
        throw new Error(errorMessage);
      } catch (jsonError) {
        // If JSON parsing fails, return the raw response text as error
        console.error('Failed to parse eBills error response as JSON:', {
          jsonError,
          responseText: responseText.substring(0, 500),
          status: response.status,
          service_id: serviceId,
        });
        throw new Error(`eBills API error (Status: ${response.status}): ${responseText.substring(0, 200)}`);
      }
    }

    try {
      data = JSON.parse(responseText) as EBillsBettingCustomerResponse;
    } catch (jsonError) {
      console.error('Failed to parse eBills success response as JSON:', {
        jsonError,
        responseText: responseText.substring(0, 500),
        status: response.status,
        service_id: serviceId,
        contentType,
      });
      throw new Error(`Invalid JSON response from eBills API: ${jsonError instanceof Error ? jsonError.message : String(jsonError)}`);
    }
    
    if (data.code !== 'success') {
      console.error('eBills API non-success response:', {
        code: data.code,
        message: data.message,
        service_id: serviceId,
        fullResponse: responseText,
      });
      throw new Error(data.message || 'Customer verification failed');
    }

    return data;
  } catch (error) {
    // Re-throw if it's already our custom error
    if (error instanceof Error && error.message.includes('eBills')) {
      throw error;
    }
    // Otherwise, wrap in a more descriptive error
    console.error('Unexpected error parsing eBills response:', {
      error,
      responseText: responseText.substring(0, 500),
      status: response.status,
      service_id: serviceId,
      contentType,
    });
    throw new Error(`Failed to parse eBills API response: ${error instanceof Error ? error.message : String(error)}`);
  }
}

export interface EBillsBettingPurchaseResponse {
  code: string;
  message: string;
  data: {
    order_id: number;
    status: string;
    product_name: string;
    service_name: string;
    customer_id: string;
    customer_name: string;
    customer_username?: string;
    customer_email_address?: string;
    customer_phone_number?: string;
    amount: number;
    amount_charged: string;
    discount: string;
    initial_balance: string;
    final_balance: string;
    request_id: string;
  };
}

/**
 * Fund betting account using eBills API
 * Requires valid JWT token
 */
export async function purchaseEBillsBetting(
  token: string,
  requestId: string,
  customerId: string,
  serviceId: string,
  amount: number
): Promise<EBillsBettingPurchaseResponse> {
  const requestBody = {
    request_id: requestId,
    customer_id: customerId,
    service_id: serviceId,
    amount: amount,
  };
  
  console.log('eBills betting purchase request:', {
    request_id: requestId,
    customer_id: customerId.substring(0, 4) + '***', // Log partial for privacy
    service_id: serviceId,
    amount: amount,
    url: `${EBILLS_BASE_URL}/api/v2/betting`,
  });

  const response = await fetch(`${EBILLS_BASE_URL}/api/v2/betting`, {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${token}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(requestBody),
  });

  const responseText = await response.text();
  const contentType = response.headers.get('content-type') || '';
  const isJsonResponse = contentType.includes('application/json');

  // Check if response is empty
  if (!responseText || responseText.trim().length === 0) {
    console.error('eBills API returned empty response:', {
      status: response.status,
      statusText: response.statusText,
      contentType,
      service_id: serviceId,
    });
    throw new Error(`eBills API returned empty response (Status: ${response.status})`);
  }

  // Check if response is HTML (error page) instead of JSON
  if (!isJsonResponse && (responseText.trim().startsWith('<!') || responseText.trim().startsWith('<html'))) {
    console.error('eBills API returned HTML instead of JSON:', {
      status: response.status,
      statusText: response.statusText,
      contentType,
      service_id: serviceId,
      responsePreview: responseText.substring(0, 200),
    });
    throw new Error(`eBills API returned an error page (Status: ${response.status}). Service may be unavailable.`);
  }

  let errorData: EBillsErrorResponse | null = null;
  let data: EBillsBettingPurchaseResponse | null = null;

  try {
    if (!isJsonResponse) {
      console.warn('eBills API response is not JSON, attempting to parse anyway:', {
        contentType,
        responsePreview: responseText.substring(0, 200),
      });
    }

    if (!response.ok) {
      try {
        errorData = JSON.parse(responseText) as EBillsErrorResponse;
        console.error('eBills API error response:', {
          status: response.status,
          statusText: response.statusText,
          errorCode: errorData.code,
          errorMessage: errorData.message,
          service_id: serviceId,
          fullResponse: responseText,
        });
        
        // Map HTTP status codes to specific error messages
        let errorMessage = errorData.message || `Betting purchase failed: ${response.status}`;
        
        if (response.status === 400) {
          // Handle specific 400 error codes from API
          if (errorData.code === 'missing_fields') {
            errorMessage = 'Required parameters missing';
          } else if (errorData.code === 'invalid_service_id') {
            errorMessage = `Invalid service ID: ${serviceId}`;
          } else if (errorData.code === 'below_minimum_amount') {
            errorMessage = 'Amount below minimum (₦100)';
          } else if (errorData.code === 'above_maximum_amount') {
            errorMessage = 'Amount above maximum (₦100,000)';
          }
        } else if (response.status === 402) {
          if (errorData.code === 'insufficient_funds') {
            errorMessage = 'Insufficient wallet balance';
          }
        } else if (response.status === 403) {
          if (errorData.code === 'rest_forbidden') {
            errorMessage = 'Unauthorized access. Please check your API credentials.';
          }
        } else if (response.status === 409) {
          if (errorData.code === 'duplicate_request_id') {
            errorMessage = 'Duplicate request ID';
          } else if (errorData.code === 'duplicate_order') {
            errorMessage = 'Duplicate order within 3 minutes';
          }
        }
        
        throw new Error(errorMessage);
      } catch (jsonError) {
        console.error('Failed to parse eBills error response as JSON:', {
          jsonError,
          responseText: responseText.substring(0, 500),
          status: response.status,
          service_id: serviceId,
        });
        throw new Error(`eBills API error (Status: ${response.status}): ${responseText.substring(0, 200)}`);
      }
    }

    try {
      data = JSON.parse(responseText) as EBillsBettingPurchaseResponse;
    } catch (jsonError) {
      console.error('Failed to parse eBills success response as JSON:', {
        jsonError,
        responseText: responseText.substring(0, 500),
        status: response.status,
        service_id: serviceId,
        contentType,
      });
      throw new Error(`Invalid JSON response from eBills API: ${jsonError instanceof Error ? jsonError.message : String(jsonError)}`);
    }
    
    if (data.code !== 'success') {
      console.error('eBills API non-success response:', {
        code: data.code,
        message: data.message,
        service_id: serviceId,
        fullResponse: responseText,
      });
      throw new Error(data.message || 'Betting purchase failed');
    }

    return data;
  } catch (error) {
    // Re-throw if it's already our custom error
    if (error instanceof Error && error.message.includes('eBills')) {
      throw error;
    }
    // Otherwise, wrap in a more descriptive error
    console.error('Unexpected error parsing eBills response:', {
      error,
      responseText: responseText.substring(0, 500),
      status: response.status,
      service_id: serviceId,
      contentType,
    });
    throw new Error(`Failed to parse eBills API response: ${error instanceof Error ? error.message : String(error)}`);
  }
}

/**
 * Map betting provider names to eBills service IDs
 */
export function getEBillsBettingServiceId(provider: string): string {
  const providerUpper = provider.toUpperCase().trim();
  const serviceIdMap: Record<string, string> = {
    '1XBET': '1xBet',
    '1X-BET': '1xBet',
    'BET9JA': 'Bet9ja',
    'BET-9JA': 'Bet9ja',
    'BETKING': 'BetKing',
    'BET-KING': 'BetKing',
    'BETWAY': 'BetWay',
    'BET-WAY': 'BetWay',
    'SPORTYBET': 'Sportybet', // Try capital S, lowercase rest
    'SPORTY-BET': 'Sportybet',
    'NAIRABET': 'NairaBet',
    'NAIRA-BET': 'NairaBet',
    'MERRYBET': 'MerryBet',
    'MERRY-BET': 'MerryBet',
    'BANGBET': 'BangBet',
    'BANG-BET': 'BangBet',
    'BETLAND': 'BetLand',
    'BET-LAND': 'BetLand',
    'BETLION': 'BetLion',
    'BET-LION': 'BetLion',
    'CLOUDBET': 'CloudBet',
    'CLOUD-BET': 'CloudBet',
    'LIVESCOREBET': 'LiveScoreBet',
    'LIVE-SCORE-BET': 'LiveScoreBet',
    'NAIJABET': 'NaijaBet',
    'NAIJA-BET': 'NaijaBet',
    'SUPABET': 'SupaBet',
    'SUPA-BET': 'SupaBet',
    'ACCESSBET': 'AccessBet',
    'ACCESS-BET': 'AccessBet',
  };
  
  // If provider is not in map, try to format it properly
  if (!serviceIdMap[providerUpper]) {
    // Convert to camelCase: first letter uppercase, rest lowercase, but preserve word boundaries
    // For example: "ACCESSBET" -> "AccessBet", "BET9JA" -> "Bet9ja"
    const words = providerUpper.split(/[-_\s]+/);
    const formatted = words.map((word, index) => {
      if (index === 0) {
        // First word: capitalize first letter, lowercase rest
        return word.charAt(0) + word.slice(1).toLowerCase();
      } else {
        // Subsequent words: capitalize first letter, lowercase rest
        return word.charAt(0).toUpperCase() + word.slice(1).toLowerCase();
      }
    }).join('');
    console.warn(`Betting provider "${provider}" not found in serviceIdMap, using formatted version: "${formatted}"`);
    return formatted;
  }
  
  return serviceIdMap[providerUpper];
}

