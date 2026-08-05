import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.7.1";
import { debitUserWallet, getUserLedgerBalance } from "../_shared/wallet.ts";
import { sendPushNotification } from "../_shared/push-notifications.ts";
import {
  extractPayvesselPaymentFields,
  getPayvesselWebhookUrl,
  shouldProcessPayvesselEvent,
  verifyPayvesselWebhook,
} from "../_shared/payvessel-webhook.ts";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

// Funding fee configuration
const FUNDING_FEE_PERCENTAGE = 0.05; // 5% fee (e.g., ₦50 for ₦1000 funding)
const MIN_FUNDING_FEE = 10; // Minimum fee of ₦10

/**
 * Calculate funding fee based on amount
 * Charges 5% of funding amount (e.g., ₦50 for ₦1000)
 * Minimum fee is ₦10
 */
const calculateFundingFee = (amount: number): number => {
  const percentageFee = amount * FUNDING_FEE_PERCENTAGE;
  return Math.max(MIN_FUNDING_FEE, Math.round(percentageFee * 100) / 100); // Round to 2 decimal places
};

serve(async (req) => {
  // Health check endpoint
  if (req.method === 'GET') {
    return new Response(
      JSON.stringify({ 
        status: 'ok', 
        function: 'payvessel-webhook',
        webhook_url: getPayvesselWebhookUrl(),
        timestamp: new Date().toISOString(),
        message: 'Webhook endpoint is active and ready to receive requests'
      }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 200 }
    );
  }

  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  const startTime = Date.now();
  console.log('=== PayVessel Webhook Called ===');
  console.log('Method:', req.method);
  console.log('URL:', req.url);
  console.log('Headers:', Object.fromEntries(req.headers.entries()));
  console.log('Timestamp:', new Date().toISOString());
  console.log('Start time:', startTime);

  try {
    const supabaseUrl = Deno.env.get('SUPABASE_URL');
    const serviceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');

    if (!supabaseUrl || !serviceRoleKey) {
      console.error('Missing environment variables:', {
        hasUrl: !!supabaseUrl,
        hasKey: !!serviceRoleKey
      });
      return new Response(
        JSON.stringify({ 
          error: 'Server configuration error',
          message: 'Missing required environment variables'
        }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 500 }
      );
    }

    console.log('Creating Supabase client...');
    const supabaseClient = createClient(
      supabaseUrl,
      serviceRoleKey,
      {
        auth: {
          autoRefreshToken: false,
          persistSession: false
        }
      }
    );

    // Test database connection early with timeout
    console.log('Testing database connection...');
    try {
      const connectionTest = supabaseClient.from('profiles').select('id').limit(1);
      const timeoutPromise = new Promise((_, reject) => {
        setTimeout(() => reject(new Error('Database connection timeout')), 10000);
      });
      
      const { error: testError } = await Promise.race([
        connectionTest,
        timeoutPromise
      ]) as any;
      
      if (testError && testError.code !== 'PGRST116') { // PGRST116 is "no rows returned" which is fine
        console.error('Database connection test failed:', testError);
        throw new Error(`Database connection failed: ${testError.message}`);
      }
      console.log('Database connection test passed');
    } catch (testErr: any) {
      console.error('Database connection test error:', testErr);
      if (testErr.message && testErr.message.includes('timeout')) {
        return new Response(
          JSON.stringify({ 
            message: 'Cannot connect to server',
            error: 'Database connection timeout. Please try again later.'
          }),
          { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 503 }
        );
      }
      // Don't throw here, continue processing - connection might work for actual queries
      console.warn('Connection test failed but continuing:', testErr.message);
    }

    let payload: any;
    let bodyText = "";
    try {
      bodyText = await req.text();
      payload = JSON.parse(bodyText);
    } catch (parseError) {
      console.error('Error parsing webhook payload:', parseError);
      return new Response(
        JSON.stringify({ error: 'Invalid JSON payload' }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 400 }
      );
    }

    const payvesselSecretKey = Deno.env.get('PAYVESSEL_SECRET_KEY');
    const verification = await verifyPayvesselWebhook(req, bodyText, payvesselSecretKey);
    if (!verification.ok) {
      return new Response(
        JSON.stringify({ error: verification.message }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: verification.status },
      );
    }

    console.log('PayVessel webhook received:', JSON.stringify(payload, null, 2));
    console.log('Payload keys:', Object.keys(payload));

    if (!shouldProcessPayvesselEvent(payload)) {
      const ignoredEvent = payload.event || payload.event_type || payload.type || payload.code;
      console.log('Ignoring PayVessel webhook event:', ignoredEvent);
      return new Response(
        JSON.stringify({ message: `Event ignored: ${ignoredEvent ?? 'unknown'}` }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 200 },
      );
    }

    const extracted = extractPayvesselPaymentFields(payload);
    console.log('Payload structure check:', {
      event: extracted.event,
      hasVirtualAccount: !!payload.virtualAccount,
      hasOrder: !!payload.order,
      hasTransaction: !!payload.transaction,
      hasSender: !!payload.sender,
      code: payload.code,
      message: payload.message,
    });

    let account_number = extracted.account_number;
    let amount = extracted.amount;
    let reference = extracted.reference;
    let transaction_reference = extracted.transaction_reference;
    let sender_name = extracted.sender_name;
    let sender_account_number = extracted.sender_account_number;
    let sender_bank = extracted.sender_bank;

    console.log(`Processing payment: ${amount} to account ${account_number}`);
    console.log('Extracted fields:', {
      account_number,
      amount,
      reference,
      transaction_reference,
      sender_name,
      sender_account_number,
      sender_bank
    });

    // Validate required fields with detailed error messages
    if (!account_number) {
      console.error('Missing account_number in webhook payload');
      console.error('Payload structure:', {
        hasVirtualAccount: !!payload.virtualAccount,
        virtualAccountKeys: payload.virtualAccount ? Object.keys(payload.virtualAccount) : [],
        hasData: !!data,
        dataKeys: data ? Object.keys(data) : []
      });
      return new Response(
        JSON.stringify({ 
          error: 'Missing account_number in webhook payload',
          received: {
            hasVirtualAccount: !!payload.virtualAccount,
            virtualAccountNumber: payload.virtualAccount?.virtualAccountNumber
          }
        }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 400 }
      );
    }

    // Convert amount to number if it's a string
    const amountValue = typeof amount === 'string' ? parseFloat(amount) : Number(amount);
    
    if (!amountValue || amountValue <= 0 || !Number.isFinite(amountValue)) {
      console.error('Invalid or missing amount in webhook payload:', {
        rawAmount: amount,
        parsedAmount: amountValue,
        hasOrder: !!payload.order,
        orderAmount: payload.order?.amount,
        orderKeys: payload.order ? Object.keys(payload.order) : []
      });
      return new Response(
        JSON.stringify({ 
          error: 'Invalid or missing amount in webhook payload',
          received: {
            rawAmount: amount,
            parsedAmount: amountValue,
            orderAmount: payload.order?.amount
          }
        }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 400 }
      );
    }

    // Find the user associated with this virtual account
    // Try exact match first
    console.log(`Looking up virtual account for account_number: "${account_number}" (length: ${account_number.length})`);
    
    let virtualAccount: any = null;
    let accountError: any = null;
    
    try {
      const result = await supabaseClient
        .from('virtual_accounts')
        .select('user_id, account_number, account_name, bank_code')
        .eq('account_number', account_number.trim())
        .maybeSingle();
      
      virtualAccount = result.data;
      accountError = result.error;
    } catch (dbError) {
      console.error('Database connection error when fetching virtual account:', dbError);
      accountError = dbError;
    }

    // If not found, try without leading zeros or with different formatting
    if (!virtualAccount && !accountError) {
      console.log('Account not found with exact match, trying alternative formats...');
      
      // Try removing leading zeros
      const accountWithoutZeros = account_number.trim().replace(/^0+/, '');
      if (accountWithoutZeros !== account_number.trim() && accountWithoutZeros.length > 0) {
        console.log(`Trying account number without leading zeros: "${accountWithoutZeros}"`);
        ({ data: virtualAccount, error: accountError } = await supabaseClient
          .from('virtual_accounts')
          .select('user_id, account_number, account_name, bank_code')
          .eq('account_number', accountWithoutZeros)
          .maybeSingle());
      }
      
      // Try with leading zeros added (if account number is shorter than 10 digits)
      if (!virtualAccount && account_number.trim().length < 10) {
        const accountWithZeros = account_number.trim().padStart(10, '0');
        console.log(`Trying account number with leading zeros: "${accountWithZeros}"`);
        ({ data: virtualAccount, error: accountError } = await supabaseClient
          .from('virtual_accounts')
          .select('user_id, account_number, account_name, bank_code')
          .eq('account_number', accountWithZeros)
          .maybeSingle());
      }
      
      // Try with trailing spaces removed
      if (!virtualAccount) {
        const accountTrimmed = account_number.trim();
        if (accountTrimmed !== account_number) {
          console.log(`Trying trimmed account number: "${accountTrimmed}"`);
          ({ data: virtualAccount, error: accountError } = await supabaseClient
            .from('virtual_accounts')
            .select('user_id, account_number, account_name, bank_code')
            .eq('account_number', accountTrimmed)
            .maybeSingle());
        }
      }
    }

    if (accountError) {
      console.error('Error fetching virtual account:', accountError);
      throw accountError;
    }

    if (!virtualAccount) {
      console.error('Virtual account not found for account_number:', account_number);
      // Log all virtual accounts for debugging (in production, you might want to limit this)
      const { data: allAccounts } = await supabaseClient
        .from('virtual_accounts')
        .select('account_number, user_id')
        .limit(10);
      console.log('Sample virtual accounts in database:', allAccounts);
      return new Response(
        JSON.stringify({ 
          error: `Virtual account not found for account number: ${account_number}`,
          received_account: account_number
        }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 404 }
      );
    }

    console.log(`Found user: ${virtualAccount.user_id}`);

    // Check if this transaction has already been processed
    // Check by reference first, then by account_number + amount + timestamp if reference is missing
    let existingTransaction = null;
    
    if (reference || transaction_reference) {
      const { data: existingByRef } = await supabaseClient
        .from('funding_transactions')
        .select('id, reference, amount')
        .eq('reference', reference || transaction_reference)
        .maybeSingle();
      existingTransaction = existingByRef;
    }
    
    // If not found by reference, check by account + amount (within last 24 hours to avoid false positives)
    // Note: amountValue is already defined above, use it instead of creditAmount
    if (!existingTransaction && account_number && amountValue) {
      const oneDayAgo = new Date();
      oneDayAgo.setHours(oneDayAgo.getHours() - 24);
      
      const { data: existingByAccount } = await supabaseClient
        .from('funding_transactions')
        .select('id, reference, amount, created_at')
        .eq('user_id', virtualAccount.user_id)
        .eq('amount', amountValue)
        .gte('created_at', oneDayAgo.toISOString())
        .order('created_at', { ascending: false })
        .limit(1)
        .maybeSingle();
      
      if (existingByAccount) {
        console.log('Found potential duplicate transaction by account + amount:', existingByAccount);
        // Only treat as duplicate if amounts match exactly
        if (Math.abs(Number(existingByAccount.amount) - amountValue) < 0.01) {
          existingTransaction = existingByAccount;
        }
      }
    }

    if (existingTransaction) {
      console.log('Transaction already processed:', {
        reference: reference || transaction_reference,
        existing_id: existingTransaction.id,
        existing_reference: existingTransaction.reference
      });
      return new Response(
        JSON.stringify({ 
          message: 'Transaction already processed',
          existing_reference: existingTransaction.reference
        }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 200 }
      );
    }

    // Authoritative balance from ledger (latest balance_after)
    const currentBalance = await getUserLedgerBalance(supabaseClient, virtualAccount.user_id);
    const creditAmount = amountValue; // Already converted to number above
    
    // Calculate funding fee
    const fundingFee = calculateFundingFee(creditAmount);
    const netCreditAmount = creditAmount - fundingFee;
    
    // Calculate final balance (net amount after fee)
    const finalBalance = currentBalance + netCreditAmount;
    
    console.log(`Processing funding:`);
    console.log(`  Amount received: ₦${creditAmount}`);
    console.log(`  Funding fee: ₦${fundingFee}`);
    console.log(`  Net credit: ₦${netCreditAmount}`);
    console.log(`  Current balance: ₦${currentBalance}`);
    console.log(`  Final balance: ₦${finalBalance}`);

    // Update user's balance with net amount directly
    // Using service_role should bypass RLS
    console.log(`Attempting to update balance for user ${virtualAccount.user_id} from ₦${currentBalance} to ₦${finalBalance}`);
    
    const { data: updatedProfile, error: balanceError } = await supabaseClient
      .from('profiles')
      .update({ balance: finalBalance })
      .eq('id', virtualAccount.user_id)
      .select('balance, id')
      .single();

    if (balanceError) {
      console.error('Error updating balance:', balanceError);
      console.error('Balance error code:', balanceError.code);
      console.error('Balance error message:', balanceError.message);
      console.error('Balance error details:', JSON.stringify(balanceError, null, 2));
      throw new Error(`Failed to update balance: ${balanceError.message || JSON.stringify(balanceError)}`);
    }

    if (!updatedProfile) {
      console.error('Profile update returned no data');
      throw new Error('Profile update failed - no data returned');
    }

    const verifiedBalance = Number(updatedProfile.balance || 0);
    console.log(`Balance updated successfully. New balance: ₦${verifiedBalance} (expected: ₦${finalBalance})`);
    
    // Verify the balance was actually updated correctly
    if (Math.abs(verifiedBalance - finalBalance) > 0.01) {
      console.error(`CRITICAL: Balance mismatch! Expected ₦${finalBalance}, got ₦${verifiedBalance}`);
      // Try to fix it
      const { error: fixError } = await supabaseClient
        .from('profiles')
        .update({ balance: finalBalance })
        .eq('id', virtualAccount.user_id);
      
      if (fixError) {
        console.error('Failed to fix balance mismatch:', fixError);
        throw new Error(`Balance update verification failed. Expected ${finalBalance}, got ${verifiedBalance}`);
      }
      console.log('Balance mismatch fixed');
    }

    // Create all transaction records atomically
    // If any fail, we'll rollback the balance
    let rollbackNeeded = false;
    
    try {
      // Create funding transaction record
      const { error: fundingError } = await supabaseClient
        .from('funding_transactions')
        .insert({
          user_id: virtualAccount.user_id,
          amount: creditAmount,
          status: 'completed',
          reference: reference || transaction_reference,
          bank_name: sender_bank || 'Unknown',
          account_number: sender_account_number || 'Unknown',
          account_name: sender_name || 'Unknown',
          api_response: payload,
        });

      if (fundingError) {
        console.error('Error creating funding transaction:', fundingError);
        rollbackNeeded = true;
        throw fundingError;
      }

      // Create user transaction record for the funding (net amount credited)
      const { error: transactionError } = await supabaseClient
        .from('user_transactions')
        .insert({
          user_id: virtualAccount.user_id,
          amount: netCreditAmount, // Record the net amount that was actually credited
          balance_before: currentBalance,
          balance_after: finalBalance,
          transaction_type: 'credit',
          description: `Wallet funding from ${sender_name || 'Bank Transfer'} (₦${creditAmount} received, ₦${fundingFee} fee)`,
          reference: reference || transaction_reference,
        });

      if (transactionError) {
        console.error('Error creating user transaction:', transactionError);
        rollbackNeeded = true;
        throw transactionError;
      }
    } catch (recordError) {
      // Rollback balance update if transaction recording failed
      if (rollbackNeeded) {
        console.error('Rolling back balance update due to transaction recording failure');
        const { error: rollbackError } = await supabaseClient
          .from('profiles')
          .update({ balance: currentBalance })
          .eq('id', virtualAccount.user_id);
        
        if (rollbackError) {
          console.error('CRITICAL: Failed to rollback balance update:', rollbackError);
        } else {
          console.log('Balance rollback successful');
        }
      }
      throw recordError;
    }

    // Fee is already deducted in the calculation above, so we just need to record it
    if (fundingFee > 0) {
      const feeReference = `${reference || transaction_reference}-FEE`;
      
      // Record the fee as a separate transaction for accounting
      try {
        await supabaseClient
          .from('user_transactions')
          .insert({
            user_id: virtualAccount.user_id,
            amount: fundingFee,
            balance_before: finalBalance, // Balance before fee (which is after net credit)
            balance_after: finalBalance, // Balance after fee (same, since fee was already deducted)
            transaction_type: 'funding_fee',
            description: `Funding fee for wallet top-up`,
            reference: feeReference,
            performed_by: virtualAccount.user_id,
          });
        
        console.log(`Recorded funding fee transaction: ₦${fundingFee}`);
      } catch (feeError) {
        // Don't fail the whole process if fee recording fails
        console.warn('Failed to record fee transaction (non-critical):', feeError);
      }
    }

    console.log(`Successfully credited ₦${netCreditAmount} (₦${creditAmount} - ₦${fundingFee} fee) to user ${virtualAccount.user_id}. Final balance: ₦${finalBalance}`);

    // Send push notification
    await sendPushNotification(
      supabaseClient,
      virtualAccount.user_id,
      'Wallet Funded Successfully',
      `₦${creditAmount.toFixed(2)} added to your wallet. Funding fee: ₦${fundingFee.toFixed(2)}. Net credit: ₦${netCreditAmount.toFixed(2)}. Your new balance is ₦${finalBalance.toFixed(2)}.`,
      {
        type: 'add_money',
        reference: reference || transaction_reference,
        amount: creditAmount,
        funding_fee: fundingFee,
        net_amount: netCreditAmount,
      }
    );

    const successResponse = {
      success: true,
      message: 'Wallet credited successfully',
      amount: creditAmount,
      fundingFee,
      netAmount: netCreditAmount,
      newBalance: finalBalance,
      userId: virtualAccount.user_id,
      accountNumber: virtualAccount.account_number
    };

    const executionTime = Date.now() - startTime;
    console.log(`Returning success response (execution time: ${executionTime}ms):`, JSON.stringify(successResponse));
    
    // Create and return response immediately - don't wait for verification
    const responseBody = JSON.stringify(successResponse);
    const finalResponse = new Response(
      responseBody,
      { 
        headers: { 
          ...corsHeaders, 
          'Content-Type': 'application/json',
          'Cache-Control': 'no-cache',
          'X-Execution-Time': `${executionTime}ms`
        }, 
        status: 200 
      }
    );
    
    console.log('Response created, returning immediately to prevent EarlyDrop');
    
    // Do final verification asynchronously (non-blocking) after returning response
    // This prevents EarlyDrop shutdown
    (async () => {
      try {
        const { data: finalProfile, error: verifyError } = await supabaseClient
          .from('profiles')
          .select('balance')
          .eq('id', virtualAccount.user_id)
          .single();

        if (verifyError) {
          console.error('Error verifying final balance (async):', verifyError);
        } else {
          const actualBalance = Number(finalProfile.balance || 0);
          console.log(`Final balance verification (async): Expected ₦${finalBalance}, Actual ₦${actualBalance}`);
          
          if (Math.abs(actualBalance - finalBalance) > 0.01) {
            console.error(`CRITICAL: Final balance mismatch! Expected ₦${finalBalance}, got ₦${actualBalance}`);
            await supabaseClient
              .from('profiles')
              .update({ balance: finalBalance })
              .eq('id', virtualAccount.user_id);
          }
        }
      } catch (verifyErr) {
        console.error('Error in async verification:', verifyErr);
      }
    })();
    
    return finalResponse;

  } catch (error) {
    console.error('=== ERROR in payvessel-webhook ===');
    console.error('Error type:', error?.constructor?.name);
    console.error('Error message:', error instanceof Error ? error.message : 'Unknown error');
    console.error('Error stack:', error instanceof Error ? error.stack : 'No stack trace');
    console.error('Full error:', JSON.stringify(error, Object.getOwnPropertyNames(error)));
    
    // Check for specific error types
    let errorMessage = 'An unknown error occurred';
    let statusCode = 500;
    
    if (error instanceof Error) {
      errorMessage = error.message;
      
      // Check for connection errors
      if (error.message.includes('connect') || 
          error.message.includes('network') || 
          error.message.includes('ECONNREFUSED') ||
          error.message.includes('fetch failed') ||
          error.message.includes('timeout')) {
        errorMessage = 'Cannot connect to server';
        statusCode = 503; // Service Unavailable
      }
      
      // Check for timeout errors
      if (error.message.includes('timeout') || error.message.includes('aborted')) {
        errorMessage = 'Request timeout';
        statusCode = 504; // Gateway Timeout
      }
      
      // Check for database errors
      if (error.message.includes('database') || error.message.includes('SQL')) {
        errorMessage = 'Database error';
        statusCode = 500;
      }
    }
    
    // Always return a response - never let the function fail silently
    try {
      return new Response(
        JSON.stringify({ 
          message: errorMessage,
          error: errorMessage,
          timestamp: new Date().toISOString()
        }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: statusCode }
      );
    } catch (responseError) {
      // If we can't even create a response, log it and return minimal response
      console.error('CRITICAL: Failed to create error response:', responseError);
      return new Response(
        JSON.stringify({ message: 'Internal server error' }),
        { headers: corsHeaders, status: 500 }
      );
    }
  } finally {
    const totalTime = Date.now() - startTime;
    console.log(`=== PayVessel Webhook Processing Complete ===`);
    console.log(`Total execution time: ${totalTime}ms`);
    console.log('Function execution finished at:', new Date().toISOString());
  }
});
