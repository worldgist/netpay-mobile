/**
 * eBills Africa API integration
 * Auth: POST /jwt-auth/v1/token (username + password → JWT, 7-day expiry)
 * Docs: https://ebills.africa — use Authorization: Bearer <token> on protected routes.
 * Unauthenticated: GET /api/v2/variations/tv, GET /api/v2/variations/data
 */

const EBILLS_BASE_URL = 'https://ebills.africa/wp-json';
const EBILLS_TOKEN_PATH = '/jwt-auth/v1/token';

/** Token lifetime per eBills docs; we fetch a fresh token per protected request. */
const EBILLS_TOKEN_TTL_MS = 7 * 24 * 60 * 60 * 1000;

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

async function parseEBillsJsonResponse<T>(response: Response): Promise<T> {
  const responseText = await response.text();

  if (!responseText || responseText.trim().length === 0) {
    throw new Error(`eBills API returned empty response (HTTP ${response.status})`);
  }

  try {
    return JSON.parse(responseText) as T;
  } catch {
    throw new Error(
      `eBills API returned invalid JSON (HTTP ${response.status}): ${responseText.substring(0, 200)}`,
    );
  }
}

function mapEBillsAuthError(errorData: EBillsErrorResponse, httpStatus: number): string {
  const code = String(errorData.code || '').toLowerCase();
  const message = errorData.message || '';

  if (code.includes('incorrect_password') || code.includes('invalid_username')) {
    return 'Invalid eBills credentials. Check EBILLS_USERNAME and EBILLS_PASSWORD in Supabase secrets.';
  }

  if (httpStatus === 403) {
    return message || 'eBills authentication forbidden. Verify your account email/username and password.';
  }

  return message || `eBills authentication failed (HTTP ${httpStatus})`;
}

/**
 * Obtain a JWT from eBills (POST /jwt-auth/v1/token).
 * Only the latest token stays active — callers should not cache tokens long-term.
 */
export async function authenticateEBills(
  username: string,
  password: string,
): Promise<EBillsAuthResponse> {
  const response = await fetch(`${EBILLS_BASE_URL}${EBILLS_TOKEN_PATH}`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Accept: 'application/json',
    },
    body: JSON.stringify({
      username: username.trim(),
      password,
    }),
  });

  const data = await parseEBillsJsonResponse<EBillsAuthResponse & EBillsErrorResponse>(response);

  if (!response.ok || !data.token) {
    const errorMessage = mapEBillsAuthError(data, response.status);
    console.error('eBills JWT auth failed:', {
      status: response.status,
      code: data.code,
      message: data.message,
    });
    throw new Error(errorMessage);
  }

  console.log('eBills JWT obtained:', {
    user_email: data.user_email,
    expires_in_days: 7,
  });

  return {
    token: data.token,
    user_email: data.user_email,
    user_nicename: data.user_nicename,
    user_display_name: data.user_display_name,
  };
}

/** Headers for authenticated eBills API requests. */
export function getEBillsAuthHeaders(token: string): Record<string, string> {
  return {
    Authorization: `Bearer ${token}`,
    'Content-Type': 'application/json',
    Accept: 'application/json',
  };
}

/**
 * Check eBills wallet balance
 * Requires valid JWT token
 */
export async function getEBillsBalance(token: string): Promise<EBillsBalanceResponse> {
  const response = await fetch(`${EBILLS_BASE_URL}/api/v2/balance`, {
    method: 'GET',
    headers: getEBillsAuthHeaders(token),
  });

  const data = await parseEBillsJsonResponse<EBillsBalanceResponse & EBillsErrorResponse>(response);

  if (!response.ok) {
    throw new Error(data.message || `Failed to get balance: ${response.status}`);
  }

  if (data.code !== 'success') {
    throw new Error(data.message || 'Failed to retrieve balance');
  }

  return data as EBillsBalanceResponse;
}

/**
 * Get eBills credentials from environment variables
 */
