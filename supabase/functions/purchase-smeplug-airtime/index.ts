import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { creditUserWallet, debitUserWallet } from "../_shared/wallet.ts";
import { sendPushNotification } from "../_shared/push-notifications.ts";
import { fetchSmeplugWalletBalance } from "../_shared/smeplug-balance.ts";

const CORS_HEADERS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

const normalizeStatusText = (value: unknown): string => {
  if (value === true) return 'success';
  if (value === false) return 'failed';
  return String(value ?? '').trim().toLowerCase();
};

const isSuccessfulStatusText = (value: string): boolean =>
  value === 'success' || value === 'successful' || value === 'completed' || value === 'delivered';

const isFailedStatusText = (value: string): boolean =>
  value === 'failed' || value === 'failure' || value === 'error' || value === 'false';

const getNestedPayload = (payload: Record<string, unknown>): Record<string, unknown> | undefined => {
  const nested = payload.data ?? payload.body;
  if (nested && typeof nested === 'object' && nested !== null) {
    return nested as Record<string, unknown>;
  }
  return undefined;
};

const isSuccessfulSmeplugAirtimeResponse = (
  apiResponse: Record<string, unknown> | string | null,
  httpStatusOk: boolean,
): boolean => {
  if (!httpStatusOk) return false;
  if (!apiResponse || typeof apiResponse !== 'object') return false;

  const payload = apiResponse as Record<string, unknown>;
  const topStatus = normalizeStatusText(payload.status);
  const topCode = payload.code;

  if (payload.status === true || payload.success === true) return true;
  if (topCode === 200 || topCode === '200') return true;
  if (isSuccessfulStatusText(topStatus)) return true;
  if (isFailedStatusText(topStatus) || payload.success === false) return false;

  const nested = getNestedPayload(payload);
  if (nested) {
    const nestedStatus = normalizeStatusText(nested.status ?? nested.Status);
    if (nested.success === true || isSuccessfulStatusText(nestedStatus)) return true;
    if (isFailedStatusText(nestedStatus) || nested.success === false || nested.error) return false;
    if (nested.id) return true;
  }

  return false;
};

const extractSmeplugErrorMessage = (apiResponse: Record<string, unknown> | string | null): string | null => {
  if (!apiResponse) return null;
  if (typeof apiResponse === 'string') return apiResponse.trim() || null;

  const payload = apiResponse as Record<string, unknown>;
  const nested = getNestedPayload(payload);

  const errorList = payload.errors ?? nested?.errors;
  if (Array.isArray(errorList) && errorList.length > 0) {
    const messages = errorList
      .map((entry) => String(entry ?? '').trim())
      .filter((entry) => entry.length > 0);
    if (messages.length > 0) {
      return messages.join('. ');
    }
  }

  const candidates = [
    payload.message,
    payload.error,
    payload.msg,
    payload.response_description,
    payload.status_message,
    nested?.message,
    nested?.error,
    nested?.msg,
    nested?.response_description,
    nested?.status_message,
  ];

  for (const candidate of candidates) {
    if (typeof candidate === 'string' && candidate.trim()) {
      return candidate.trim();
    }
  }

  return null;
};

const normalizePhoneForSmeplug = (value: unknown): string => {
  if (typeof value !== 'string') return '';

  let normalized = value.trim().replace(/\s+/g, '');

  if (normalized.startsWith('+234')) {
    normalized = `0${normalized.slice(4)}`;
  } else if (normalized.startsWith('234') && normalized.length === 13) {
    normalized = `0${normalized.slice(3)}`;
  }

  normalized = normalized.replace(/[^0-9]/g, '');

  // 10-digit numbers like 8012345678 → 08012345678
  if (/^[789]\d{9}$/.test(normalized)) {
    normalized = `0${normalized}`;
  }

  return normalized;
};

const isValidSmeplugPhone = (value: string) => /^0\d{10}$/.test(value);

