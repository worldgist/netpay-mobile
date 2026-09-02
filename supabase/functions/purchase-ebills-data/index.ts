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
import { debitUserWallet, creditUserWallet, getUserLedgerBalance } from "../_shared/wallet.ts";
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

    if (!isDemoUser && !validateEBillsPhoneForNetwork(sanitizedPhone, serviceId)) {
      return new Response(
        JSON.stringify({
          success: false,
          error: 'Network does not match the phone number. Please check the selected network.',
        }),
        { status: 200, headers: { ...CORS_HEADERS, 'Content-Type': 'application/json' } }
      );
    }

    const balanceBefore = await getUserLedgerBalance(supabase, user.id);

    const userCharged = dataPlan.custom_price ?? dataPlan.original_price ?? dataPlan.price;
    const userChargedAmount = Number(userCharged) || 0;

    if (!isDemoUser && balanceBefore < userChargedAmount) {
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

    const planName = dataPlan.plan_name || 'Data Plan';
    const networkLabel = dataPlan.network || serviceId;

    const refundWallet = async (reason: string, refSuffix: string) => {
      try {
        await creditUserWallet({
          supabase,
          userId: user.id,
          amount: userChargedAmount,
          transactionType: 'refund',
          description: `Data purchase refunded — ${reason}`,
          reference: `${requestId}-${refSuffix}`,
          performedBy: user.id,
        });
      } catch (refundError) {
        console.error('CRITICAL: eBills data refund failed; manual reconciliation required.', {
          refundError,
          userId: user.id,
          requestId,
          amount: userChargedAmount,
          reason,
        });
      }
    };

    const recordDataTransaction = async (params: {
      reference: string;
      status: string;
      balanceBeforeValue: number;
      balanceAfterValue: number;
      planLabel?: string;
      apiResponse?: unknown;
      amount?: number;
    }) => {
      const row = {
        user_id: user.id,
        phone_number: sanitizedPhone,
        network: networkLabel,
        plan_name: params.planLabel ?? planName,
        plan_validity: dataPlan.validity || 'N/A',
        amount: params.amount ?? userChargedAmount,
        balance_before: params.balanceBeforeValue,
        balance_after: params.balanceAfterValue,
        status: params.status,
        reference: params.reference,
        api_response: params.apiResponse ?? null,
        provider: 'ebills',
        vending_provider: 'ebills',
        performed_by: user.id,
      };
      const { error } = await supabase.from('data_transactions').insert(row);
      if (error && /vending_provider/i.test(error.message || '')) {
        const { vending_provider: _vendor, ...withoutVendor } = row;
        await supabase.from('data_transactions').insert(withoutVendor);
      }
    };

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

      await recordDataTransaction({
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

    let debitResult: Awaited<ReturnType<typeof debitUserWallet>>;
    try {
      debitResult = await debitUserWallet({
        supabase,
        userId: user.id,
        amount: userChargedAmount,
        transactionType: 'data_purchase',
        description: `Data purchase (pending eBills) - ${planName}`,
        reference: requestId,
        performedBy: user.id,
        balanceBefore,
      });
    } catch (debitError) {
      console.error('Debit failed before eBills data purchase:', debitError);
      return new Response(
        JSON.stringify({
          success: false,
          error: debitError instanceof Error
            ? debitError.message
            : 'Could not debit wallet for data purchase',
        }),
        { status: 200, headers: { ...CORS_HEADERS, 'Content-Type': 'application/json' } }
      );
    }

    let purchaseResult: Awaited<ReturnType<typeof purchaseEBillsData>>;
    try {
      const ebillsToken = await getEBillsToken();
      purchaseResult = await purchaseEBillsData(
        ebillsToken,
        requestId,
        sanitizedPhone,
        serviceId,
        variationId,
      );
    } catch (vendorError) {
      console.error('eBills data vendor call failed after debit:', vendorError);
      await refundWallet(
        vendorError instanceof Error ? vendorError.message : 'provider request failed',
        'VENDOR-FAIL',
      );
      await recordDataTransaction({
        reference: requestId,
        status: 'failed',
        balanceBeforeValue: debitResult.balanceBefore,
        balanceAfterValue: debitResult.balanceBefore,
        apiResponse: vendorError instanceof EBillsDataError
          ? { code: vendorError.code, message: vendorError.message }
          : { message: vendorError instanceof Error ? vendorError.message : 'Vendor failed' },
      });

      const message = vendorError instanceof EBillsDataError
        ? vendorError.message
        : vendorError instanceof Error
          ? vendorError.message
          : 'Data purchase failed';

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
      await recordDataTransaction({
        reference,
        status: isRefunded ? 'refunded' : 'failed',
        balanceBeforeValue: debitResult.balanceBefore,
        balanceAfterValue: debitResult.balanceBefore,
        planLabel: orderData.data_plan || planName,
        amount: isRefunded ? 0 : userChargedAmount,
        apiResponse: purchaseResult,
      });

      return new Response(
        JSON.stringify({
          success: false,
          error: isRefunded
            ? 'Data purchase was refunded by the provider. Your wallet has been credited back.'
            : 'Data purchase failed at the provider. Your wallet has been credited back.',
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

    await recordDataTransaction({
      reference,
      status: transactionStatus,
      balanceBeforeValue: debitResult.balanceBefore,
      balanceAfterValue: debitResult.balanceAfter,
      planLabel: orderData.data_plan || planName,
      apiResponse: purchaseResult,
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
