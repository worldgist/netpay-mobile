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
import { debitUserWallet } from "../_shared/wallet.ts";
import { sendPushNotification } from "../_shared/push-notifications.ts";

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
    const supabaseKey = Deno.env.get('SUPABASE_ANON_KEY') ?? '';
    const supabase = createClient(supabaseUrl, supabaseKey, {
      global: { headers: { Authorization: authHeader } },
    });

    const { data: { user }, error: authError } = await supabase.auth.getUser();
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

    if (!validateEBillsAirtimePhoneForNetwork(sanitizedPhone, ebillsServiceId)) {
      return new Response(
        JSON.stringify({
          success: false,
          error: 'Network does not match the phone number. Please check the selected network.',
        }),
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

    const balanceBefore = Number(profile.balance) || 0;

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

    const isDemoUser = profile.email === 'demo@netpayy.ng';

    if (isDemoUser) {
      const debitResult = await debitUserWallet({
        supabase,
        userId: user.id,
        amount: purchaseAmount,
        transactionType: 'airtime_purchase',
        description: `Airtime purchase (eBills Demo) - ${network_name || ebillsServiceId}`,
        reference: requestId,
        performedBy: user.id,
        balanceBefore,
        notification: {
          title: 'Airtime purchase successful (Demo)',
          message: `₦${purchaseAmount} airtime purchased for ${sanitizedPhone}. Reference: ${requestId}.`,
        },
      });

      await supabase.from('airtime_transactions').insert({
        user_id: user.id,
        phone_number: sanitizedPhone,
        network: network_name || ebillsServiceId,
        service_id: ebillsServiceId,
        amount: purchaseAmount,
        balance_before: debitResult.balanceBefore,
        balance_after: debitResult.balanceAfter,
        status: 'success',
        reference: requestId,
        performed_by: user.id,
      });

      return new Response(
        JSON.stringify({
          success: true,
          data: {
            reference: requestId,
            amount: purchaseAmount,
            phone_number: sanitizedPhone,
            network: network_name || ebillsServiceId,
            balance_before: debitResult.balanceBefore,
            balance_after: debitResult.balanceAfter,
            vendor: 'ebills',
          },
          message: 'Airtime purchased successfully (Demo)',
        }),
        { status: 200, headers: { ...CORS_HEADERS, 'Content-Type': 'application/json' } }
      );
    }

    const ebillsToken = await getEBillsToken();
    const purchaseResult = await purchaseEBillsAirtime(
      ebillsToken,
      requestId,
      sanitizedPhone,
      ebillsServiceId,
      purchaseAmount,
    );

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

    if (isRefunded) {
      await supabase.from('airtime_transactions').insert({
        user_id: user.id,
        phone_number: sanitizedPhone,
        network: network_name || ebillsServiceId,
        service_id: ebillsServiceId,
        amount: 0,
        balance_before: balanceBefore,
        balance_after: balanceBefore,
        status: 'refunded',
        reference,
        api_response: purchaseResult,
        performed_by: user.id,
      });

      return new Response(
        JSON.stringify({
          success: false,
          error: 'Airtime purchase was refunded by the provider. Your wallet was not charged.',
          data: {
            reference,
            order_id: orderId,
            status: 'refunded',
            api_response: orderData,
          },
        }),
        { status: 200, headers: { ...CORS_HEADERS, 'Content-Type': 'application/json' } }
      );
    }

    let transactionStatus = 'pending';
    if (isCompleted) transactionStatus = 'success';
    else if (isProcessing) transactionStatus = 'processing';

    const debitResult = await debitUserWallet({
      supabase,
      userId: user.id,
      amount: purchaseAmount,
      transactionType: 'airtime_purchase',
      description: `Airtime purchase (eBills) - ${network_name || ebillsServiceId}`,
      reference,
      performedBy: user.id,
      balanceBefore,
      notification: {
        title: isCompleted ? 'Airtime purchase successful' : 'Airtime purchase processing',
        message: `₦${purchaseAmount} airtime purchased for ${sanitizedPhone}. Reference: ${reference}.`,
      },
    });

    await supabase.from('airtime_transactions').insert({
      user_id: user.id,
      phone_number: sanitizedPhone,
      network: network_name || ebillsServiceId,
      service_id: ebillsServiceId,
      amount: purchaseAmount,
      balance_before: debitResult.balanceBefore,
      balance_after: debitResult.balanceAfter,
      status: transactionStatus,
      reference,
      api_response: purchaseResult,
      performed_by: user.id,
    });

    const notificationTitle = isCompleted
      ? 'Airtime Purchase Successful'
      : 'Airtime Purchase Processing';
    const notificationMessage = isCompleted
      ? `₦${purchaseAmount.toFixed(2)} airtime purchased for ${sanitizedPhone}. Your new balance is ₦${debitResult.balanceAfter.toFixed(2)}.`
      : `₦${purchaseAmount.toFixed(2)} airtime purchase is being processed for ${sanitizedPhone}. Reference: ${reference}.`;

    await sendPushNotification(
      supabase,
      user.id,
      notificationTitle,
      notificationMessage,
      {
        type: 'airtime_purchase',
        reference,
        order_id: orderId,
        amount: purchaseAmount,
        phone_number: sanitizedPhone,
        network: network_name || ebillsServiceId,
        status: transactionStatus,
      }
    );

    return new Response(
      JSON.stringify({
        success: true,
        data: {
          reference,
          order_id: orderId,
          amount: purchaseAmount,
          phone_number: sanitizedPhone,
          network: network_name || ebillsServiceId,
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
