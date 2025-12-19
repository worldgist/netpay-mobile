import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.7.1";
import { creditUserWallet } from "../_shared/wallet.ts";

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
    console.log('MobileNig webhook received:', JSON.stringify(payload, null, 2));

    // MobileNig webhook payload structure may vary
    // Common fields: trans_id, reference, status, statusCode, message, details
    const {
      trans_id,
      reference,
      status,
      statusCode,
      message,
      details,
      service_id,
      customerAccountId,
      product_code,
      amount,
    } = payload;

    // Extract reference from various possible fields
    const transactionReference = reference || trans_id || details?.reference || details?.trans_id;
    
    if (!transactionReference) {
      console.error('No transaction reference found in webhook payload');
      return new Response(
        JSON.stringify({ error: 'Missing transaction reference' }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 400 }
      );
    }

    console.log(`Processing webhook for transaction: ${transactionReference}`);

    // Determine transaction status
    const isSuccess = (
      (statusCode === '200' || statusCode === 200) && 
      (message?.toLowerCase() === 'success' || status?.toLowerCase() === 'success')
    ) || (
      status?.toLowerCase() === 'completed' || status?.toLowerCase() === 'successful'
    );

    const transactionStatus = isSuccess ? 'completed' : 'failed';

    // Try to find transaction in user_transactions first (cable TV, etc.)
    const { data: userTransaction, error: userTxnError } = await supabaseClient
      .from('user_transactions')
      .select('id, user_id, transaction_type, amount, reference, status')
      .eq('reference', transactionReference)
      .maybeSingle();

    if (userTxnError) {
      console.error('Error fetching user transaction:', userTxnError);
    }

    // Try to find transaction in electricity_transactions
    const { data: electricityTransaction, error: elecTxnError } = await supabaseClient
      .from('electricity_transactions')
      .select('id, user_id, reference, status')
      .eq('reference', transactionReference)
      .maybeSingle();

    if (elecTxnError) {
      console.error('Error fetching electricity transaction:', elecTxnError);
    }

    // Try to find transaction in data_transactions
    const { data: dataTransaction, error: dataTxnError } = await supabaseClient
      .from('data_transactions')
      .select('id, user_id, reference, status')
      .eq('reference', transactionReference)
      .maybeSingle();

    if (dataTxnError) {
      console.error('Error fetching data transaction:', dataTxnError);
    }

    // Determine which transaction to update (priority: data > electricity > user)
    const transaction = dataTransaction || electricityTransaction || userTransaction;
    const transactionTable = dataTransaction ? 'data_transactions' : 
                            electricityTransaction ? 'electricity_transactions' : 
                            'user_transactions';

    if (!transaction) {
      console.log(`Transaction not found: ${transactionReference}`);
      // Return success to prevent webhook retries for unknown transactions
      return new Response(
        JSON.stringify({ message: 'Transaction not found, but webhook received' }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 200 }
      );
    }

    // Check if transaction status is already updated
    if (transaction.status === transactionStatus) {
      console.log(`Transaction ${transactionReference} already has status: ${transactionStatus}`);
      return new Response(
        JSON.stringify({ message: 'Transaction status already updated' }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 200 }
      );
    }

    console.log(`Updating transaction ${transactionReference} from ${transaction.status} to ${transactionStatus}`);

    // Update transaction status
    const updateData: Record<string, any> = {
      status: transactionStatus,
      updated_at: new Date().toISOString(),
    };

    // Add API response to transaction if it's electricity
    if (transactionTable === 'electricity_transactions' && details) {
      // Extract token if available
      if (details.token) {
        updateData.token = details.token;
      }
      // Store full API response
      updateData.api_response = payload;
    }

    const { error: updateError } = await supabaseClient
      .from(transactionTable)
      .update(updateData)
      .eq('id', transaction.id);

    if (updateError) {
      console.error('Error updating transaction:', updateError);
      throw updateError;
    }

    // If transaction failed and wallet was debited (status was completed), automatically refund the user
    // This ensures users get their money back if the provider confirms the transaction failed
    if (transactionStatus === 'failed' && transaction.status === 'completed' && transaction.user_id && transaction.amount) {
      console.log(`Transaction ${transactionReference} failed after completion - processing automatic refund...`);
      try {
        const refundAmount = Number(transaction.amount) || 0;
        if (refundAmount > 0) {
          // Get current balance for refund
          const { data: profile } = await supabaseClient
            .from('profiles')
            .select('balance')
            .eq('id', transaction.user_id)
            .single();
          
          const currentBalance = profile?.balance ? Number(profile.balance) : 0;
          
          await creditUserWallet({
            supabase: supabaseClient,
            userId: transaction.user_id,
            amount: refundAmount,
            transactionType: 'refund',
            description: `Automatic refund for failed electricity purchase. Original reference: ${transactionReference}`,
            reference: `REFUND-${transactionReference}`,
            performedBy: transaction.user_id,
            balanceBefore: currentBalance,
            notification: {
              title: 'Transaction refunded',
              message: `Your payment of ₦${refundAmount.toFixed(2)} has been automatically refunded because the transaction failed. Your new balance is ₦${(currentBalance + refundAmount).toFixed(2)}.`,
            },
          });
          console.log(`Successfully refunded ₦${refundAmount} to user ${transaction.user_id}`);
        }
      } catch (refundError) {
        console.error(`Failed to refund user for transaction ${transactionReference}:`, refundError);
        // Log error but don't fail webhook - we'll need manual intervention
      }
    }

    // Send notification to user if transaction completed
    if (transactionStatus === 'completed' && transaction.user_id) {
      try {
        const notificationMessage = isSuccess
          ? `Your transaction ${transactionReference} has been completed successfully.`
          : `Your transaction ${transactionReference} has failed.`;

        await supabaseClient.functions.invoke('send-push-notification', {
          body: {
            user_id: transaction.user_id,
            title: transactionStatus === 'completed' ? 'Transaction Completed' : 'Transaction Failed',
            body: notificationMessage,
            data: {
              transaction_id: transaction.id,
              reference: transactionReference,
              status: transactionStatus,
            },
          },
        });
      } catch (notifError) {
        console.error('Error sending notification:', notifError);
        // Don't fail the webhook if notification fails
      }
    }

    console.log(`Successfully updated transaction ${transactionReference} to ${transactionStatus}`);

    return new Response(
      JSON.stringify({
        success: true,
        message: 'Transaction status updated',
        reference: transactionReference,
        status: transactionStatus,
      }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 200 }
    );

  } catch (error) {
    console.error('Error in mobilenig-webhook:', error);
    const errorMessage = error instanceof Error ? error.message : 'An unknown error occurred';
    return new Response(
      JSON.stringify({ error: errorMessage }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 500 }
    );
  }
});



