import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { getEBillsToken, verifyEBillsBettingCustomer, purchaseEBillsBetting, getEBillsBettingServiceId } from "../_shared/ebills-api.ts";
import { debitUserWallet, creditUserWallet, getUserLedgerBalance } from "../_shared/wallet.ts";
import { sendPushNotification } from "../_shared/push-notifications.ts";
import { beginBillPurchase, purchaseReference, queuedUserId } from "../_shared/purchase-queue.ts";

const CORS_HEADERS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, idempotency-key',
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
    const replayUserId = queuedUserId(req);
    let user: { id: string };
    if (replayUserId) {
      user = { id: replayUserId };
    } else {
      const { data: { user: authUser }, error: authError } = await supabase.auth.getUser(token);
      if (authError || !authUser) {
        return new Response(
          JSON.stringify({ success: false, error: 'Unauthorized' }),
          { status: 401, headers: { ...CORS_HEADERS, 'Content-Type': 'application/json' } }
        );
      }
      user = authUser;
    }

    // Parse request body
    let parsedBody: Record<string, unknown> = {};
    try {
      const bodyText = await req.text();
      if (bodyText && bodyText.trim().length > 0) {
        parsedBody = JSON.parse(bodyText);
      }
    } catch (error) {
      console.error('purchase-ebills-betting: unable to parse request body:', error);
      return new Response(
        JSON.stringify({ success: false, error: 'Invalid request body' }),
        { status: 400, headers: { ...CORS_HEADERS, 'Content-Type': 'application/json' } }
      );
    }

    const customer_id = parsedBody.customer_id as string;
    const betting_provider = parsedBody.betting_provider as string;
    const amount = parsedBody.amount as number;
    const request_id = parsedBody.request_id as string | undefined;

    // Validate required fields
    if (!customer_id || !betting_provider || !amount) {
      return new Response(
        JSON.stringify({ 
          success: false, 
          error: 'Missing required fields: customer_id, betting_provider, and amount are required' 
        }),
        { status: 400, headers: { ...CORS_HEADERS, 'Content-Type': 'application/json' } }
      );
    }

    // Validate amount (min ₦100, max ₦100,000)
    if (amount < 100) {
      return new Response(
        JSON.stringify({ success: false, error: 'Amount below minimum (₦100)' }),
        { status: 400, headers: { ...CORS_HEADERS, 'Content-Type': 'application/json' } }
      );
    }

    if (amount > 100000) {
      return new Response(
        JSON.stringify({ success: false, error: 'Amount above maximum (₦100,000)' }),
        { status: 400, headers: { ...CORS_HEADERS, 'Content-Type': 'application/json' } }
      );
    }

    const bettingAmount = Number(amount);
    const bettingFee = Math.round(bettingAmount * 0.1 * 100) / 100;
    const bettingBalance = await getUserLedgerBalance(supabase, user.id);
    const queuedBetting = await beginBillPurchase({
      req,
      supabase,
      userId: user.id,
      service: 'betting',
      body: parsedBody,
      amount: bettingAmount + bettingFee,
      pendingRow: {
        betting_provider,
        account_number: customer_id,
        purchase_amount: bettingAmount,
        charge_fee: bettingFee,
        balance_before: bettingBalance,
        balance_after: bettingBalance,
        vending_provider: 'ebills',
        performed_by: user.id,
      },
    });
    if (queuedBetting) return queuedBetting;

    // Get user balance
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
    const purchaseAmount = Number(amount);
    
    // Demo account IDs that work for testing
    const DEMO_ACCOUNT_IDS = ['1234567890', 'demo123', 'testaccount', '9999999999'];
    const isDemoAccount = DEMO_ACCOUNT_IDS.includes(customer_id.trim());
    
    // Calculate 10% charge fee for betting
    const CHARGE_FEE_RATE = 0.1; // 10%
    const chargeFee = Math.round(purchaseAmount * CHARGE_FEE_RATE * 100) / 100;
    const totalAmount = purchaseAmount + chargeFee;

    const balanceBefore = await getUserLedgerBalance(supabase, user.id);

    // Check balance
    if (balanceBefore < totalAmount) {
      return new Response(
        JSON.stringify({ success: false, error: 'Insufficient balance' }),
        { status: 402, headers: { ...CORS_HEADERS, 'Content-Type': 'application/json' } }
      );
    }

    // Get eBills service ID
    const serviceId = getEBillsBettingServiceId(betting_provider);
    
    // Generate unique request ID if not provided
    const requestId = request_id || `req_${Date.now()}_${user.id.substring(0, 8)}_${Math.random().toString(36).substring(7)}`;

    // Check for duplicate request_id only for recent transactions (within last 2 minutes)
    if (request_id) {
      const twoMinutesAgo = new Date(Date.now() - 2 * 60 * 1000).toISOString();
      const { data: existingTransaction } = await supabase
        .from('betting_transactions')
        .select('id, created_at')
        .eq('reference', requestId)
        .gte('created_at', twoMinutesAgo)
        .maybeSingle();

      if (existingTransaction) {
        return new Response(
          JSON.stringify({ success: false, error: 'Duplicate request detected. Please wait a moment before trying again.' }),
          { status: 409, headers: { ...CORS_HEADERS, 'Content-Type': 'application/json' } }
        );
      }
    }

    const refundWallet = async (reason: string, refSuffix: string) => {
      try {
        await creditUserWallet({
          supabase,
          userId: user.id,
          amount: totalAmount,
          transactionType: 'refund',
          description: `Betting purchase refunded — ${reason}`,
          reference: `${requestId}-${refSuffix}`,
          performedBy: user.id,
        });
      } catch (refundError) {
        console.error('CRITICAL: eBills betting refund failed; manual reconciliation required.', {
          refundError,
          userId: user.id,
          requestId,
          amount: totalAmount,
          reason,
        });
      }
    };

    const recordBettingTransaction = async (params: {
      reference: string;
      status: string;
      balanceBeforeValue: number;
      balanceAfterValue: number;
      amount?: number;
      purchaseAmountValue?: number;
      chargeFeeValue?: number;
    }) => {
      await supabase.from('betting_transactions').insert({
        user_id: user.id,
        betting_provider,
        account_number: customer_id,
        amount: params.amount ?? totalAmount,
        purchase_amount: params.purchaseAmountValue ?? purchaseAmount,
        charge_fee: params.chargeFeeValue ?? chargeFee,
        balance_before: params.balanceBeforeValue,
        balance_after: params.balanceAfterValue,
        status: params.status,
        reference: params.reference,
        vending_provider: 'ebills',
        performed_by: user.id,
      });
    };

    // For demo users or demo accounts, return mock successful response
    if (isDemoUser || isDemoAccount) {
      const reference = purchaseReference(req, parsedBody, requestId || `BET-EBILLS-${Date.now()}-${user.id.substring(0, 8)}`);

      const debitResult = await debitUserWallet({
        supabase,
        userId: user.id,
        amount: totalAmount,
        transactionType: 'betting_purchase',
        description: `Betting purchase (eBills) - ${betting_provider}`,
        reference,
        performedBy: user.id,
        balanceBefore,
        notification: {
          title: 'Betting purchase successful (Demo)',
          message: `₦${purchaseAmount} betting credits purchased via eBills. Reference: ${reference}.`,
        },
      });

      await recordBettingTransaction({
        reference,
        status: 'completed',
        balanceBeforeValue: debitResult.balanceBefore,
        balanceAfterValue: debitResult.balanceAfter,
      });

      await sendPushNotification(
        supabase,
        user.id,
        'Betting Purchase Successful (Demo)',
        `₦${purchaseAmount.toFixed(2)} betting credits purchased via eBills. Reference: ${reference}.`,
        {
          type: 'betting_purchase',
          reference,
          amount: totalAmount,
          purchase_amount: purchaseAmount,
          charge_fee: chargeFee,
          betting_provider,
          account_number: customer_id,
          status: 'completed',
        }
      );

      return new Response(
        JSON.stringify({
          success: true,
          data: {
            reference,
            betting_provider,
            account_number: customer_id,
            amount: totalAmount,
            purchase_amount: purchaseAmount,
            charge_fee: chargeFee,
            vending_provider: 'ebills',
            balance_before: debitResult.balanceBefore,
            balance_after: debitResult.balanceAfter,
            order_id: `DEMO-${Date.now()}`,
            status: 'completed-api',
          },
          message: isDemoUser 
            ? 'Betting purchase completed successfully via eBills (Demo User)' 
            : 'Betting purchase completed successfully via eBills (Demo Account)',
        }),
        { status: 200, headers: { ...CORS_HEADERS, 'Content-Type': 'application/json' } }
      );
    }

    let debitResult: Awaited<ReturnType<typeof debitUserWallet>>;
    try {
      debitResult = await debitUserWallet({
        supabase,
        userId: user.id,
        amount: totalAmount,
        transactionType: 'betting_purchase',
        description: `Betting purchase (pending eBills) - ${betting_provider}`,
        reference: requestId,
        performedBy: user.id,
        balanceBefore,
      });
    } catch (debitError) {
      console.error('Debit failed before eBills betting purchase:', debitError);
      return new Response(
        JSON.stringify({
          success: false,
          error: debitError instanceof Error
            ? debitError.message
            : 'Could not debit wallet for betting purchase',
        }),
        { status: 200, headers: { ...CORS_HEADERS, 'Content-Type': 'application/json' } }
      );
    }

    console.log('Purchasing betting credits via eBills:', {
      requestId,
      customerId: customer_id,
      serviceId,
      amount: purchaseAmount,
      betting_provider,
    });

    let customerVerification: Awaited<ReturnType<typeof verifyEBillsBettingCustomer>> | null = null;
    try {
      const ebillsToken = await getEBillsToken();
      try {
        customerVerification = await verifyEBillsBettingCustomer(
          ebillsToken,
          customer_id,
          serviceId,
        );
        console.log('Customer verified:', customerVerification.data.customer_name);
      } catch (verifyError) {
        console.warn('Customer verification failed (proceeding anyway):', verifyError);
      }

      let purchaseResult: Awaited<ReturnType<typeof purchaseEBillsBetting>>;
      try {
        purchaseResult = await purchaseEBillsBetting(
          ebillsToken,
          requestId,
          customer_id,
          serviceId,
          purchaseAmount,
        );
      } catch (vendorError) {
        console.error('eBills betting vendor call failed after debit:', vendorError);
        await refundWallet(
          vendorError instanceof Error ? vendorError.message : 'provider request failed',
          'VENDOR-FAIL',
        );
        await recordBettingTransaction({
          reference: requestId,
          status: 'failed',
          balanceBeforeValue: debitResult.balanceBefore,
          balanceAfterValue: debitResult.balanceBefore,
        });

        throw vendorError;
      }

      const reference = purchaseReference(req, parsedBody, purchaseResult.data.request_id || requestId);
      const orderId = purchaseResult.data.order_id;

      const isProcessing = purchaseResult.data.status === 'processing-api' || purchaseResult.message === 'ORDER PROCESSING';
      const isCompleted = purchaseResult.data.status === 'completed-api' || purchaseResult.message === 'ORDER COMPLETED';
      const isRefunded = purchaseResult.data.status === 'refunded' || purchaseResult.message === 'ORDER REFUNDED';

      if (isRefunded || (!isProcessing && !isCompleted)) {
        await refundWallet(
          isRefunded ? 'provider refunded order' : 'provider rejected order',
          'REF',
        );
        const failedStatus = isRefunded ? 'refunded' : 'failed';
        await recordBettingTransaction({
          reference,
          status: failedStatus,
          balanceBeforeValue: debitResult.balanceBefore,
          balanceAfterValue: debitResult.balanceBefore,
          amount: isRefunded ? 0 : totalAmount,
          purchaseAmountValue: isRefunded ? 0 : purchaseAmount,
          chargeFeeValue: isRefunded ? 0 : chargeFee,
        });

        return new Response(
          JSON.stringify({
            success: false,
            error: isRefunded
              ? 'Betting purchase was refunded by the provider. Your wallet has been credited back.'
              : 'Betting purchase failed at the provider. Your wallet has been credited back.',
            data: {
              order_id: orderId,
              reference,
              status: failedStatus,
              balance_before: debitResult.balanceBefore,
              balance_after: debitResult.balanceBefore,
            },
          }),
          { status: 200, headers: { ...CORS_HEADERS, 'Content-Type': 'application/json' } }
        );
      }

      const transactionStatus = isCompleted ? 'completed' : 'processing';

      await recordBettingTransaction({
        reference,
        status: transactionStatus,
        balanceBeforeValue: debitResult.balanceBefore,
        balanceAfterValue: debitResult.balanceAfter,
      });

      const notificationTitle = isCompleted
        ? 'Betting Purchase Successful'
        : 'Betting Purchase Processing';
      const notificationMessage = isCompleted
        ? `₦${purchaseAmount.toFixed(2)} betting credits purchased via eBills. Order ID: ${orderId}. Reference: ${reference}.`
        : `₦${purchaseAmount.toFixed(2)} betting credits purchase is being processed. Reference: ${reference}.`;

      await sendPushNotification(
        supabase,
        user.id,
        notificationTitle,
        notificationMessage,
        {
          type: 'betting_purchase',
          reference,
          order_id: orderId,
          amount: totalAmount,
          purchase_amount: purchaseAmount,
          charge_fee: chargeFee,
          betting_provider,
          account_number: customer_id,
          customer_name: purchaseResult.data.customer_name || customerVerification?.data.customer_name,
          status: transactionStatus,
          vending_provider: 'ebills',
        }
      );

      return new Response(
        JSON.stringify({
          success: true,
          data: {
            order_id: orderId,
            reference,
            betting_provider,
            account_number: customer_id,
            customer_name: purchaseResult.data.customer_name || customerVerification?.data.customer_name,
            customer_username: purchaseResult.data.customer_username,
            customer_email_address: purchaseResult.data.customer_email_address,
            customer_phone_number: purchaseResult.data.customer_phone_number,
            amount: purchaseAmount,
            purchase_amount: purchaseAmount,
            charge_fee: chargeFee,
            amount_charged: totalAmount,
            total_amount: totalAmount,
            discount: purchaseResult.data.discount,
            initial_balance: purchaseResult.data.initial_balance,
            final_balance: purchaseResult.data.final_balance,
            api_amount_charged: purchaseResult.data.amount_charged,
            status: purchaseResult.data.status,
            transaction_status: transactionStatus,
            balance_before: debitResult.balanceBefore,
            balance_after: debitResult.balanceAfter,
            vending_provider: 'ebills',
          },
          message: purchaseResult.message,
        }),
        { status: 200, headers: { ...CORS_HEADERS, 'Content-Type': 'application/json' } }
      );
    } catch (innerError) {
      if (innerError instanceof Error) {
        throw innerError;
      }
      throw new Error('Betting purchase failed');
    }
  } catch (error) {
    console.error('purchase-ebills-betting error:', error);
    
    // Handle specific eBills API errors
    if (error instanceof Error) {
      const errorMessage = error.message.toLowerCase();
      
      // 400 errors
      if (errorMessage.includes('missing_fields') || errorMessage.includes('required parameters missing')) {
        return new Response(
          JSON.stringify({ success: false, error: 'Required parameters missing. Please check your input and try again.' }),
          { status: 400, headers: { ...CORS_HEADERS, 'Content-Type': 'application/json' } }
        );
      }
      
      if (errorMessage.includes('invalid_service_id') || errorMessage.includes('invalid service id')) {
        return new Response(
          JSON.stringify({ success: false, error: 'Invalid betting provider. Please select a valid provider.' }),
          { status: 400, headers: { ...CORS_HEADERS, 'Content-Type': 'application/json' } }
        );
      }
      
      if (errorMessage.includes('below_minimum_amount') || errorMessage.includes('amount below minimum')) {
        return new Response(
          JSON.stringify({ success: false, error: 'Amount below minimum (₦100). Please enter a higher amount.' }),
          { status: 400, headers: { ...CORS_HEADERS, 'Content-Type': 'application/json' } }
        );
      }
      
      if (errorMessage.includes('above_maximum_amount') || errorMessage.includes('amount above maximum')) {
        return new Response(
          JSON.stringify({ success: false, error: 'Amount above maximum (₦100,000). Please enter a lower amount.' }),
          { status: 400, headers: { ...CORS_HEADERS, 'Content-Type': 'application/json' } }
        );
      }
      
      // 402 errors
      if (errorMessage.includes('insufficient_funds') || errorMessage.includes('insufficient wallet balance')) {
        return new Response(
          JSON.stringify({ success: false, error: 'Insufficient wallet balance' }),
          { status: 402, headers: { ...CORS_HEADERS, 'Content-Type': 'application/json' } }
        );
      }
      
      // 403 errors
      if (errorMessage.includes('rest_forbidden') || errorMessage.includes('unauthorized access')) {
        return new Response(
          JSON.stringify({ success: false, error: 'Unauthorized access. Please contact support.' }),
          { status: 403, headers: { ...CORS_HEADERS, 'Content-Type': 'application/json' } }
        );
      }
      
      // 409 errors
      if (errorMessage.includes('duplicate_request_id') || errorMessage.includes('duplicate request id')) {
        return new Response(
          JSON.stringify({ success: false, error: 'Duplicate request ID. Please try again.' }),
          { status: 409, headers: { ...CORS_HEADERS, 'Content-Type': 'application/json' } }
        );
      }
      
      if (errorMessage.includes('duplicate_order') || errorMessage.includes('duplicate order')) {
        return new Response(
          JSON.stringify({ success: false, error: 'Duplicate order detected. Please wait a few minutes before trying again.' }),
          { status: 409, headers: { ...CORS_HEADERS, 'Content-Type': 'application/json' } }
        );
      }
    }

    return new Response(
      JSON.stringify({
        success: false,
        error: error instanceof Error ? error.message : 'Unexpected error occurred',
      }),
      { status: 500, headers: { ...CORS_HEADERS, 'Content-Type': 'application/json' } }
    );
  }
});


