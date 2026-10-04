import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { getMobilenigSecretKey } from "../_shared/mobilenig-api.ts";
import { debitUserWallet, creditUserWallet } from "../_shared/wallet.ts";
import { sendPushNotification } from "../_shared/push-notifications.ts";

const CORS_HEADERS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

// MobileNig Service IDs for Electricity Providers
const MOBILENIG_SERVICE_IDS: Record<string, { prepaid: string; postpaid: string }> = {
  IKEJA: { prepaid: 'AMA', postpaid: 'AMB' },
  EKO: { prepaid: 'ANA', postpaid: 'ANB' },
  ABUJA: { prepaid: 'AHB', postpaid: 'AHA' },
  KADUNA: { prepaid: 'AGB', postpaid: 'AGA' },
  IBADAN: { prepaid: 'AEA', postpaid: 'AEB' },
  KANO: { prepaid: 'AFA', postpaid: 'AFB' },
  PORTHARCOURT: { prepaid: 'ADB', postpaid: 'ADA' },
  JOS: { prepaid: 'ACB', postpaid: 'ACA' },
  BENIN: { prepaid: 'AAB', postpaid: 'AAA' },
  YOLA: { prepaid: 'ALA', postpaid: 'ALB' },
};

// Provider aliases
const PROVIDER_ALIASES: Record<string, string> = {
  IKEDC: 'IKEJA',
  EKEDC: 'EKO',
  AEDC: 'ABUJA',
  KAEDCO: 'KADUNA',
  IBEDC: 'IBADAN',
  KEDCO: 'KANO',
  PHEDC: 'PORTHARCOURT',
  JED: 'JOS',
  BEDC: 'BENIN',
  YEDC: 'YOLA',
};

interface PurchaseElectricityRequest {
  meter_number: string;
  provider: string;
  meter_type: 'prepaid' | 'postpaid';
  amount: number;
  customer_name: string;
  customer_address: string;
  minimum_vend?: number;
}

// Normalize meter number
const normalizeMeter = (meterNumber: string): string => {
  return meterNumber.replace(/[^\d]/g, '').trim();
};

