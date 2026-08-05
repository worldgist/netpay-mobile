import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import {
  getEBillsDataVariations,
  getEBillsMobileNetworkServiceId,
  extractEBillsDataPlanValidity,
  extractEBillsDataPlanSize,
  isValidEBillsDataServiceId,
} from "../_shared/ebills-api.ts";

const CORS_HEADERS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: CORS_HEADERS });
  }

  try {
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

    let parsedBody: Record<string, unknown> = {};
    try {
      const bodyText = await req.text();
      if (bodyText && bodyText.trim().length > 0) {
        parsedBody = JSON.parse(bodyText);
      }
    } catch (error) {
      console.error('fetch-ebills-data-plans: unable to parse request body:', error);
    }

    const network = String(parsedBody.network || parsedBody.network_name || '').trim();
    const serviceIdParam = String(parsedBody.service_id || '').trim().toLowerCase();

    const serviceId = serviceIdParam && isValidEBillsDataServiceId(serviceIdParam)
      ? serviceIdParam
      : network
        ? getEBillsMobileNetworkServiceId(network)
        : '';

    if (!serviceId) {
      return new Response(
        JSON.stringify({ success: false, error: 'network or service_id is required' }),
        { status: 400, headers: { ...CORS_HEADERS, 'Content-Type': 'application/json' } }
      );
    }

    if (!isValidEBillsDataServiceId(serviceId)) {
      return new Response(
        JSON.stringify({
          success: false,
          error: `Invalid service_id "${serviceId}". Must be one of: mtn, airtel, glo, 9mobile, smile`,
        }),
        { status: 400, headers: { ...CORS_HEADERS, 'Content-Type': 'application/json' } }
      );
    }

    console.log('Fetching eBills data variations:', { network, serviceId });

    const variationsData = await getEBillsDataVariations(serviceId);

    const rawVariations = Array.isArray(variationsData.data) ? variationsData.data : [];

    if (rawVariations.length === 0) {
      return new Response(
        JSON.stringify({
          success: false,
          error: `No data plans available for ${network || serviceId}`,
        }),
        { status: 200, headers: { ...CORS_HEADERS, 'Content-Type': 'application/json' } }
      );
    }

    const plans = rawVariations
      .filter((variation) => {
        const availability = String(variation.availability || 'Available').trim();
        return availability.toLowerCase() === 'available';
      })
      .map((variation) => {
        const variationId = variation.variation_id;
        const dataPlanLabel = String(variation.data_plan || '').trim();
        const planName = dataPlanLabel || `Data Plan ${variationId ?? ''}`;
        const priceRaw = variation.price ?? 0;
        const price = typeof priceRaw === 'number'
          ? priceRaw
          : parseFloat(String(priceRaw).replace(/[^0-9.-]/g, '')) || 0;

        const validity = dataPlanLabel ? extractEBillsDataPlanValidity(dataPlanLabel) : 'N/A';
        const size = dataPlanLabel ? extractEBillsDataPlanSize(dataPlanLabel) : null;

        return {
          plan_name: planName,
          data_plan: dataPlanLabel,
          price,
          api_code: String(variationId ?? ''),
          variation_id: variationId,
          service_id: variation.service_id || serviceId,
          service_name: variation.service_name || serviceId,
          availability: variation.availability || 'Available',
          validity,
          size,
          network: (network || variation.service_name || serviceId).toUpperCase(),
        };
      })
      .filter((plan) => plan.api_code && Number.isFinite(plan.price) && plan.price > 0);

    console.log(`Fetched ${plans.length} eBills data plans for ${serviceId}`);

    return new Response(
      JSON.stringify({
        success: true,
        data: plans,
        metadata: {
          total_plans: plans.length,
          total_variations: rawVariations.length,
          network: network || serviceId,
          service_id: serviceId,
          product: variationsData.product || 'Data',
          vending_provider: 'ebills',
        },
      }),
      { status: 200, headers: { ...CORS_HEADERS, 'Content-Type': 'application/json' } }
    );
  } catch (error) {
    console.error('fetch-ebills-data-plans error:', error);
    return new Response(
      JSON.stringify({
        success: false,
        error: error instanceof Error ? error.message : 'Unexpected error',
      }),
      { status: 500, headers: { ...CORS_HEADERS, 'Content-Type': 'application/json' } }
    );
  }
});
