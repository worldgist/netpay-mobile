import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { debitUserWallet } from "../_shared/wallet.ts";

const CORS_HEADERS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: CORS_HEADERS });
  }

  try {
    const SECRET_KEY = Deno.env.get('SMEPLUG_SECRET_KEY');
    
    if (!SECRET_KEY) {
      throw new Error('SMEPLUG_SECRET_KEY not configured');
    }

    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const supabase = createClient(supabaseUrl, supabaseKey);

    const authHeader = req.headers.get('Authorization');
    if (!authHeader) {
      return new Response(
        JSON.stringify({ success: false, error: 'Unauthorized' }),
        { status: 401, headers: { ...CORS_HEADERS, 'Content-Type': 'application/json' } }
      );
    }

    const token = authHeader.replace('Bearer ', '');
    const { data: { user }, error: authError } = await supabase.auth.getUser(token);
    
    if (authError || !user) {
      return new Response(
        JSON.stringify({ success: false, error: 'Unauthorized' }),
        { status: 401, headers: { ...CORS_HEADERS, 'Content-Type': 'application/json' } }
      );
    }

    let rawBody: Record<string, unknown> | null = null;
    let phone_number: unknown;
    let plan_id: unknown;
    let network_id: unknown;
    let network_name: unknown;
    let resolved_network_key: unknown;

    const bodyText = await req.text();
    console.log('Raw request body text for purchase-smeplug-data:', bodyText);
    if (bodyText && bodyText.trim().length > 0) {
      try {
        rawBody = JSON.parse(bodyText);
      } catch (parseRequestError) {
        console.error('Unable to parse request body for purchase-smeplug-data. Treating as empty payload.', {
          error: parseRequestError,
          bodyText,
        });
        rawBody = null;
      }
    }

    if (rawBody && typeof rawBody === 'object') {
      ({ phone_number, plan_id, network_id, network_name, resolved_network_key } = rawBody as Record<string, unknown>);
    }

    console.log('Incoming data purchase payload:', JSON.stringify(rawBody, null, 2));

    const resolveNetworkId = (value: unknown) => {
      if (typeof value === 'number' && Number.isFinite(value)) {
        return value;
      }

      if (typeof value === 'string') {
        const trimmed = value.trim();
        if (/^\d+$/.test(trimmed)) {
          return Number(trimmed);
        }

        const normalized = trimmed.toUpperCase();
        const mapping: Record<string, number> = {
          MTN: 1,
          'MTN NIGERIA': 1,
          AIRTEL: 2,
          'AIRTEL NIGERIA': 2,
          '9MOBILE': 3,
          '9 MOBILE': 3,
          ETISALAT: 3,
          GLO: 4,
          GLOBACOM: 4,
        };

        if (mapping[normalized]) {
          return mapping[normalized];
        }
      }

      return null;
    };

    // Normalize phone number (remove spaces, handle +234 format)
    let sanitizedPhone = typeof phone_number === 'string' ? phone_number.trim().replace(/\s+/g, '') : '';
    
    // Handle +234 format (convert to 0xxx format)
    if (sanitizedPhone.startsWith('+234')) {
      sanitizedPhone = '0' + sanitizedPhone.slice(4);
    } else if (sanitizedPhone.startsWith('234') && sanitizedPhone.length === 13) {
      sanitizedPhone = '0' + sanitizedPhone.slice(3);
    }
    
    // Remove any remaining non-digit characters except leading 0
    sanitizedPhone = sanitizedPhone.replace(/[^0-9]/g, '');

    // Basic validation - let API handle network-specific validation
    if (!sanitizedPhone || sanitizedPhone.length < 10 || sanitizedPhone.length > 11) {
      return new Response(
        JSON.stringify({
          success: false,
          error: 'Please enter a valid phone number (10-11 digits)',
        }),
        { status: 200, headers: { ...CORS_HEADERS, 'Content-Type': 'application/json' } }
      );
    }

    if (!plan_id) {
      console.error('Invalid data purchase payload:', {
        phone_number: sanitizedPhone ? '***hidden***' : sanitizedPhone,
        plan_id,
        network_id,
        resolved_network_key,
        resolvedNetworkId: null,
      });
      return new Response(
        JSON.stringify({
          success: false,
          error: 'phone_number and plan_id are required',
          details: {
            phone_number: Boolean(sanitizedPhone),
            plan_id,
            network_id,
            resolved_network_key,
            resolvedNetworkId: null,
          },
        }),
        { status: 200, headers: { ...CORS_HEADERS, 'Content-Type': 'application/json' } }
      );
    }

    // Fetch data plan details from database
    const { data: dataPlan, error: planError } = await supabase
      .from('data_plans')
      .select('*')
      .eq('id', plan_id)
      .single();

    if (planError || !dataPlan) {
      console.error('Error fetching data plan:', planError);
      return new Response(
        JSON.stringify({ success: false, error: 'Data plan not found' }),
        { status: 404, headers: { ...CORS_HEADERS, 'Content-Type': 'application/json' } }
      );
    }

    // Fetch user's balance
    const { data: profile, error: profileError } = await supabase
      .from('profiles')
      .select('balance, full_name, email')
      .eq('id', user.id)
      .single();

    if (profileError || !profile) {
      console.error('Error fetching user profile:', profileError);
      return new Response(
        JSON.stringify({ success: false, error: 'Failed to fetch user profile' }),
        { status: 500, headers: { ...CORS_HEADERS, 'Content-Type': 'application/json' } }
      );
    }

    const effectiveNetworkKey =
      (typeof network_id === 'string' && network_id.trim().length > 0 ? network_id.trim() : null) ??
      (typeof resolved_network_key === 'string' && resolved_network_key.trim().length > 0
        ? resolved_network_key.trim()
        : null) ??
      (typeof network_name === 'string' && network_name.trim().length > 0 ? network_name.trim() : null) ??
      (typeof dataPlan.network === 'string' && dataPlan.network.trim().length > 0
        ? dataPlan.network.trim()
        : null);

    const smeplugNetworkId =
      resolveNetworkId(effectiveNetworkKey) ??
      resolveNetworkId(dataPlan.network);

    if (smeplugNetworkId === null) {
      console.error('Unable to resolve SMEPLUG network ID', {
        network_id,
        resolved_network_key,
        network_name,
        data_plan_network: dataPlan.network,
      });
      return new Response(
        JSON.stringify({
          success: false,
          error: 'Unable to resolve network ID for this provider',
          details: {
            network_id,
            resolved_network_key,
            network_name,
            data_plan_network: dataPlan.network,
          },
        }),
        { status: 200, headers: { ...CORS_HEADERS, 'Content-Type': 'application/json' } }
      );
    }

    const resolvedNetworkName =
      typeof network_name === 'string' && network_name.trim().length > 0
        ? network_name.trim()
        : dataPlan.network || effectiveNetworkKey || '';

    const balanceBefore = Number(profile.balance) || 0;
    
    // Calculate pricing: user pays admin-set price, API gets original price
    // userCharged = what user pays (custom_price or original_price)
    // apiCost = what SMEPLUG charges for this plan (original_price, the actual API cost)
    // adminRevenue = difference (userCharged - apiCost)
    const userCharged = dataPlan.custom_price ?? dataPlan.original_price ?? dataPlan.price;
    const apiCost = dataPlan.original_price ?? dataPlan.price;
    const userChargedAmount = Number(userCharged) || 0;
    const apiCostAmount = Number(apiCost) || 0;
    const adminRevenue = userChargedAmount - apiCostAmount; // Can be negative if admin sets price lower than API cost

    console.log('Pricing breakdown:', {
      custom_price: dataPlan.custom_price,
      original_price: dataPlan.original_price,
      price: dataPlan.price,
      userCharged: userChargedAmount,
      apiCost: apiCostAmount,
      adminRevenue: adminRevenue
    });

    if (balanceBefore < userChargedAmount) {
      return new Response(
        JSON.stringify({ success: false, error: 'Insufficient balance' }),
        { status: 400, headers: { ...CORS_HEADERS, 'Content-Type': 'application/json' } }
      );
    }

    const reference = `DATA-${Date.now()}-${user.id.slice(0, 8)}`;

    console.log(
      `Purchasing data: ${dataPlan.plan_name} for ${sanitizedPhone} on network ${smeplugNetworkId} (resolved from ${network_id ?? resolved_network_key ?? resolvedNetworkName})`
    );

    // Purchase data via SMEPLUG API
    const response = await fetch('https://smeplug.ng/api/v1/data/purchase', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${SECRET_KEY}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        network_id: smeplugNetworkId,
        plan_id: parseInt(dataPlan.api_code),
        phone: sanitizedPhone,
        customer_reference: reference
      }),
    });

    const responseText = await response.text();
    let apiResponse;
    try {
      if (responseText.trim().length === 0) {
        throw new Error('Empty response from SMEPLUG data endpoint');
      }
      apiResponse = JSON.parse(responseText);
    } catch (parseError) {
      console.error('Failed to parse SMEPLUG response:', responseText, parseError);
      return new Response(
        JSON.stringify({
          success: false,
          error: `Invalid response from data provider: ${responseText.substring(0, 120)}`,
          details: {
            raw: responseText,
          },
        }),
        { status: 500, headers: { ...CORS_HEADERS, 'Content-Type': 'application/json' } }
      );
    }
    console.log('SMEPLUG data purchase response:', JSON.stringify(apiResponse, null, 2));

    const apiStatus =
      apiResponse?.success === true ||
      apiResponse?.status === true ||
      apiResponse?.data?.status === true ||
      apiResponse?.data?.success === true ||
      apiResponse?.status === 'success';

    if (!response.ok || !apiStatus) {
      const errorMessage =
        apiResponse.message ||
        apiResponse.error ||
        apiResponse.data?.message ||
        apiResponse.data?.error ||
        'Data purchase failed';
      console.error('SMEPLUG data API error:', errorMessage, 'Full response:', apiResponse);
      return new Response(
        JSON.stringify({ 
          success: false, 
          error: errorMessage,
          details: apiResponse,
        }),
        { status: 200, headers: { ...CORS_HEADERS, 'Content-Type': 'application/json' } }
      );
    }

    const formattedAmount = `₦${userChargedAmount.toFixed(2)}`;

    // Debit wallet with the amount user is charged (custom_price or original_price)
    // This is the full amount the user pays, which includes admin markup
    const debitResult = await debitUserWallet({
      supabase,
      userId: user.id,
      amount: userChargedAmount, // Charge user the admin-set price
      transactionType: 'data_purchase',
      description: `Data purchase - ${dataPlan.plan_name} for ${sanitizedPhone}`,
      reference,
      performedBy: user.id,
      balanceBefore,
      notification: {
        title: 'Data purchase successful',
        message: `${formattedAmount} data bundle (${dataPlan.plan_name}) purchased for ${sanitizedPhone} on ${resolvedNetworkName || dataPlan.network || 'the selected network'}. Reference: ${reference}.`,
      },
    });

    // Record transaction with admin revenue tracking - CRITICAL: This must succeed
    // Try with all columns first, fallback if api_cost/admin_revenue don't exist
    let insertedTransaction = null;
    let dataTxnError = null;
    
    const baseTransactionData = {
      user_id: user.id,
      phone_number: sanitizedPhone,
      network: dataPlan.network || String(network_id),
      plan_name: dataPlan.plan_name,
      plan_validity: dataPlan.validity || "N/A",
      amount: userChargedAmount,
      balance_before: debitResult.balanceBefore,
      balance_after: debitResult.balanceAfter,
      status: 'success',
      reference,
      api_response: apiResponse,
      performed_by: user.id,
      provider: 'smeplug',
    };

    // First attempt: try with api_cost and admin_revenue
    const result = await supabase
      .from('data_transactions')
      .insert({
        ...baseTransactionData,
        api_cost: apiCostAmount,
        admin_revenue: adminRevenue,
      })
      .select()
      .single();

    dataTxnError = result.error;
    insertedTransaction = result.data;

    // If error is about missing columns, retry without them
    if (dataTxnError && (
      dataTxnError.code === '42703' ||
      dataTxnError.message?.toLowerCase().includes('column') ||
      dataTxnError.message?.toLowerCase().includes('does not exist') ||
      dataTxnError.message?.toLowerCase().includes('api_cost') ||
      dataTxnError.message?.toLowerCase().includes('admin_revenue')
    )) {
      console.warn('api_cost/admin_revenue columns not found, inserting without them:', dataTxnError.message);
      const fallbackResult = await supabase
        .from('data_transactions')
        .insert(baseTransactionData)
        .select()
        .single();
      
      dataTxnError = fallbackResult.error;
      insertedTransaction = fallbackResult.data;
    }

    if (dataTxnError || !insertedTransaction) {
      console.error("CRITICAL: Failed to record data transaction after wallet debit:", dataTxnError);
      // This is a critical error - wallet was debited but transaction not recorded
      console.error("Data consistency issue: Wallet debited but transaction not recorded", {
        userId: user.id,
        userCharged: userChargedAmount,
        apiCost: apiCostAmount,
        adminRevenue: adminRevenue,
        reference,
        error: dataTxnError,
      });
      
      // Return error so the frontend knows something went wrong
      return new Response(
        JSON.stringify({
          success: false,
          error: "Transaction completed but failed to record. Please contact support with reference: " + reference,
          reference,
          details: {
            message: "Your wallet was debited and data was delivered, but the transaction record failed. Please contact support.",
            error: dataTxnError?.message || "Unknown error",
          },
        }),
        { status: 500, headers: { ...CORS_HEADERS, 'Content-Type': 'application/json' } },
      );
    }

    return new Response(
      JSON.stringify({ 
        success: true,
        message: 'Data purchased successfully',
        data: {
          reference,
          plan_name: dataPlan.plan_name,
          amount: userChargedAmount, // Amount user paid
          api_cost: apiCostAmount, // Amount sent to API
          admin_revenue: adminRevenue, // Admin profit
          phone_number: sanitizedPhone,
          network: resolvedNetworkName || dataPlan.network || String(network_id),
          validity: dataPlan.validity,
          balance_before: debitResult.balanceBefore,
          balance_after: debitResult.balanceAfter
        }
      }),
      { status: 200, headers: { ...CORS_HEADERS, 'Content-Type': 'application/json' } }
    );

  } catch (error) {
    console.error('Error in purchase-smeplug-data function:', error);
    
    return new Response(
      JSON.stringify({ 
        success: false, 
        error: error instanceof Error ? error.message : 'Unknown error occurred'
      }),
      { 
        status: 500, 
        headers: { ...CORS_HEADERS, 'Content-Type': 'application/json' } 
      }
    );
  }
});
