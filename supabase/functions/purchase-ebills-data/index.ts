import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import {
  getEBillsToken,
  getEBillsMobileNetworkServiceId,
  purchaseEBillsData,
  validateEBillsPhoneForNetwork,
  isValidEBillsDataServiceId,
  generateEBillsRequestId,
  EBillsDataError,
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
    const plan_id = parsedBody.plan_id as string;
    const client_request_id = parsedBody.request_id ? String(parsedBody.request_id).trim() : '';

    const sanitizedPhone = normalizePhone(phone_number);
    if (!sanitizedPhone || !/^0\d{10}$/.test(sanitizedPhone)) {
      return new Response(
        JSON.stringify({
          success: false,
          error: 'Please enter a valid phone number (e.g. 08012345678 or +2348012345678)',
        }),
        { status: 200, headers: { ...CORS_HEADERS, 'Content-Type': 'application/json' } }
      );
    }

    if (!plan_id) {
      return new Response(
        JSON.stringify({ success: false, error: 'phone_number and plan_id are required' }),
        { status: 200, headers: { ...CORS_HEADERS, 'Content-Type': 'application/json' } }
      );
    }

    const { data: dataPlan, error: planError } = await supabase
      .from('data_plans')
      .select('*')
      .eq('id', plan_id)
      .single();

    if (planError || !dataPlan) {
      return new Response(
        JSON.stringify({ success: false, error: 'Data plan not found' }),
        { status: 404, headers: { ...CORS_HEADERS, 'Content-Type': 'application/json' } }
      );
    }

    const serviceId = getEBillsMobileNetworkServiceId(dataPlan.network || '');
    const variationId = String(dataPlan.api_code || '').trim();

    if (!serviceId || !isValidEBillsDataServiceId(serviceId)) {
      return new Response(
        JSON.stringify({ success: false, error: 'Unable to determine valid eBills network for this data plan' }),
        { status: 200, headers: { ...CORS_HEADERS, 'Content-Type': 'application/json' } }
      );
    }

    if (!variationId) {
      return new Response(
        JSON.stringify({
          success: false,
          error: 'Data plan is missing eBills variation ID. Re-import plans from eBills Africa.',
        }),
        { status: 200, headers: { ...CORS_HEADERS, 'Content-Type': 'application/json' } }
      );
    }

    if (!validateEBillsPhoneForNetwork(sanitizedPhone, serviceId)) {
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
        JSON.stringify({ success: false, error: 'Failed to fetch user profile' }),
        { status: 500, headers: { ...CORS_HEADERS, 'Content-Type': 'application/json' } }
      );
    }

    const userCharged = dataPlan.custom_price ?? dataPlan.original_price ?? dataPlan.price;
    const userChargedAmount = Number(userCharged) || 0;
    const balanceBefore = Number(profile.balance) || 0;

    if (balanceBefore < userChargedAmount) {
      return new Response(
        JSON.stringify({ success: false, error: 'Insufficient balance' }),
        { status: 200, headers: { ...CORS_HEADERS, 'Content-Type': 'application/json' } }
      );
    }

    const requestId = client_request_id && client_request_id.length <= 50
      ? client_request_id
      : generateEBillsRequestId(user.id);

    const twoMinutesAgo = new Date(Date.now() - 2 * 60 * 1000).toISOString();
    const { data: existingTransaction } = await supabase
      .from('data_transactions')
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

    const isDemoUser = profile.email === 'demo@netppay.com';
    const planName = dataPlan.plan_name || 'Data Plan';

    if (isDemoUser) {
      const debitResult = await debitUserWallet({
        supabase,
        userId: user.id,
        amount: userChargedAmount,
        transactionType: 'data_purchase',
        description: `Data purchase (eBills Demo) - ${planName}`,
        reference: requestId,
        performedBy: user.id,
        balanceBefore,
        notification: {
          title: 'Data purchase successful (Demo)',
          message: `${planName} purchased for ${sanitizedPhone}. Reference: ${requestId}.`,
        },
      });

      await supabase.from('data_transactions').insert({
        user_id: user.id,
        phone_number: sanitizedPhone,
        network: dataPlan.network || serviceId,
        plan_name: planName,
        plan_validity: dataPlan.validity || 'N/A',
        amount: userChargedAmount,
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
            phone_number: sanitizedPhone,
            plan_name: planName,
            amount: userChargedAmount,
            vendor: 'ebills',
            balance_before: debitResult.balanceBefore,
            balance_after: debitResult.balanceAfter,
          },
          message: 'Data purchased successfully (Demo)',
        }),
        { status: 200, headers: { ...CORS_HEADERS, 'Content-Type': 'application/json' } }
      );
    }

    console.log('Purchasing eBills data:', {
      requestId,
      serviceId,
      variationId,
      phone: sanitizedPhone,
      planName,
    });

    const ebillsToken = await getEBillsToken();
    const purchaseResult = await purchaseEBillsData(
      ebillsToken,
      requestId,
      sanitizedPhone,
      serviceId,
      variationId,
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
      await supabase.from('data_transactions').insert({
        user_id: user.id,
        phone_number: sanitizedPhone,
        network: dataPlan.network || serviceId,
        plan_name: planName,
        plan_validity: dataPlan.validity || 'N/A',
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
          error: 'Data purchase was refunded by the provider. Your wallet was not charged.',
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
      amount: userChargedAmount,
      transactionType: 'data_purchase',
      description: `Data purchase (eBills) - ${planName}`,
      reference,
      performedBy: user.id,
      balanceBefore,
      notification: {
        title: isCompleted ? 'Data purchase successful' : 'Data purchase processing',
        message: `${planName} purchased for ${sanitizedPhone}. Reference: ${reference}.`,
      },
    });

    await supabase.from('data_transactions').insert({
      user_id: user.id,
      phone_number: sanitizedPhone,
      network: dataPlan.network || serviceId,
      plan_name: orderData.data_plan || planName,
      plan_validity: dataPlan.validity || 'N/A',
      amount: userChargedAmount,
      balance_before: debitResult.balanceBefore,
      balance_after: debitResult.balanceAfter,
      status: transactionStatus,
      reference,
      api_response: purchaseResult,
      performed_by: user.id,
    });

    const notificationTitle = isCompleted ? 'Data Purchase Successful' : 'Data Purchase Processing';
    const notificationMessage = isCompleted
      ? `${planName} purchased for ${sanitizedPhone}. Your new balance is ₦${debitResult.balanceAfter.toFixed(2)}.`
      : `${planName} purchase is being processed for ${sanitizedPhone}. Reference: ${reference}.`;

    await sendPushNotification(
      supabase,
      user.id,
      notificationTitle,
      notificationMessage,
      {
        type: 'data_purchase',
        reference,
        order_id: orderId,
        amount: userChargedAmount,
        phone_number: sanitizedPhone,
        plan_name: planName,
        status: transactionStatus,
      }
    );

    return new Response(
      JSON.stringify({
        success: true,
        data: {
          reference,
          order_id: orderId,
          phone_number: sanitizedPhone,
          plan_name: orderData.data_plan || planName,
          amount: userChargedAmount,
          vendor: 'ebills',
          status: transactionStatus,
          balance_before: debitResult.balanceBefore,
          balance_after: debitResult.balanceAfter,
          api_response: orderData,
        },
        message: isCompleted
          ? (purchaseResult.message || 'Data purchased successfully')
          : 'Data purchase is being processed',
      }),
      { status: 200, headers: { ...CORS_HEADERS, 'Content-Type': 'application/json' } }
    );
  } catch (error) {
    console.error('purchase-ebills-data error:', error);
    const message = error instanceof EBillsDataError
      ? error.message
      : error instanceof Error
        ? error.message
        : 'Data purchase failed';

    return new Response(
      JSON.stringify({ success: false, error: message }),
      { status: 200, headers: { ...CORS_HEADERS, 'Content-Type': 'application/json' } }
    );
  }
});
