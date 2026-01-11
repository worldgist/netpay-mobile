import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { debitUserWallet, creditUserWallet } from "../_shared/wallet.ts";

const CORS_HEADERS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

// MobileNig Service IDs for Education
const MOBILENIG_SERVICE_IDS: Record<string, string> = {
  WAEC: 'AJA',
  NECO: 'AJC',
  JAMB: 'AJB',
};

interface PurchaseEducationRequest {
  exam_type: string;
  education_service_id: string;
  amount: number;
  quantity?: number;
  billers_code?: string; // For JAMB
  phone_number?: string;
  variation_code?: string; // For VTpass
  api_code?: string;
  service_id?: string;
}

// Generate unique transaction ID
const generateTransId = (): number => {
  return Date.now();
};

// Parse PINs from MobileNig API response
// Handles both single PIN format (WAEC, NECO) and multiple PINs array format (JAMB)
const parsePinsFromResponse = (apiResponse: any, examType: string): { pin?: string; serial?: string; pins?: Array<{ Pin: string; Serial?: string }> } => {
  const result: { pin?: string; serial?: string; pins?: Array<{ Pin: string; Serial?: string }> } = {};
  
  try {
    // MobileNig typically returns PINs in details.details structure
    const details = apiResponse?.details?.details || apiResponse?.details || apiResponse?.data || {};
    
    // Priority 1: Check for pins array format first (for JAMB which can return multiple PINs)
    // This takes priority because JAMB can have multiple PINs and we want all of them
    if (details.pins && Array.isArray(details.pins) && details.pins.length > 0) {
      result.pins = details.pins.map((p: any) => ({
        Pin: p.Pin || p.pin || p.pinNumber || p.pin_number || '',
        Serial: p.Serial || p.serial || p.serialNumber || p.serial_number || '',
      })).filter((p: any) => p.Pin && p.Pin.trim() !== '');
      
      // Set first PIN as main pin for backward compatibility (WAEC/NECO single PIN display)
      if (result.pins.length > 0) {
        result.pin = result.pins[0].Pin;
        result.serial = result.pins[0].Serial || '';
      }
      
      console.log(`Parsed ${result.pins.length} PIN(s) from array format for ${examType.toUpperCase()}`);
      return result; // Return early if we found pins array
    }
    
    // Priority 2: Check for single PIN format (WAEC, NECO, or JAMB single PIN response)
    const pinValue = details.pin || details.Pin || details.pinNumber || details.pin_number;
    const serialValue = details.serial || details.Serial || details.serialNumber || details.serial_number;
    
    if (pinValue && pinValue.trim() !== '') {
      result.pin = pinValue.trim();
      result.serial = serialValue ? serialValue.trim() : '';
      
      // Create pins array for consistency (all exam types use the same structure)
      result.pins = [{
        Pin: result.pin,
        Serial: result.serial,
      }];
      
      console.log(`Parsed single PIN format for ${examType.toUpperCase()}`);
      return result; // Return early if we found single PIN
    }
    
    // Priority 3: Check for alternative formats in the response (nested objects, etc.)
    // Look for any PIN-like fields in the entire response
    const searchForPin = (obj: any, depth = 0): { pin?: string; serial?: string } | null => {
      if (depth > 5 || !obj || typeof obj !== 'object') return null;
      
      for (const [key, value] of Object.entries(obj)) {
        const keyLower = key.toLowerCase();
        
        // Check if this looks like a PIN field
        if ((keyLower.includes('pin') || keyLower === 'code' || keyLower === 'voucher') && typeof value === 'string' && value.trim() !== '') {
          // Try to find corresponding serial
          const serialKeys = ['serial', 'serialnumber', 'serial_number', 'serno'];
          let serial: string | undefined;
          
          for (const sk of serialKeys) {
            if (obj[sk] || obj[sk.charAt(0).toUpperCase() + sk.slice(1)]) {
              serial = (obj[sk] || obj[sk.charAt(0).toUpperCase() + sk.slice(1)])?.toString().trim();
              break;
            }
          }
          
          return { pin: value.toString().trim(), serial };
        }
        
        // Recursively search nested objects
        if (typeof value === 'object' && value !== null && !Array.isArray(value)) {
          const found = searchForPin(value, depth + 1);
          if (found) return found;
        }
      }
      
      return null;
    };
    
    const foundPin = searchForPin(apiResponse);
    if (foundPin && foundPin.pin) {
      result.pin = foundPin.pin;
      result.serial = foundPin.serial || '';
      result.pins = [{
        Pin: result.pin,
        Serial: result.serial,
      }];
      
      console.log(`Parsed PIN from alternative format for ${examType.toUpperCase()}`);
      return result;
    }
    
    console.warn(`No PIN found in response for ${examType.toUpperCase()}. Response structure:`, JSON.stringify(details).substring(0, 500));
    
  } catch (error) {
    console.error('Error parsing PINs from response:', error);
  }
  
  return result;
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

    // Create Supabase client
    const supabaseClient = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_ANON_KEY') ?? '',
      {
        global: {
          headers: { Authorization: authHeader },
        },
      }
    );

    // Verify authentication
    const { data: { user }, error: authError } = await supabaseClient.auth.getUser();
    if (authError || !user) {
      return new Response(
        JSON.stringify({ success: false, error: 'Unauthorized' }),
        { status: 401, headers: { ...CORS_HEADERS, 'Content-Type': 'application/json' } }
      );
    }

    // Parse request body
    const body: PurchaseEducationRequest = await req.json();
    const { exam_type, education_service_id, amount, quantity = 1, billers_code, phone_number, api_code } = body;

    // Validate inputs (education_service_id is optional - can use fallback services)
    if (!exam_type || !amount) {
      return new Response(
        JSON.stringify({
          success: false,
          error: 'exam_type and amount are required',
        }),
        { status: 400, headers: { ...CORS_HEADERS, 'Content-Type': 'application/json' } }
      );
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

    // Get education service details (optional - if not found, use exam_type to derive service_id)
    let educationService: any = null;
    if (education_service_id && !education_service_id.includes('-fallback')) {
      // Only query database if ID looks like a valid UUID (not a fallback ID)
      const { data, error: serviceError } = await supabaseClient
        .from('education_services')
        .select('*')
        .eq('id', education_service_id)
        .single();

      if (!serviceError && data) {
        educationService = data;
      }
    }

    // If service not found in DB, derive service_id from exam_type
    // This allows fallback services to work without requiring DB entry
    const serviceId = educationService?.service_id || MOBILENIG_SERVICE_IDS[exam_type.toUpperCase()] || body.service_id;
    
    if (!serviceId) {
      return new Response(
        JSON.stringify({
          success: false,
          error: 'Unable to determine service ID. Please specify exam_type and service_id.',
        }),
        { status: 400, headers: { ...CORS_HEADERS, 'Content-Type': 'application/json' } }
      );
    }

    // Get user profile and check balance
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

    const balanceBefore = Number(profile.balance) || 0;
    const isDemoUser = profile.email === 'demo@netpayy.ng';

    // Calculate total amount (purchase amount + 7% charge fee)
    const CHARGE_FEE_RATE = 0.07; // 7% charge fee
    const chargeFee = Math.round(purchaseAmount * CHARGE_FEE_RATE * 100) / 100;
    const totalAmount = purchaseAmount + chargeFee;

    // Check balance
    if (balanceBefore < totalAmount) {
      return new Response(
        JSON.stringify({ success: false, error: 'Insufficient balance' }),
        { status: 400, headers: { ...CORS_HEADERS, 'Content-Type': 'application/json' } }
      );
    }

    // serviceId already determined above
    const transId = generateTransId();
    const reference = `EDU-${transId}-${Date.now()}`;

    console.log('Purchasing education service:', {
      exam_type: exam_type.toUpperCase(),
      service_id: serviceId,
      amount: purchaseAmount,
      trans_id: transId,
      is_demo: isDemoUser,
    });

    // Handle demo user purchases - return mock successful response
    if (isDemoUser) {
      // Debit user wallet for demo purchase
      let debitResult;
      try {
        debitResult = await debitUserWallet({
          supabase: supabaseClient,
          userId: user.id,
          amount: totalAmount,
          transactionType: 'education_purchase',
          description: `Education purchase (Demo): ${exam_type.toUpperCase()} - ${reference}`,
          reference: reference,
          performedBy: user.id,
        });
      } catch (debitError: any) {
        return new Response(
          JSON.stringify({ success: false, error: debitError.message || 'Failed to debit wallet' }),
          { status: 500, headers: { ...CORS_HEADERS, 'Content-Type': 'application/json' } }
        );
      }

      // Generate demo PIN based on exam type
      const examTypeUpper = exam_type.toUpperCase();
      let demoPin: string;
      let demoSerial: string;
      let demoPins: Array<{ Pin: string; Serial?: string }> = [];

      if (examTypeUpper === 'JAMB') {
        // JAMB returns single PIN
        demoPin = `607489298863769${Date.now().toString().slice(-6)}`;
        demoSerial = `JAMB-${Date.now()}`;
        demoPins = [{ Pin: demoPin, Serial: demoSerial }];
      } else {
        // WAEC/NECO - single PIN
        demoPin = `980568322686${Date.now().toString().slice(-6)}`;
        demoSerial = `${examTypeUpper}-${Date.now()}`;
        demoPins = [{ Pin: demoPin, Serial: demoSerial }];
      }

      // Mock API response structure for demo
      const mockApiResponse = {
        message: 'success',
        statusCode: '200',
        details: {
          trans_id: transId,
          service: examTypeUpper,
          status: 'Approved',
          details: examTypeUpper === 'JAMB'
            ? {
                amount: purchaseAmount,
                confirmationCode: billers_code || 'DEMO123456',
                pin: demoPin,
                firstName: 'DEMO',
                lastName: 'USER',
                middleName: 'TEST',
                phoneNumber: phone_number || '08012345678',
              }
            : {
                amount: purchaseAmount,
                pins: demoPins.map(p => ({ pin: p.Pin })),
              },
        },
        wallet_balance: (balanceBefore - totalAmount).toString(),
      };

      // Record transaction in database
      const { error: transactionError } = await supabaseClient
        .from('education_transactions')
        .insert({
          user_id: user.id,
          amount: totalAmount,
          purchase_amount: purchaseAmount,
          charge_fee: chargeFee,
          balance_before: debitResult.balanceBefore,
          balance_after: debitResult.balanceAfter,
          exam_type: examTypeUpper,
          phone_number: phone_number || null,
          status: 'completed',
          reference: reference,
          api_response: mockApiResponse,
          pin: demoPin,
          serial_number: demoSerial,
          pins: demoPins.length > 0 ? demoPins : undefined,
          performed_by: user.id,
        });

      if (transactionError) {
        console.error('Failed to record demo transaction:', transactionError);
      }

      return new Response(
        JSON.stringify({
          success: true,
          data: {
            reference: reference,
            pin: demoPin,
            serial: demoSerial,
            pins: demoPins,
            exam_type: examTypeUpper,
            amount: purchaseAmount,
            charge_fee: chargeFee,
            total_amount: totalAmount,
            balance_before: debitResult.balanceBefore,
            balance_after: debitResult.balanceAfter,
          },
        }),
        { status: 200, headers: { ...CORS_HEADERS, 'Content-Type': 'application/json' } }
      );
    }

    // Get MobileNig secret key (required for purchase)
    const mobilenigSecretKey = Deno.env.get('MOBILENIG_SECRET_KEY');
    if (!mobilenigSecretKey) {
      return new Response(
        JSON.stringify({
          success: false,
          error: 'MobileNig credentials not configured',
        }),
        { status: 500, headers: { ...CORS_HEADERS, 'Content-Type': 'application/json' } }
      );
    }

    // Debit user wallet first
    let debitResult;
    try {
      debitResult = await debitUserWallet({
        supabase: supabaseClient,
        userId: user.id,
        amount: totalAmount,
        transactionType: 'education_purchase',
        description: `Education purchase: ${exam_type.toUpperCase()} - ${reference}`,
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
      // For WAEC/NECO: service_id, trans_id, quantity, amount
      // For JAMB: service_id, trans_id, confirmationCode, phoneNumber, productCode, amount
      const requestBody: any = {
        service_id: serviceId,
        trans_id: transId,
        amount: purchaseAmount,
      };

      // Handle JAMB purchase with new format
      if (exam_type.toUpperCase() === 'JAMB') {
        // JAMB requires: confirmationCode, phoneNumber, productCode
        if (!billers_code) {
          return new Response(
            JSON.stringify({
              success: false,
              error: 'JAMB Profile Code (confirmationCode) is required',
            }),
            { status: 400, headers: { ...CORS_HEADERS, 'Content-Type': 'application/json' } }
          );
        }
        
        if (!phone_number) {
          return new Response(
            JSON.stringify({
              success: false,
              error: 'Phone number is required for JAMB purchase. Please verify your profile code first.',
            }),
            { status: 400, headers: { ...CORS_HEADERS, 'Content-Type': 'application/json' } }
          );
        }

        // productCode is the service type (UTME or DE) from api_code or default to UTME
        const productCode = (api_code || 'UTME').toUpperCase();
        if (productCode !== 'UTME' && productCode !== 'DE') {
          return new Response(
            JSON.stringify({
              success: false,
              error: 'Invalid service type. Must be UTME or DE',
            }),
            { status: 400, headers: { ...CORS_HEADERS, 'Content-Type': 'application/json' } }
          );
        }

        requestBody.confirmationCode = billers_code.trim();
        requestBody.phoneNumber = phone_number.trim();
        requestBody.productCode = productCode;
        requestBody.quantity = 1; // JAMB always uses quantity 1
      } else {
        // WAEC/NECO: use quantity
        requestBody.quantity = quantity || 1;
      }

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
      console.log('MobileNig API response (first 1000 chars):', responseText.substring(0, 1000));

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
          description: `Refund for failed education purchase: ${reference}`,
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
        const apiReference = data.details?.details?.reference || data.details?.reference || reference;
        
        // Parse PINs from response
        const pinData = parsePinsFromResponse(data, exam_type);
        
        // Calculate transaction amounts
        const purchaseAmountNum = Number(purchaseAmount);
        const chargeFeeNum = Number(chargeFee);

        // Prepare metadata with PINs
        const metadata = {
          pins: pinData.pins || (pinData.pin ? [{ Pin: pinData.pin, Serial: pinData.serial || '' }] : []),
          educationPin: pinData.pin,
          educationSerial: pinData.serial,
          examType: exam_type.toUpperCase(),
        };

        // Record transaction in database with PINs
        const { error: transactionError } = await supabaseClient
          .from('education_transactions')
          .insert({
            user_id: user.id,
            amount: totalAmount, // Total amount charged to user
            purchase_amount: purchaseAmountNum, // Base purchase amount
            charge_fee: chargeFeeNum, // Charge fee (7%)
            balance_before: debitResult.balanceBefore,
            balance_after: debitResult.balanceAfter,
            exam_type: exam_type.toUpperCase(),
            phone_number: phone_number || null,
            pin: pinData.pin || null, // Store single PIN for backward compatibility
            serial_number: pinData.serial || null, // Store serial number
            pins: pinData.pins || null, // Store pins array (for JAMB which can have multiple)
            status: 'completed',
            reference: apiReference,
            api_response: data,
            metadata: metadata, // Store PINs in metadata for easy access
            performed_by: user.id,
          });

        if (transactionError) {
          console.error('Failed to record transaction:', transactionError);
          // Wallet was debited but transaction recording failed - refund user
          try {
            await creditUserWallet({
              supabase: supabaseClient,
              userId: user.id,
              amount: totalAmount,
              transactionType: 'refund',
              description: `Refund for failed transaction recording: ${reference}`,
              reference: `REF-${reference}`,
              performedBy: user.id,
            });
            console.log('User refunded due to transaction recording failure');
          } catch (refundError) {
            console.error('CRITICAL: Failed to refund user after transaction recording failure:', refundError);
            // This is a critical error - user was debited but we can't record or refund
            // Log it for manual intervention
          }
          
          return new Response(
            JSON.stringify({
              success: false,
              error: 'Transaction completed but failed to record. Amount has been refunded. Please contact support if you see this message.',
            }),
            { status: 200, headers: { ...CORS_HEADERS, 'Content-Type': 'application/json' } }
          );
        }

        console.log('Education purchase successful:', {
          reference: apiReference,
          exam_type: exam_type.toUpperCase(),
          pins_count: pinData.pins?.length || (pinData.pin ? 1 : 0),
        });

        // Send email with PDF receipt (non-blocking)
        if (profile.email && pinData.pin) {
          try {
            const supabaseService = createClient(
              Deno.env.get('SUPABASE_URL') ?? '',
              Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
            );
            
            await supabaseService.functions.invoke('send-purchase-email', {
              body: {
                type: 'education',
                email: profile.email,
                fullName: profile.full_name,
                examType: exam_type.toUpperCase(),
                pin: pinData.pin,
                serial: pinData.serial,
                phoneNumber: phone_number || undefined,
                amount: totalAmount,
                purchaseAmount: purchaseAmountNum,
                chargeFee: chargeFeeNum,
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
              pins: pinData.pins || (pinData.pin ? [{ Pin: pinData.pin, Serial: pinData.serial || '' }] : []),
              pin: pinData.pin, // For backward compatibility
              serial: pinData.serial,
              exam_type: exam_type.toUpperCase(),
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
        // Purchase failed - refund user (wallet was already debited)
        try {
          await creditUserWallet({
            supabase: supabaseClient,
            userId: user.id,
            amount: totalAmount,
            transactionType: 'refund',
            description: `Refund for failed education purchase: ${reference}`,
            reference: `REF-${reference}`,
            performedBy: user.id,
          });
          
          // Record failed transaction for audit trail
          const purchaseAmountNum = Number(purchaseAmount);
          const chargeFeeNum = Number(chargeFee);
          
          await supabaseClient
            .from('education_transactions')
            .insert({
              user_id: user.id,
              amount: totalAmount,
              purchase_amount: purchaseAmountNum,
              charge_fee: chargeFeeNum,
              balance_before: debitResult.balanceBefore,
              balance_after: debitResult.balanceAfter + totalAmount, // After refund
              exam_type: exam_type.toUpperCase(),
              phone_number: phone_number || null,
              status: 'failed',
              reference: reference,
              api_response: data,
              metadata: { refunded: true, error: 'Purchase failed from provider' },
              performed_by: user.id,
            }).catch((err) => {
              console.error('Failed to record failed transaction:', err);
              // Non-critical - we already refunded
            });
        } catch (refundError) {
          console.error('CRITICAL: Failed to refund user after purchase failure:', refundError);
          // This is a critical error - user was debited but we can't refund
          // Log it for manual intervention
        }

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

        console.log('Education purchase failed:', {
          statusCode,
          errorMessage,
          refunded: true,
        });

        return new Response(
          JSON.stringify({
            success: false,
            error: `${errorMessage}. Amount has been refunded.`,
            statusCode,
          }),
          { status: 200, headers: { ...CORS_HEADERS, 'Content-Type': 'application/json' } }
        );
      }
    } catch (apiError: any) {
      console.error('Error calling MobileNig API:', apiError);
      // Refund user on API error (wallet was already debited)
      try {
        await creditUserWallet({
          supabase: supabaseClient,
          userId: user.id,
          amount: totalAmount,
          transactionType: 'refund',
          description: `Refund for failed education purchase: ${reference}`,
          reference: `REF-${reference}`,
          performedBy: user.id,
        });
        
        // Record failed transaction for audit trail
        await supabaseClient
          .from('education_transactions')
          .insert({
            user_id: user.id,
            amount: totalAmount,
            purchase_amount: purchaseAmount,
            charge_fee: chargeFee,
            balance_before: debitResult.balanceBefore,
            balance_after: debitResult.balanceAfter + totalAmount, // After refund
            exam_type: exam_type.toUpperCase(),
            phone_number: phone_number || null,
            status: 'failed',
            reference: reference,
            api_response: { error: apiError.message || 'API call failed', error_type: 'api_error' },
            metadata: { error: apiError.message, refunded: true },
            performed_by: user.id,
          }).catch((err) => {
            console.error('Failed to record failed transaction:', err);
            // Non-critical - we already refunded
          });
      } catch (refundError) {
        console.error('CRITICAL: Failed to refund user after API error:', refundError);
        // This is a critical error - user was debited but we can't refund
        // Log it for manual intervention
      }

      return new Response(
        JSON.stringify({
          success: false,
          error: apiError.message || 'Service temporarily unavailable. Amount has been refunded.',
        }),
        { status: 200, headers: { ...CORS_HEADERS, 'Content-Type': 'application/json' } }
      );
    }
  } catch (error: any) {
    console.error('Error purchasing education service:', error);
    
    // Check if wallet was already debited (debitResult exists)
    // If so, we need to refund
    if (typeof debitResult !== 'undefined') {
      try {
        await creditUserWallet({
          supabase: supabaseClient,
          userId: user.id,
          amount: totalAmount,
          transactionType: 'refund',
          description: `Refund for failed education purchase: ${reference || 'unknown'}`,
          reference: `REF-${reference || Date.now()}`,
          performedBy: user.id,
        });
        console.log('User refunded due to unexpected error');
      } catch (refundError) {
        console.error('CRITICAL: Failed to refund user after unexpected error:', refundError);
        // This is a critical error - user was debited but we can't refund
        // Log it for manual intervention
      }
    }
    
    return new Response(
      JSON.stringify({
        success: false,
        error: error.message || 'Failed to purchase education service. If you were charged, please contact support.',
      }),
      { status: 500, headers: { ...CORS_HEADERS, 'Content-Type': 'application/json' } }
    );
  }
});