// Generate unique transaction ID
const generateTransId = (): number => {
  return Date.now();
};

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: CORS_HEADERS });
  }

  try {
    // Get authorization header
    const authHeader = req.headers.get('Authorization');
    if (!authHeader) {
      return new Response(
        JSON.stringify({ success: false, error: 'Missing authorization header' }),
        { status: 401, headers: { ...CORS_HEADERS, 'Content-Type': 'application/json' } }
      );
    }

    // Create service-role client for database operations
    const supabaseClient = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
    );

    // Verify authentication using the caller's JWT
    const token = authHeader.startsWith('Bearer ')
      ? authHeader.substring(7).trim()
      : authHeader.trim();
    const { data: { user }, error: authError } = await supabaseClient.auth.getUser(token);
    if (authError || !user) {
      return new Response(
        JSON.stringify({ success: false, error: 'Unauthorized' }),
        { status: 401, headers: { ...CORS_HEADERS, 'Content-Type': 'application/json' } }
      );
    }

    // Parse request body
    const body: PurchaseElectricityRequest = await req.json();
    const { meter_number, provider, meter_type, amount, customer_name, customer_address, minimum_vend } = body;

    // Get user profile to check if demo user (need to check early for validation)
    const { data: profile, error: profileError } = await supabaseClient
      .from('profiles')
      .select('balance, full_name, email')
      .eq('id', user.id)
      .single();

    if (profileError || !profile) {
      return new Response(
        JSON.stringify({ success: false, error: 'Failed to fetch user profile' }),
        { status: 500, headers: { ...CORS_HEADERS, 'Content-Type': 'application/json' } }
      );
    }

    const isDemoUser = profile.email === 'demo@netppay.com';

    // Validate inputs (more lenient for demo users)
    if (!isDemoUser) {
      // For real users, all fields are required
      if (!meter_number || !provider || !meter_type || !amount || !customer_name || !customer_address) {
        return new Response(
          JSON.stringify({
            success: false,
            error: 'meter_number, provider, meter_type, amount, customer_name, and customer_address are required',
          }),
          { status: 400, headers: { ...CORS_HEADERS, 'Content-Type': 'application/json' } }
        );
      }
    } else {
      // For demo users, only amount is required, others can have defaults
      if (!amount) {
        return new Response(
          JSON.stringify({
            success: false,
            error: 'amount is required',
          }),
          { status: 400, headers: { ...CORS_HEADERS, 'Content-Type': 'application/json' } }
        );
      }
    }

    // Validate amount
    const purchaseAmount = Number(amount);
    if (isNaN(purchaseAmount) || purchaseAmount <= 0) {
      return new Response(
        JSON.stringify({
          success: false,
          error: 'Invalid amount',
        }),
        { status: 400, headers: { ...CORS_HEADERS, 'Content-Type': 'application/json' } }
      );
    }

    // Check minimum vend amount
    if (minimum_vend && purchaseAmount < minimum_vend) {
      return new Response(
        JSON.stringify({
          success: false,
          error: `Minimum purchase amount is ₦${minimum_vend.toFixed(2)}`,
        }),
        { status: 400, headers: { ...CORS_HEADERS, 'Content-Type': 'application/json' } }
      );
    }

    // Use profile already fetched above
    const balanceBefore = Number(profile.balance) || 0;
    
    // For demo users, provide defaults for missing fields
    const finalMeterNumber = meter_number || (isDemoUser ? '12345678901' : '');
    const finalProvider = provider || (isDemoUser ? 'IKEJA' : '');
    const finalMeterType = meter_type || (isDemoUser ? 'prepaid' : '');
    const finalCustomerName = customer_name || (isDemoUser ? 'Demo Customer' : '');
    const finalCustomerAddress = customer_address || (isDemoUser ? 'Demo Address' : '');

    // Calculate total amount (purchase amount + 10% charge fee)
    const CHARGE_FEE_RATE = 0.1; // 10% charge fee
    const chargeFee = Math.round(purchaseAmount * CHARGE_FEE_RATE * 100) / 100;
    const totalAmount = purchaseAmount + chargeFee;

    // Check balance (skip for demo users - they can proceed with any balance)
    if (!isDemoUser && balanceBefore < totalAmount) {
      return new Response(
        JSON.stringify({ success: false, error: 'Insufficient balance' }),
        { status: 400, headers: { ...CORS_HEADERS, 'Content-Type': 'application/json' } }
      );
    }

    // Normalize meter number
    // For demo users, ensure we have a valid meter number
    const meterToNormalize = isDemoUser && !finalMeterNumber ? '12345678901' : finalMeterNumber;
    const sanitizedMeter = normalizeMeter(meterToNormalize);
    if (!sanitizedMeter && !isDemoUser) {
      return new Response(
        JSON.stringify({
          success: false,
          error: 'Invalid meter number',
        }),
        { status: 400, headers: { ...CORS_HEADERS, 'Content-Type': 'application/json' } }
      );
    }
    
    // Ensure demo users always have a valid sanitized meter
    const finalSanitizedMeter = sanitizedMeter || (isDemoUser ? '12345678901' : '');

    // Get MobileNig secret key (required for purchase)
    const mobilenigSecretKey = getMobilenigSecretKey();
    if (!mobilenigSecretKey) {
      return new Response(
        JSON.stringify({
          success: false,
          error: 'MobileNig credentials not configured',
        }),
        { status: 500, headers: { ...CORS_HEADERS, 'Content-Type': 'application/json' } }
      );
    }

    // Normalize provider and get service ID
    const normalizedProvider = finalProvider.toUpperCase().replace(/[^A-Z]/g, '');
    const canonicalProvider = PROVIDER_ALIASES[normalizedProvider] || normalizedProvider;
    const serviceIds = MOBILENIG_SERVICE_IDS[canonicalProvider];

    if (!serviceIds && !isDemoUser) {
      return new Response(
        JSON.stringify({
          success: false,
          error: `Unsupported electricity provider: ${finalProvider}`,
        }),
        { status: 400, headers: { ...CORS_HEADERS, 'Content-Type': 'application/json' } }
      );
    }

    // For demo users, use default service ID if provider not found
    const defaultServiceIds = MOBILENIG_SERVICE_IDS['IKEJA'];
    const finalServiceIds = serviceIds || defaultServiceIds;
    const serviceId = finalMeterType === 'prepaid' ? finalServiceIds.prepaid : finalServiceIds.postpaid;
    const transId = generateTransId();
    const reference = `MB-${transId}-${Date.now()}`;

    // For demo users, return mock successful response (but still debit wallet)
    if (isDemoUser) {
      console.log('Demo user detected - using mock API response for electricity purchase');
      
      let debitResult: Awaited<ReturnType<typeof debitUserWallet>>;
      try {
        debitResult = await debitUserWallet({
          supabase: supabaseClient,
          userId: user.id,
          amount: totalAmount,
          transactionType: 'electricity_purchase',
          description: `Electricity purchase (Demo): ${canonicalProvider || 'IKEJA'} ${finalMeterType} - ${reference}`,
          reference,
          performedBy: user.id,
          balanceBefore,
        });
      } catch (debitError) {
        console.error('Demo electricity debit failed:', debitError);
        debitResult = {
          balanceBefore,
          balanceAfter: balanceBefore - totalAmount,
          reference,
        };
      }

      // Generate mock token for demo
      const mockToken = `DEMO-${finalSanitizedMeter.substring(0, Math.min(4, finalSanitizedMeter.length))}-${Date.now().toString().slice(-8)}`;

      // Record transaction in database
      const { error: electricityTransactionError } = await supabaseClient
        .from('electricity_transactions')
        .insert({
          user_id: user.id,
          amount: totalAmount,
          purchase_amount: purchaseAmount,
          charge_fee: chargeFee,
          balance_before: debitResult.balanceBefore,
          balance_after: debitResult.balanceAfter,
          meter_number: finalSanitizedMeter,
          provider: canonicalProvider || 'IKEJA',
          meter_type: finalMeterType,
          customer_name: finalCustomerName,
          token: mockToken,
          status: 'completed',
          reference: reference,
          api_response: { demo: true, message: 'Demo transaction' },
          performed_by: user.id,
        });

      if (electricityTransactionError) {
        console.error('Failed to record demo electricity transaction:', electricityTransactionError);
      }

        // Send push notification
        await sendPushNotification(
          supabaseClient,
          user.id,
          'Electricity Purchase Successful (Demo)',
          `₦${purchaseAmount.toFixed(2)} electricity purchased for ${finalSanitizedMeter} (${canonicalProvider || 'IKEJA'} ${finalMeterType}). Token: ${mockToken}. Your new balance is ₦${debitResult.balanceAfter.toFixed(2)}.`,
          {
            type: 'electricity_purchase',
            reference: reference,
            amount: purchaseAmount,
            meter_number: finalSanitizedMeter,
            provider: canonicalProvider || 'IKEJA',
            meter_type: finalMeterType,
            token: mockToken,
          }
        );

        return new Response(
          JSON.stringify({
            success: true,
            data: {
              reference: reference,
              token: mockToken,
              meter_number: finalSanitizedMeter,
              provider: canonicalProvider || 'IKEJA',
              meter_type: finalMeterType,
              amount: purchaseAmount,
              charge_fee: chargeFee,
              total_amount: totalAmount,
              balance_before: debitResult.balanceBefore,
              balance_after: debitResult.balanceAfter,
            },
            message: 'Electricity purchase successful (Demo)',
          }),
          { status: 200, headers: { ...CORS_HEADERS, 'Content-Type': 'application/json' } }
        );
    }

    console.log('Purchasing electricity with MobileNig:', {
      meter_number: sanitizedMeter.substring(0, 4) + '***',
      provider: canonicalProvider,
      meter_type,
      service_id: serviceId,
      amount: purchaseAmount,
      trans_id: transId,
    });

    // Debit user wallet first
    let debitResult;
    try {
      debitResult = await debitUserWallet({
        supabase: supabaseClient,
        userId: user.id,
        amount: totalAmount,
        transactionType: 'electricity_purchase',
        description: `Electricity purchase: ${canonicalProvider} ${meter_type} - ${reference}`,
        reference: reference,
        performedBy: user.id,
      });
    } catch (debitError: any) {
      return new Response(
        JSON.stringify({ success: false, error: debitError.message || 'Failed to debit wallet' }),
        { status: 500, headers: { ...CORS_HEADERS, 'Content-Type': 'application/json' } }
      );
    }

    try {
      // Call MobileNig API: POST /api/v2/services/
      // Required fields: service_id, trans_id, customerReference, amount, customerName, customerAddress
      // Authorization: Bearer {{secret_key}}
      const requestBody = {
        service_id: serviceId,
        trans_id: transId,
        customerReference: sanitizedMeter,
        amount: purchaseAmount,
        customerName: finalCustomerName,
        customerAddress: finalCustomerAddress,
      };

      const response = await fetch('https://enterprise.mobilenig.com/api/v2/services/', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${mobilenigSecretKey}`,
        },
        body: JSON.stringify(requestBody),
      });

      const responseText = await response.text();
      console.log('MobileNig API response status:', response.status);
      console.log('MobileNig API response (first 500 chars):', responseText.substring(0, 500));

      // Parse JSON response
      let data: any;
      try {
        data = JSON.parse(responseText);
      } catch (parseError) {
        console.error('Failed to parse MobileNig API response:', parseError);
        // Refund user if we can't parse the response
        await creditUserWallet({
          supabase: supabaseClient,
          userId: user.id,
          amount: totalAmount,
          transactionType: 'refund',
          description: `Refund for failed electricity purchase: ${reference}`,
          reference: `REF-${reference}`,
          performedBy: user.id,
        });
        return new Response(
          JSON.stringify({
            success: false,
            error: 'Invalid response from service provider. Amount has been refunded.',
          }),
          { status: 200, headers: { ...CORS_HEADERS, 'Content-Type': 'application/json' } }
        );
      }

      // Check for success: statusCode "200" and message "success"
      if (response.ok && data.statusCode === '200' && data.message === 'success') {
        const details = data.details || {};
        const token = details.details?.token || details.token || null;
        const apiReference = details.details?.reference || details.reference || reference;

        // Calculate transaction amounts
        const purchaseAmountNum = Number(purchaseAmount);
        const chargeFeeNum = Number(chargeFee);

        // Record transaction in database
        const { error: transactionError } = await supabaseClient
          .from('electricity_transactions')
          .insert({
            user_id: user.id,
            amount: totalAmount, // Total amount charged to user
            purchase_amount: purchaseAmountNum, // Base purchase amount
            charge_fee: chargeFeeNum, // Charge fee (10%)
            balance_before: debitResult.balanceBefore,
            balance_after: debitResult.balanceAfter,
            meter_number: sanitizedMeter,
            provider: canonicalProvider,
            meter_type: meter_type,
            customer_name: customer_name,
            token: token,
            status: 'completed',
            reference: apiReference,
            api_response: data,
            performed_by: user.id,
          });

        if (transactionError) {
          console.error('Failed to record transaction:', transactionError);
          // Transaction is already debited, so we continue
        }

        console.log('Electricity purchase successful:', {
          reference: apiReference,
          token: token ? token.substring(0, 4) + '***' : 'N/A',
        });

        // Send push notification
        await sendPushNotification(
          supabaseClient,
          user.id,
          'Electricity Purchase Successful',
          `₦${purchaseAmountNum.toFixed(2)} electricity purchased for ${sanitizedMeter} (${canonicalProvider} ${meter_type}). Token: ${token || 'N/A'}. Your new balance is ₦${debitResult.balanceAfter.toFixed(2)}.`,
          {
            type: 'electricity_purchase',
            reference: apiReference,
            amount: purchaseAmountNum,
            meter_number: sanitizedMeter,
            provider: canonicalProvider,
            meter_type: meter_type,
            token: token || undefined,
          }
        );

        // Send email with PDF receipt (non-blocking)
        if (profile.email && token) {
          try {
            const supabaseService = createClient(
              Deno.env.get('SUPABASE_URL') ?? '',
              Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
            );
            
            await supabaseService.functions.invoke('send-purchase-email', {
              body: {
                type: 'electricity',
                email: profile.email,
                fullName: profile.full_name,
                provider: canonicalProvider,
                token: token,
                amount: totalAmount,
                purchaseAmount: purchaseAmountNum,
                chargeFee: chargeFeeNum,
                meterNumber: sanitizedMeter,
                meterType: meter_type,
                customerName: customer_name,
                customerAddress: customer_address,
                customerId: String(
                  details.details?.account_number ||
                  details.account_number ||
                  details.details?.customer_number ||
                  details.customer_number ||
                  details.details?.customer_id ||
                  details.customer_id ||
                  ""
                ).trim() || undefined,
                reference: apiReference,
                purchasedAt: new Date().toISOString(),
                balanceBefore: debitResult.balanceBefore,
                balanceAfter: debitResult.balanceAfter,
              },
            });
          } catch (emailError) {
            console.error('Failed to send email receipt:', emailError);
            // Don't fail the transaction if email fails
          }
        }

        return new Response(
          JSON.stringify({
            success: true,
            data: {
              reference: apiReference,
              token: token,
              meter_number: sanitizedMeter,
              provider: canonicalProvider,
              meter_type: meter_type,
              amount: purchaseAmountNum,
              charge_fee: chargeFeeNum,
              total_amount: totalAmount,
              balance_before: debitResult.balanceBefore,
              balance_after: debitResult.balanceAfter,
            },
          }),
          { status: 200, headers: { ...CORS_HEADERS, 'Content-Type': 'application/json' } }
        );
      } else {
        // Purchase failed - refund user
        await creditUserWallet({
          supabase: supabaseClient,
          userId: user.id,
          amount: totalAmount,
          transactionType: 'refund',
          description: `Refund for failed electricity purchase: ${reference}`,
          reference: `REF-${reference}`,
          performedBy: user.id,
        });

        // Extract error message
        const statusCode = data.statusCode;
        let errorMessage = 'Purchase failed';

        if (typeof data.details === 'string') {
          errorMessage = data.details;
        } else if (data.details?.details) {
          errorMessage = typeof data.details.details === 'string'
            ? data.details.details
            : (data.details.details?.message || errorMessage);
        } else if (data.details?.responseMessage) {
          errorMessage = data.details.responseMessage;
        } else if (data.message) {
          errorMessage = data.message;
        } else if (data.error) {
          errorMessage = data.error;
        }

        console.log('Electricity purchase failed:', {
          statusCode,
          errorMessage,
        });

        return new Response(
          JSON.stringify({
            success: false,
            error: errorMessage,
            statusCode,
          }),
          { status: 200, headers: { ...CORS_HEADERS, 'Content-Type': 'application/json' } }
        );
      }
    } catch (apiError: any) {
      console.error('Error calling MobileNig API:', apiError);
      // Refund user on API error
      await creditUserWallet({
        supabase: supabaseClient,
        userId: user.id,
        amount: totalAmount,
        transactionType: 'refund',
        description: `Refund for failed electricity purchase: ${reference}`,
        reference: `REF-${reference}`,
        performedBy: user.id,
      });

      return new Response(
        JSON.stringify({
          success: false,
          error: apiError.message || 'Service temporarily unavailable. Amount has been refunded.',
        }),
        { status: 200, headers: { ...CORS_HEADERS, 'Content-Type': 'application/json' } }
      );
    }
  } catch (error: any) {
    console.error('Error purchasing electricity:', error);
    return new Response(
      JSON.stringify({
        success: false,
        error: error.message || 'Failed to purchase electricity',
      }),
      { status: 500, headers: { ...CORS_HEADERS, 'Content-Type': 'application/json' } }
    );
  }
});