export function getEBillsCredentials(): { username: string; password: string } {
  const username = Deno.env.get('EBILLS_USERNAME');
  const password = Deno.env.get('EBILLS_PASSWORD');

  if (!username || !password) {
    throw new Error(
      'EBILLS_USERNAME and EBILLS_PASSWORD must be set in Supabase Edge Function secrets',
    );
  }

  return { username, password };
}

/**
 * Fresh JWT for each protected eBills call (recommended by eBills docs).
 * Credentials: EBILLS_USERNAME + EBILLS_PASSWORD in Supabase Edge Function secrets.
 */
export async function getEBillsToken(): Promise<string> {
  const { username, password } = getEBillsCredentials();
  const authResponse = await authenticateEBills(username, password);
  return authResponse.token;
}

/** @deprecated Use getEBillsToken — tokens are not cached; TTL is {@link EBILLS_TOKEN_TTL_MS}. */
export const EBILLS_TOKEN_EXPIRY_MS = EBILLS_TOKEN_TTL_MS;

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
    headers: getEBillsAuthHeaders(token),
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

export interface EBillsElectricityCustomerResponse {
  code: string;
  message: string;
  data: {
    service_name: string;
    customer_id: string;
    customer_name: string;
    customer_address: string;
    customer_arrears: number;
    outstanding: number;
    meter_number: string;
    account_number: string;
    district?: string;
    service_band?: string;
    min_purchase_amount: number;
    max_purchase_amount: number;
    business_unit?: string;
    customer_account_type?: string;
  };
}

export function normalizeEBillsElectricityVariationId(meterType: string): 'prepaid' | 'postpaid' {
  const normalized = meterType.toLowerCase().trim();
  if (normalized === 'prepaid' || normalized === 'postpaid') {
    return normalized;
  }
  throw new Error('Invalid meter type. Use prepaid or postpaid.');
}

export function mapEBillsVerifyCustomerError(
  errorData: EBillsErrorResponse,
  httpStatus: number,
): string {
  const code = String(errorData.code || '').toLowerCase();
  const message = String(errorData.message || '').toLowerCase();

  if (code.includes('missing_fields') || message.includes('missing')) {
    return 'Required verification details are missing. Please try again.';
  }
  if (code.includes('invalid_field') || message.includes('invalid field') || message.includes('invalid service')) {
    return 'Invalid service or meter type. Please check your selection and try again.';
  }
  if (code.includes('failure') || message.includes('invalid customer') || message.includes('not found')) {
    return 'Customer verification failed. Please check the account number and try again.';
  }
  if (httpStatus === 403 || code.includes('forbidden')) {
    return 'Verification is not authorized. Please contact support.';
  }

  return errorData.message || `Customer verification failed (HTTP ${httpStatus})`;
}

/**
 * Verify electricity customer (meter/account) using eBills POST /api/v2/verify-customer.
 * variation_id is required: prepaid or postpaid.
 */