const mapAirtimePurchaseError = (
  rawMessage: string,
  providerBalance: number | null,
  purchaseAmount: number,
): string => {
  const text = rawMessage.toLowerCase();

  if (
    providerBalance !== null &&
    providerBalance < purchaseAmount &&
    (text.includes('unable to purchase') || text.includes('insufficient'))
  ) {
    return 'Airtime service is temporarily unavailable (provider wallet is low). Please try again later or contact support.';
  }

  if (text.includes('unable to purchase airtime')) {
    if (providerBalance !== null && providerBalance < purchaseAmount) {
      return 'Airtime service is temporarily unavailable (provider wallet is low). Please try again later or contact support.';
    }
    if (providerBalance !== null && providerBalance >= purchaseAmount) {
      return 'Airtime is temporarily unavailable from our service provider (not your phone number). Please contact NetPay support — SMEPlug airtime may need to be enabled on the merchant account.';
    }
    return 'Airtime could not be delivered to this number. Use a valid active Nigerian line that matches the selected network (MTN number for MTN, etc.).';
  }

  if (text.includes('invalid phone') || text.includes('phone number')) {
    return 'Invalid phone number for the selected network. Use an 11-digit Nigerian number (e.g. 08012345678).';
  }

  if (text.includes('insufficient') && text.includes('balance')) {
    return 'Insufficient balance with the airtime provider. Please try again later or contact support.';
  }

  return rawMessage;
};

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: CORS_HEADERS });
  }

  try {
    const SECRET_KEY = Deno.env.get('SMEPLUG_SECRET_KEY');
    
    if (!SECRET_KEY) {
      console.error('SMEPLUG_SECRET_KEY is not configured in environment variables');
      return new Response(
        JSON.stringify({ 
          success: false, 
          error: 'Service currently unavailable. Please contact support or try again later.'
        }),
        { status: 200, headers: { ...CORS_HEADERS, 'Content-Type': 'application/json' } }
      );
    }

    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const supabase = createClient(supabaseUrl, supabaseKey);

    const authHeader = req.headers.get('Authorization');
    if (!authHeader) {
      return new Response(
        JSON.stringify({ success: false, error: 'Unauthorized' }),
        { status: 401, headers: { ...CORS_HEADERS, 'Content-Type': 'application/json' } }
      );
    }

    const token = authHeader.replace('Bearer ', '');
    const { data: { user }, error: authError } = await supabase.auth.getUser(token);
    
    if (authError || !user) {
      return new Response(
        JSON.stringify({ success: false, error: 'Unauthorized' }),
        { status: 401, headers: { ...CORS_HEADERS, 'Content-Type': 'application/json' } }
      );
    }

    const rawBody = await req.json();
    const { phone_number, amount, network_id, network_name } = rawBody ?? {};

    console.log('Incoming airtime purchase payload:', JSON.stringify(rawBody, null, 2));

    const resolveNetworkId = (value: unknown) => {
      if (typeof value === 'number' && Number.isFinite(value)) {
        return value;
      }

      if (typeof value === 'string') {
        const trimmed = value.trim();
        if (/^\d+$/.test(trimmed)) {
          return Number(trimmed);
        }

        const normalized = trimmed.toUpperCase();
        const mapping: Record<string, number> = {
          MTN: 1,
          'MTN NIGERIA': 1,
          AIRTEL: 2,
          'AIRTEL NIGERIA': 2,
          '9MOBILE': 3,
          '9 MOBILE': 3,
          ETISALAT: 3,
          T2: 3,
          GLO: 4,
          GLOBACOM: 4,
        };

        if (mapping[normalized]) {
          return mapping[normalized];
        }
      }

      return null;
    };

    const smeplugNetworkId = resolveNetworkId(network_id);
    const providedNetworkName =
      typeof network_name === 'string' && network_name.trim().length > 0
        ? network_name.trim()
        : null;

    const resolveNetworkName = (id: number | null, fallback?: string | null) => {
      if (fallback) return fallback;
      if (id === null) return null;
      const NAME_MAP: Record<number, string> = {
        1: 'MTN',
        2: 'Airtel',
        3: '9Mobile',
        4: 'Glo',
      };
      return NAME_MAP[id] || null;
    };
    const sanitizedPhone = normalizePhoneForSmeplug(phone_number);
    const normalizedAmount = Number(amount);

    if (!isValidSmeplugPhone(sanitizedPhone)) {
      return new Response(
        JSON.stringify({
          success: false,
          error: 'Please enter a valid 11-digit Nigerian phone number (e.g. 08012345678).',
        }),
        { status: 200, headers: { ...CORS_HEADERS, 'Content-Type': 'application/json' } }
      );
    }

    if (!Number.isFinite(normalizedAmount) || normalizedAmount <= 0) {
      return new Response(
        JSON.stringify({
          success: false,
          error: 'Please enter a valid amount greater than 0',
        }),
        { status: 200, headers: { ...CORS_HEADERS, 'Content-Type': 'application/json' } }
      );
    }

    if (smeplugNetworkId === null) {
      return new Response(
        JSON.stringify({
          success: false,
          error: 'Invalid network selected. Please try again.',
        }),
        { status: 200, headers: { ...CORS_HEADERS, 'Content-Type': 'application/json' } }
      );
    }

    // Fetch user's balance
    const { data: profile, error: profileError } = await supabase
      .from('profiles')
      .select('balance, full_name, email')
      .eq('id', user.id)
      .single();

    if (profileError || !profile) {
      console.error('Error fetching user profile:', profileError);
      return new Response(
        JSON.stringify({ success: false, error: 'Failed to fetch user profile' }),
        { status: 200, headers: { ...CORS_HEADERS, 'Content-Type': 'application/json' } }
      );
    }

    const balanceBefore = Number(profile.balance) || 0;

    if (balanceBefore < normalizedAmount) {
      return new Response(
        JSON.stringify({ success: false, error: 'Insufficient balance' }),
        { status: 200, headers: { ...CORS_HEADERS, 'Content-Type': 'application/json' } }
      );
    }

    const reference = `AIRTIME-${Date.now()}-${user.id.slice(0, 8)}-${crypto.randomUUID().replace(/-/g, '').slice(0, 10).toUpperCase()}`;

    const buildVendorReference = () =>
      `AT${Date.now().toString(36).toUpperCase()}${crypto.randomUUID().replace(/-/g, '').slice(0, 8).toUpperCase()}`;

    const normalizedNetworkName = resolveNetworkName(smeplugNetworkId, providedNetworkName);
    const normalizedServiceId = smeplugNetworkId !== null ? String(smeplugNetworkId) : String(network_id ?? '');

    console.log(
      `Purchasing airtime: ${normalizedAmount} for ${sanitizedPhone} on network ${smeplugNetworkId} (${normalizedNetworkName ?? 'UNKNOWN'})`
    );

    const isDemoUser = profile.email === 'demo@netppay.com';

    const fallbackNetworkId = network_id ?? smeplugNetworkId;
    const displayNetwork =
      normalizedNetworkName ||
      (fallbackNetworkId !== null && fallbackNetworkId !== undefined && fallbackNetworkId !== ''
        ? `Network ${fallbackNetworkId}`
        : 'the selected network');
    const formattedAmount = `₦${normalizedAmount.toFixed(2)}`;
    const purchaseAmount = Math.round(normalizedAmount);

    if (!isDemoUser && SECRET_KEY) {
      const { balance: providerBalance } = await fetchSmeplugWalletBalance(SECRET_KEY);
      if (providerBalance !== null && providerBalance < purchaseAmount) {
        console.error('SMEPLUG wallet balance too low for airtime purchase', {
          providerBalance,
          purchaseAmount,
          userId: user.id,
        });
        return new Response(
          JSON.stringify({
            success: false,
            error:
              'Airtime service is temporarily unavailable (provider wallet is low). Please try again later or contact support.',
            details: {
              reason: 'provider_wallet_low',
              provider_balance: providerBalance,
              required: purchaseAmount,
            },
          }),
          { status: 200, headers: { ...CORS_HEADERS, 'Content-Type': 'application/json' } },
        );
      }
    }

    // Debit wallet BEFORE calling SMEPlug so we never get "vendor success + user not debited"
    // (e.g. client timeout / Edge failure after SMEPlug already processed the purchase).
    let debitResult: Awaited<ReturnType<typeof debitUserWallet>>;
    try {
      debitResult = await debitUserWallet({
        supabase,
        userId: user.id,
        amount: normalizedAmount,
        transactionType: 'airtime_purchase',
        description: `Airtime purchase (pending vendor) — ${sanitizedPhone} (${displayNetwork})`,
        reference,
        performedBy: user.id,
        balanceBefore,
        notification: undefined,
      });
    } catch (debitErr) {
      console.error('Debit failed before SMEPlug:', debitErr);
      return new Response(
        JSON.stringify({
          success: false,
          error: debitErr instanceof Error ? debitErr.message : 'Could not debit wallet for airtime purchase',
        }),
        { status: 200, headers: { ...CORS_HEADERS, 'Content-Type': 'application/json' } },
      );
    }

    const refundWallet = async (reason: string, refSuffix: string) => {
      try {
        await creditUserWallet({
          supabase,
          userId: user.id,
          amount: normalizedAmount,
          transactionType: 'refund',
          description: `Airtime purchase refunded — ${reason}`,
          reference: `${reference}-${refSuffix}`,
          performedBy: user.id,
        });
      } catch (refundErr) {
        console.error('CRITICAL: refund failed after airtime vendor failure; manual reconciliation required.', {
          refundErr,
          userId: user.id,
          reference,
          amount: normalizedAmount,
        });
      }
    };

    const recordAirtimeFailure = async (apiPayload: unknown, _errMsg: string) => {
      await supabase.from('airtime_transactions').insert({
        user_id: user.id,
        phone_number: sanitizedPhone,
        network: normalizedNetworkName || String(network_id ?? smeplugNetworkId ?? ''),
        service_id: normalizedServiceId,
        amount: normalizedAmount,
        balance_before: debitResult.balanceBefore,
        balance_after: debitResult.balanceBefore,
        status: 'failed',
        reference,
        api_response: apiPayload ?? { note: _errMsg },
        performed_by: user.id,
      });
    };

    let apiResponse: Record<string, unknown> | string | null = null;
    let response: Response | { ok: boolean; status?: number };
    let providerBalanceAtCall: number | null = null;

    if (isDemoUser) {
      console.log('Demo user detected - using mock API response');
      apiResponse = {
        success: true,
        status: true,
        message: 'Airtime purchase successful (Demo)',
        data: {
          status: true,
          success: true,
          reference: reference,
          phone: sanitizedPhone,
          amount: normalizedAmount,
          network: normalizedNetworkName || String(smeplugNetworkId),
        },
      };
      response = { ok: true };
    } else {
      try {
        if (SECRET_KEY) {
          const providerWallet = await fetchSmeplugWalletBalance(SECRET_KEY);
          providerBalanceAtCall = providerWallet.balance;
          console.log('SMEPLUG provider wallet balance:', providerBalanceAtCall, providerWallet.raw);
        }

        // Official SMEPlug body: { network_id, phone, amount, customer_reference }
        const buildCanonicalSmeplugBody = () => ({
          network_id: smeplugNetworkId,
          phone: sanitizedPhone,
          amount: purchaseAmount,
          customer_reference: reference,
        });

        const callSmeplugAirtime = async (requestBody: Record<string, unknown>) => {
          console.log('Calling SMEPLUG API with:', JSON.stringify(requestBody, null, 2));

          const vendorResponse = await fetch('https://smeplug.ng/api/v1/airtime/purchase', {
            method: 'POST',
            headers: {
              Authorization: `Bearer ${SECRET_KEY}`,
              'Content-Type': 'application/json',
            },
            body: JSON.stringify(requestBody),
          });

          console.log('SMEPLUG API response status:', vendorResponse.status, vendorResponse.statusText);

          const responseText = await vendorResponse.text();
          console.log('SMEPLUG API raw response:', responseText.substring(0, 500));

          let parsedResponse: Record<string, unknown> | string;
          try {
            parsedResponse = JSON.parse(responseText) as Record<string, unknown>;
          } catch {
            parsedResponse = responseText;
          }

          return { vendorResponse, parsedResponse, requestBody };
        };

        const isDuplicateReferenceError = (payload: Record<string, unknown> | string | null) => {
          const message = extractSmeplugErrorMessage(
            typeof payload === 'object' && payload !== null ? payload : null,
          )?.toLowerCase() ?? '';
          return message.includes('duplicate customer reference') || message.includes('duplicate reference');
        };

        let lastAttempt: Awaited<ReturnType<typeof callSmeplugAirtime>> | null = null;
        let vendorSucceeded = false;

        const primaryAttempt = await callSmeplugAirtime(buildCanonicalSmeplugBody());
        lastAttempt = primaryAttempt;

        const parseAttempt = (attempt: typeof primaryAttempt) => {
          const parsed =
            typeof attempt.parsedResponse === 'object' && attempt.parsedResponse !== null
              ? attempt.parsedResponse
              : null;
          const httpOk =
            attempt.vendorResponse.ok &&
            attempt.vendorResponse.status >= 200 &&
            attempt.vendorResponse.status < 300;
          return { parsed, httpOk };
        };

        let { parsed, httpOk } = parseAttempt(primaryAttempt);
        if (isSuccessfulSmeplugAirtimeResponse(parsed, httpOk)) {
          vendorSucceeded = true;
          response = primaryAttempt.vendorResponse;
          apiResponse = primaryAttempt.parsedResponse;
        } else if (isDuplicateReferenceError(parsed)) {
          const retryAttempt = await callSmeplugAirtime({
            ...buildCanonicalSmeplugBody(),
            customer_reference: buildVendorReference(),
          });
          lastAttempt = retryAttempt;
          ({ parsed, httpOk } = parseAttempt(retryAttempt));
          if (isSuccessfulSmeplugAirtimeResponse(parsed, httpOk)) {
            vendorSucceeded = true;
            response = retryAttempt.vendorResponse;
            apiResponse = retryAttempt.parsedResponse;
          }
        }

        if (!vendorSucceeded && lastAttempt) {
          response = lastAttempt.vendorResponse;
          apiResponse = lastAttempt.parsedResponse;
        }

        if (typeof apiResponse === 'string') {
          const trimmed = apiResponse.trim();
          if (trimmed.length === 0 || trimmed.startsWith('<!DOCTYPE') || trimmed.startsWith('<html')) {
            await refundWallet('invalid response from provider', 'REVK-PARSE');
            await recordAirtimeFailure({ raw: trimmed.slice(0, 2000) }, 'parse_error');
            return new Response(
              JSON.stringify({
                success: false,
                error: 'Service currently unavailable. Please try again later or contact support.',
              }),
              { status: 200, headers: { ...CORS_HEADERS, 'Content-Type': 'application/json' } },
            );
          }
        }

        console.log('SMEPLUG airtime purchase response:', JSON.stringify(apiResponse, null, 2));
      } catch (fetchError) {
        console.error('Network error calling SMEPLUG API:', fetchError);
        console.error('Error details:', {
          message: fetchError instanceof Error ? fetchError.message : String(fetchError),
          stack: fetchError instanceof Error ? fetchError.stack : undefined,
        });
        await refundWallet('network error calling provider', 'REVK-NET');
        await recordAirtimeFailure(
          { error: fetchError instanceof Error ? fetchError.message : String(fetchError) },
          'fetch_error',
        );
        return new Response(
          JSON.stringify({
            success: false,
            error: 'Service currently unavailable. Please check your connection and try again later.',
          }),
          { status: 200, headers: { ...CORS_HEADERS, 'Content-Type': 'application/json' } },
        );
      }
    }
    
    console.log('Airtime purchase API response:', JSON.stringify(apiResponse, null, 2));
    console.log('HTTP Response status:', 'status' in response ? response.status : 'N/A', 'ok:', response.ok);

    // Check HTTP status first (for real API responses)
    const httpStatusOk = response.ok && ('status' in response ? (response.status >= 200 && response.status < 300) : true);

    const parsedApiResponse =
      apiResponse && typeof apiResponse === 'object' && apiResponse !== null
        ? (apiResponse as Record<string, unknown>)
        : null;

    const purchaseSucceeded = isSuccessfulSmeplugAirtimeResponse(parsedApiResponse, httpStatusOk);

    // If HTTP status is not OK or API indicates failure
    if (!purchaseSucceeded) {
      let errorMessage = extractSmeplugErrorMessage(parsedApiResponse);

      let providerBalanceForError: number | null = providerBalanceAtCall ?? null;
      if (errorMessage && !isDemoUser && SECRET_KEY) {
        if (providerBalanceForError === null) {
          const refreshed = await fetchSmeplugWalletBalance(SECRET_KEY);
          providerBalanceForError = refreshed.balance;
        }
        errorMessage = mapAirtimePurchaseError(errorMessage, providerBalanceForError, purchaseAmount);
      }

      // If no error message found, check HTTP status
      if (!errorMessage) {
        if (!httpStatusOk && 'status' in response) {
          const statusCode = response.status;
          if (statusCode === 401) {
            errorMessage = 'Authentication failed. Please contact support.';
          } else if (statusCode === 403) {
            errorMessage = 'Access denied. Please contact support.';
          } else if (statusCode === 400 || statusCode === 406) {
            errorMessage = 'Invalid request. Please check the phone number and amount, then try again.';
          } else if (statusCode >= 500) {
            errorMessage = 'Service temporarily unavailable. Please try again later.';
          } else {
            errorMessage = `Service error (${statusCode}). Please try again later.`;
          }
        } else {
          errorMessage = 'Airtime purchase failed. Please try again.';
        }
      }
      
      // Handle string responses
      if (typeof apiResponse === 'string') {
        errorMessage = apiResponse || errorMessage;
      }
      
      // Check for phone number validation errors specifically
      const errorText = String(errorMessage).toLowerCase();
      if (errorText.includes('phone') || errorText.includes('number') || errorText.includes('invalid')) {
        console.error('SMEPLUG API phone validation error:', errorMessage, 'Phone:', sanitizedPhone, 'Network:', smeplugNetworkId);
      } else if (errorText.includes('balance') || errorText.includes('insufficient')) {
        console.error('SMEPLUG API balance error:', errorMessage);
        errorMessage = 'Insufficient balance with service provider. Please try again later or contact support.';
      } else if (errorText.includes('network') || errorText.includes('provider')) {
        console.error('SMEPLUG API network error:', errorMessage);
      } else {
        const statusCode = 'status' in response ? response.status : 'N/A';
        console.error('SMEPLUG API error:', errorMessage, 'HTTP Status:', statusCode, 'Full response:', JSON.stringify(apiResponse, null, 2));
      }

      await refundWallet('provider reported failure or non-success', 'REVK-API');
      await recordAirtimeFailure(apiResponse, String(errorMessage));

      return new Response(
        JSON.stringify({
          success: false,
          error: errorMessage,
          details: apiResponse,
          httpStatus: 'status' in response ? response.status : undefined,
          provider_balance: providerBalanceForError,
        }),
        { status: 200, headers: { ...CORS_HEADERS, 'Content-Type': 'application/json' } },
      );
    }

    const { error: insertTxnError } = await supabase.from('airtime_transactions').insert({
      user_id: user.id,
      phone_number: sanitizedPhone,
      network: normalizedNetworkName || String(network_id ?? smeplugNetworkId ?? ''),
      service_id: normalizedServiceId,
      amount: normalizedAmount,
      balance_before: debitResult.balanceBefore,
      balance_after: debitResult.balanceAfter,
      status: 'success',
      reference,
      api_response: apiResponse,
      performed_by: user.id,
    });

    if (insertTxnError) {
      // Wallet is already debited and SMEPlug already succeeded — do not refund automatically.
      console.error('CRITICAL: airtime_transactions insert failed after successful debit + vendor:', insertTxnError, {
        reference,
        userId: user.id,
      });
      return new Response(
        JSON.stringify({
          success: true,
          message: 'Airtime was purchased but receipt sync failed. Your balance was updated; please contact support with this reference if history is missing.',
          data: {
            reference,
            amount: normalizedAmount,
            phone_number: sanitizedPhone,
            network: normalizedNetworkName || String(network_id ?? smeplugNetworkId ?? ''),
            balance_before: debitResult.balanceBefore,
            balance_after: debitResult.balanceAfter,
            syncWarning: true,
          },
        }),
        { status: 200, headers: { ...CORS_HEADERS, 'Content-Type': 'application/json' } },
      );
    }

    // Send push notification
    await sendPushNotification(
      supabase,
      user.id,
      'Airtime Purchase Successful',
      `${formattedAmount} airtime purchased for ${sanitizedPhone} on ${displayNetwork}. Your new balance is ₦${debitResult.balanceAfter.toFixed(2)}.`,
      {
        type: 'airtime_purchase',
        transactionType: 'airtime_purchase',
        reference,
        amount: normalizedAmount,
        phone_number: sanitizedPhone,
        network: normalizedNetworkName || String(network_id ?? smeplugNetworkId ?? ''),
      }
    );

    return new Response(
      JSON.stringify({ 
        success: true,
        message: 'Airtime purchased successfully',
        data: {
          reference,
          amount: normalizedAmount,
          phone_number: sanitizedPhone,
          network: normalizedNetworkName || String(network_id ?? smeplugNetworkId ?? ''),
          balance_before: debitResult.balanceBefore,
          balance_after: debitResult.balanceAfter
        }
      }),
      { status: 200, headers: { ...CORS_HEADERS, 'Content-Type': 'application/json' } }
    );

  } catch (error) {
    console.error('Error in purchase-smeplug-airtime function:', error);
    
    // Provide user-friendly error messages
    let errorMessage = 'Service currently unavailable. Please try again later or contact support.';
    
    if (error instanceof Error) {
      const errorText = error.message.toLowerCase();
      if (errorText.includes('secret') || errorText.includes('key') || errorText.includes('configured')) {
        errorMessage = 'Service currently unavailable. Please contact support.';
      } else if (errorText.includes('network') || errorText.includes('fetch')) {
        errorMessage = 'Network error. Please check your connection and try again.';
      } else if (errorText.includes('unauthorized') || errorText.includes('auth')) {
        errorMessage = 'Authentication failed. Please log in again.';
      }
    }
    
    return new Response(
      JSON.stringify({ 
        success: false, 
        error: errorMessage
      }),
      { 
        status: 200, 
        headers: { ...CORS_HEADERS, 'Content-Type': 'application/json' } 
      }
    );
  }
});
