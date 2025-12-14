import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
  'Content-Type': 'application/json',
};

serve(async (req) => {
  // CORS preflight
  if (req.method === 'OPTIONS') {
    return new Response(null, {
      status: 204,
      headers: corsHeaders,
    });
  }

  // Determine which key to use based on operation
  // For recharge/purchase operations, use SECRET_KEY
  // For query/validation operations, use PUBLIC_KEY
  const useSecretKey = req.method === 'POST';
  const mobilenigKey = useSecretKey 
    ? Deno.env.get('MOBILENIG_SECRET_KEY')
    : Deno.env.get('MOBILENIG_PUBLIC_KEY');

  if (!mobilenigKey) {
    const keyType = useSecretKey ? 'MOBILENIG_SECRET_KEY' : 'MOBILENIG_PUBLIC_KEY';
    return new Response(
      JSON.stringify({ 
        error: `${keyType} environment variable is not set` 
      }),
      { 
        status: 500, 
        headers: { ...corsHeaders, 'Content-Type': 'application/json' } 
      }
    );
  }

  const BASE = 'https://enterprise.mobilenig.com/api/v2/services';
  const url = new URL(req.url);
  const pathname = url.pathname;

  try {
    if (req.method === 'POST') {
      // Recharge: forwards request body to MobileNig recharge endpoint
      const body = await req.json().catch(() => null);
      if (!body) {
        return new Response(
          JSON.stringify({ error: 'Invalid or missing JSON body' }),
          { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }

      // Validate required fields for recharge
      const required = ['service_id', 'trans_id', 'customerReference', 'amount', 'customerName', 'customerAddress'];
      for (const key of required) {
        if (body[key] === undefined || body[key] === null || body[key] === '') {
          return new Response(
            JSON.stringify({ error: `Missing required field: ${key}` }),
            { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
          );
        }
      }

      console.log('MobileNig proxy - POST request:', {
        service_id: body.service_id,
        trans_id: body.trans_id,
        customerReference: body.customerReference,
        amount: body.amount,
      });

      const resp = await fetch(`${BASE}/`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${mobilenigKey}`,
        },
        body: JSON.stringify(body),
      });

      const text = await resp.text();
      console.log('MobileNig proxy - POST response status:', resp.status);
      console.log('MobileNig proxy - POST response (first 500 chars):', text.substring(0, 500));

      return new Response(text, { 
        status: resp.status, 
        headers: { ...corsHeaders, 'Content-Type': 'application/json' } 
      });
    }

    if (req.method === 'GET') {
      // Query: expects ?trans_id=...
      const trans_id = url.searchParams.get('trans_id');
      if (!trans_id) {
        return new Response(
          JSON.stringify({ error: 'Missing query param trans_id' }),
          { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }

      console.log('MobileNig proxy - GET request:', { trans_id });

      const resp = await fetch(`${BASE}/query?trans_id=${encodeURIComponent(trans_id)}`, {
        method: 'GET',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${mobilenigKey}`,
        },
      });

      const text = await resp.text();
      console.log('MobileNig proxy - GET response status:', resp.status);
      console.log('MobileNig proxy - GET response (first 500 chars):', text.substring(0, 500));

      return new Response(text, { 
        status: resp.status, 
        headers: { ...corsHeaders, 'Content-Type': 'application/json' } 
      });
    }

    return new Response(
      JSON.stringify({ error: 'Method not allowed' }),
      { status: 405, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  } catch (err) {
    console.error('MobileNig proxy function error:', err);
    return new Response(
      JSON.stringify({ 
        error: 'Internal server error', 
        detail: err instanceof Error ? err.message : String(err) 
      }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});








