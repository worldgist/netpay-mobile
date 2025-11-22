import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const CORS_HEADERS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, x-smeplug-signature',
};

// Verify SMEPlug webhook signature
function verifySignature(payload: string, signature: string, secret: string): boolean {
  // SMEPlug webhook verification logic
  // Adjust based on their actual signature verification method
  // This is a placeholder - check SMEPlug documentation for exact implementation
  try {
    const crypto = globalThis.crypto;
    const encoder = new TextEncoder();
    const key = encoder.encode(secret);
    const data = encoder.encode(payload);
    
    // SMEPlug typically uses HMAC SHA256
    // This needs to be adjusted based on their actual signature method
    return true; // Placeholder - implement actual verification
  } catch (e) {
    console.error('Error verifying signature:', e);
    return false;
  }
}

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: CORS_HEADERS });
  }

  try {
    const supabase = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '',
    );

    // Get signature from headers
    const signature = req.headers.get('x-smeplug-signature') || '';
    const secret = Deno.env.get('SMEPLUG_WEBHOOK_SECRET') || '';

    // Read body as text for signature verification
    const bodyText = await req.text();
    let payload: any;

    try {
      payload = JSON.parse(bodyText);
    } catch (e) {
      return new Response(
        JSON.stringify({ error: 'Invalid JSON payload' }),
        { status: 400, headers: { ...CORS_HEADERS, 'Content-Type': 'application/json' } }
      );
    }

    console.log('SMEPlug webhook received:', JSON.stringify(payload, null, 2));

    // Verify signature if secret is configured
    if (secret && signature) {
      if (!verifySignature(bodyText, signature, secret)) {
        console.error('Invalid webhook signature');
        return new Response(
          JSON.stringify({ error: 'Invalid signature' }),
          { status: 401, headers: { ...CORS_HEADERS, 'Content-Type': 'application/json' } }
        );
      }
    }

    // Extract transaction reference
    // SMEPlug webhook structure may vary - adjust based on actual payload
    const transactionReference = 
      payload.reference ||
      payload.customer_reference ||
      payload.transaction_id ||
      payload.transId ||
      payload.data?.reference ||
      payload.data?.customer_reference;

    if (!transactionReference) {
      console.error('No transaction reference found in webhook payload');
      return new Response(
        JSON.stringify({ error: 'Missing transaction reference' }),
        { status: 400, headers: { ...CORS_HEADERS, 'Content-Type': 'application/json' } }
      );
    }

    console.log(`Processing webhook for transaction: ${transactionReference}`);

    // Determine transaction status from SMEPlug response
    const status = payload.status || payload.data?.status || '';
    const statusLower = status.toLowerCase();
    
    const isSuccess = (
      statusLower === 'success' ||
      statusLower === 'delivered' ||
      statusLower === 'completed' ||
      payload.success === true ||
      payload.data?.success === true
    );

    const isFailed = (
      statusLower === 'failed' ||
      statusLower === 'error' ||
      payload.success === false ||
      payload.data?.success === false
    );

    const transactionStatus = isSuccess ? 'success' : 
                             isFailed ? 'failed' : 
                             (statusLower === 'pending' || statusLower === 'processing') ? 'pending' : 
                             'pending';

    // Try to find transaction in data_transactions
    const { data: dataTransaction, error: dataTxnError } = await supabase
      .from('data_transactions')
      .select('id, user_id, reference, status, provider')
      .eq('reference', transactionReference)
      .maybeSingle();

    if (dataTxnError) {
      console.error('Error fetching data transaction:', dataTxnError);
    }

    // Only process if provider is smeplug
    if (dataTransaction && dataTransaction.provider !== 'smeplug') {
      console.log(`Transaction ${transactionReference} is not from SMEPlug, ignoring`);
      return new Response(
        JSON.stringify({ message: 'Transaction not from SMEPlug' }),
        { status: 200, headers: { ...CORS_HEADERS, 'Content-Type': 'application/json' } }
      );
    }

    if (!dataTransaction) {
      console.log(`Transaction not found: ${transactionReference}`);
      // Return success to prevent webhook retries
      return new Response(
        JSON.stringify({ message: 'Transaction not found, but webhook received' }),
        { status: 200, headers: { ...CORS_HEADERS, 'Content-Type': 'application/json' } }
      );
    }

    // Check if transaction status is already updated
    if (dataTransaction.status === transactionStatus) {
      console.log(`Transaction ${transactionReference} already has status: ${transactionStatus}`);
      return new Response(
        JSON.stringify({ message: 'Transaction status already updated' }),
        { status: 200, headers: { ...CORS_HEADERS, 'Content-Type': 'application/json' } }
      );
    }

    console.log(`Updating transaction ${transactionReference} from ${dataTransaction.status} to ${transactionStatus}`);

    // Update transaction status
    const updateData: Record<string, any> = {
      status: transactionStatus,
      updated_at: new Date().toISOString(),
    };

    // Update api_response with webhook payload
    if (payload) {
      const { data: currentTransaction } = await supabase
        .from('data_transactions')
        .select('api_response')
        .eq('id', dataTransaction.id)
        .single();

      updateData.api_response = {
        ...(currentTransaction?.api_response || {}),
        webhook: payload,
        webhook_received_at: new Date().toISOString(),
      };
    }

    const { error: updateError } = await supabase
      .from('data_transactions')
      .update(updateData)
      .eq('id', dataTransaction.id);

    if (updateError) {
      console.error('Error updating transaction:', updateError);
      throw updateError;
    }

    // Send notification to user if transaction status changed
    if (dataTransaction.user_id && transactionStatus !== dataTransaction.status) {
      try {
        const notificationTitle = transactionStatus === 'success' 
          ? 'Data purchase successful' 
          : transactionStatus === 'failed' 
          ? 'Data purchase failed'
          : 'Data purchase status updated';

        const notificationMessage = transactionStatus === 'success'
          ? `Your data purchase (${transactionReference}) has been delivered successfully.`
          : transactionStatus === 'failed'
          ? `Your data purchase (${transactionReference}) has failed.`
          : `Your data purchase (${transactionReference}) status has been updated.`;

        await supabase.functions.invoke('send-push-notification', {
          body: {
            user_id: dataTransaction.user_id,
            title: notificationTitle,
            body: notificationMessage,
            data: {
              transaction_id: dataTransaction.id,
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

    // If transaction failed and was previously pending, log for potential refund
    if (transactionStatus === 'failed' && dataTransaction.status === 'pending') {
      console.log(`Transaction ${transactionReference} failed - may need refund processing`);
      // Add refund logic here if needed
    }

    console.log(`Successfully updated transaction ${transactionReference} to ${transactionStatus}`);

    return new Response(
      JSON.stringify({
        success: true,
        message: 'Transaction status updated',
        reference: transactionReference,
        status: transactionStatus,
      }),
      { status: 200, headers: { ...CORS_HEADERS, 'Content-Type': 'application/json' } }
    );

  } catch (error) {
    console.error('Error in smeplug-webhook:', error);
    const errorMessage = error instanceof Error ? error.message : 'An unknown error occurred';
    return new Response(
      JSON.stringify({ error: errorMessage }),
      { status: 500, headers: { ...CORS_HEADERS, 'Content-Type': 'application/json' } }
    );
  }
});

