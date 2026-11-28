import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { debitUserWallet, creditUserWallet } from "../_shared/wallet.ts";
import { getEbillsOrderStatus } from "../_shared/purchase-refund.ts";
import { sendPushNotification } from "../_shared/push-notifications.ts";
import { sendElectricityReceiptEmail } from "../_shared/electricity-receipt-email.ts";
import {
  localPurchaseRequest,
  purchaseReference,
  queuedUserId,
} from "../_shared/purchase-queue.ts";
import { runAfterResponse } from "../_shared/run-after-response.ts";
import { handlePurchase as purchaseMobilenigElectricity } from "../purchase-mobilenig-electricity/handler.ts";
import { handlePurchase as purchaseFlutterwaveElectricity } from "../purchase-flutterwave-electricity/handler.ts";
import { handlePurchase as purchasePlustiveElectricity } from "../purchase-plustive-electricity/handler.ts";

const CORS_HEADERS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, idempotency-key',
};

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: CORS_HEADERS });
  }

  try {
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    // Get authenticated user
    const authHeader = req.headers.get('Authorization');
    if (!authHeader) {
      return new Response(
        JSON.stringify({ success: false, error: 'Unauthorized - Please sign in to continue' }),
        { status: 401, headers: { ...CORS_HEADERS, 'Content-Type': 'application/json' } }
      );
    }

    const token = authHeader.startsWith('Bearer ') 
      ? authHeader.substring(7).trim() 
      : authHeader.trim();
    
    const replayUserId = queuedUserId(req);
    let user: { id: string };
    if (replayUserId) {
      user = { id: replayUserId };
    } else {
      const { data: { user: authUser }, error: authError } = await supabase.auth.getUser(token);
      if (authError || !authUser) {
        return new Response(
          JSON.stringify({ success: false, error: 'Unauthorized - Please sign in to continue' }),
          { status: 401, headers: { ...CORS_HEADERS, 'Content-Type': 'application/json' } }
        );
      }
      user = authUser;
    }

    // Parse request body
    let body: any = {};
    try {
      const bodyText = await req.text();
      if (bodyText && bodyText.trim().length > 0) {
        body = JSON.parse(bodyText);
      }
    } catch (parseError) {
      return new Response(
        JSON.stringify({ success: false, error: 'Invalid request body format' }),
        { status: 400, headers: { ...CORS_HEADERS, 'Content-Type': 'application/json' } }
      );
    }

    const { 
      meter_number, 
      provider, 
      meter_type, 
      amount, 
      customer_name, 
      customer_address,
      minimum_vend 
    } = body;

    if (!meter_number || !provider || !meter_type || !amount) {
      return new Response(
        JSON.stringify({ success: false, error: 'Missing required fields: meter_number, provider, meter_type, and amount' }),
        { status: 400, headers: { ...CORS_HEADERS, 'Content-Type': 'application/json' } }
      );
    }

    const { fetchVendingProvider, normalizeVendingProvider } = await import("../_shared/vending-settings.ts");
    const configuredProvider = await fetchVendingProvider(supabase, "electricity_provider");

    // Normalize provider name to handle variations (ebill -> ebills, ebills.africa -> ebills, etc.)
    const normalizeProvider = (provider: string): string => {
      const shared = normalizeVendingProvider(provider);
      if (shared) return shared;
      const normalized = provider.toLowerCase().trim();
      
      // Handle eBills variations
      if (normalized === 'ebill' || normalized === 'ebills' || normalized === 'ebills.africa') {
        return 'ebills';
      }
      
      // Handle MobileNig variations
      if (normalized === 'mobilenig' || normalized === 'mobile-nig' || normalized === 'mobile_nig') {
        return 'mobilenig';
      }
      
      // Handle VTpass variations
      if (normalized === 'vtpass' || normalized === 'vt-pass' || normalized === 'vt_pass') {
        return 'vtpass';
      }
      
      // Handle SMEPLUG variations
      if (normalized === 'smeplug' || normalized === 'sme-plug' || normalized === 'sme_plug') {
        return 'smeplug';
      }
      
      // Handle Flutterwave variations
      if (normalized === 'flutterwave' || normalized === 'flutter-wave' || normalized === 'flw') {
        return 'flutterwave';
      }

      // Handle Plustive variations
      if (
        normalized === 'plustive' ||
        normalized === 'plustiveimpact' ||
        normalized === 'plustive-impact' ||
        normalized === 'plustive_impact'
      ) {
        return 'plustive';
      }
      
      // Return as-is if no normalization needed
      return normalized;
    };

    const vendingProvider = normalizeProvider(configuredProvider);
    
    console.log('Electricity vending provider (from admin settings):', configuredProvider, '-> normalized to:', vendingProvider, 'for electricity provider:', provider);

    // If using MobileNig, route to MobileNig handler
    if (vendingProvider === 'mobilenig') {
      try {
        const mobilenigResponse = await purchaseMobilenigElectricity(localPurchaseRequest(req, authHeader, {
            meter_number,
            provider,
            meter_type,
            amount,
            customer_name,
            customer_address,
            minimum_vend,
          }, body));

        const mobilenigResult = await mobilenigResponse.json();
        return new Response(
          JSON.stringify(mobilenigResult),
          { 
            status: mobilenigResponse.status, 
            headers: { ...CORS_HEADERS, 'Content-Type': 'application/json' } 
          }
        );
      } catch (mobilenigError) {
        console.error('Error forwarding to MobileNig function:', mobilenigError);
        return new Response(
          JSON.stringify({ 
            success: false, 
            error: 'Failed to process MobileNig electricity purchase. Please try again.' 
          }),
          { status: 500, headers: { ...CORS_HEADERS, 'Content-Type': 'application/json' } }
        );
      }
    }

    // If using eBills, handle eBills purchase
    if (vendingProvider === 'ebills') {
      try {
        // Import eBills functions
        const { getEBillsToken, getEBillsElectricityServiceId, purchaseEBillsElectricity, EBILLS_ELECTRICITY_MAX_AMOUNT, normalizeEBillsElectricityVariationId, generateEBillsRequestId } = await import('../_shared/ebills-api.ts');

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
        const basePrice = Number(amount);
        const minPurchaseAmount = Number(minimum_vend) || 100;

        if (basePrice < minPurchaseAmount) {
          return new Response(
            JSON.stringify({
              success: false,
              error: `Amount below minimum purchase (₦${minPurchaseAmount.toLocaleString()})`,
            }),
            { status: 400, headers: { ...CORS_HEADERS, 'Content-Type': 'application/json' } },
          );
        }

        if (basePrice > EBILLS_ELECTRICITY_MAX_AMOUNT) {
          return new Response(
            JSON.stringify({
              success: false,
              error: `Amount above maximum (₦${EBILLS_ELECTRICITY_MAX_AMOUNT.toLocaleString()})`,
            }),
            { status: 400, headers: { ...CORS_HEADERS, 'Content-Type': 'application/json' } },
          );
        }

        let normalizedMeterType: 'prepaid' | 'postpaid';
        try {
          normalizedMeterType = normalizeEBillsElectricityVariationId(String(meter_type));
        } catch {
          return new Response(
            JSON.stringify({ success: false, error: 'Invalid meter type. Use prepaid or postpaid.' }),
            { status: 400, headers: { ...CORS_HEADERS, 'Content-Type': 'application/json' } },
          );
        }
        
        // Calculate 2% charge fee
        const CHARGE_FEE_RATE = 0.02; // 2%
        const purchaseAmount = basePrice;
        const chargeFee = purchaseAmount * CHARGE_FEE_RATE;
        const totalAmount = purchaseAmount + chargeFee;

        // Check balance
        if (profile.balance < totalAmount) {
          return new Response(
            JSON.stringify({ success: false, error: 'Insufficient balance' }),
            { status: 400, headers: { ...CORS_HEADERS, 'Content-Type': 'application/json' } }
          );
        }

        // For demo users, return mock successful response
        if (isDemoUser) {
          const reference = purchaseReference(req, body, `ELEC-EBILLS-${Date.now()}-${user.id.substring(0, 8)}`);
          const balanceBefore = Number(profile.balance) || 0;

          const debitResult = await debitUserWallet({
            supabase,
            userId: user.id,
            amount: totalAmount,
            transactionType: 'electricity_purchase',
            description: `Electricity purchase (eBills) - ${provider} ${meter_type}`,
            reference,
            performedBy: user.id,
            balanceBefore,
            notification: {
              title: 'Electricity purchase successful (Demo)',
              message: `₦${purchaseAmount} electricity purchased via eBills. Reference: ${reference}.`,
            },
          });

          await supabase.from('electricity_transactions').insert({
            user_id: user.id,
            meter_number: meter_number,
            provider: provider,
            meter_type: meter_type,
            amount: totalAmount,
            purchase_amount: purchaseAmount,
            charge_fee: chargeFee,
            balance_before: debitResult.balanceBefore,
            balance_after: debitResult.balanceAfter,
            status: 'success',
            reference,
            token: 'DEMO-TOKEN-12345678',
            units: '100.0',
            vending_provider: 'ebills',
            performed_by: user.id
          });

          return new Response(
            JSON.stringify({
              success: true,
              data: {
                reference,
                meter_number: meter_number,
                provider: provider,
                meter_type: meter_type,
                amount: totalAmount,
                purchase_amount: purchaseAmount,
                charge_fee: chargeFee,
                vendor: 'ebills',
                balance_before: debitResult.balanceBefore,
                balance_after: debitResult.balanceAfter,
                token: 'DEMO-TOKEN-12345678',
                units: '100.0'
              },
              message: 'Electricity purchased successfully via eBills (Demo)',
            }),
            { status: 200, headers: { ...CORS_HEADERS, 'Content-Type': 'application/json' } }
          );
        }

        // Get eBills service ID and debit wallet before calling provider
        const serviceId = getEBillsElectricityServiceId(provider);
        const requestId = generateEBillsRequestId(user.id);
        const reference = purchaseReference(req, body, requestId);

        const refundWallet = async (reason: string, refSuffix: string) => {
          try {
            await creditUserWallet({
              supabase,
              userId: user.id,
              amount: totalAmount,
              transactionType: 'refund',
              description: `Electricity purchase refunded — ${reason}`,
              reference: `${reference}-${refSuffix}`,
              performedBy: user.id,
            });
          } catch (refundError) {
            console.error('CRITICAL: eBills electricity refund failed; manual reconciliation required.', {
              refundError,
              userId: user.id,
              reference,
              amount: totalAmount,
              reason,
            });
          }
        };

        const recordElectricityFailure = async (params: {
          status: string;
          apiResponse?: unknown;
        }) => {
          await supabase.from('electricity_transactions').insert({
            user_id: user.id,
            meter_number: meter_number,
            provider: provider,
            meter_type: meter_type,
            amount: totalAmount,
            purchase_amount: purchaseAmount,
            charge_fee: chargeFee,
            balance_before: debitResult.balanceBefore,
            balance_after: debitResult.balanceBefore,
            status: params.status,
            reference,
            api_response: params.apiResponse ?? null,
            vending_provider: 'ebills',
            performed_by: user.id,
          });
        };

        let debitResult: Awaited<ReturnType<typeof debitUserWallet>>;
        try {
          debitResult = await debitUserWallet({
            supabase,
            userId: user.id,
            amount: totalAmount,
            transactionType: 'electricity_purchase',
            description: `Electricity purchase (pending eBills) - ${provider} ${meter_type}`,
            reference,
            performedBy: user.id,
            balanceBefore: Number(profile.balance) || 0,
          });
        } catch (debitError) {
          console.error('Debit failed before eBills electricity purchase:', debitError);
          return new Response(
            JSON.stringify({
              success: false,
              error: debitError instanceof Error
                ? debitError.message
                : 'Could not debit wallet for electricity purchase',
            }),
            { status: 200, headers: { ...CORS_HEADERS, 'Content-Type': 'application/json' } },
          );
        }

        console.log('Purchasing electricity via eBills:', {
          requestId,
          customerId: meter_number,
          serviceId,
          variationId: normalizedMeterType,
          amount: purchaseAmount,
          provider,
        });

        const ebillsToken = await getEBillsToken();

        let purchaseResult: Awaited<ReturnType<typeof purchaseEBillsElectricity>>;
        try {
          purchaseResult = await purchaseEBillsElectricity(
            ebillsToken,
            requestId,
            meter_number,
            serviceId,
            purchaseAmount,
            normalizedMeterType,
          );
        } catch (purchaseError: unknown) {
          console.error('Error purchasing electricity via eBills API:', purchaseError);
          const reason = purchaseError instanceof Error ? purchaseError.message : 'provider request failed';
          await refundWallet(reason, 'VENDOR-FAIL');
          await recordElectricityFailure({
            status: 'failed',
            apiResponse: { message: reason },
          });
          return new Response(
            JSON.stringify({
              success: false,
              error: reason || 'Failed to purchase electricity via eBills. Your wallet has been credited back.',
            }),
            { status: 200, headers: { ...CORS_HEADERS, 'Content-Type': 'application/json' } },
          );
        }

        if (!purchaseResult || !purchaseResult.data) {
          console.error('Invalid purchase result structure:', purchaseResult);
          await refundWallet('invalid provider response', 'INVALID-RESP');
          await recordElectricityFailure({
            status: 'failed',
            apiResponse: purchaseResult ?? null,
          });
          return new Response(
            JSON.stringify({
              success: false,
              error: 'Invalid response from eBills API. Your wallet has been credited back.',
            }),
            { status: 200, headers: { ...CORS_HEADERS, 'Content-Type': 'application/json' } },
          );
        }

        const orderId = purchaseResult.data.order_id;
        const orderStatus = getEbillsOrderStatus(purchaseResult);
        const isProcessing = orderStatus.isProcessing;
        const isCompleted = orderStatus.isCompleted;
        const isRefunded = orderStatus.isRefunded;

        if (orderStatus.shouldRefund) {
          await refundWallet(
            isRefunded ? 'provider refunded order' : 'provider rejected order',
            'REF',
          );
          await recordElectricityFailure({
            status: isRefunded ? 'refunded' : 'failed',
            apiResponse: purchaseResult,
          });
          return new Response(
            JSON.stringify({
              success: false,
              error: isRefunded
                ? 'Electricity purchase was refunded by the provider. Your wallet has been credited back.'
                : 'Electricity purchase failed at the provider. Your wallet has been credited back.',
              data: {
                reference,
                status: isRefunded ? 'refunded' : 'failed',
                balance_before: debitResult.balanceBefore,
                balance_after: debitResult.balanceBefore,
              },
            }),
            { status: 200, headers: { ...CORS_HEADERS, 'Content-Type': 'application/json' } },
          );
        }

        // Log the full response for debugging
        console.log('eBills purchase response:', {
          code: purchaseResult.code,
          message: purchaseResult.message,
          status: purchaseResult.data?.status,
          orderId: purchaseResult.data?.order_id,
          requestId: purchaseResult.data?.request_id,
          token: purchaseResult.data?.token,
          units: purchaseResult.data?.units,
          customerName: purchaseResult.data?.customer_name,
          hasData: !!purchaseResult.data,
          fullResponse: JSON.stringify(purchaseResult, null, 2)
        });

        // Check if order is processing or completed
        // eBills status values: 'processing-api', 'completed-api', 'refunded'

        // Extract token from response - check multiple locations
        // Token can be null when processing, or a string when completed
        // Check: data.token, api_response.data.token, or nested locations
        let token: string | null = null;
        
        // Primary location: purchaseResult.data.token
        if (purchaseResult.data?.token) {
          token = String(purchaseResult.data.token).trim();
        }
        
        // If token is null, check nested locations in api_response
        if (!token && purchaseResult.data) {
          const data = purchaseResult.data as any;
          // Check various nested paths
          token = data.token || 
                  data.details?.token ||
                  (purchaseResult as any).token ||
                  null;
          
          if (token) {
            token = String(token).trim();
          }
        }
        
        // Final validation: ensure token is valid
        if (token) {
          // If token is empty string or 'null', set to null
          if (token === '' || token.toLowerCase() === 'null' || token === 'undefined') {
            token = null;
          }
        }
        
        // Log token extraction for debugging
        console.log('Token extraction result:', {
          hasToken: !!token,
          tokenLength: token ? token.length : 0,
          tokenPreview: token ? `${token.substring(0, 10)}...` : 'null',
          dataToken: purchaseResult.data?.token,
          dataTokenType: typeof purchaseResult.data?.token,
        });
        
        // Extract customer details if available
        const customerName = purchaseResult.data.customer_name || customer_name || null;
        const customerAddress = purchaseResult.data.customer_address || customer_address || null;
        const purchaseData = purchaseResult.data as Record<string, unknown>;
        const purchaseDetails = purchaseData.details && typeof purchaseData.details === "object"
          ? purchaseData.details as Record<string, unknown>
          : {};
        const readCustomerField = (value: unknown) => {
          const text = String(value ?? "").trim();
          if (!text || text.toLowerCase() === "null" || text.toLowerCase() === "undefined") return "";
          return text;
        };
        const customerId =
          readCustomerField(purchaseData.account_number) ||
          readCustomerField(purchaseDetails.account_number) ||
          readCustomerField(purchaseData.customer_number) ||
          readCustomerField(purchaseDetails.customer_number) ||
          readCustomerField(purchaseData.customer_id) ||
          readCustomerField(purchaseDetails.customer_id) ||
          null;
        const units = purchaseResult.data.units || null;

        console.log('Extracted transaction details:', {
          reference,
          orderId,
          status: purchaseResult.data.status,
          isProcessing,
          isCompleted,
          isRefunded,
          token: token ? `${token.substring(0, 10)}...` : 'null',
          units,
          customerName,
        });

        // Wallet already debited — keep debit when processing or completed
        const transactionStatus = isCompleted ? 'completed' : 'processing';

        // Record transaction in electricity_transactions table
        const transactionData = {
          user_id: user.id,
          meter_number: meter_number,
          provider: provider,
          meter_type: meter_type,
          amount: totalAmount,
          purchase_amount: purchaseAmount,
          charge_fee: chargeFee,
          balance_before: debitResult.balanceBefore,
          balance_after: debitResult.balanceAfter,
          status: transactionStatus,
          reference,
          order_id: orderId,
          token: token, // Store token even if null (will be updated later if processing)
          units: units,
          customer_name: customerName,
          customer_address: customerAddress,
          api_response: purchaseResult,
          vending_provider: 'ebills',
          performed_by: user.id
        };

        console.log('Inserting electricity transaction:', {
          userId: user.id,
          reference,
          orderId,
          status: transactionStatus,
          token: token ? `${token.substring(0, 10)}...` : 'null',
          amount: totalAmount,
          purchaseAmount,
          chargeFee,
          provider,
          meterNumber: meter_number,
          vendingProvider: 'ebills',
          hasApiResponse: !!purchaseResult,
        });

        // Insert transaction - using existing supabase client (already initialized with service role key)
        const { data: insertedTransaction, error: insertError } = await supabase
          .from('electricity_transactions')
          .insert(transactionData)
          .select('id, token, status, reference, vending_provider')
          .single();

        if (insertError) {
          console.error('CRITICAL: Error inserting electricity transaction:', {
            error: insertError,
            errorMessage: insertError.message,
            errorCode: insertError.code,
            errorDetails: insertError.details,
            errorHint: insertError.hint,
            transactionData: {
              ...transactionData,
              token: token ? `${token.substring(0, 10)}...` : 'null',
              api_response: 'omitted for brevity'
            }
          });
          // Throw error to ensure transaction is not lost
          throw new Error(`Failed to record electricity transaction: ${insertError.message}`);
        }

        if (!insertedTransaction || !insertedTransaction.id) {
          console.error('CRITICAL: Transaction insert returned no data:', {
            insertedTransaction,
            transactionData: {
              ...transactionData,
              token: token ? `${token.substring(0, 10)}...` : 'null',
              api_response: 'omitted for brevity'
            }
          });
          throw new Error('Failed to record electricity transaction: No transaction ID returned');
        }

        const emailToken = token && token.trim() !== '' ? token : 'Processing...';
        const receiptEmail = profile.email || user.email;
        runAfterResponse((async () => {
          await sendPushNotification(
            supabase,
            user.id,
            'Electricity Purchase Successful',
            `₦${totalAmount.toFixed(2)} electricity purchased via eBills. ${isCompleted && token ? `Token: ${token}` : 'Processing...'}. Reference: ${reference}.`,
            {
              type: 'electricity_purchase',
              reference,
              amount: totalAmount,
              provider,
              meter_type,
              token: token,
            }
          );
          const { data: userProfile } = await supabase
            .from('profiles')
            .select('full_name')
            .eq('id', user.id)
            .maybeSingle();
          await sendElectricityReceiptEmail({
            email: receiptEmail,
            fullName: userProfile?.full_name || null,
            provider,
            token: emailToken,
            amount: totalAmount,
            units: units ? parseFloat(String(units)) : null,
            meterNumber: meter_number,
            meterType: meter_type,
            customerName,
            customerAddress,
            customerId,
            reference,
            balanceBefore: debitResult.balanceBefore,
            balanceAfter: debitResult.balanceAfter,
            chargeFee,
            purchaseAmount,
          });
        })());

        return new Response(
          JSON.stringify({
            success: true,
            data: {
              reference,
              order_id: orderId,
              meter_number: meter_number,
              provider: provider,
              meter_type: meter_type,
              amount: totalAmount,
              purchase_amount: purchaseAmount,
              charge_fee: chargeFee,
              vendor: 'ebills',
              balance_before: debitResult.balanceBefore,
              balance_after: debitResult.balanceAfter,
              status: transactionStatus,
              token: token,
              units: units,
              customer_name: customerName,
              customer_address: customerAddress,
              ebills_response: purchaseResult.data
            },
            message: isCompleted
              ? 'Electricity purchased successfully via eBills'
              : 'Electricity purchase is processing',
          }),
          { status: 200, headers: { ...CORS_HEADERS, 'Content-Type': 'application/json' } }
        );
      } catch (ebillsError: any) {
        console.error('Error processing eBills electricity purchase:', ebillsError);
        return new Response(
          JSON.stringify({ 
            success: false, 
            error: ebillsError?.message || 'Failed to process eBills electricity purchase. Please try again.' 
          }),
          { status: 500, headers: { ...CORS_HEADERS, 'Content-Type': 'application/json' } }
        );
      }
    }

    // If using Flutterwave, route to Flutterwave handler
    if (vendingProvider === 'flutterwave') {
      try {
        const flutterwaveResponse = await purchaseFlutterwaveElectricity(localPurchaseRequest(req, authHeader, {
            meter_number,
            provider,
            meter_type,
            amount,
            customer_name,
            customer_address,
            minimum_vend,
          }, body));

        const flutterwaveResult = await flutterwaveResponse.json();
        return new Response(
          JSON.stringify(flutterwaveResult),
          {
            status: flutterwaveResponse.status,
            headers: { ...CORS_HEADERS, 'Content-Type': 'application/json' },
          },
        );
      } catch (flutterwaveError) {
        console.error('Error forwarding to Flutterwave electricity function:', flutterwaveError);
        return new Response(
          JSON.stringify({
            success: false,
            error: 'Failed to process Flutterwave electricity purchase. Please try again.',
          }),
          { status: 500, headers: { ...CORS_HEADERS, 'Content-Type': 'application/json' } },
        );
      }
    }

    // If using Plustive, route to Plustive handler
    if (vendingProvider === 'plustive') {
      try {
        const plustiveResponse = await purchasePlustiveElectricity(localPurchaseRequest(req, authHeader, {
            meter_number,
            provider,
            meter_type,
            amount,
            customer_name,
            customer_address,
            minimum_vend,
          }, body));

        const plustiveResult = await plustiveResponse.json();
        return new Response(
          JSON.stringify(plustiveResult),
          {
            status: plustiveResponse.status,
            headers: { ...CORS_HEADERS, 'Content-Type': 'application/json' },
          },
        );
      } catch (plustiveError) {
        console.error('Error forwarding to Plustive electricity function:', plustiveError);
        return new Response(
          JSON.stringify({
            success: false,
            error: 'Failed to process Plustive electricity purchase. Please try again.',
          }),
          { status: 500, headers: { ...CORS_HEADERS, 'Content-Type': 'application/json' } },
        );
      }
    }

    // If no matching provider, return error with all supported providers
    console.error(`Unsupported electricity vending provider: ${vendingProvider} (normalized from: ${rawVendingProvider}). Admin must set a valid provider.`, {
      rawProvider: rawVendingProvider,
      normalizedProvider: vendingProvider,
      supportedProviders: ['mobilenig', 'ebills', 'flutterwave', 'plustive'],
    });
    return new Response(
      JSON.stringify({ 
        success: false, 
        error: `Unsupported electricity vending provider: ${vendingProvider}. Supported providers: mobilenig, ebills, flutterwave, plustive. Please contact administrator to configure a valid provider.`,
        vending_provider: vendingProvider,
        raw_vending_provider: rawVendingProvider,
        supported_providers: ['mobilenig', 'ebills', 'flutterwave', 'plustive']
      }),
      { status: 400, headers: { ...CORS_HEADERS, 'Content-Type': 'application/json' } }
    );

  } catch (error) {
    console.error('Error in purchase-electricity function:', error);
    const errorMessage = error instanceof Error 
      ? error.message 
      : typeof error === 'string' 
        ? error 
        : 'Unknown error occurred';
    
    return new Response(
      JSON.stringify({ 
        success: false, 
        error: errorMessage,
      }),
      { status: 500, headers: { ...CORS_HEADERS, 'Content-Type': 'application/json' } }
    );
  }
});






