import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import {
  corsHeaders,
  createServiceClient,
  errorResponse,
  jsonResponse,
  requireAdmin,
} from "../_shared/admin-auth.ts";

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { status: 204, headers: corsHeaders });
  }

  try {
    const payvesselApiKey = Deno.env.get('PAYVESSEL_API_KEY');
    const payvesselSecretKey = Deno.env.get('PAYVESSEL_SECRET_KEY');
    const payvesselBusinessId = Deno.env.get('PAYVESSEL_BUSINESS_ID');

    if (!payvesselApiKey || !payvesselSecretKey || !payvesselBusinessId) {
      console.error('PayVessel credentials not configured:', {
        hasApiKey: !!payvesselApiKey,
        hasSecretKey: !!payvesselSecretKey,
        hasBusinessId: !!payvesselBusinessId
      });
      return jsonResponse({
        success: false,
        error: 'PayVessel credentials not configured. Please set PAYVESSEL_API_KEY, PAYVESSEL_SECRET_KEY, and PAYVESSEL_BUSINESS_ID environment variables.'
      }, 500);
    }

    const supabase = createServiceClient();
    await requireAdmin(req, supabase);

    console.log('Fetching PayVessel available balance...');

    const apiKey = payvesselApiKey.trim().replace(/^['"]|['"]$/g, '');
    const apiSecret = payvesselSecretKey.trim().replace(/^['"]|['"]$/g, '').replace(/^Bearer\s+/i, '').trim();

    const readMoney = (value: unknown): number | null => {
      if (typeof value === 'number' && Number.isFinite(value)) return value;
      if (typeof value === 'string') {
        const parsed = Number(value.replace(/₦|ngn|,|\s/gi, '').trim());
        return Number.isFinite(parsed) ? parsed : null;
      }
      return null;
    };

    const collectMoney = (value: unknown, found: Array<{ key: string; amount: number }>, depth = 0) => {
      if (depth > 6 || value == null) return;
      if (Array.isArray(value)) {
        for (const item of value) collectMoney(item, found, depth + 1);
        return;
      }
      if (typeof value !== 'object') return;
      for (const [key, child] of Object.entries(value as Record<string, unknown>)) {
        const amount = readMoney(child);
        if (amount != null && /balance|amount/i.test(key) && !/limit|used|fee|charge/i.test(key)) {
          found.push({ key, amount });
        }
        if (child && typeof child === 'object') collectMoney(child, found, depth + 1);
      }
    };

    const businessId = payvesselBusinessId.trim();
    const loadPayvessel = async (url: string, secretHeader: string) => {
      const response = await fetch(url, {
        method: 'GET',
        headers: {
          'api-key': apiKey,
          'api-secret': secretHeader,
          'Authorization': secretHeader.startsWith('Bearer ') ? secretHeader : `Bearer ${secretHeader}`,
          'Content-Type': 'application/json',
        },
      });
      const responseText = await response.text();
      let body: Record<string, any> | null = null;
      try {
        body = JSON.parse(responseText);
      } catch {
        body = null;
      }
      const failed = !response.ok || body?.success === false || body?.status === false || body?.status === 'error';
      const fields: Array<{ key: string; amount: number }> = [];
      if (!failed) collectMoney(body, fields);
      return { failed, status: response.status, body, fields, message: body?.message || body?.error || responseText.slice(0, 180) };
    };

    const businessProfileUrl = (id: string) => `https://api.payvessel.com/ums/api/v2/business/${encodeURIComponent(id)}/`;
    const balanceUrl = 'https://api.payvessel.com/pms/api/external/request/wallet/balance/';
    const walletUrl = 'https://api.payvessel.com/pms/api/external/request/wallet/get-or-create/';
    const [businessResult, balanceResult, walletResult] = await Promise.all([
      loadPayvessel(businessProfileUrl(businessId), `Bearer ${apiSecret}`),
      loadPayvessel(balanceUrl, apiSecret),
      loadPayvessel(walletUrl, `Bearer ${apiSecret}`),
    ]);

    const walletBusinessId = walletResult.body?.data?.business_id;
    const linkedBusinessResult = walletBusinessId && walletBusinessId !== businessId
      ? await loadPayvessel(businessProfileUrl(String(walletBusinessId)), `Bearer ${apiSecret}`)
      : null;

    const results = [businessResult, linkedBusinessResult, balanceResult, walletResult].filter(Boolean);
    const fields = results.flatMap((result) => result.fields);
    const dashboardHit = fields.find((field) => field.key === 'wallet_balance');
    const availableHit = fields.find((field) => /available_?balance/i.test(field.key) && field.amount > 0);
    const balanceHit = fields.find((field) => field.key === 'balance' && field.amount > 0);
    const amount = dashboardHit?.amount ?? availableHit?.amount ?? balanceHit?.amount ?? fields.find((field) => /available_?balance/i.test(field.key))?.amount;

    if (amount == null) {
      const errorMsg = businessResult.message || balanceResult.message || walletResult.message || 'Failed to fetch PayVessel available balance';
      console.error('PayVessel API error:', errorMsg);
      return new Response(
        JSON.stringify({ success: false, error: errorMsg }),
        { status: balanceResult.status || 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const walletBody = (!walletResult.failed ? walletResult.body : null)?.data;
    const wallet = walletBody && typeof walletBody === 'object' && !Array.isArray(walletBody) ? walletBody : null;
    const businessBody = (!businessResult.failed ? businessResult.body : linkedBusinessResult?.body)?.data;
    const business = businessBody?.data && typeof businessBody.data === 'object' ? businessBody.data : businessBody;
    const balanceData = (!balanceResult.failed ? balanceResult.body : null)?.data;

    console.log('PayVessel available balance parsed:', {
      statuses: results.map((result) => result.status),
      fields: fields.map((field) => ({ key: field.key, amount: field.amount })),
      amount,
    });

    const responseData = {
      success: true,
      balance: {
        amount,
        availableBalance: amount,
        currency: balanceData?.currency || wallet?.currency || 'NGN',
      },
      account: {
        businessName: business?.name || wallet?.wallet_name || wallet?.account_name || 'PayVessel Account',
        businessId: payvesselBusinessId,
        bankName: wallet?.bank_name || null,
      },
    };

    return new Response(
      JSON.stringify(responseData),
      { 
        status: 200,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' } 
      }
    );

  } catch (error) {
    console.error('Error in fetch-payvessel-balance function:', error);
    console.error('Error stack:', error instanceof Error ? error.stack : 'No stack trace');
    console.error('Error name:', error instanceof Error ? error.name : 'Unknown');
    
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    const errorDetails = error instanceof Error ? {
      message: error.message,
      name: error.name,
      stack: error.stack
    } : { error: String(error) };
    
    return new Response(
      JSON.stringify({ 
        success: false,
        error: 'Internal server error',
        message: errorMessage,
        details: errorDetails
      }),
      { 
        status: 500,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' } 
      }
    );
  }
});

