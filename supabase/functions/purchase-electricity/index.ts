import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { debitUserWallet } from "../_shared/wallet.ts";
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
    
    const { data: { user }, error: authError } = await supabase.auth.getUser(token);
    
    if (authError || !user) {
      return new Response(
        JSON.stringify({ success: false, error: 'Unauthorized - Please sign in to continue' }),
        { status: 401, headers: { ...CORS_HEADERS, 'Content-Type': 'application/json' } }
      );
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

    // Get the active electricity vending provider from app_settings
    // This MUST be set by admin - no default fallback to ensure admin control
    const { data: providerSetting, error: settingError } = await supabase
      .from('app_settings')
      .select('setting_value')
      .eq('setting_key', 'electricity_provider')
      .maybeSingle();

    console.log('Electricity provider setting query result:', {
      hasData: !!providerSetting,
      settingValue: providerSetting?.setting_value,
      settingValueType: typeof providerSetting?.setting_value,
      error: settingError,
    });

    if (settingError) {
      console.error('Error fetching electricity_provider setting:', settingError);
      return new Response(
        JSON.stringify({ 
          success: false, 
          error: 'Failed to retrieve electricity provider configuration. Please contact support.',
          details: settingError.message 
        }),
        { status: 500, headers: { ...CORS_HEADERS, 'Content-Type': 'application/json' } }
      );
    }

    // Get vending provider from admin settings - handle different data structures
    let rawVendingProvider: string | undefined;
    
    if (providerSetting?.setting_value) {
      const settingValue = providerSetting.setting_value;
      
      // Supabase JSONB columns are returned as objects, not strings
      if (typeof settingValue === 'object' && settingValue !== null) {
        // Direct object access (most common case)
        rawVendingProvider = (settingValue as any)?.provider;
        
        // If provider key doesn't exist, try value key or use the object itself if it's a string
        if (!rawVendingProvider) {
          rawVendingProvider = (settingValue as any)?.value;
        }
        
        // If still no value and it's a simple object with string values, try to find any string value
        if (!rawVendingProvider && typeof (settingValue as any) === 'object') {
          const values = Object.values(settingValue as any);
          const stringValue = values.find(v => typeof v === 'string') as string | undefined;
          if (stringValue) rawVendingProvider = stringValue;
        }
      } else if (typeof settingValue === 'string') {
        // If it's a string, try to parse as JSON first
        try {
          const parsed = JSON.parse(settingValue);
          rawVendingProvider = parsed?.provider || parsed?.value || parsed;
        } catch {
          // If parsing fails, use the string directly
          rawVendingProvider = settingValue;
        }
      }
    }
    
    console.log('Extracted raw vending provider:', rawVendingProvider, {
      settingValueType: typeof providerSetting?.setting_value,
      settingValue: JSON.stringify(providerSetting?.setting_value),
    });
    
    if (!rawVendingProvider || typeof rawVendingProvider !== 'string') {
      console.error('Electricity provider not configured in app_settings. Admin must set electricity_provider setting.', {
        settingValue: providerSetting?.setting_value,
        settingValueString: JSON.stringify(providerSetting?.setting_value),
        extractedProvider: rawVendingProvider,
      });
      return new Response(
        JSON.stringify({ 
          success: false, 
          error: 'Electricity provider not configured. Please contact administrator.',
          debug: {
            settingValue: providerSetting?.setting_value,
            settingValueString: JSON.stringify(providerSetting?.setting_value),
            extractedProvider: rawVendingProvider,
          }
        }),
        { status: 400, headers: { ...CORS_HEADERS, 'Content-Type': 'application/json' } }
      );
    }

    // Normalize provider name to handle variations (ebill -> ebills, ebills.africa -> ebills, etc.)
    const normalizeProvider = (provider: string): string => {
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
      
      // Return as-is if no normalization needed
      return normalized;
    };

    const vendingProvider = normalizeProvider(rawVendingProvider);
    
    console.log('Electricity vending provider (from admin settings):', rawVendingProvider, '-> normalized to:', vendingProvider, 'for electricity provider:', provider);

    // If using MobileNig, route to MobileNig handler
    if (vendingProvider === 'mobilenig') {
      const functionUrl = `${supabaseUrl}/functions/v1/purchase-mobilenig-electricity`;
      
      try {
        const mobilenigResponse = await fetch(functionUrl, {
          method: 'POST',
          headers: {
            'Authorization': authHeader,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            meter_number,
            provider,
            meter_type,
            amount,
            customer_name,
            customer_address,
            minimum_vend,
          }),
        });

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
          const reference = `ELEC-EBILLS-${Date.now()}-${user.id.substring(0, 8)}`;
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

        // Get eBills service ID
        const serviceId = getEBillsElectricityServiceId(provider);
        
        // Get eBills token
        const ebillsToken = await getEBillsToken();
        
        // Generate unique request ID
        const requestId = generateEBillsRequestId(user.id);
        
        console.log('Purchasing electricity via eBills:', {
          requestId,
          customerId: meter_number,
          serviceId,
          variationId: normalizedMeterType,
          amount: purchaseAmount,
          provider
        });

        // Make purchase via eBills API
        let purchaseResult;
        try {
          purchaseResult = await purchaseEBillsElectricity(
            ebillsToken,
            requestId,
            meter_number,
            serviceId,
            purchaseAmount,
            normalizedMeterType,
          );
        } catch (purchaseError: any) {
          console.error('Error purchasing electricity via eBills API:', purchaseError);
          throw new Error(purchaseError?.message || 'Failed to purchase electricity via eBills. Please try again.');
        }

        // Validate purchase result structure
        if (!purchaseResult || !purchaseResult.data) {
          console.error('Invalid purchase result structure:', purchaseResult);
          throw new Error('Invalid response from eBills API. Please try again.');
        }

        const reference = purchaseResult.data.request_id || `ELEC-EBILLS-${Date.now()}-${user.id.substring(0, 8)}`;
        const orderId = purchaseResult.data.order_id;

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
        const statusLower = (purchaseResult.data?.status || '').toLowerCase();
        const messageLower = (purchaseResult.message || '').toLowerCase();
        const isProcessing = statusLower === 'processing-api' || 
                            statusLower === 'processing' ||
                            messageLower.includes('processing');
        const isCompleted = statusLower === 'completed-api' || 
                           statusLower === 'completed' ||
                           messageLower.includes('completed');
        const isRefunded = statusLower === 'refunded' || 
                          messageLower.includes('refunded');

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

        // Debit wallet only if order is processing or completed (not refunded)
        let debitResult;
        if (!isRefunded) {
          const balanceBefore = Number(profile.balance) || 0;
          debitResult = await debitUserWallet({
            supabase,
            userId: user.id,
            amount: totalAmount,
            transactionType: 'electricity_purchase',
            description: `Electricity purchase (eBills) - ${provider} ${meter_type}`,
            reference,
            performedBy: user.id,
            balanceBefore,
            notification: {
              title: 'Electricity purchase successful',
              message: `₦${totalAmount.toFixed(2)} electricity purchased via eBills. ${isCompleted && token ? `Token: ${token}` : 'Processing...'}. Reference: ${reference}.`,
            },
          });
        } else {
          // If refunded, don't debit wallet
          debitResult = {
            balanceBefore: Number(profile.balance) || 0,
            balanceAfter: Number(profile.balance) || 0,
          };
        }

        // Determine transaction status
        // Use 'completed' for completed (consistent with other transaction types), 'processing' for processing, 'refunded' for refunded
        // Note: Some parts of the codebase expect 'completed' instead of 'success'
        const transactionStatus = isRefunded ? 'refunded' : (isCompleted ? 'completed' : 'processing');

        // Record transaction in electricity_transactions table
        const transactionData = {
          user_id: user.id,
          meter_number: meter_number,
          provider: provider,
          meter_type: meter_type,
          amount: isRefunded ? 0 : totalAmount,
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

        // Verify the transaction was inserted correctly
        const { data: verifyTransaction, error: verifyError } = await supabase
          .from('electricity_transactions')
          .select('id, token, status, reference, vending_provider, order_id, user_id')
          .eq('id', insertedTransaction.id)
          .single();

        if (verifyError) {
          console.error('WARNING: Could not verify transaction insertion:', verifyError);
        } else if (verifyTransaction) {
          console.log('Transaction verified after insertion:', {
            id: verifyTransaction.id,
            reference: verifyTransaction.reference,
            status: verifyTransaction.status,
            token: verifyTransaction.token ? `${verifyTransaction.token.substring(0, 10)}...` : 'null',
            vendingProvider: verifyTransaction.vending_provider,
            orderId: verifyTransaction.order_id,
            userId: verifyTransaction.user_id,
            matchesRequestUser: verifyTransaction.user_id === user.id,
          });
        }

        // Also verify that a user query would return this transaction (simulating user's query)
        // This helps catch RLS policy issues - we'll use the service role but check user_id match
        const { data: userTransactions, error: userQueryError } = await supabase
          .from('electricity_transactions')
          .select('id, reference, status, vending_provider, user_id')
          .eq('user_id', user.id)
          .eq('reference', reference)
          .limit(1);

        if (userQueryError) {
          console.error('WARNING: Cannot query transaction by user_id and reference:', userQueryError);
        } else if (userTransactions && userTransactions.length > 0) {
          console.log('Transaction is queryable by user_id and reference - should be visible to user');
        } else {
          console.error('CRITICAL: Transaction inserted but not queryable - possible data issue:', {
            insertedUserId: user.id,
            insertedReference: reference,
            queryResult: userTransactions,
          });
        }

        console.log('Electricity transaction successfully recorded:', {
          transactionId: insertedTransaction.id,
          reference,
          status: transactionStatus,
          token: token ? 'provided' : 'null',
          orderId,
          isCompleted,
          isProcessing,
        });

        // Send push notification
        if (!isRefunded) {
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
        }

        // Send email receipt notification
        // Always send email receipt, even if token is processing (will show "Processing...")
        if (!isRefunded && profile.email) {
          try {
            const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
            const emailFunctionUrl = `${supabaseUrl}/functions/v1/send-purchase-email`;
            
            // Get user's full name if available
            const { data: userProfile } = await supabase
              .from('profiles')
              .select('full_name')
              .eq('id', user.id)
              .single();

            // Use token if available, otherwise use placeholder
            const emailToken = token && token.trim() !== '' ? token : 'Processing...';

            const emailPayload = {
              type: 'electricity',
              email: profile.email,
              fullName: userProfile?.full_name || null,
              provider: provider,
              token: emailToken,
              amount: totalAmount,
              units: units ? parseFloat(units) : null,
              meterNumber: meter_number,
              meterType: meter_type,
              customerName: customerName,
              reference: reference,
              purchasedAt: new Date().toISOString(),
              balanceBefore: debitResult.balanceBefore,
              balanceAfter: debitResult.balanceAfter,
              chargeFee: chargeFee,
              purchaseAmount: purchaseAmount,
            };

            console.log('Sending email receipt:', {
              email: profile.email,
              reference,
              token: token ? 'provided' : 'processing',
              hasToken: !!token,
            });

            // Send email asynchronously (don't wait for response to avoid blocking)
            fetch(emailFunctionUrl, {
              method: 'POST',
              headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')}`,
              },
              body: JSON.stringify(emailPayload),
            }).then(async (emailResponse) => {
              if (!emailResponse.ok) {
                const errorText = await emailResponse.text();
                console.error('Email receipt send failed:', {
                  status: emailResponse.status,
                  error: errorText,
                });
              } else {
                console.log('Email receipt sent successfully:', {
                  email: profile.email,
                  reference,
                });
              }
            }).catch((emailError) => {
              console.error('Error sending email receipt (non-blocking):', emailError);
              // Don't throw - email failure shouldn't fail the purchase
            });
          } catch (emailError) {
            console.error('Error preparing email receipt (non-blocking):', emailError);
            // Don't throw - email failure shouldn't fail the purchase
          }
        }

        return new Response(
          JSON.stringify({
            success: true,
            data: {
              reference,
              order_id: orderId,
              meter_number: meter_number,
              provider: provider,
              meter_type: meter_type,
              amount: isRefunded ? 0 : totalAmount,
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
            message: isRefunded 
              ? 'Order was refunded' 
              : isCompleted 
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
      const functionUrl = `${supabaseUrl}/functions/v1/purchase-flutterwave-electricity`;

      try {
        const flutterwaveResponse = await fetch(functionUrl, {
          method: 'POST',
          headers: {
            'Authorization': authHeader,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            meter_number,
            provider,
            meter_type,
            amount,
            customer_name,
            customer_address,
            minimum_vend,
          }),
        });

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

    // If no matching provider, return error with all supported providers
    console.error(`Unsupported electricity vending provider: ${vendingProvider} (normalized from: ${rawVendingProvider}). Admin must set a valid provider.`, {
      rawProvider: rawVendingProvider,
      normalizedProvider: vendingProvider,
      supportedProviders: ['mobilenig', 'ebills', 'flutterwave'],
    });
    return new Response(
      JSON.stringify({ 
        success: false, 
        error: `Unsupported electricity vending provider: ${vendingProvider}. Supported providers: mobilenig, ebills, flutterwave. Please contact administrator to configure a valid provider.`,
        vending_provider: vendingProvider,
        raw_vending_provider: rawVendingProvider,
        supported_providers: ['mobilenig', 'ebills', 'flutterwave']
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






