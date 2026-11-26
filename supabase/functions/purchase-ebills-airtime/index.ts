import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import {
  getEBillsToken,
  purchaseEBillsAirtime,
  resolveEBillsAirtimeServiceId,
  validateEBillsAirtimePhoneForNetwork,
  getEBillsAirtimeMinAmount,
  EBILLS_AIRTIME_MAX_AMOUNT,
  generateEBillsAirtimeRequestId,
  EBillsAirtimeError,
} from "../_shared/ebills-api.ts";
import { debitUserWallet, creditUserWallet, getUserLedgerBalance } from "../_shared/wallet.ts";

const CORS_HEADERS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

const normalizePhone = (value: unknown): string => {
  if (typeof value !== 'string') return '';
  let normalized = value.trim().replace(/\s+/g, '');
  if (normalized.startsWith('+234')) normalized = `0${normalized.slice(4)}`;
  else if (normalized.startsWith('234') && normalized.length === 13) normalized = `0${normalized.slice(3)}`;
  normalized = normalized.replace(/[^0-9]/g, '');
  if (/^[789]\d{9}$/.test(normalized)) normalized = `0${normalized}`;
  return normalized;
};

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: CORS_HEADERS });
  }

  try {
    const authHeader = req.headers.get('Authorization');
    if (!authHeader) {
      return new Response(
        JSON.stringify({ success: false, error: 'Missing authorization header' }),
        { status: 401, headers: { ...CORS_HEADERS, 'Content-Type': 'application/json' } }
      );
    }

    const supabaseUrl = Deno.env.get('SUPABASE_URL') ?? '';
    const supabaseKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '';
    const supabase = createClient(supabaseUrl, supabaseKey);

    const token = authHeader.replace('Bearer ', '');
    const { data: { user }, error: authError } = await supabase.auth.getUser(token);
    if (authError || !user) {
      return new Response(
        JSON.stringify({ success: false, error: 'Unauthorized' }),
        { status: 401, headers: { ...CORS_HEADERS, 'Content-Type': 'application/json' } }
      );
    }

    let parsedBody: Record<string, unknown> = {};
    try {
      const bodyText = await req.text();
      if (bodyText && bodyText.trim().length > 0) {
        parsedBody = JSON.parse(bodyText);
      }
    } catch {
      return new Response(
        JSON.stringify({ success: false, error: 'Invalid request body' }),
        { status: 400, headers: { ...CORS_HEADERS, 'Content-Type': 'application/json' } }
      );
    }

    const phone_number = parsedBody.phone_number as string;
    const amount = Number(parsedBody.amount);
    const network_name = String(parsedBody.network_name || parsedBody.network || '').trim();
    const service_id = String(parsedBody.service_id || parsedBody.api_code || '').trim();
    const client_request_id = parsedBody.request_id ? String(parsedBody.request_id).trim() : '';

    const sanitizedPhone = normalizePhone(phone_number);
    if (!sanitizedPhone || !/^0\d{10}$/.test(sanitizedPhone)) {
      return new Response(
        JSON.stringify({ success: false, error: 'Please enter a valid phone number (e.g. 08012345678 or +2348012345678)' }),
        { status: 200, headers: { ...CORS_HEADERS, 'Content-Type': 'application/json' } }
      );
    }

    if (!Number.isFinite(amount) || amount <= 0) {
      return new Response(
        JSON.stringify({ success: false, error: 'A valid amount is required' }),
        { status: 200, headers: { ...CORS_HEADERS, 'Content-Type': 'application/json' } }
      );
    }

    const ebillsServiceId = resolveEBillsAirtimeServiceId(service_id, network_name);
    if (!ebillsServiceId) {
      return new Response(
        JSON.stringify({ success: false, error: 'Unable to determine network for eBills airtime purchase' }),
        { status: 200, headers: { ...CORS_HEADERS, 'Content-Type': 'application/json' } }
      );
    }

    const purchaseAmount = Math.round(amount);
    const minAmount = getEBillsAirtimeMinAmount(ebillsServiceId);

    if (purchaseAmount < minAmount) {
      return new Response(
        JSON.stringify({
          success: false,
          error: `Minimum airtime amount is ₦${minAmount} for ${ebillsServiceId.toUpperCase()}.`,
        }),
        { status: 200, headers: { ...CORS_HEADERS, 'Content-Type': 'application/json' } }
      );
    }

    if (purchaseAmount > EBILLS_AIRTIME_MAX_AMOUNT) {
      return new Response(
        JSON.stringify({ success: false, error: 'Maximum airtime amount is ₦50,000.' }),
        { status: 200, headers: { ...CORS_HEADERS, 'Content-Type': 'application/json' } }
      );
    }

    const { data: profile, error: profileError } = await supabase
      .from('profiles')
      .select('balance, email')
      .eq('id', user.id)
      .single();

    if (profileError || !profile) {
      return new Response(
        JSON.stringify({ success: false, error: 'User profile not found' }),
        { status: 404, headers: { ...CORS_HEADERS, 'Content-Type': 'application/json' } }
      );
    }

    const isDemoUser = profile.email === 'demo@netppay.com';

    if (!isDemoUser && !validateEBillsAirtimePhoneForNetwork(sanitizedPhone, ebillsServiceId)) {
      return new Response(
        JSON.stringify({
          success: false,
          error: 'Network does not match the phone number. Please check the selected network.',
        }),
        { status: 200, headers: { ...CORS_HEADERS, 'Content-Type': 'application/json' } }
      );
    }

    const balanceBefore = await getUserLedgerBalance(supabase, user.id);

    if (balanceBefore < purchaseAmount) {
      return new Response(
        JSON.stringify({ success: false, error: 'Insufficient balance' }),
        { status: 200, headers: { ...CORS_HEADERS, 'Content-Type': 'application/json' } }
      );
    }

    const requestId = client_request_id && client_request_id.length <= 50
      ? client_request_id
      : generateEBillsAirtimeRequestId(user.id);

    const twoMinutesAgo = new Date(Date.now() - 2 * 60 * 1000).toISOString();
    const { data: existingTransaction } = await supabase
      .from('airtime_transactions')
      .select('id')
      .eq('reference', requestId)
      .gte('created_at', twoMinutesAgo)
      .maybeSingle();

    if (existingTransaction) {
      return new Response(
        JSON.stringify({
          success: false,
          error: 'Duplicate request detected. Please wait a moment and try again.',
        }),
        { status: 200, headers: { ...CORS_HEADERS, 'Content-Type': 'application/json' } }
      );
    }

    const displayNetwork = network_name || ebillsServiceId;

    const refundWallet = async (reason: string, refSuffix: string) => {
      try {
        await creditUserWallet({
          supabase,
          userId: user.id,
          amount: purchaseAmount,
          transactionType: 'refund',
          description: `Airtime purchase refunded — ${reason}`,
          reference: `${requestId}-${refSuffix}`,
          performedBy: user.id,
        });
      } catch (refundError) {
        console.error('CRITICAL: eBills airtime refund failed; manual reconciliation required.', {
          refundError,
          userId: user.id,
          requestId,
          amount: purchaseAmount,
          reason,
        });
      }
    };

    const recordAirtimeTransaction = async (params: {
      reference: string;
      status: string;
      balanceBeforeValue: number;
      balanceAfterValue: number;
      apiResponse?: unknown;
      amount?: number;
    }) => {
      const row = {
        user_id: user.id,
        phone_number: sanitizedPhone,
        network: displayNetwork,
        service_id: ebillsServiceId,
        amount: params.amount ?? purchaseAmount,
        balance_before: params.balanceBeforeValue,
        balance_after: params.balanceAfterValue,
        status: params.status,
        reference: params.reference,
        api_response: params.apiResponse ?? null,
        vending_provider: 'ebills',
        performed_by: user.id,
      };
      const { error } = await supabase.from('airtime_transactions').insert(row);
      if (error && /vending_provider/i.test(error.message || '')) {
        const { vending_provider: _vendor, ...withoutVendor } = row;
        await supabase.from('airtime_transactions').insert(withoutVendor);
      }
    };

    if (isDemoUser) {
      const debitResult = await debitUserWallet({
        supabase,
        userId: user.id,
        amount: purchaseAmount,
        transactionType: 'airtime_purchase',
        description: `Airtime purchase (eBills Demo) - ${displayNetwork}`,
        reference: requestId,
        performedBy: user.id,
        balanceBefore,
      });

      await recordAirtimeTransaction({
        reference: requestId,
        status: 'success',
        balanceBeforeValue: debitResult.balanceBefore,
        balanceAfterValue: debitResult.balanceAfter,
      });

      return new Response(
        JSON.stringify({
          success: true,
          data: {
            reference: requestId,
            amount: purchaseAmount,
            phone_number: sanitizedPhone,
            network: displayNetwork,
            balance_before: debitResult.balanceBefore,
            balance_after: debitResult.balanceAfter,
            vendor: 'ebills',
          },
          message: 'Airtime purchased successfully (Demo)',
        }),
        { status: 200, headers: { ...CORS_HEADERS, 'Content-Type': 'application/json' } }
      );
    }

    // Debit wallet BEFORE calling eBills so vendor success never leaves the user uncharged.
    let debitResult: Awaited<ReturnType<typeof debitUserWallet>>;
    try {
      debitResult = await debitUserWallet({
        supabase,
        userId: user.id,
        amount: purchaseAmount,
        transactionType: 'airtime_purchase',
        description: `Airtime purchase (pending eBills) - ${displayNetwork}`,
        reference: requestId,
        performedBy: user.id,
        balanceBefore,
      });
    } catch (debitError) {
      console.error('Debit failed before eBills airtime purchase:', debitError);
      return new Response(
        JSON.stringify({
          success: false,
          error: debitError instanceof Error
            ? debitError.message
            : 'Could not debit wallet for airtime purchase',
        }),
        { status: 200, headers: { ...CORS_HEADERS, 'Content-Type': 'application/json' } }
      );
    }

    let purchaseResult: Awaited<ReturnType<typeof purchaseEBillsAirtime>>;
    try {
      const ebillsToken = await getEBillsToken();
      purchaseResult = await purchaseEBillsAirtime(
        ebillsToken,
        requestId,
        sanitizedPhone,
        ebillsServiceId,
        purchaseAmount,
      );
    } catch (vendorError) {
      console.error('eBills airtime vendor call failed after debit:', vendorError);
      await refundWallet(
        vendorError instanceof Error ? vendorError.message : 'provider request failed',
        'VENDOR-FAIL',
      );
      await recordAirtimeTransaction({
        reference: requestId,
        status: 'failed',
        balanceBeforeValue: debitResult.balanceBefore,
        balanceAfterValue: debitResult.balanceBefore,
        apiResponse: vendorError instanceof EBillsAirtimeError
          ? { code: vendorError.code, message: vendorError.message }
          : { message: vendorError instanceof Error ? vendorError.message : 'Vendor failed' },
      });

      const message = vendorError instanceof EBillsAirtimeError
        ? vendorError.message
        : vendorError instanceof Error
          ? vendorError.message
          : 'Airtime purchase failed';

      return new Response(
        JSON.stringify({ success: false, error: message }),
        { status: 200, headers: { ...CORS_HEADERS, 'Content-Type': 'application/json' } }
      );
    }

    const orderData = purchaseResult.data || {};
    const reference = String(orderData.request_id || requestId);
    const orderId = orderData.order_id;

    const isProcessing =
      orderData.status === 'processing-api' ||
      purchaseResult.message === 'ORDER PROCESSING';
    const isCompleted =
      orderData.status === 'completed-api' ||
      purchaseResult.message === 'ORDER COMPLETED';
    const isRefunded =
      orderData.status === 'refunded' ||
      purchaseResult.message === 'ORDER REFUNDED';

    if (isRefunded || (!isProcessing && !isCompleted)) {
      await refundWallet(
        isRefunded ? 'provider refunded order' : 'provider rejected order',
        'REF',
      );
      await recordAirtimeTransaction({
        reference,
        status: isRefunded ? 'refunded' : 'failed',
        balanceBeforeValue: debitResult.balanceBefore,
        balanceAfterValue: debitResult.balanceBefore,
        amount: isRefunded ? 0 : purchaseAmount,
        apiResponse: purchaseResult,
      });

      return new Response(
        JSON.stringify({
          success: false,
          error: isRefunded
            ? 'Airtime purchase was refunded by the provider. Your wallet has been credited back.'
            : 'Airtime purchase failed at the provider. Your wallet has been credited back.',
          data: {
            reference,
            order_id: orderId,
            status: isRefunded ? 'refunded' : 'failed',
            api_response: orderData,
            balance_before: debitResult.balanceBefore,
            balance_after: debitResult.balanceBefore,
          },
        }),
        { status: 200, headers: { ...CORS_HEADERS, 'Content-Type': 'application/json' } }
      );
    }

    const transactionStatus = isCompleted ? 'success' : 'processing';

    await recordAirtimeTransaction({
      reference,
      status: transactionStatus,
      balanceBeforeValue: debitResult.balanceBefore,
      balanceAfterValue: debitResult.balanceAfter,
      apiResponse: purchaseResult,
    });

    // Push is sent once from the mobile payment-success screen ("Purchase Successful").

    return new Response(
      JSON.stringify({
        success: true,
        data: {
          reference,
          order_id: orderId,
          amount: purchaseAmount,
          phone_number: sanitizedPhone,
          network: displayNetwork,
          balance_before: debitResult.balanceBefore,
          balance_after: debitResult.balanceAfter,
          vendor: 'ebills',
          status: transactionStatus,
          api_response: orderData,
        },
        message: isCompleted
          ? (purchaseResult.message || 'Airtime purchased successfully')
          : 'Airtime purchase is being processed',
      }),
      { status: 200, headers: { ...CORS_HEADERS, 'Content-Type': 'application/json' } }
    );
  } catch (error) {
    console.error('purchase-ebills-airtime error:', error);
    const message = error instanceof EBillsAirtimeError
      ? error.message
      : error instanceof Error
        ? error.message
        : 'Airtime purchase failed';

    return new Response(
      JSON.stringify({ success: false, error: message }),
      { status: 200, headers: { ...CORS_HEADERS, 'Content-Type': 'application/json' } }
    );
  }
});
