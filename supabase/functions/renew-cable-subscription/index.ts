import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { debitUserWallet } from "../_shared/wallet.ts";

const CORS_HEADERS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: CORS_HEADERS });
  }

  try {
    const SUPABASE_URL = Deno.env.get('SUPABASE_URL') ?? '';
    const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '';
    const MOBILENIG_SECRET_KEY = Deno.env.get('MOBILENIG_SECRET_KEY');
    const MOBILENIG_PUBLIC_KEY = Deno.env.get('MOBILENIG_PUBLIC_KEY');

    const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

    // Get authentication token
    const authHeader = req.headers.get('Authorization');
    if (!authHeader) {
      return new Response(
        JSON.stringify({ success: false, error: 'Missing authorization header' }),
        { status: 401, headers: { ...CORS_HEADERS, 'Content-Type': 'application/json' } }
      );
    }

    const token = authHeader.replace('Bearer ', '');
    const { data: userData, error: userError } = await supabase.auth.getUser(token);
    
    if (userError || !userData?.user) {
      return new Response(
        JSON.stringify({ success: false, error: 'Unauthorized - Please sign in to continue' }),
        { status: 401, headers: { ...CORS_HEADERS, 'Content-Type': 'application/json' } }
      );
    }

    const user = userData.user;

    // Get user profile and balance
    const { data: profile, error: profileError } = await supabase
      .from('profiles')
      .select('balance')
      .eq('id', user.id)
      .single();

    if (profileError || !profile) {
      return new Response(
        JSON.stringify({ success: false, error: 'User profile not found' }),
        { status: 404, headers: { ...CORS_HEADERS, 'Content-Type': 'application/json' } }
      );
    }

    const body = await req.json();
    const { card_number, provider, customer_number, customer_name, amount } = body;

    if (!card_number || !provider || !amount) {
      return new Response(
        JSON.stringify({ success: false, error: 'Missing required fields: card_number, provider, and amount are required' }),
        { status: 400, headers: { ...CORS_HEADERS, 'Content-Type': 'application/json' } }
      );
    }

    if (!customer_number || !customer_name) {
      return new Response(
        JSON.stringify({ 
          success: false, 
          error: 'Customer information is required. Please verify your smart card number first.' 
        }),
        { status: 400, headers: { ...CORS_HEADERS, 'Content-Type': 'application/json' } }
      );
    }

    // Validate amount
    const renewalAmount = Number(amount);
    if (isNaN(renewalAmount) || renewalAmount <= 0) {
      return new Response(
        JSON.stringify({ success: false, error: 'Invalid amount' }),
        { status: 400, headers: { ...CORS_HEADERS, 'Content-Type': 'application/json' } }
      );
    }

    // Check minimum amount (₦500)
    const MINIMUM_AMOUNT = 500;
    if (renewalAmount < MINIMUM_AMOUNT) {
      return new Response(
        JSON.stringify({ 
          success: false, 
          error: `Minimum renewal amount is ₦${MINIMUM_AMOUNT}. The amount (₦${renewalAmount}) is below the minimum required.` 
        }),
        { status: 400, headers: { ...CORS_HEADERS, 'Content-Type': 'application/json' } }
      );
    }

    // Check user balance
    const userBalance = Number(profile.balance) || 0;
    if (userBalance < renewalAmount) {
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

    const reference = `RENEW-${Date.now()}-${user.id.substring(0, 8)}`;
    const trans_id = parseInt(Date.now().toString().slice(-10) + Math.floor(Math.random() * 1000).toString().padStart(3, '0')) || Date.now();
    const maxTransId = 999999999999;
    const finalTransId = trans_id > maxTransId ? trans_id % maxTransId : trans_id;

    const apiKey = MOBILENIG_SECRET_KEY || MOBILENIG_PUBLIC_KEY;
    if (!apiKey) {
      return new Response(
        JSON.stringify({ success: false, error: 'MOBILENIG_SECRET_KEY or MOBILENIG_PUBLIC_KEY not configured' }),
        { status: 500, headers: { ...CORS_HEADERS, 'Content-Type': 'application/json' } }
      );
    }
    
    const apiUrl = 'https://enterprise.mobilenig.com/api/v2/services/';
    
    const customerNumberNum = customer_number ? parseInt(String(customer_number).replace(/\D/g, '')) : null;
    const smartcardNumberNum = card_number ? parseInt(String(card_number).replace(/\D/g, '')) : null;
    
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
    
    const apiPayload = {
      service_id: service_id,
      trans_id: finalTransId,
      customerNumber: customerNumberNum,
      smartcardNumber: smartcardNumberNum,
      customerName: cleanedCustomerName,
      amount: Number(renewalAmount)
    };
    
    console.log('MobileNig renew subscription payload:', JSON.stringify(apiPayload, null, 2));

    const apiResponse = await fetch(apiUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${apiKey}`,
      },
      body: JSON.stringify(apiPayload),
    });

    const responseText = await apiResponse.text();
    console.log('MobileNig API response status:', apiResponse.status);
    console.log('MobileNig API response text (first 1000 chars):', responseText.substring(0, 1000));

    if (responseText.trim().startsWith('<!DOCTYPE') || responseText.trim().startsWith('<html') || !apiResponse.ok) {
      return new Response(
        JSON.stringify({ 
          success: false, 
          error: 'Cable TV renewal failed. Please check your API credentials.',
          details: {
            status: apiResponse.status,
            response_preview: responseText.substring(0, 500)
          }
        }),
        { status: 400, headers: { ...CORS_HEADERS, 'Content-Type': 'application/json' } }
      );
    }

    let apiResult: any;
    try {
      apiResult = JSON.parse(responseText);
    } catch (parseError) {
      return new Response(
        JSON.stringify({ 
          success: false, 
          error: 'Invalid response from cable TV provider',
          details: { response_preview: responseText.substring(0, 500) }
        }),
        { status: 400, headers: { ...CORS_HEADERS, 'Content-Type': 'application/json' } }
      );
    }
    
    const isSuccess = apiResponse.ok && (
      apiResult.statusCode === '200' || 
      apiResult.statusCode === 200 ||
      (apiResult.message && apiResult.message.toLowerCase() === 'success')
    );

    const transactionDetails = apiResult.details || {};
    const transactionStatus = transactionDetails.status || '';
    const statusLower = String(transactionStatus).toLowerCase();
    
    const isCancelled = statusLower.includes('cancelled') || 
                       statusLower.includes('failed') ||
                       statusLower.includes('rejected');
    
    const isApproved = statusLower.includes('approved') || 
                      statusLower.includes('success') ||
                      statusLower === 'successful';
    
    const isPending = statusLower.includes('pending') || 
                     statusLower.includes('processing');

    if (isCancelled) {
      return new Response(
        JSON.stringify({ 
          success: false, 
          error: `Transaction was cancelled by MobileNig. Status: ${transactionStatus || 'Unknown'}`,
          details: transactionDetails
        }),
        { status: 400, headers: { ...CORS_HEADERS, 'Content-Type': 'application/json' } }
      );
    }

    if (!isSuccess || (!isApproved && transactionStatus && !isPending)) {
      if (transactionStatus && !isApproved && !isPending) {
        return new Response(
          JSON.stringify({ 
            success: false, 
            error: `Transaction not approved. Status: ${transactionStatus || 'Unknown'}`,
            details: transactionDetails
          }),
          { status: 400, headers: { ...CORS_HEADERS, 'Content-Type': 'application/json' } }
        );
      }
    }

    // Query transaction status
    let actualStatus = transactionStatus || 'Unknown';
    try {
      const queryUrl = `https://enterprise.mobilenig.com/api/v2/services/query?trans_id=${finalTransId}`;
      const queryResponse = await fetch(queryUrl, {
        method: 'GET',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${apiKey}`,
        },
      });

      if (queryResponse.ok) {
        const queryText = await queryResponse.text();
        const queryResult = JSON.parse(queryText);
        
        if (queryResult.statusCode === '200' && queryResult.message === 'success') {
          const queryDetails = queryResult.details || {};
          actualStatus = queryDetails.status || transactionStatus;
          const queryStatus = String(actualStatus).toLowerCase();
          
          const isPendingQuery = queryStatus.includes('pending') || 
                                queryStatus.includes('processing');
          const isApprovedQuery = queryStatus.includes('approved') || 
                                queryStatus.includes('success');
          
          if (isPendingQuery) {
            return new Response(
              JSON.stringify({ 
                success: false,
                pending: true,
                error: `Transaction is pending confirmation from MobileNig. Your wallet has not been debited.`,
                details: { status: actualStatus, trans_id: finalTransId }
              }),
              { status: 202, headers: { ...CORS_HEADERS, 'Content-Type': 'application/json' } }
            );
          } else if (!isApprovedQuery) {
            return new Response(
              JSON.stringify({ 
                success: false, 
                error: `Transaction verification failed. Status: ${actualStatus}`,
                details: queryDetails
              }),
              { status: 400, headers: { ...CORS_HEADERS, 'Content-Type': 'application/json' } }
            );
          }
        }
      }
    } catch (queryError) {
      console.warn('Error querying transaction status:', queryError);
    }
    
    const finalStatusLower = String(actualStatus).toLowerCase();
    const isApprovedFinal = finalStatusLower.includes('approved') || 
                           finalStatusLower.includes('success') ||
                           actualStatus === 'Approved';

    if (!isApprovedFinal) {
      return new Response(
        JSON.stringify({ 
          success: false, 
          error: `Transaction not approved. Status: ${actualStatus || 'Unknown'}`,
          details: transactionDetails
        }),
        { status: 400, headers: { ...CORS_HEADERS, 'Content-Type': 'application/json' } }
      );
    }

    // Debit wallet
    const formattedAmount = `₦${renewalAmount.toFixed(2)}`;

    let debitResult;
    try {
      debitResult = await debitUserWallet({
        supabase,
        userId: user.id,
        amount: renewalAmount,
        transactionType: 'purchase',
        description: `Renewal: ${provider} - ${card_number}`,
        reference,
        performedBy: user.id,
        balanceBefore: userBalance,
        notification: {
          title: 'Cable TV renewal successful',
          message: `${formattedAmount} paid for ${provider} renewal on smart card ${card_number}. Reference: ${reference}.`,
        },
      });
    } catch (debitError) {
      const balanceAfter = userBalance - renewalAmount;
      await supabase.from('user_transactions').insert({
        user_id: user.id,
        transaction_type: 'purchase',
        amount: renewalAmount,
        balance_before: userBalance,
        balance_after: balanceAfter,
        description: `Renewal: ${provider} - ${card_number}`,
        reference: reference,
        performed_by: user.id,
      });
      
      await supabase
        .from('profiles')
        .update({ balance: balanceAfter })
        .eq('id', user.id);
      
      debitResult = {
        balanceBefore: userBalance,
        balanceAfter: balanceAfter,
        reference: reference,
      };
    }

    return new Response(
      JSON.stringify({ 
        success: true,
        data: {
          reference: reference,
          amount: renewalAmount,
          balance_after: debitResult.balanceAfter,
          provider: provider,
          card_number: card_number,
          customer_name: customer_name,
          status: actualStatus,
          trans_id: finalTransId,
          mobilenig_details: transactionDetails
        }
      }),
      { status: 200, headers: { ...CORS_HEADERS, 'Content-Type': 'application/json' } }
    );

  } catch (error) {
    console.error('Error in renew-cable-subscription function:', error);
    return new Response(
      JSON.stringify({
        success: false,
        error: 'Internal server error',
        details: error instanceof Error ? error.message : String(error),
      }),
      { status: 500, headers: { ...CORS_HEADERS, 'Content-Type': 'application/json' } }
    );
  }
});




