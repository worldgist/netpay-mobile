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
    const { resolveSmeplugSecretKey } = await import("../_shared/vendor-secrets.ts");
    const smeplugSecretKey = await resolveSmeplugSecretKey();

    if (!smeplugSecretKey) {
      console.error('SMEPLUG_SECRET_KEY not configured');
      return jsonResponse({ success: false, error: 'Service configuration error' }, 500);
    }

    const supabase = createServiceClient();
    await requireAdmin(req, supabase);

    const { page = 1, per_page = 10, trans_id } = await req.json().catch(() => ({ page: 1, per_page: 10 }));

    let url: string;
    if (trans_id) {
      // Search by transaction ID
      url = `https://smeplug.ng/api/v1/transactions?transaction_id=${trans_id}`;
      console.log('Searching wallet history for transaction:', trans_id);
    } else {
      // Get paginated transactions
      url = `https://smeplug.ng/api/v1/transactions?page=${page}&limit=${per_page}`;
      console.log('Fetching wallet history - page:', page, 'per_page:', per_page);
    }

    const response = await fetch(url, {
      method: 'GET',
      headers: {
        'Authorization': `Bearer ${smeplugSecretKey}`,
        'Content-Type': 'application/json',
      },
    });

    const data = await response.json();
    console.log('SMEPLUG wallet history response:', data);

    // Transform SMEPLUG response to match expected format
    let transactions = [];
    if (data.success && data.data) {
      if (Array.isArray(data.data)) {
        transactions = data.data;
      } else if (trans_id) {
        transactions = [data.data];
      }
    }

    const responseData = {
      success: true,
      transactions: transactions,
      message: data.message || 'Success',
      statusCode: data.statusCode || 200,
    };

    return new Response(
      JSON.stringify(responseData),
      { 
        status: 200,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' } 
      }
    );

  } catch (error) {
    console.error('Error in fetch-smeplug-wallet-history function:', error);
    return new Response(
      JSON.stringify({ 
        error: 'Internal server error',
        details: error instanceof Error ? error.message : 'Unknown error'
      }),
      { 
        status: 500,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' } 
      }
    );
  }
});

