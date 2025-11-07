import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabase = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
    );

    // Get the authorization header
    const authHeader = req.headers.get('Authorization');
    if (!authHeader) {
      throw new Error('No authorization header');
    }

    // Verify the user is authenticated
    const { data: { user }, error: authError } = await supabase.auth.getUser(
      authHeader.replace('Bearer ', '')
    );

    if (authError || !user) {
      throw new Error('Unauthorized');
    }

    const { recipientEmail, amount, description } = await req.json();

    if (!recipientEmail || !amount || amount <= 0) {
      throw new Error('Invalid input parameters');
    }

    console.log(`User ${user.id} initiating transfer of ₦${amount} to ${recipientEmail}`);

    // Get sender profile
    const { data: senderProfile, error: senderError } = await supabase
      .from('profiles')
      .select('balance, email, full_name')
      .eq('id', user.id)
      .single();

    if (senderError || !senderProfile) {
      throw new Error('Sender profile not found');
    }

    // Prevent self-transfer
    if (senderProfile.email === recipientEmail) {
      throw new Error('Cannot transfer to yourself');
    }

    // Check if sender has sufficient balance
    if (senderProfile.balance < amount) {
      throw new Error('Insufficient balance');
    }

    // Get recipient profile by email
    const { data: recipientProfile, error: recipientError } = await supabase
      .from('profiles')
      .select('id, balance, full_name, email')
      .eq('email', recipientEmail)
      .single();

    if (recipientError || !recipientProfile) {
      throw new Error('Recipient not found');
    }

    const senderBalanceBefore = senderProfile.balance;
    const senderBalanceAfter = senderBalanceBefore - amount;
    const recipientBalanceBefore = recipientProfile.balance;
    const recipientBalanceAfter = recipientBalanceBefore + amount;

    // Generate unique reference
    const reference = `TRF-${Date.now()}`;

    // Insert debit transaction for sender
    const { error: debitTxError } = await supabase
      .from('user_transactions')
      .insert({
        user_id: user.id,
        transaction_type: 'debit',
        amount: amount,
        balance_before: senderBalanceBefore,
        balance_after: senderBalanceAfter,
        description: description || `Transfer to ${recipientProfile.full_name || recipientEmail}`,
        reference: reference,
        performed_by: user.id,
      });

    if (debitTxError) {
      console.error('Debit transaction error:', debitTxError);
      throw new Error('Failed to record debit transaction');
    }

    // Insert credit transaction for recipient
    const { error: creditTxError } = await supabase
      .from('user_transactions')
      .insert({
        user_id: recipientProfile.id,
        transaction_type: 'credit',
        amount: amount,
        balance_before: recipientBalanceBefore,
        balance_after: recipientBalanceAfter,
        description: description || `Transfer from ${senderProfile.full_name || senderProfile.email}`,
        reference: reference,
        performed_by: user.id,
      });

    if (creditTxError) {
      console.error('Credit transaction error:', creditTxError);
      throw new Error('Failed to record credit transaction');
    }

    // Update sender balance
    const { error: senderUpdateError } = await supabase
      .from('profiles')
      .update({ balance: senderBalanceAfter })
      .eq('id', user.id);

    if (senderUpdateError) {
      console.error('Sender balance update error:', senderUpdateError);
      throw new Error('Failed to update sender balance');
    }

    // Update recipient balance
    const { error: recipientUpdateError } = await supabase
      .from('profiles')
      .update({ balance: recipientBalanceAfter })
      .eq('id', recipientProfile.id);

    if (recipientUpdateError) {
      console.error('Recipient balance update error:', recipientUpdateError);
      throw new Error('Failed to update recipient balance');
    }

    // Insert transfer record
    const { error: transferRecordError } = await supabase
      .from('transfer_transactions')
      .insert({
        sender_id: user.id,
        recipient_id: recipientProfile.id,
        amount: amount,
        description: description || null,
        reference: reference,
        status: 'completed',
        sender_balance_before: senderBalanceBefore,
        sender_balance_after: senderBalanceAfter,
        recipient_balance_before: recipientBalanceBefore,
        recipient_balance_after: recipientBalanceAfter,
      });

    if (transferRecordError) {
      console.error('Transfer record error:', transferRecordError);
      // Don't throw error here as the transfer is already completed
      // Just log the error for debugging
    }

    console.log(`Transfer successful: ${reference}`);

    return new Response(
      JSON.stringify({
        success: true,
        message: 'Transfer completed successfully',
        data: {
          reference,
          amount,
          recipientName: recipientProfile.full_name,
          recipientEmail: recipientProfile.email,
          senderBalanceAfter,
        },
      }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  } catch (error) {
    console.error('Transfer error:', error);
    const errorMessage = error instanceof Error ? error.message : 'An unknown error occurred';
    return new Response(
      JSON.stringify({
        success: false,
        error: errorMessage,
      }),
      {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      }
    );
  }
});