export async function verifyEBillsElectricityCustomer(
  token: string,
  customerId: string,
  serviceId: string,
  variationId: string,
): Promise<EBillsElectricityCustomerResponse> {
  const normalizedVariation = normalizeEBillsElectricityVariationId(variationId);
  const requestBody = {
    customer_id: customerId,
    service_id: serviceId,
    variation_id: normalizedVariation,
  };

  console.log('eBills electricity customer verification request:', {
    service_id: serviceId,
    variation_id: normalizedVariation,
    customer_id: customerId.substring(0, 4) + '***',
    url: `${EBILLS_BASE_URL}/api/v2/verify-customer`,
  });

  const response = await fetch(`${EBILLS_BASE_URL}/api/v2/verify-customer`, {
    method: 'POST',
    headers: getEBillsAuthHeaders(token),
    body: JSON.stringify(requestBody),
  });

  const data = await parseEBillsJsonResponse<EBillsElectricityCustomerResponse & EBillsErrorResponse>(response);

  if (!response.ok || data.code !== 'success') {
    const friendlyMessage = mapEBillsVerifyCustomerError(data, response.status);
    console.error('eBills electricity verification error:', {
      status: response.status,
      code: data.code,
      message: data.message,
      service_id: serviceId,
      variation_id: normalizedVariation,
    });
    throw new Error(friendlyMessage);
  }

  console.log('eBills electricity customer verified successfully:', {
    customer_name: data.data?.customer_name,
    service_id: serviceId,
    min_purchase_amount: data.data?.min_purchase_amount,
  });

  return data as EBillsElectricityCustomerResponse;
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
    'SHOWMAX': 'showmax',
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
 * Fetch cable TV packages/variations from eBills API.
 * Does NOT require JWT authentication.
 */
export async function getEBillsTVVariations(
  serviceId: string
): Promise<EBillsTVVariationsResponse> {
  const response = await fetch(`${EBILLS_BASE_URL}/api/v2/variations/tv?service_id=${serviceId}`, {
    method: 'GET',
    headers: {
      'Content-Type': 'application/json',
      Accept: 'application/json',
    },
  });

  if (!response.ok) {
    const errorData = await parseEBillsJsonResponse<EBillsErrorResponse>(response).catch(() => ({
      code: 'fetch_error',
      message: `Failed to fetch TV variations: ${response.status}`,
    }));
    throw new Error(errorData.message || `Failed to fetch TV variations: ${response.status}`);
  }

  const data = await parseEBillsJsonResponse<EBillsTVVariationsResponse>(response);
  
  // Log the first variation to see the structure
  if (data.data && data.data.length > 0) {
    console.log('eBills TV variations sample (first item):', JSON.stringify(data.data[0], null, 2));
  }
  
  if (data.code !== 'success') {
    throw new Error(data.message || 'Failed to retrieve TV variations');
  }

  return data;
}

export interface EBillsDataVariationItem {
  variation_id: number | string;
  service_name?: string;
  service_id?: string;
  data_plan?: string;
  price?: string | number;
  availability?: string;
}

export interface EBillsDataVariationsResponse {
  code: string;
  message: string;
  product?: string;
  data: EBillsDataVariationItem[];
}

export const EBILLS_DATA_SERVICE_IDS = ['mtn', 'airtel', 'glo', '9mobile', 'smile'] as const;

export function isValidEBillsDataServiceId(serviceId: string): boolean {
  return EBILLS_DATA_SERVICE_IDS.includes(serviceId.toLowerCase() as typeof EBILLS_DATA_SERVICE_IDS[number]);
}

/** Extract validity period from eBills data_plan label e.g. "1.4GB - 30 Days" */
export function extractEBillsDataPlanValidity(dataPlan: string): string {
  const parts = dataPlan.split('-').map((part) => part.trim());
  if (parts.length >= 2) {
    return parts.slice(1).join(' - ').trim() || 'N/A';
  }
  return 'N/A';
}

/** Extract data size from eBills data_plan label e.g. "1.4GB - 30 Days" */
export function extractEBillsDataPlanSize(dataPlan: string): string | null {
  const match = dataPlan.match(/(\d+(?:\.\d+)?\s*(?:GB|MB|TB))/i);
  return match ? match[1].replace(/\s+/g, '') : null;
}

/**
 * Fetch data bundle variations from eBills API.
 * Does NOT require JWT authentication.
 * Pass serviceId to filter by network (mtn, airtel, glo, 9mobile, smile).
 */
export async function getEBillsDataVariations(
  serviceId?: string,
): Promise<EBillsDataVariationsResponse> {
  const normalizedServiceId = serviceId?.trim().toLowerCase();
  if (normalizedServiceId && !isValidEBillsDataServiceId(normalizedServiceId)) {
    throw new Error(`Invalid service_id "${serviceId}". Must be one of: ${EBILLS_DATA_SERVICE_IDS.join(', ')}`);
  }

  const url = normalizedServiceId
    ? `${EBILLS_BASE_URL}/api/v2/variations/data?service_id=${encodeURIComponent(normalizedServiceId)}`
    : `${EBILLS_BASE_URL}/api/v2/variations/data`;

  const response = await fetch(url, {
    method: 'GET',
    headers: {
      'Content-Type': 'application/json',
      Accept: 'application/json',
    },
  });

  if (!response.ok) {
    const errorData = await parseEBillsJsonResponse<EBillsErrorResponse>(response).catch(() => ({
      code: 'fetch_error',
      message: `Failed to fetch data variations: ${response.status}`,
    }));
    throw new Error(errorData.message || `Failed to fetch data variations: ${response.status}`);
  }

  const data = await parseEBillsJsonResponse<EBillsDataVariationsResponse>(response);

  if (data.code !== 'success') {
    throw new Error(data.message || 'Failed to retrieve data variations');
  }

  return data;
}

export interface EBillsPurchaseResponse {
  code: string;
  message: string;
  data: {
    order_id?: number;
    transaction_id?: string;
    customer_id?: string;
    customer_name?: string;
    service_name?: string;
    variation_name?: string;
    product_name?: string;
    amount?: number;
    amount_charged?: string;
    discount?: string;
    initial_balance?: string;
    final_balance?: string;
    status?: string;
    request_id?: string;
    reference?: string;
  };
}

export function mapEBillsCableError(
  errorData: EBillsErrorResponse,
  httpStatus: number,
): string {
  const code = String(errorData.code || '').toLowerCase();
  const message = String(errorData.message || '').toLowerCase();

  if (code.includes('rest_no_route') || message.includes('no route was found')) {
    return 'Cable TV service is temporarily unavailable. Please try again.';
  }
  if (code.includes('missing_fields') || message.includes('missing')) {
    return 'Required cable purchase details are missing. Please try again.';
  }
  if (code.includes('invalid_service') || message.includes('invalid service')) {
    return 'Invalid cable TV provider. Please contact support.';
  }
  if (code.includes('invalid_variation') || message.includes('invalid variation')) {
    return 'Invalid cable package selected. Please refresh packages and try again.';
  }
  if (code.includes('invalid_customer') || message.includes('invalid customer')) {
    return 'Invalid smartcard/IUC number. Please verify the card and try again.';
  }
  if (code.includes('insufficient_funds') || message.includes('insufficient')) {
    return 'Cable TV service is temporarily unavailable. Please try again later.';
  }
  if (code.includes('duplicate_request') || code.includes('duplicate_order') || message.includes('duplicate')) {
    return 'Duplicate request detected. Please wait a moment and try again.';
  }
  if (httpStatus === 403 || code.includes('forbidden')) {
    return 'Cable TV purchase is not authorized. Please contact support.';
  }

  return errorData.message || `Cable TV purchase failed (HTTP ${httpStatus})`;
}

/**
 * Purchase cable TV subscription using eBills POST /api/v2/tv.
 * Requires valid JWT token, request_id, and variation_id from /api/v2/variations/tv.
 */
export async function purchaseEBillsCableTV(
  token: string,
  requestId: string,
  customerId: string,
  serviceId: string,
  variationId: string,
  amount?: number,
): Promise<EBillsPurchaseResponse> {
  const requestBody: Record<string, unknown> = {
    request_id: requestId,
    customer_id: customerId,
    service_id: serviceId,
    variation_id: String(variationId),
  };

  if (typeof amount === 'number' && Number.isFinite(amount) && amount > 0) {
    requestBody.amount = Math.round(amount);
  }

  console.log('eBills cable purchase request:', {
    request_id: requestId,
    customer_id: customerId.substring(0, 4) + '***',
    service_id: serviceId,
    variation_id: variationId,
    amount: requestBody.amount,
    url: `${EBILLS_BASE_URL}/api/v2/tv`,
  });

  const response = await fetch(`${EBILLS_BASE_URL}/api/v2/tv`, {
    method: 'POST',
    headers: getEBillsAuthHeaders(token),
    body: JSON.stringify(requestBody),
  });

  const data = await parseEBillsJsonResponse<EBillsPurchaseResponse & EBillsErrorResponse>(response);
  if (!response.ok || data.code !== 'success') {
    throw new Error(mapEBillsCableError(data, response.status));
  }

  return data as EBillsPurchaseResponse;
}

/**
 * Requery an eBills order by request_id (POST /api/v2/requery).
 * Use for pending/processing orders to detect completion, failure, or refund.
 */
export async function requeryEBillsOrder(
  token: string,
  requestId: string,
): Promise<EBillsPurchaseResponse> {
  const response = await fetch(`${EBILLS_BASE_URL}/api/v2/requery`, {
    method: 'POST',
    headers: getEBillsAuthHeaders(token),
    body: JSON.stringify({ request_id: requestId }),
  });

  const data = await parseEBillsJsonResponse<EBillsPurchaseResponse & EBillsErrorResponse>(response);

  if (!response.ok || data.code !== 'success') {
    const code = String(data.code || '').toLowerCase();
    if (code.includes('order_not_found') || response.status === 404) {
      throw new Error(`Order not found at eBills for request_id: ${requestId}`);
    }
    throw new Error(data.message || `eBills requery failed (HTTP ${response.status})`);
  }

  return data as EBillsPurchaseResponse;
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

export function mapEBillsElectricityError(
  errorData: EBillsErrorResponse,
  httpStatus: number,
): string {
  const code = String(errorData.code || '').toLowerCase();
  const message = String(errorData.message || '').toLowerCase();

  if (code.includes('missing_fields') || message.includes('missing')) {
    return 'Required purchase details are missing. Please try again.';
  }
  if (code.includes('invalid_service') || message.includes('invalid service')) {
    return 'Invalid electricity provider. Please contact support.';
  }
  if (code.includes('invalid_variation') || message.includes('invalid variation')) {
    return 'Invalid meter type. Use prepaid or postpaid.';
  }
  if (code.includes('invalid_customer') || message.includes('invalid customer') || message.includes('invalid meter')) {
    return 'Invalid meter number. Please verify the meter and try again.';
  }
  if (code.includes('below_minimum') || message.includes('below minimum')) {
    return 'Amount is below the minimum purchase amount for this meter.';
  }
  if (code.includes('below_customer_arrears') || message.includes('arrears')) {
    return 'Amount is below outstanding arrears. Please pay the full arrears amount.';
  }
  if (code.includes('insufficient_funds') || message.includes('insufficient')) {
    return 'Electricity service is temporarily unavailable. Please try again later.';
  }
  if (code.includes('duplicate_request') || code.includes('duplicate_order') || message.includes('duplicate')) {
    return 'Duplicate request detected. Please wait a moment and try again.';
  }
  if (httpStatus === 403 || code.includes('forbidden')) {
    return 'Electricity purchase is not authorized. Please contact support.';
  }

  return errorData.message || `Electricity purchase failed (HTTP ${httpStatus})`;
}

export const EBILLS_ELECTRICITY_MAX_AMOUNT = 100000;

/**
 * Purchase electricity units using eBills API
 * Requires valid JWT token and variation_id (prepaid/postpaid).
 */
export async function purchaseEBillsElectricity(
  token: string,
  requestId: string,
  customerId: string,
  serviceId: string,
  amount: number,
  variationId: string,
): Promise<EBillsElectricityPurchaseResponse> {
  const normalizedVariation = normalizeEBillsElectricityVariationId(variationId);
  const requestBody = {
    request_id: requestId,
    customer_id: customerId,
    service_id: serviceId,
    variation_id: normalizedVariation,
    amount: amount,
  };

  console.log('eBills electricity purchase request:', {
    request_id: requestId,
    customer_id: customerId.substring(0, 4) + '***', // Log partial for privacy
    service_id: serviceId,
    amount: amount,
    variation_id: normalizedVariation,
    url: `${EBILLS_BASE_URL}/api/v2/electricity`,
  });

  const response = await fetch(`${EBILLS_BASE_URL}/api/v2/electricity`, {
    method: 'POST',
    headers: getEBillsAuthHeaders(token),
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
        
        const errorMessage = mapEBillsElectricityError(errorData, response.status);
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
    minimum_amount?: number;
    maximum_amount?: number;
    status?: string;
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
    headers: getEBillsAuthHeaders(token),
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
    headers: getEBillsAuthHeaders(token),
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

/** Map mobile network names to eBills service_id (mtn, airtel, glo, 9mobile, smile). */
export function getEBillsMobileNetworkServiceId(network: string): string {
  const normalized = network.toUpperCase().trim().replace(/[^A-Z0-9]/g, '');
  const map: Record<string, string> = {
    MTN: 'mtn',
    AIRTEL: 'airtel',
    GLO: 'glo',
    '9MOBILE': '9mobile',
    ETISALAT: '9mobile',
    T2: '9mobile',
    SMILE: 'smile',
  };
  return map[normalized] || network.toLowerCase().trim();
}

export interface EBillsAirtimeOrderData {
  order_id?: number;
  status?: string;
  product_name?: string;
  service_name?: string;
  phone?: string;
  amount?: number;
  discount?: string;
  amount_charged?: string;
  initial_balance?: string;
  final_balance?: string;
  request_id?: string;
}

export interface EBillsAirtimePurchaseResponse {
  code: string;
  message: string;
  data: EBillsAirtimeOrderData;
}

export class EBillsAirtimeError extends Error {
  code: string;

  constructor(code: string, message: string) {
    super(message);
    this.name = 'EBillsAirtimeError';
    this.code = code;
  }
}

export function mapEBillsAirtimeError(
  errorData: EBillsErrorResponse,
  httpStatus: number,
  serviceId?: string,
): string {
  const code = String(errorData.code || '').toLowerCase();
  const message = String(errorData.message || '').toLowerCase();

  if (code.includes('below_minimum') || message.includes('below minimum')) {
    const minAmount = serviceId === 'mtn' ? 10 : 50;
    return `Minimum airtime amount is ₦${minAmount} for this network.`;
  }
  if (code.includes('above_maximum') || message.includes('above maximum')) {
    return 'Maximum airtime amount is ₦50,000.';
  }
  if (code.includes('invalid_service') || message.includes('invalid service')) {
    return 'Network does not match the phone number. Please check the selected network.';
  }
  if (code.includes('insufficient_funds') || message.includes('insufficient')) {
    return 'Airtime service is temporarily unavailable. Please try again later.';
  }
  if (code.includes('duplicate_request') || code.includes('duplicate_order') || message.includes('duplicate')) {
    return 'Duplicate request detected. Please wait a moment and try again.';
  }
  if (code.includes('missing_fields') || message.includes('missing')) {
    return 'Required purchase details are missing. Please try again.';
  }
  if (httpStatus === 403 || code.includes('forbidden')) {
    return 'Airtime purchase is not authorized. Please contact support.';
  }

  return errorData.message || `Airtime purchase failed (HTTP ${httpStatus})`;
}

export function resolveEBillsAirtimeServiceId(
  serviceId: string,
  networkName: string,
): string {
  const trimmed = serviceId.trim().toLowerCase();
  if (trimmed && !/^\d+$/.test(trimmed)) {
    return trimmed;
  }
  if (networkName) {
    return getEBillsMobileNetworkServiceId(networkName);
  }
  return '';
}

const NETWORK_PREFIXES: Record<string, string[]> = {
  mtn: ['0803', '0806', '0703', '0706', '0810', '0813', '0814', '0816', '0903', '0906', '0913', '0916', '0811'],
  airtel: ['0802', '0808', '0708', '0701', '0812', '0902', '0901', '0907', '0912', '0801', '0804', '0904'],
  glo: ['0805', '0807', '0811', '0815', '0905', '0915'],
  '9mobile': ['0809', '0817', '0818', '0909', '0908'],
};

export function validateEBillsPhoneForNetwork(phone: string, serviceId: string): boolean {
  const prefixes = NETWORK_PREFIXES[serviceId.toLowerCase()];
  if (!prefixes || prefixes.length === 0) return true;
  return prefixes.some((prefix) => phone.startsWith(prefix));
}

/** @deprecated Use validateEBillsPhoneForNetwork */
export const validateEBillsAirtimePhoneForNetwork = validateEBillsPhoneForNetwork;

export function getEBillsAirtimeMinAmount(serviceId: string): number {
  return serviceId.toLowerCase() === 'mtn' ? 10 : 50;
}

export const EBILLS_AIRTIME_MAX_AMOUNT = 50000;

export function generateEBillsRequestId(userId: string): string {
  const random = crypto.randomUUID().replace(/-/g, '').slice(0, 6);
  const requestId = `req_${Date.now()}_${userId.substring(0, 6)}_${random}`;
  return requestId.length <= 50 ? requestId : requestId.slice(0, 50);
}

/** @deprecated Use generateEBillsRequestId */
export const generateEBillsAirtimeRequestId = generateEBillsRequestId;

export async function purchaseEBillsAirtime(
  token: string,
  requestId: string,
  phone: string,
  serviceId: string,
  amount: number,
): Promise<EBillsAirtimePurchaseResponse> {
  const response = await fetch(`${EBILLS_BASE_URL}/api/v2/airtime`, {
    method: 'POST',
    headers: getEBillsAuthHeaders(token),
    body: JSON.stringify({
      request_id: requestId,
      phone,
      service_id: serviceId,
      amount: Math.round(amount),
    }),
  });

  const data = await parseEBillsJsonResponse<EBillsAirtimePurchaseResponse & EBillsErrorResponse>(response);
  if (!response.ok || data.code !== 'success') {
    const friendlyMessage = mapEBillsAirtimeError(data, response.status, serviceId);
    throw new EBillsAirtimeError(String(data.code || 'airtime_error'), friendlyMessage);
  }
  return data as EBillsAirtimePurchaseResponse;
}

export interface EBillsDataOrderData {
  order_id?: number;
  status?: string;
  product_name?: string;
  variation_id?: string;
  service_name?: string;
  data_plan?: string;
  phone?: string;
  amount?: number;
  discount?: string;
  amount_charged?: string;
  initial_balance?: string;
  final_balance?: string;
  request_id?: string;
}

export interface EBillsDataPurchaseResponse {
  code: string;
  message: string;
  data: EBillsDataOrderData;
}

export class EBillsDataError extends Error {
  code: string;

  constructor(code: string, message: string) {
    super(message);
    this.name = 'EBillsDataError';
    this.code = code;
  }
}

export function mapEBillsDataError(
  errorData: EBillsErrorResponse,
  httpStatus: number,
): string {
  const code = String(errorData.code || '').toLowerCase();
  const message = String(errorData.message || '').toLowerCase();

  if (code.includes('invalid_variation') || message.includes('invalid variation')) {
    return 'Invalid data plan selected. Please re-import plans from eBills and try again.';
  }
  if (code.includes('invalid_service') || message.includes('invalid service')) {
    return 'Network does not match the phone number. Please check the selected network.';
  }
  if (code.includes('insufficient_funds') || message.includes('insufficient')) {
    return 'Data service is temporarily unavailable. Please try again later.';
  }
  if (code.includes('duplicate_request') || code.includes('duplicate_order') || message.includes('duplicate')) {
    return 'Duplicate request detected. Please wait a moment and try again.';
  }
  if (code.includes('missing_fields') || message.includes('missing')) {
    return 'Required purchase details are missing. Please try again.';
  }
  if (httpStatus === 403 || code.includes('forbidden')) {
    return 'Data purchase is not authorized. Please contact support.';
  }

  return errorData.message || `Data purchase failed (HTTP ${httpStatus})`;
}

export async function purchaseEBillsData(
  token: string,
  requestId: string,
  phone: string,
  serviceId: string,
  variationId: string,
): Promise<EBillsDataPurchaseResponse> {
  const response = await fetch(`${EBILLS_BASE_URL}/api/v2/data`, {
    method: 'POST',
    headers: getEBillsAuthHeaders(token),
    body: JSON.stringify({
      request_id: requestId,
      phone,
      service_id: serviceId,
      variation_id: String(variationId),
    }),
  });

  const data = await parseEBillsJsonResponse<EBillsDataPurchaseResponse & EBillsErrorResponse>(response);
  if (!response.ok || data.code !== 'success') {
    const friendlyMessage = mapEBillsDataError(data, response.status);
    throw new EBillsDataError(String(data.code || 'data_error'), friendlyMessage);
  }
  return data as EBillsDataPurchaseResponse;
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

