import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import {
  getEBillsToken,
  getEBillsServiceId,
  purchaseEBillsCableTV,
} from "../_shared/ebills-api.ts";
import { debitUserWallet, creditUserWallet, getUserLedgerBalance } from "../_shared/wallet.ts";
import { getEbillsOrderStatus } from "../_shared/purchase-refund.ts";
import { sendPushNotification } from "../_shared/push-notifications.ts";

const CORS_HEADERS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
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

    let body: Record<string, unknown> = {};
    try {
      const bodyText = await req.text();
      if (bodyText && bodyText.trim().length > 0) {
        body = JSON.parse(bodyText);
      }
    } catch {
      return new Response(
        JSON.stringify({ success: false, error: 'Invalid request body format' }),
        { status: 400, headers: { ...CORS_HEADERS, 'Content-Type': 'application/json' } }
      );
    }

    const card_number = String(body.card_number || body.billersCode || body.smartcard_number || '').trim();
    const provider = String(body.provider || '').trim();
    const customer_name = String(body.customer_name || '').trim();
    const package_name = String(body.package_name || `${provider} Package`).trim();
    const api_code = String(body.api_code || body.variation_code || body.plan_id || '').trim();
    const parsedPrice = typeof body.price === 'string' ? parseFloat(body.price) : Number(body.price || body.amount || 0);

    if (!card_number || !provider) {
      return new Response(
        JSON.stringify({ success: false, error: 'Missing required fields: card_number and provider' }),
        { status: 400, headers: { ...CORS_HEADERS, 'Content-Type': 'application/json' } }
      );
    }

    if (!api_code) {
      return new Response(
        JSON.stringify({ success: false, error: 'Package variation ID (api_code) is required' }),
        { status: 400, headers: { ...CORS_HEADERS, 'Content-Type': 'application/json' } }
      );
    }

    if (!parsedPrice || parsedPrice <= 0 || Number.isNaN(parsedPrice)) {
      return new Response(
        JSON.stringify({ success: false, error: 'Plan price is required and must be a valid number' }),
        { status: 400, headers: { ...CORS_HEADERS, 'Content-Type': 'application/json' } }
      );
    }

    const CHARGE_FEE_RATE = 0.02;
    const purchaseAmount = parsedPrice;
    const chargeFee = purchaseAmount * CHARGE_FEE_RATE;
    const totalAmount = purchaseAmount + chargeFee;

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
    const balanceBefore = await getUserLedgerBalance(supabase, user.id);

    if (balanceBefore < totalAmount) {
      return new Response(
        JSON.stringify({ success: false, error: 'Insufficient balance' }),
        { status: 400, headers: { ...CORS_HEADERS, 'Content-Type': 'application/json' } }
      );
    }

    const reference = `CABLE-EBILLS-${Date.now()}-${user.id.substring(0, 8)}`;
    const serviceId = getEBillsServiceId(provider);

    const refundWallet = async (reason: string, refSuffix: string) => {
      try {
        await creditUserWallet({
          supabase,
          userId: user.id,
          amount: totalAmount,
          transactionType: 'refund',
          description: `Cable TV purchase refunded — ${reason}`,
          reference: `${reference}-${refSuffix}`,
          performedBy: user.id,
        });
      } catch (refundError) {
        console.error('CRITICAL: eBills cable refund failed; manual reconciliation required.', {
          refundError,
          userId: user.id,
          reference,
          amount: totalAmount,
          reason,
        });
      }
    };

    const recordCableTransaction = async (params: {
      status: string;
      balanceBeforeValue: number;
      balanceAfterValue: number;
      customerName?: string | null;
      apiResponse?: unknown;
    }) => {
      await supabase.from('cable_tv_transactions').insert({
        user_id: user.id,
        smartcard_number: card_number,
        provider,
        plan_name: package_name,
        customer_name: params.customerName ?? customer_name ?? null,
        amount: totalAmount,
        purchase_amount: purchaseAmount,
        charge_fee: chargeFee,
        balance_before: params.balanceBeforeValue,
        balance_after: params.balanceAfterValue,
        status: params.status,
        reference,
        api_response: params.apiResponse ?? null,
        performed_by: user.id,
      });
    };

    if (isDemoUser) {
      const debitResult = await debitUserWallet({
        supabase,
        userId: user.id,
        amount: totalAmount,
        transactionType: 'cable_purchase',
        description: `Cable TV purchase (eBills Demo) - ${package_name}`,
        reference,
        performedBy: user.id,
        balanceBefore,
        notification: {
          title: 'Cable TV purchase successful (Demo)',
          message: `${package_name} subscription purchased. Reference: ${reference}.`,
        },
      });

      await recordCableTransaction({
        status: 'success',
        balanceBeforeValue: debitResult.balanceBefore,
        balanceAfterValue: debitResult.balanceAfter,
      });

      return new Response(
        JSON.stringify({
          success: true,
          data: {
            reference,
            smartcard_number: card_number,
            provider,
            package_name,
            amount: totalAmount,
            purchase_amount: purchaseAmount,
            charge_fee: chargeFee,
            vendor: 'ebills',
            balance_before: debitResult.balanceBefore,
            balance_after: debitResult.balanceAfter,
          },
          message: 'Cable TV subscription purchased successfully (Demo)',
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
        transactionType: 'cable_purchase',
        description: `Cable TV purchase (pending eBills) - ${package_name}`,
        reference,
        performedBy: user.id,
        balanceBefore,
      });
    } catch (debitError) {
      console.error('Debit failed before eBills cable purchase:', debitError);
      return new Response(
        JSON.stringify({
          success: false,
          error: debitError instanceof Error
            ? debitError.message
            : 'Could not debit wallet for cable purchase',
        }),
        { status: 200, headers: { ...CORS_HEADERS, 'Content-Type': 'application/json' } }
      );
    }

    let purchaseResult: Awaited<ReturnType<typeof purchaseEBillsCableTV>>;
    try {
      const ebillsToken = await getEBillsToken();
      purchaseResult = await purchaseEBillsCableTV(
        ebillsToken,
        card_number,
        serviceId,
        api_code,
        purchaseAmount,
      );
    } catch (vendorError) {
      console.error('eBills cable vendor call failed after debit:', vendorError);
      await refundWallet(
        vendorError instanceof Error ? vendorError.message : 'provider request failed',
        'VENDOR-FAIL',
      );
      await recordCableTransaction({
        status: 'failed',
        balanceBeforeValue: debitResult.balanceBefore,
        balanceAfterValue: debitResult.balanceBefore,
        apiResponse: {
          message: vendorError instanceof Error ? vendorError.message : 'Vendor failed',
        },
      });

      return new Response(
        JSON.stringify({
          success: false,
          error: vendorError instanceof Error ? vendorError.message : 'Cable TV purchase failed',
        }),
        { status: 200, headers: { ...CORS_HEADERS, 'Content-Type': 'application/json' } }
      );
    }

    const resolvedCustomerName = customer_name || purchaseResult.data?.customer_name || null;
    const orderStatus = getEbillsOrderStatus(purchaseResult);

    if (orderStatus.shouldRefund) {
      await refundWallet(
        orderStatus.isRefunded ? "provider refunded order" : "provider rejected order",
        "REF",
      );
      await recordCableTransaction({
        status: orderStatus.isRefunded ? "refunded" : "failed",
        balanceBeforeValue: debitResult.balanceBefore,
        balanceAfterValue: debitResult.balanceBefore,
        customerName: resolvedCustomerName,
        apiResponse: purchaseResult,
      });

      return new Response(
        JSON.stringify({
          success: false,
          error: orderStatus.isRefunded
            ? "Cable TV purchase was refunded by the provider. Your wallet has been credited back."
            : "Cable TV purchase failed at the provider. Your wallet has been credited back.",
          data: {
            reference,
            status: orderStatus.isRefunded ? "refunded" : "failed",
            balance_before: debitResult.balanceBefore,
            balance_after: debitResult.balanceBefore,
          },
        }),
        { status: 200, headers: { ...CORS_HEADERS, "Content-Type": "application/json" } },
      );
    }

    const transactionStatus = orderStatus.isCompleted ? "success" : "processing";

    await recordCableTransaction({
      status: transactionStatus,
      balanceBeforeValue: debitResult.balanceBefore,
      balanceAfterValue: debitResult.balanceAfter,
      customerName: resolvedCustomerName,
      apiResponse: purchaseResult,
    });

    await sendPushNotification(
      supabase,
      user.id,
      'Cable TV Subscription Successful',
      `₦${totalAmount.toFixed(2)} ${package_name} subscription successful for ${provider} (Card: ${card_number}). Your new balance is ₦${debitResult.balanceAfter.toFixed(2)}.`,
      {
        type: 'cable_tv_subscription',
        reference,
        amount: totalAmount,
        provider,
        package_name,
        card_number,
      }
    );

    return new Response(
      JSON.stringify({
        success: true,
        data: {
          reference,
          amount: totalAmount,
          purchase_amount: purchaseAmount,
          charge_fee: chargeFee,
          balance_before: debitResult.balanceBefore,
          balance_after: debitResult.balanceAfter,
          provider,
          package: package_name,
          card_number,
          customer_name: resolvedCustomerName,
          status: transactionStatus,
          vendor: 'ebills',
          api_response: purchaseResult.data,
        },
      }),
      { status: 200, headers: { ...CORS_HEADERS, 'Content-Type': 'application/json' } }
    );
  } catch (error) {
    console.error('purchase-ebills-cable error:', error);
    return new Response(
      JSON.stringify({
        success: false,
        error: error instanceof Error ? error.message : 'Cable TV purchase failed',
      }),
      { status: 500, headers: { ...CORS_HEADERS, 'Content-Type': 'application/json' } }
    );
  }
});
