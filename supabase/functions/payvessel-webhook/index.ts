import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.7.1";
import { debitUserWallet } from "../_shared/wallet.ts";

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
        timestamp: new Date().toISOString()
      }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 200 }
    );
  }

  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  console.log('=== PayVessel Webhook Called ===');
  console.log('Method:', req.method);
  console.log('URL:', req.url);
  console.log('Headers:', Object.fromEntries(req.headers.entries()));
  console.log('Timestamp:', new Date().toISOString());

  try {
    const supabaseClient = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '',
      {
        auth: {
          autoRefreshToken: false,
          persistSession: false
        }
      }
    );

    let payload: any;
    try {
      payload = await req.json();
    } catch (parseError) {
      console.error('Error parsing webhook payload:', parseError);
      return new Response(
        JSON.stringify({ error: 'Invalid JSON payload' }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 400 }
      );
    }

    console.log('PayVessel webhook received:', JSON.stringify(payload, null, 2));
    console.log('Payload keys:', Object.keys(payload));

    // Verify webhook authenticity (optional but recommended)
    // You can add signature verification here if PayVessel provides it

    // Extract payment details from webhook
    // PayVessel might send different payload structures, so we need to handle multiple formats
    let event_type = payload.event_type || payload.event || payload.type || payload.status;
    let data = payload.data || payload;

    // If payload is flat (no nested data), use the payload directly
    if (!payload.data && (payload.account_number || payload.amount)) {
      data = payload;
    }

    console.log('Extracted event_type:', event_type);
    console.log('Extracted data:', JSON.stringify(data, null, 2));

    // Only process successful collections - check multiple possible event types
    const successfulEvents = [
      'collection.successful',
      'successful',
      'completed',
      'credit',
      'transfer.successful',
      'transaction.successful'
    ];

    if (event_type && !successfulEvents.includes(event_type.toLowerCase())) {
      console.log('Ignoring event type:', event_type);
      return new Response(
        JSON.stringify({ message: `Event ignored: ${event_type}` }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 200 }
      );
    }

    // Extract fields with multiple possible names
    const account_number = data.account_number || data.accountNumber || data.account || data.virtual_account_number;
    const amount = data.amount || data.credit_amount || data.transaction_amount;
    const reference = data.reference || data.transaction_reference || data.ref || data.tracking_reference;
    const sender_name = data.sender_name || data.senderName || data.sender || data.customer_name;
    const sender_account_number = data.sender_account_number || data.senderAccountNumber || data.sender_account;
    const sender_bank = data.sender_bank || data.senderBank || data.bank_name || data.bank;
    const transaction_reference = data.transaction_reference || data.transactionReference || reference;

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

    // Validate required fields
    if (!account_number) {
      console.error('Missing account_number in webhook payload');
      return new Response(
        JSON.stringify({ error: 'Missing account_number in webhook payload' }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 400 }
      );
    }

    if (!amount || amount <= 0) {
      console.error('Invalid or missing amount in webhook payload:', amount);
      return new Response(
        JSON.stringify({ error: 'Invalid or missing amount in webhook payload' }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 400 }
      );
    }

    // Find the user associated with this virtual account
    // Try exact match first
    let { data: virtualAccount, error: accountError } = await supabaseClient
      .from('virtual_accounts')
      .select('user_id, account_number, account_name, bank_code')
      .eq('account_number', account_number)
      .maybeSingle();

    // If not found, try without leading zeros or with different formatting
    if (!virtualAccount && !accountError) {
      console.log('Account not found with exact match, trying alternative formats...');
      // Try removing leading zeros
      const accountWithoutZeros = account_number.replace(/^0+/, '');
      if (accountWithoutZeros !== account_number) {
        ({ data: virtualAccount, error: accountError } = await supabaseClient
          .from('virtual_accounts')
          .select('user_id, account_number, account_name, bank_code')
          .eq('account_number', accountWithoutZeros)
          .maybeSingle());
      }
      
      // Try with leading zeros added
      if (!virtualAccount && account_number.length < 10) {
        const accountWithZeros = account_number.padStart(10, '0');
        ({ data: virtualAccount, error: accountError } = await supabaseClient
          .from('virtual_accounts')
          .select('user_id, account_number, account_name, bank_code')
          .eq('account_number', accountWithZeros)
          .maybeSingle());
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
    const { data: existingTransaction } = await supabaseClient
      .from('funding_transactions')
      .select('id')
      .eq('reference', reference || transaction_reference)
      .maybeSingle();

    if (existingTransaction) {
      console.log('Transaction already processed:', reference || transaction_reference);
      return new Response(
        JSON.stringify({ message: 'Transaction already processed' }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 200 }
      );
    }

    // Get user's current balance
    const { data: profile, error: profileError } = await supabaseClient
      .from('profiles')
      .select('balance')
      .eq('id', virtualAccount.user_id)
      .single();

    if (profileError) {
      console.error('Error fetching profile:', profileError);
      throw profileError;
    }

    const currentBalance = Number(profile.balance || 0);
    const creditAmount = Number(amount);
    
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

    // Update user's balance with net amount directly (simpler approach)
    // Using service_role should bypass RLS, but let's be explicit
    const { data: updatedProfile, error: balanceError } = await supabaseClient
      .from('profiles')
      .update({ balance: finalBalance })
      .eq('id', virtualAccount.user_id)
      .select('balance, id')
      .single();

    let verifiedBalance = finalBalance;
    
    if (balanceError) {
      console.error('Error updating balance:', balanceError);
      console.error('Balance error code:', balanceError.code);
      console.error('Balance error message:', balanceError.message);
      console.error('Balance error details:', JSON.stringify(balanceError, null, 2));
      
      // Try using raw SQL update as fallback (service role should have access)
      console.log('Attempting direct SQL update as fallback...');
      const { data: sqlResult, error: sqlError } = await supabaseClient
        .from('profiles')
        .update({ balance: finalBalance })
        .eq('id', virtualAccount.user_id)
        .select('balance')
        .single();
      
      if (sqlError || !sqlResult) {
        console.error('Direct SQL update also failed:', sqlError);
        throw new Error(`Failed to update balance: ${balanceError.message || JSON.stringify(balanceError)}`);
      }
      
      verifiedBalance = Number(sqlResult.balance || 0);
      console.log('Direct SQL update succeeded');
    } else if (updatedProfile) {
      verifiedBalance = Number(updatedProfile.balance || 0);
    }

    if (!updatedProfile && balanceError) {
      console.error('Profile update returned no data');
      throw new Error('Profile update failed - no data returned');
    }
    console.log(`Balance updated successfully. New balance: ₦${verifiedBalance} (expected: ₦${finalBalance})`);
    
    if (Math.abs(verifiedBalance - finalBalance) > 0.01) {
      console.warn(`Balance mismatch! Expected ${finalBalance}, got ${verifiedBalance}`);
    }

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
      // Rollback balance update
      await supabaseClient
        .from('profiles')
        .update({ balance: currentBalance })
        .eq('id', virtualAccount.user_id);
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
      // Rollback balance update
      await supabaseClient
        .from('profiles')
        .update({ balance: currentBalance })
        .eq('id', virtualAccount.user_id);
      throw transactionError;
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
            transaction_type: 'debit',
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

    return new Response(
      JSON.stringify({
        success: true,
        message: 'Wallet credited successfully',
        amount: creditAmount,
        fundingFee,
        netAmount: netCreditAmount,
        newBalance: finalBalance
      }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 200 }
    );

  } catch (error) {
    console.error('=== ERROR in payvessel-webhook ===');
    console.error('Error type:', error?.constructor?.name);
    console.error('Error message:', error instanceof Error ? error.message : 'Unknown error');
    console.error('Error stack:', error instanceof Error ? error.stack : 'No stack trace');
    console.error('Full error:', JSON.stringify(error, Object.getOwnPropertyNames(error)));
    
    const errorMessage = error instanceof Error ? error.message : 'An unknown error occurred';
    return new Response(
      JSON.stringify({ 
        error: errorMessage,
        timestamp: new Date().toISOString()
      }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 500 }
    );
  } finally {
    console.log('=== PayVessel Webhook Processing Complete ===');
  }
});
