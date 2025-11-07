import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.7.1";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

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

    const payload = await req.json();
    console.log('PayVessel webhook received:', JSON.stringify(payload, null, 2));

    // Verify webhook authenticity (optional but recommended)
    // You can add signature verification here if PayVessel provides it

    // Extract payment details from webhook
    const {
      event_type,
      data
    } = payload;

    // Only process successful collections
    if (event_type !== 'collection.successful' && event_type !== 'successful') {
      console.log('Ignoring event type:', event_type);
      return new Response(
        JSON.stringify({ message: 'Event ignored' }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 200 }
      );
    }

    const {
      account_number,
      amount,
      reference,
      sender_name,
      sender_account_number,
      sender_bank,
      transaction_reference
    } = data;

    console.log(`Processing payment: ${amount} to account ${account_number}`);

    // Find the user associated with this virtual account
    const { data: virtualAccount, error: accountError } = await supabaseClient
      .from('virtual_accounts')
      .select('user_id, account_number, account_name')
      .eq('account_number', account_number)
      .maybeSingle();

    if (accountError) {
      console.error('Error fetching virtual account:', accountError);
      throw accountError;
    }

    if (!virtualAccount) {
      console.error('Virtual account not found:', account_number);
      return new Response(
        JSON.stringify({ error: 'Virtual account not found' }),
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
    const newBalance = currentBalance + creditAmount;

    console.log(`Updating balance: ${currentBalance} + ${creditAmount} = ${newBalance}`);

    // Update user's balance
    const { error: balanceError } = await supabaseClient
      .from('profiles')
      .update({ balance: newBalance })
      .eq('id', virtualAccount.user_id);

    if (balanceError) {
      console.error('Error updating balance:', balanceError);
      throw balanceError;
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
      throw fundingError;
    }

    // Create user transaction record
    const { error: transactionError } = await supabaseClient
      .from('user_transactions')
      .insert({
        user_id: virtualAccount.user_id,
        amount: creditAmount,
        balance_before: currentBalance,
        balance_after: newBalance,
        transaction_type: 'credit',
        description: `Wallet funding from ${sender_name || 'Bank Transfer'}`,
        reference: reference || transaction_reference,
      });

    if (transactionError) {
      console.error('Error creating user transaction:', transactionError);
      throw transactionError;
    }

    console.log(`Successfully credited ₦${creditAmount} to user ${virtualAccount.user_id}`);

    return new Response(
      JSON.stringify({
        success: true,
        message: 'Wallet credited successfully',
        amount: creditAmount,
        newBalance
      }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 200 }
    );

  } catch (error) {
    console.error('Error in payvessel-webhook:', error);
    const errorMessage = error instanceof Error ? error.message : 'An unknown error occurred';
    return new Response(
      JSON.stringify({ error: errorMessage }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 500 }
    );
  }
});
