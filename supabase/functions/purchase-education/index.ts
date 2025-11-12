import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { debitUserWallet } from "../_shared/wallet.ts";

const CORS_HEADERS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

const buildMobilenigHeaders = (secretKey: string) => ({
  'Content-Type': 'application/json',
  Authorization: `Bearer ${secretKey}`,
});

const ensureNumber = (value: unknown, fallback = 0): number => {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
};

const normalizePinEntries = (payload: any): Array<Record<string, unknown>> => {
  if (!payload) return [];
  if (Array.isArray(payload)) return payload;
  return [payload];
};

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: CORS_HEADERS });
  }

  try {
    const supabaseUrl = Deno.env.get('SUPABASE_URL');
    const supabaseKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
    const mobilenigSecretKey =
      Deno.env.get('MOBILENIG_SECRET_KEY') ?? Deno.env.get('MOBILENIG_PUBLIC_KEY');

    if (!supabaseUrl || !supabaseKey) {
      throw new Error('Supabase credentials are not configured');
    }

    if (!mobilenigSecretKey) {
      throw new Error('MOBILENIG_SECRET_KEY not configured');
    }

    const supabase = createClient(supabaseUrl, supabaseKey);

    const authHeader = req.headers.get('Authorization');
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return new Response(
        JSON.stringify({ success: false, error: 'Unauthorized' }),
        { status: 401, headers: { ...CORS_HEADERS, 'Content-Type': 'application/json' } }
      );
    }

    const token = authHeader.replace('Bearer ', '');
    const {
      data: { user },
      error: authError,
    } = await supabase.auth.getUser(token);

    if (authError || !user) {
      return new Response(
        JSON.stringify({ success: false, error: 'Unauthorized' }),
        { status: 401, headers: { ...CORS_HEADERS, 'Content-Type': 'application/json' } }
      );
    }

    const payload = await req.json();
    const phone_number = payload?.phone_number;
    const exam_type = payload?.exam_type;
    const api_code = payload?.api_code;
    const amount = payload?.amount;
    const quantityInput = payload?.quantity;
    const providerServiceIdInput = payload?.service_id ? String(payload.service_id) : undefined;
    const educationServiceIdInput = payload?.education_service_id ? String(payload.education_service_id) : undefined;

    const isUuid = (value: string | undefined) =>
      !!value && /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(value);

    const serviceRowId = educationServiceIdInput ?? (isUuid(providerServiceIdInput) ? providerServiceIdInput : undefined);

    if (!exam_type || !serviceRowId) {
      return new Response(
        JSON.stringify({ success: false, error: 'exam_type and education_service_id are required' }),
        { status: 400, headers: { ...CORS_HEADERS, 'Content-Type': 'application/json' } }
      );
    }

    const normalizedExam = String(exam_type).toUpperCase().trim();
    const quantity = Math.max(1, ensureNumber(quantityInput, 1));

    const { data: serviceRow, error: serviceError } = await supabase
      .from('education_services')
      .select('id, exam_type, service_name, price, original_price, custom_price, api_code, service_id, metadata')
      .eq('id', serviceRowId)
      .maybeSingle();

    if (serviceError || !serviceRow) {
      return new Response(
        JSON.stringify({ success: false, error: 'Education service not found' }),
        { status: 404, headers: { ...CORS_HEADERS, 'Content-Type': 'application/json' } }
      );
    }

    const { data: profile, error: profileError } = await supabase
      .from('profiles')
      .select('balance, full_name, email')
      .eq('id', user.id)
      .maybeSingle();

    if (profileError || !profile) {
      console.error('Error fetching user profile:', profileError);
      return new Response(
        JSON.stringify({ success: false, error: 'Failed to fetch user profile' }),
        { status: 500, headers: { ...CORS_HEADERS, 'Content-Type': 'application/json' } }
      );
    }

    const balanceBefore = ensureNumber(profile.balance);

    const providerServiceId =
      serviceRow.service_id ||
      providerServiceIdInput ||
      serviceRow.api_code ||
      api_code ||
      (serviceRow.metadata as Record<string, unknown>)?.service_id;

    if (!providerServiceId) {
      return new Response(
        JSON.stringify({ success: false, error: 'Service ID missing for education purchase' }),
        { status: 400, headers: { ...CORS_HEADERS, 'Content-Type': 'application/json' } }
      );
    }

    const unitPrice =
      ensureNumber(serviceRow.price) || ensureNumber(serviceRow.original_price) || ensureNumber(amount);
    if (!unitPrice || unitPrice <= 0) {
      return new Response(
        JSON.stringify({ success: false, error: 'Invalid service price' }),
        { status: 400, headers: { ...CORS_HEADERS, 'Content-Type': 'application/json' } }
      );
    }

    const totalAmount = unitPrice * quantity;

    if (balanceBefore < totalAmount) {
      return new Response(
        JSON.stringify({ success: false, error: 'Insufficient balance' }),
        { status: 400, headers: { ...CORS_HEADERS, 'Content-Type': 'application/json' } }
      );
    }

    const reference = `EDU-${Date.now()}-${user.id.slice(0, 8)}`;
    const transId = Date.now();

    let rechargePayload: Record<string, unknown> = {};
    let pins: Array<Record<string, unknown>> = [];
    let walletBalance: unknown = null;
    let providerUsed: 'enterprise' | 'legacy' = 'enterprise';

    try {
      const response = await fetch('https://enterprise.mobilenig.com/api/v2/services/', {
        method: 'POST',
        headers: buildMobilenigHeaders(mobilenigSecretKey),
        body: JSON.stringify({
          service_id: providerServiceId,
          trans_id: transId,
          quantity,
          amount: totalAmount,
        }),
      });

      const payloadText = await response.text();
      let payload: any = null;
      try {
        payload = JSON.parse(payloadText);
      } catch {
        payload = payloadText;
      }

      if (!response.ok || payload?.statusCode !== '200') {
        throw new Error(payload?.message || payload?.error || 'Enterprise endpoint failed');
      }

      rechargePayload = payload;
      pins = normalizePinEntries(payload?.details?.details?.pins);
      walletBalance = payload?.details?.wallet_balance;
    } catch (enterpriseError) {
      console.warn('Enterprise Mobilenig endpoint failed, falling back to legacy API:', enterpriseError);
      providerUsed = 'legacy';
      const legacyResults: Array<Record<string, unknown>> = [];

      for (let index = 0; index < quantity; index += 1) {
        const legacyReference = `${reference}-${index + 1}`;
        const legacyResponse = await fetch('https://mobilenig.com/API/services/exec_purchase', {
          method: 'POST',
          headers: buildMobilenigHeaders(mobilenigSecretKey),
          body: JSON.stringify({
            serviceID: providerServiceId,
            phone: phone_number,
            amount: unitPrice,
            request_id: legacyReference,
          }),
        });

        const legacyText = await legacyResponse.text();
        let legacyPayload: any = null;
        try {
          legacyPayload = JSON.parse(legacyText);
        } catch {
          legacyPayload = legacyText;
        }

        if (!legacyResponse.ok || (legacyPayload?.status ?? legacyPayload?.message) === 'Failed') {
          const errorMessage =
            legacyPayload?.message || legacyPayload?.error || 'Education service purchase failed';
          console.error('Legacy Mobilenig error:', errorMessage, legacyPayload);
          return new Response(
            JSON.stringify({ success: false, error: errorMessage, details: legacyPayload }),
            { status: legacyResponse.status || 400, headers: { ...CORS_HEADERS, 'Content-Type': 'application/json' } }
          );
        }

        legacyResults.push({ reference: legacyReference, response: legacyPayload });

        const legacyPins = normalizePinEntries(legacyPayload?.details?.pins ?? legacyPayload?.details);
        pins = pins.concat(legacyPins);
        walletBalance = walletBalance ?? legacyPayload?.details?.wallet_balance;
      }

      rechargePayload = {
        endpoint: providerUsed,
        results: legacyResults,
      };
    }

    const debitResult = await debitUserWallet({
      supabase,
      userId: user.id,
      amount: totalAmount,
      transactionType: 'education_purchase',
      description: `Education service purchase - ${normalizedExam}`,
      reference,
      performedBy: user.id,
      balanceBefore,
      notification: {
        title: 'Education purchase successful',
        message: `₦${totalAmount.toFixed(2)} paid for ${normalizedExam}. Ref: ${reference}.`,
      },
    });

    const { error: insertError } = await supabase.from('education_transactions').insert({
      user_id: user.id,
      phone_number,
      exam_type: normalizedExam,
      service_id: providerServiceId,
      amount: totalAmount,
      unit_price: unitPrice,
      quantity,
      balance_before: debitResult.balanceBefore,
      balance_after: debitResult.balanceAfter,
      status: 'success',
      reference,
      api_response: rechargePayload,
      metadata: {
        pins,
        trans_id,
        wallet_balance: walletBalance,
        provider: providerUsed,
        provider_service_id: providerServiceId,
        education_service_id: serviceRowId,
      },
      performed_by: user.id,
    });

    if (insertError) {
      console.error('Failed to record education transaction:', insertError);
    }

    return new Response(
      JSON.stringify({
        success: true,
        message: 'Education service purchased successfully',
        data: {
          reference,
          quantity,
          amount: totalAmount,
          unit_price: unitPrice,
          exam_type: normalizedExam,
          phone_number,
          pins,
          provider_response: rechargePayload,
        },
      }),
      { status: 200, headers: { ...CORS_HEADERS, 'Content-Type': 'application/json' } }
    );
  } catch (error) {
    console.error('Error in purchase-education function:', error);

    return new Response(
      JSON.stringify({
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error occurred',
      }),
      { status: 500, headers: { ...CORS_HEADERS, 'Content-Type': 'application/json' } }
    );
  }
});

