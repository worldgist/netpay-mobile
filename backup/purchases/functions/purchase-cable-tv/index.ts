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
    const MOBILENIG_PUBLIC_KEY = Deno.env.get('MOBILENIG_PUBLIC_KEY');
    const MOBILENIG_SECRET_KEY = Deno.env.get('MOBILENIG_SECRET_KEY');
    
    if (!MOBILENIG_PUBLIC_KEY) {
      throw new Error('MOBILENIG_PUBLIC_KEY not configured');
    }

    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    // Get authenticated user
    const authHeader = req.headers.get('Authorization');
    console.log('Authorization header present:', !!authHeader);
    console.log('Authorization header length:', authHeader?.length || 0);
    
    if (!authHeader) {
      console.error('No Authorization header provided');
      return new Response(
        JSON.stringify({ success: false, error: 'Unauthorized - Please sign in to continue' }),
        { status: 401, headers: { ...CORS_HEADERS, 'Content-Type': 'application/json' } }
      );
    }

    // Extract token - handle both "Bearer token" and just "token" formats
    const token = authHeader.startsWith('Bearer ') 
      ? authHeader.substring(7).trim() 
      : authHeader.trim();
    
    console.log('Token extracted, length:', token.length);
    
    if (!token) {
      console.error('No token found in Authorization header');
      return new Response(
        JSON.stringify({ success: false, error: 'Unauthorized - Invalid token' }),
        { status: 401, headers: { ...CORS_HEADERS, 'Content-Type': 'application/json' } }
      );
    }

    const { data: { user }, error: authError } = await supabase.auth.getUser(token);
    
    if (authError || !user) {
      console.error('Authentication error:', {
        error: authError?.message,
        code: authError?.status,
        hasUser: !!user
      });
      return new Response(
        JSON.stringify({ 
          success: false, 
          error: 'Unauthorized - Please sign in to continue',
          details: authError?.message 
        }),
        { status: 401, headers: { ...CORS_HEADERS, 'Content-Type': 'application/json' } }
      );
    }

    console.log('User authenticated successfully:', user.id);

    // Parse request body with error handling
    let body: any = {};
    try {
      const bodyText = await req.text();
      if (bodyText && bodyText.trim().length > 0) {
        body = JSON.parse(bodyText);
      }
    } catch (parseError) {
      console.error('Error parsing request body:', parseError);
      return new Response(
        JSON.stringify({ success: false, error: 'Invalid request body format' }),
        { status: 400, headers: { ...CORS_HEADERS, 'Content-Type': 'application/json' } }
      );
    }

    const { card_number, plan_id, provider, customer_number, customer_name } = body;

    if (!card_number || !plan_id || !provider) {
      return new Response(
        JSON.stringify({ success: false, error: 'Missing required fields' }),
        { status: 400, headers: { ...CORS_HEADERS, 'Content-Type': 'application/json' } }
      );
    }

    // Customer information is required for MobileNig API
    if (!customer_number || !customer_name) {
      return new Response(
        JSON.stringify({ 
          success: false, 
          error: 'Customer information is required. Please verify your smart card number first.' 
        }),
        { status: 400, headers: { ...CORS_HEADERS, 'Content-Type': 'application/json' } }
      );
    }

    // Get plan details
    const { data: plan, error: planError } = await supabase
      .from('cable_tv_plans')
      .select('*')
      .eq('id', plan_id)
      .single();

    if (planError || !plan) {
      return new Response(
        JSON.stringify({ success: false, error: 'Plan not found' }),
        { status: 404, headers: { ...CORS_HEADERS, 'Content-Type': 'application/json' } }
      );
    }

    // Get the active cable vending provider from app_settings
    const { data: providerSetting } = await supabase
      .from('app_settings')
      .select('setting_value')
      .eq('setting_key', 'cable_provider')
      .maybeSingle();

    const vendingProvider = providerSetting?.setting_value?.provider || plan.vending_provider || 'smeplug';
    console.log('Cable vending provider:', vendingProvider, 'for plan:', plan_id);

    // If using VTpass, route to VTpass handler
    if (vendingProvider === 'vtpass') {
      // Get the VTpass purchase function URL and forward the request
      const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
      const functionUrl = `${supabaseUrl}/functions/v1/purchase-vtpass-cable`;
      
      try {
        const vtpassResponse = await fetch(functionUrl, {
          method: 'POST',
          headers: {
            'Authorization': authHeader,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            billersCode: card_number,
            card_number: card_number,
            smartcard_number: card_number,
            plan_id: plan_id,
            provider: provider,
            amount: plan.custom_price || plan.original_price || plan.price,
          }),
        });

        const vtpassResult = await vtpassResponse.json();
        return new Response(
          JSON.stringify(vtpassResult),
          { 
            status: vtpassResponse.status, 
            headers: { ...CORS_HEADERS, 'Content-Type': 'application/json' } 
          }
        );
      } catch (vtpassError) {
        console.error('Error forwarding to VTpass function:', vtpassError);
        return new Response(
          JSON.stringify({ 
            success: false, 
            error: 'Failed to process VTpass purchase. Please try again.' 
          }),
          { status: 500, headers: { ...CORS_HEADERS, 'Content-Type': 'application/json' } }
        );
      }
    }

    // Get user balance and email
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

    const isDemoUser = profile.email === 'demo@netpayy.ng';
    const effectivePrice = Number(plan.custom_price || plan.original_price || plan.price || 0);

    // For demo users, return mock successful response
    if (isDemoUser) {
      console.log('Demo user detected - using mock API response for cable TV purchase');
      
      const balanceBefore = Number(profile.balance) || 0;
      if (balanceBefore < effectivePrice) {
        return new Response(
          JSON.stringify({ success: false, error: 'Insufficient balance' }),
          { status: 400, headers: { ...CORS_HEADERS, 'Content-Type': 'application/json' } }
        );
      }

      const reference = `CABLE-${Date.now()}-${user.id.substring(0, 8)}`;

      // Debit wallet using shared function
      const { debitUserWallet } = await import('../_shared/wallet.ts');
      const debitResult = await debitUserWallet({
        supabase,
        userId: user.id,
        amount: effectivePrice,
        transactionType: 'cable_purchase',
        description: `Cable TV purchase - ${plan.package_name || provider}`,
        reference,
        performedBy: user.id,
        balanceBefore,
        notification: {
          title: 'Cable TV purchase successful (Demo)',
          message: `${plan.package_name || provider} subscription purchased. Reference: ${reference}.`,
        },
      });

      // Record transaction
      await supabase.from('cable_tv_transactions').insert({
        user_id: user.id,
        smartcard_number: card_number,
        provider: provider,
        package_name: plan.package_name,
        amount: effectivePrice,
        balance_before: debitResult.balanceBefore,
        balance_after: debitResult.balanceAfter,
        status: 'success',
        reference,
        vendor: 'demo',
        performed_by: user.id
      });

      return new Response(
        JSON.stringify({
          success: true,
          data: {
            reference,
            smartcard_number: card_number,
            provider: provider,
            package_name: plan.package_name,
            amount: effectivePrice,
            vendor: 'demo',
            balance_before: debitResult.balanceBefore,
            balance_after: debitResult.balanceAfter
          },
          message: 'Cable TV subscription purchased successfully (Demo)',
        }),
        { status: 200, headers: { ...CORS_HEADERS, 'Content-Type': 'application/json' } }
      );
    }

    console.log('Price calculation:', {
      custom_price: plan.custom_price,
      original_price: plan.original_price,
      price: plan.price,
      effectivePrice: effectivePrice
    });

    // Check minimum amount requirement (MobileNig requires minimum ₦500)
    const MINIMUM_AMOUNT = 500;
    if (effectivePrice < MINIMUM_AMOUNT) {
      console.log(`Amount validation failed: ${effectivePrice} < ${MINIMUM_AMOUNT}`);
      return new Response(
        JSON.stringify({ 
          success: false, 
          error: `Minimum purchase amount is ₦${MINIMUM_AMOUNT}. Selected package amount (₦${effectivePrice}) is below the minimum.` 
        }),
        { status: 400, headers: { ...CORS_HEADERS, 'Content-Type': 'application/json' } }
      );
    }
    
    console.log(`Amount validation passed: ${effectivePrice} >= ${MINIMUM_AMOUNT}`);

    if (profile.balance < effectivePrice) {
      return new Response(
        JSON.stringify({ success: false, error: 'Insufficient balance' }),
        { status: 400, headers: { ...CORS_HEADERS, 'Content-Type': 'application/json' } }
      );
    }

    // Map provider to service ID
    const serviceIdMap: Record<string, string> = {
      'GOTV': 'AKA',
      'STARTIMES': 'AKB',
      'DSTV': 'AKC'
    };

    const service_id = serviceIdMap[provider.toUpperCase()];
    
    if (!service_id) {
      return new Response(
        JSON.stringify({ success: false, error: 'Invalid provider' }),
        { status: 400, headers: { ...CORS_HEADERS, 'Content-Type': 'application/json' } }
      );
    }

    const reference = `CABLE-${Date.now()}-${user.id.substring(0, 8)}`;
    // Generate trans_id as a number (10-12 digits as shown in API examples)
    // MobileNig requires a unique trans_id - use timestamp + random to ensure uniqueness
    const trans_id = parseInt(Date.now().toString().slice(-10) + Math.floor(Math.random() * 1000).toString().padStart(3, '0')) || Date.now();
    
    // Ensure trans_id is within valid range (not too large)
    const maxTransId = 999999999999; // 12 digits max
    const finalTransId = trans_id > maxTransId ? trans_id % maxTransId : trans_id;

    // Use direct purchase with MobileNig API
    // Cable TV purchases require SECRET_KEY (not PUBLIC_KEY)
    const apiKey = MOBILENIG_SECRET_KEY || MOBILENIG_PUBLIC_KEY;
    if (!apiKey) {
      return new Response(
        JSON.stringify({ success: false, error: 'MOBILENIG_SECRET_KEY or MOBILENIG_PUBLIC_KEY not configured' }),
        { status: 500, headers: { ...CORS_HEADERS, 'Content-Type': 'application/json' } }
      );
    }
    
    const apiUrl = 'https://enterprise.mobilenig.com/api/v2/services/';
    
    // Convert customer_number and smartcardNumber to numbers as per MobileNig API spec
    // customerNumber and smartcardNumber should be numbers, not strings
    const customerNumberNum = customer_number ? parseInt(String(customer_number).replace(/\D/g, '')) : null;
    const smartcardNumberNum = card_number ? parseInt(String(card_number).replace(/\D/g, '')) : null;
    
    // Validate that we have numeric values
    if (!customerNumberNum || isNaN(customerNumberNum)) {
      return new Response(
        JSON.stringify({ 
          success: false, 
          error: 'Invalid customer number. Please verify your smart card number first.' 
        }),
        { status: 400, headers: { ...CORS_HEADERS, 'Content-Type': 'application/json' } }
      );
    }
    
    if (!smartcardNumberNum || isNaN(smartcardNumberNum)) {
      return new Response(
        JSON.stringify({ 
          success: false, 
          error: 'Invalid smart card number.' 
        }),
        { status: 400, headers: { ...CORS_HEADERS, 'Content-Type': 'application/json' } }
      );
    }
    
    // Clean and format customer name (remove extra spaces, ensure proper format)
    const cleanedCustomerName = String(customer_name || '').trim().replace(/\s+/g, ' ');
    
    if (!cleanedCustomerName) {
      return new Response(
        JSON.stringify({ 
          success: false, 
          error: 'Customer name is required. Please verify your smart card number first.' 
        }),
        { status: 400, headers: { ...CORS_HEADERS, 'Content-Type': 'application/json' } }
      );
    }
    
    // According to MobileNig API documentation, the payload should match exactly
    // Remove 'reference' field as it's not in the API spec for purchase
    // Use 'productCode' instead of 'product_code' to match API spec
    // According to MobileNig API documentation, the payload should match exactly:
    // { service_id, trans_id, customerNumber, smartcardNumber, customerName, amount }
    // Note: productCode is NOT in the API spec for direct purchase - it's only for change subscription
    const apiPayload = {
      service_id: service_id,
      trans_id: finalTransId,
      customerNumber: customerNumberNum, // Number
      smartcardNumber: smartcardNumberNum, // Number
      customerName: cleanedCustomerName, // String
      amount: Number(effectivePrice)
      // Removed productCode - not in API spec for direct purchase
    };
    
    console.log('Using MobileNig direct purchase endpoint:', apiUrl);
    console.log('Using API key type:', MOBILENIG_SECRET_KEY ? 'SECRET_KEY' : 'PUBLIC_KEY');
    console.log('Purchase amount being sent:', effectivePrice);
    console.log('Raw customer data received:', {
      customer_number: customer_number,
      customer_name: customer_name,
      card_number: card_number,
      customer_number_type: typeof customer_number,
      customer_name_type: typeof customer_name,
      card_number_type: typeof card_number
    });
    console.log('Processed customer data:', {
      customerNumber: customerNumberNum,
      customerNumber_type: typeof customerNumberNum,
      smartcardNumber: smartcardNumberNum,
      smartcardNumber_type: typeof smartcardNumberNum,
      customerName: cleanedCustomerName,
      customerName_type: typeof cleanedCustomerName
    });
    console.log('Purchase payload:', JSON.stringify(apiPayload, null, 2));
    console.log('Payload types:', {
      service_id: typeof apiPayload.service_id,
      trans_id: typeof apiPayload.trans_id,
      customerNumber: typeof apiPayload.customerNumber,
      smartcardNumber: typeof apiPayload.smartcardNumber,
      customerName: typeof apiPayload.customerName,
      product_code: typeof apiPayload.product_code,
      amount: typeof apiPayload.amount
    });

    // Build headers for MobileNig API
    const apiHeaders: HeadersInit = {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${apiKey}`,
    };

    console.log('Calling MobileNig API:', {
      url: apiUrl,
      method: 'POST',
      key_type: MOBILENIG_SECRET_KEY ? 'SECRET_KEY' : 'PUBLIC_KEY',
      payload: apiPayload
    });

    // Call MobileNig API
    const apiResponse = await fetch(apiUrl, {
      method: 'POST',
      headers: apiHeaders,
      body: JSON.stringify(apiPayload),
    });

    // Read response as text first to handle HTML error pages
    const responseText = await apiResponse.text();
    console.log('MobileNig API response status:', apiResponse.status);
    console.log('MobileNig API response headers:', Object.fromEntries(apiResponse.headers.entries()));
    console.log('MobileNig API response text (first 1000 chars):', responseText.substring(0, 1000));

    // Check if response is HTML (error page)
    if (responseText.trim().startsWith('<!DOCTYPE') || responseText.trim().startsWith('<html') || !apiResponse.ok) {
      console.error('API returned HTML error page or non-OK status');
      return new Response(
        JSON.stringify({ 
          success: false, 
          error: 'Cable TV purchase failed. Please check your API credentials.',
          details: {
            status: apiResponse.status,
            statusText: apiResponse.statusText,
            response_preview: responseText.substring(0, 500),
            endpoint: apiUrl
          }
        }),
        { status: 400, headers: { ...CORS_HEADERS, 'Content-Type': 'application/json' } }
      );
    }

    // Parse JSON response
    let apiResult: any;
    try {
      apiResult = JSON.parse(responseText);
      console.log('Successfully parsed API response:', JSON.stringify(apiResult, null, 2));
    } catch (parseError) {
      console.error('Failed to parse API response as JSON:', parseError);
      return new Response(
        JSON.stringify({ 
          success: false, 
          error: 'Invalid response from cable TV provider',
          details: {
            parse_error: parseError instanceof Error ? parseError.message : String(parseError),
            response_preview: responseText.substring(0, 500)
          }
        }),
        { status: 400, headers: { ...CORS_HEADERS, 'Content-Type': 'application/json' } }
      );
    }
    
    console.log('MobileNig API response:', JSON.stringify(apiResult, null, 2));

    // Check for success - both endpoints return statusCode "200" on success
    const isSuccess = apiResponse.ok && (
      apiResult.statusCode === '200' || 
      apiResult.statusCode === 200 ||
      (apiResult.message && apiResult.message.toLowerCase() === 'success')
    );

    // Check transaction details for status
    const transactionDetails = apiResult.details || {};
    const transactionStatus = transactionDetails.status || transactionDetails.Status || '';
    const statusLower = String(transactionStatus).toLowerCase();
    
    // Check if transaction was cancelled or failed
    const isCancelled = statusLower.includes('cancelled') || 
                       statusLower.includes('cancel') ||
                       statusLower.includes('failed') ||
                       statusLower.includes('rejected') ||
                       statusLower.includes('declined');
    
    const isApproved = statusLower.includes('approved') || 
                      statusLower.includes('success') ||
                      statusLower === 'successful' ||
                      statusLower === 'completed';

    // Log transaction status for debugging
    console.log('Transaction status check:', {
      isSuccess,
      statusCode: apiResult.statusCode,
      message: apiResult.message,
      transactionStatus: transactionStatus,
      statusLower: statusLower,
      isCancelled: isCancelled,
      isApproved: isApproved,
      details: transactionDetails
    });

    // If transaction was cancelled, return error before debiting wallet
    if (isCancelled) {
      console.error('Transaction was cancelled by MobileNig:', {
        status: transactionStatus,
        statusCode: apiResult.statusCode,
        details: transactionDetails,
        fullResponse: apiResult
      });
      
      // Provide specific error messages based on status code
      let errorMessage = `Transaction was cancelled by MobileNig. Status: ${transactionStatus || 'Unknown'}`;
      let errorDetails: any = {
        status: transactionStatus,
        statusCode: apiResult.statusCode,
        message: transactionDetails.message || apiResult.message,
        exchangeReference: transactionDetails.exchangeReference,
        customerCareReferenceId: transactionDetails.customerCareReferenceId
      };
      
      // Handle specific error codes
      if (apiResult.statusCode === 'EXC020') {
        errorMessage = 'Transaction was cancelled by MobileNig. This may be due to invalid product code, insufficient balance in MobileNig account, or service unavailability. Please try again or contact support.';
        errorDetails.reason = 'EXC020 - Transaction Cancelled';
        errorDetails.suggestions = [
          'Verify the product code is correct',
          'Check if MobileNig account has sufficient balance',
          'Try again in a few moments',
          'Contact support if issue persists'
        ];
      } else if (apiResult.statusCode) {
        errorMessage = `Transaction failed. Error code: ${apiResult.statusCode}. ${transactionDetails.message || apiResult.message || 'Please try again or contact support.'}`;
        errorDetails.reason = `Status Code: ${apiResult.statusCode}`;
      }
      
      return new Response(
        JSON.stringify({ 
          success: false, 
          error: errorMessage,
          details: errorDetails
        }),
        { status: 400, headers: { ...CORS_HEADERS, 'Content-Type': 'application/json' } }
      );
    }

    // Treat "Processing" as successful - MobileNig often returns "Processing" for successful transactions
    // that are being processed on their end. We'll process immediately and debit the wallet.
    const isProcessing = statusLower.includes('processing') || 
                        statusLower === 'processing' ||
                        transactionStatus === 'Processing';
    
    // If status is "Processing", treat it as approved for immediate processing
    const shouldProcess = isApproved || isProcessing || isSuccess;
    
    // Verify transaction is actually approved/successful or processing
    if (!shouldProcess && transactionStatus) {
      console.error('Transaction not approved:', {
        status: transactionStatus,
        details: transactionDetails
      });
      
      return new Response(
        JSON.stringify({ 
          success: false, 
          error: `Transaction not approved. Status: ${transactionStatus || 'Unknown'}`,
          details: transactionDetails
        }),
        { status: 400, headers: { ...CORS_HEADERS, 'Content-Type': 'application/json' } }
      );
    }

    // Use initial transaction status - query verification can be done asynchronously if needed
    // This reduces function execution time and prevents EarlyDrop shutdowns
    let actualStatus = transactionStatus || 'Unknown';
    let queryDetails: any = null;
    
    // Only query if transaction status is unclear or we need verification
    // Skip query for clearly approved/processing transactions to reduce execution time and process immediately
    const needsVerification = !isApproved && !isProcessing && !transactionStatus;
    
    if (needsVerification) {
      try {
        console.log('Querying transaction status to verify:', trans_id);
        const queryUrl = `https://enterprise.mobilenig.com/api/v2/services/query?trans_id=${trans_id}`;
        
        // Add timeout to prevent hanging
        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), 5000); // 5 second timeout
        
        const queryResponse = await fetch(queryUrl, {
          method: 'GET',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${apiKey}`,
          },
          signal: controller.signal,
        });

        clearTimeout(timeoutId);

        if (queryResponse.ok) {
          const queryText = await queryResponse.text();
          const queryResult = JSON.parse(queryText);
          
          console.log('Query result:', {
            statusCode: queryResult.statusCode,
            message: queryResult.message,
            details: queryResult.details
          });

          if (queryResult.statusCode === '200' && queryResult.message === 'success') {
            queryDetails = queryResult.details || {};
            actualStatus = queryDetails.status || transactionStatus || 'Unknown';
            const queryStatus = String(actualStatus).toLowerCase();
            
            const verifiedStatus = queryStatus.includes('approved') || 
                            queryStatus.includes('success') ||
                            queryStatus === 'successful' ||
                            queryStatus === 'completed' ||
                            queryStatus.includes('processing'); // Treat processing as verified for immediate processing
            
            // Only mark as truly pending if status is explicitly "Pending" (not "Processing")
            const isPending = (queryStatus.includes('pending') && !queryStatus.includes('processing')) ||
                             queryStatus === 'pending';
            
            if (isPending) {
              console.warn('Transaction is pending in MobileNig (not processing):', {
                trans_id: trans_id,
                status: actualStatus,
                details: queryDetails
              });
            } else if (!verifiedStatus) {
              console.error('Transaction verification failed - status not approved:', {
                trans_id: trans_id,
                status: actualStatus,
                details: queryDetails
              });
              
              return new Response(
                JSON.stringify({ 
                  success: false, 
                  error: `Transaction verification failed. Status: ${actualStatus || 'Unknown'}`,
                  details: queryDetails
                }),
                { status: 400, headers: { ...CORS_HEADERS, 'Content-Type': 'application/json' } }
              );
            }
          }
        } else {
          console.warn('Failed to query transaction status, proceeding with initial response');
        }
      } catch (queryError: any) {
        if (queryError.name === 'AbortError') {
          console.warn('Transaction status query timed out, proceeding with initial response');
        } else {
          console.warn('Error querying transaction status, proceeding with initial response:', queryError);
        }
        // Continue with initial response if query fails
      }
    } else {
      console.log('Transaction clearly approved, skipping status query to reduce execution time');
    }
    
    // Determine final transaction status
    // Treat "Processing" as successful for immediate processing
    const finalStatusLower = String(actualStatus).toLowerCase();
    const isProcessingFinal = finalStatusLower.includes('processing') || 
                             actualStatus === 'Processing';
    // Only mark as pending if explicitly "Pending" (not "Processing")
    const isPending = (finalStatusLower.includes('pending') && !isProcessingFinal) ||
                     finalStatusLower === 'pending' ||
                     actualStatus === 'Pending';
    const isApprovedFinal = finalStatusLower.includes('approved') || 
                           finalStatusLower.includes('success') ||
                           finalStatusLower === 'successful' ||
                           finalStatusLower === 'completed' ||
                           isProcessingFinal || // Treat processing as approved for immediate processing
                           actualStatus === 'Approved' ||
                           actualStatus === 'Success' ||
                           actualStatus === 'Processing';
    
    // Process immediately if approved, successful, or processing
    // Only fail if status is explicitly not approved and not processing
    if (!isApprovedFinal && !isPending) {
      return new Response(
        JSON.stringify({ 
          success: false, 
          error: `Transaction not approved. Status: ${actualStatus || 'Unknown'}`,
          details: queryDetails || transactionDetails
        }),
        { status: 400, headers: { ...CORS_HEADERS, 'Content-Type': 'application/json' } }
      );
    }

    if (!isSuccess) {
      // Create failed transaction record
      await supabase.from('user_transactions').insert({
        user_id: user.id,
        transaction_type: 'purchase',
        amount: effectivePrice,
        balance_before: profile.balance,
        balance_after: profile.balance,
        description: `Failed: ${provider} - ${plan.package_name} - ${card_number}`,
        reference: reference,
      });

      // Extract user-friendly error message
      let errorMessage = apiResult.message || 'Cable TV purchase failed';
      const errorDetails = apiResult.details || '';
      
      // Handle specific API errors
      if (apiResult.statusCode === 'EXC008' || errorDetails.includes('Amount must not be less than')) {
        errorMessage = `Minimum purchase amount is ₦500. The selected package amount (₦${effectivePrice}) is below the minimum required.`;
      } else if (errorDetails) {
        errorMessage = errorDetails;
      }

      return new Response(
        JSON.stringify({ 
          success: false, 
          error: errorMessage,
          details: apiResult
        }),
        { status: 400, headers: { ...CORS_HEADERS, 'Content-Type': 'application/json' } }
      );
    }

    const formattedAmount = `₦${effectivePrice.toFixed(2)}`;

    console.log('Debiting user wallet:', {
      userId: user.id,
      amount: effectivePrice,
      balanceBefore: Number(profile.balance) || 0,
      reference: reference
    });

    let debitResult;
    try {
      // Process transaction immediately - treat "Processing" as successful
      // MobileNig "Processing" status means transaction is being processed and will complete
      const transactionDescription = `${provider} - ${plan.package_name} - ${card_number}`;
      
      console.log('Processing transaction immediately:', {
        status: actualStatus,
        isProcessing: isProcessingFinal,
        isPending: isPending,
        willDebit: true
      });
      
      debitResult = await debitUserWallet({
        supabase,
        userId: user.id,
        amount: effectivePrice,
        transactionType: 'purchase',
        description: transactionDescription,
        reference,
        performedBy: user.id,
        balanceBefore: Number(profile.balance) || 0,
        notification: {
          title: 'Cable TV purchase successful',
          message: `${formattedAmount} paid for ${provider} (${plan.package_name}) smart card ${card_number}. Reference: ${reference}.`,
        },
      });
      console.log('Wallet debited successfully:', debitResult);
    } catch (debitError) {
      console.error('Error debiting wallet:', debitError);
      // Even if wallet debit fails, the API purchase was successful
      // Create a transaction record manually
      const balanceAfter = (Number(profile.balance) || 0) - effectivePrice;
      const transactionDescription = `${provider} - ${plan.package_name} - ${card_number}`;
      
      await supabase.from('user_transactions').insert({
        user_id: user.id,
        transaction_type: 'purchase',
        amount: effectivePrice,
        balance_before: Number(profile.balance) || 0,
        balance_after: balanceAfter,
        description: transactionDescription,
        reference: reference,
        performed_by: user.id,
      });
      
      // Update balance manually
      await supabase
        .from('profiles')
        .update({ balance: balanceAfter })
        .eq('id', user.id);
      
      debitResult = {
        balanceBefore: Number(profile.balance) || 0,
        balanceAfter: balanceAfter,
        reference: reference,
      };
    }

    return new Response(
      JSON.stringify({ 
        success: true,
        data: {
          reference: reference,
          amount: effectivePrice,
          balance_after: debitResult.balanceAfter,
          provider: provider,
          package: plan.package_name,
          card_number: card_number,
          customer_name: customer_name,
          status: actualStatus,
          trans_id: trans_id,
          mobilenig_details: queryDetails || transactionDetails,
          api_response: apiResult
        }
      }),
      { status: 200, headers: { ...CORS_HEADERS, 'Content-Type': 'application/json' } }
    );

    // Send push notification
    await sendPushNotification(
      supabase,
      user.id,
      'Cable TV Subscription Successful',
      `₦${effectivePrice.toFixed(2)} ${plan.package_name} subscription successful for ${provider} (Card: ${card_number}). Your new balance is ₦${debitResult.balanceAfter.toFixed(2)}.`,
      {
        type: 'cable_tv_subscription',
        reference,
        amount: effectivePrice,
        provider,
        package_name: plan.package_name,
        card_number: card_number,
      }
    );

  } catch (error) {
    console.error('Error in purchase-cable-tv function:', error);
    console.error('Error stack:', error instanceof Error ? error.stack : 'No stack trace');
    console.error('Error details:', JSON.stringify(error, Object.getOwnPropertyNames(error)));
    
    const errorMessage = error instanceof Error 
      ? error.message 
      : typeof error === 'string' 
        ? error 
        : 'Unknown error occurred';
    
    return new Response(
      JSON.stringify({ 
        success: false, 
        error: errorMessage,
        error_type: error instanceof Error ? error.constructor.name : typeof error
      }),
      { status: 500, headers: { ...CORS_HEADERS, 'Content-Type': 'application/json' } }
    );
  }
});
