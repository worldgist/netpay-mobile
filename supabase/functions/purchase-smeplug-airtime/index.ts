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

    const rawBody = await req.json();
    const { phone_number, amount, network_id, network_name } = rawBody ?? {};

    console.log('Incoming airtime purchase payload:', JSON.stringify(rawBody, null, 2));

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

    const smeplugNetworkId = resolveNetworkId(network_id);
    const providedNetworkName =
      typeof network_name === 'string' && network_name.trim().length > 0
        ? network_name.trim()
        : null;

    const resolveNetworkName = (id: number | null, fallback?: string | null) => {
      if (fallback) return fallback;
      if (id === null) return null;
      const NAME_MAP: Record<number, string> = {
        1: 'MTN',
        2: 'Airtel',
        3: '9Mobile',
        4: 'Glo',
      };
      return NAME_MAP[id] || null;
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
    
    const normalizedAmount = Number(amount);

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

    if (!Number.isFinite(normalizedAmount) || normalizedAmount <= 0) {
      return new Response(
        JSON.stringify({
          success: false,
          error: 'Please enter a valid amount greater than 0',
        }),
        { status: 200, headers: { ...CORS_HEADERS, 'Content-Type': 'application/json' } }
      );
    }

    if (smeplugNetworkId === null) {
      return new Response(
        JSON.stringify({
          success: false,
          error: 'Invalid network selected. Please try again.',
        }),
        { status: 200, headers: { ...CORS_HEADERS, 'Content-Type': 'application/json' } }
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
        { status: 200, headers: { ...CORS_HEADERS, 'Content-Type': 'application/json' } }
      );
    }

    const balanceBefore = Number(profile.balance) || 0;

    if (balanceBefore < normalizedAmount) {
      return new Response(
        JSON.stringify({ success: false, error: 'Insufficient balance' }),
        { status: 200, headers: { ...CORS_HEADERS, 'Content-Type': 'application/json' } }
      );
    }

    const reference = `AIRTIME-${Date.now()}-${user.id.slice(0, 8)}`;

    const normalizedNetworkName = resolveNetworkName(smeplugNetworkId, providedNetworkName);
    const normalizedServiceId = smeplugNetworkId !== null ? String(smeplugNetworkId) : String(network_id ?? '');

    console.log(
      `Purchasing airtime: ${normalizedAmount} for ${sanitizedPhone} on network ${smeplugNetworkId} (${normalizedNetworkName ?? 'UNKNOWN'})`
    );

    // Check if user is demo user - mock the API response for demo users
    const isDemoUser = profile.email === 'demo@netpayy.ng';
    
    let apiResponse;
    let response;

    if (isDemoUser) {
      // Mock successful response for demo users
      console.log('Demo user detected - using mock API response');
      apiResponse = {
        success: true,
        status: true,
        message: 'Airtime purchase successful (Demo)',
        data: {
          status: true,
          success: true,
          reference: reference,
          phone: sanitizedPhone,
          amount: normalizedAmount,
          network: normalizedNetworkName || String(smeplugNetworkId),
        },
      };
      response = { ok: true };
    } else {
      // Purchase airtime via SMEPLUG API for real users
      response = await fetch('https://smeplug.ng/api/v1/airtime/purchase', {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${SECRET_KEY}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          network_id: smeplugNetworkId,
          phone: sanitizedPhone,
          amount: normalizedAmount,
          customer_reference: reference
        }),
      });

      const responseText = await response.text();
      try {
        apiResponse = JSON.parse(responseText);
      } catch (parseError) {
        console.error('Failed to parse SMEPLUG response:', responseText);
        return new Response(
          JSON.stringify({ 
            success: false, 
            error: `Invalid response from airtime provider: ${responseText.substring(0, 100)}`
          }),
          { status: 500, headers: { ...CORS_HEADERS, 'Content-Type': 'application/json' } }
        );
      }
      
      console.log('SMEPLUG airtime purchase response:', JSON.stringify(apiResponse, null, 2));
    }
    
    console.log('Airtime purchase API response:', JSON.stringify(apiResponse, null, 2));

    const apiStatus =
      apiResponse?.success === true ||
      apiResponse?.status === true ||
      apiResponse?.data?.status === true ||
      apiResponse?.data?.success === true;

    const normalizedStatus =
      apiStatus ||
      (apiResponse?.status === 'success') ||
      (apiResponse?.data && typeof apiResponse.data === 'object' && !apiResponse.data.error);

    if (!response.ok || !normalizedStatus) {
      // Extract error message from various possible API response formats
      const errorMessage =
        apiResponse.message ||
        apiResponse.error ||
        apiResponse.data?.message ||
        apiResponse.data?.error ||
        apiResponse.response_description ||
        apiResponse.data?.response_description ||
        apiResponse.status_message ||
        apiResponse.data?.status_message ||
        (typeof apiResponse === 'string' ? apiResponse : 'Airtime purchase failed');
      
      // Check for phone number validation errors specifically
      const errorText = String(errorMessage).toLowerCase();
      if (errorText.includes('phone') || errorText.includes('number') || errorText.includes('invalid')) {
        console.error('SMEPLUG API phone validation error:', errorMessage, 'Phone:', sanitizedPhone, 'Network:', smeplugNetworkId);
      } else {
        console.error('SMEPLUG API error:', errorMessage, 'Full response:', apiResponse);
      }
      
      return new Response(
        JSON.stringify({ 
          success: false, 
          error: errorMessage,
          details: apiResponse
        }),
        { status: 200, headers: { ...CORS_HEADERS, 'Content-Type': 'application/json' } }
      );
    }

    const fallbackNetworkId = network_id ?? smeplugNetworkId;
    const displayNetwork =
      normalizedNetworkName ||
      (fallbackNetworkId !== null && fallbackNetworkId !== undefined && fallbackNetworkId !== ''
        ? `Network ${fallbackNetworkId}`
        : 'the selected network');
    const formattedAmount = `₦${normalizedAmount.toFixed(2)}`;

    const debitResult = await debitUserWallet({
      supabase,
      userId: user.id,
      amount: normalizedAmount,
      transactionType: 'airtime_purchase',
      description: `Airtime purchase - ${sanitizedPhone}`,
      reference,
      performedBy: user.id,
      balanceBefore,
      notification: {
        title: 'Airtime purchase successful',
        message: `${formattedAmount} airtime purchased for ${sanitizedPhone} on ${displayNetwork}. Reference: ${reference}.`,
      },
    });

    await supabase.from('airtime_transactions').insert({
      user_id: user.id,
      phone_number: sanitizedPhone,
      network: normalizedNetworkName || String(network_id ?? smeplugNetworkId ?? ''),
      service_id: normalizedServiceId,
      amount: normalizedAmount,
      balance_before: debitResult.balanceBefore,
      balance_after: debitResult.balanceAfter,
      status: 'success',
      reference,
      api_response: apiResponse,
      performed_by: user.id
    });

    // Send push notification
    await sendPushNotification(
      supabase,
      user.id,
      'Airtime Purchase Successful',
      `${formattedAmount} airtime purchased for ${sanitizedPhone} on ${displayNetwork}. Your new balance is ₦${debitResult.balanceAfter.toFixed(2)}.`,
      {
        type: 'airtime_purchase',
        reference,
        amount: normalizedAmount,
        phone_number: sanitizedPhone,
        network: normalizedNetworkName || String(network_id ?? smeplugNetworkId ?? ''),
      }
    );

    return new Response(
      JSON.stringify({ 
        success: true,
        message: 'Airtime purchased successfully',
        data: {
          reference,
          amount: normalizedAmount,
          phone_number: sanitizedPhone,
          network: normalizedNetworkName || String(network_id ?? smeplugNetworkId ?? ''),
          balance_before: debitResult.balanceBefore,
          balance_after: debitResult.balanceAfter
        }
      }),
      { status: 200, headers: { ...CORS_HEADERS, 'Content-Type': 'application/json' } }
    );

  } catch (error) {
    console.error('Error in purchase-smeplug-airtime function:', error);
    
    return new Response(
      JSON.stringify({ 
        success: false, 
        error: error instanceof Error ? error.message : 'Unknown error occurred'
      }),
      { 
        status: 200, 
        headers: { ...CORS_HEADERS, 'Content-Type': 'application/json' } 
      }
    );
  }
});
