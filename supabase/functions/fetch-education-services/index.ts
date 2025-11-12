import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const CORS_HEADERS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

const formatServiceRow = (row: any) => {
  const examTypeRaw = row.exam_type ?? row.service_name ?? row.id;
  const examType = typeof examTypeRaw === 'string' ? examTypeRaw.toUpperCase().trim() : 'EDUCATION';
  const defaultServiceIdMap: Record<string, string> = {
    'WAEC': 'AJA',
    'NECO': 'AJC',
    'JAMB': 'AJB',
  };
  const price =
    (typeof row.custom_price === 'number' ? row.custom_price : null) ??
    (typeof row.price === 'number' ? row.price : null) ??
    (typeof row.original_price === 'number' ? row.original_price : null) ??
    0;

  const serviceId =
    (typeof row.service_id === 'string' && row.service_id.trim().length > 0 ? row.service_id.trim() : null) ??
    (typeof row.api_code === 'string' && row.api_code.trim().length > 0 ? row.api_code.trim() : null) ??
    (typeof row.id === 'string' && row.id.trim().length > 0 ? row.id.trim() : null) ??
    defaultServiceIdMap[examType] ??
    null;

  return {
    id: row.id,
    exam_type: examType,
    service_name: row.service_name ?? examType,
    price,
    original_price:
      (typeof row.original_price === 'number' ? row.original_price : null) ??
      price,
    custom_price: typeof row.custom_price === 'number' ? row.custom_price : null,
    api_code: row.api_code,
    service_id: serviceId,
    is_active: row.is_active,
    logo_url: row.logo_url ?? null,
    metadata: row.metadata ?? null,
  };
};

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: CORS_HEADERS });
  }

  try {
    const supabaseUrl = Deno.env.get('SUPABASE_URL');
    const supabaseKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');

    if (!supabaseUrl || !supabaseKey) {
      throw new Error('Supabase credentials are not configured');
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

    const { data: roleRow } = await supabase
      .from('user_roles')
      .select('role')
      .eq('user_id', user.id)
      .eq('role', 'admin')
      .maybeSingle();

    if (!roleRow) {
      return new Response(
        JSON.stringify({ success: false, error: 'Admin access required' }),
        { status: 403, headers: { ...CORS_HEADERS, 'Content-Type': 'application/json' } }
      );
    }

    let examTypeFilter: string | null = null;
    try {
      if (req.body) {
        const payload = await req.json();
        if (payload?.exam_type) {
          examTypeFilter = String(payload.exam_type).toUpperCase().trim();
        }
      }
    } catch {
      examTypeFilter = null;
    }

    const query = supabase
      .from('education_services')
      .select('id, exam_type, service_name, price, custom_price, original_price, api_code, service_id, is_active, logo_url, metadata')
      .eq('is_active', true)
      .order('exam_type', { ascending: true });

    if (examTypeFilter) {
      query.ilike('exam_type', examTypeFilter);
    }

    const { data: rows, error } = await query;

    if (error) {
      throw error;
    }

    const services = (rows ?? []).map(formatServiceRow);

    return new Response(
      JSON.stringify({
        success: true,
        data: services,
        metadata: {
          total: services.length,
          exam_type: examTypeFilter,
        },
      }),
      { status: 200, headers: { ...CORS_HEADERS, 'Content-Type': 'application/json' } }
    );
  } catch (error) {
    console.error('Error in fetch-education-services function:', error);

    return new Response(
      JSON.stringify({
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error occurred',
      }),
      { status: 500, headers: { ...CORS_HEADERS, 'Content-Type': 'application/json' } }
    );
  }
});
