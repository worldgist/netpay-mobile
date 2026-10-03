import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { getEBillsTVVariations, getEBillsServiceId } from "../_shared/ebills-api.ts";

const CORS_HEADERS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

function parsePrice(value: unknown): number {
  if (typeof value === 'number' && Number.isFinite(value)) return value;
  if (typeof value === 'string') {
    const n = parseFloat(value.replace(/,/g, '').trim());
    return Number.isFinite(n) ? n : 0;
  }
  return 0;
}

function formatBouquetName(providerUpper: string, bouquet: string): string {
  const cleaned = bouquet.replace(/\s+/g, ' ').trim();
  if (!cleaned) return cleaned;
  const upper = cleaned.toUpperCase();
  if (providerUpper === 'DSTV' && !upper.startsWith('DSTV')) {
    return `DSTV ${cleaned}`;
  }
  if (providerUpper === 'GOTV' && !upper.startsWith('GOTV')) {
    return `GOtv ${cleaned}`;
  }
  return cleaned;
}

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: CORS_HEADERS });
  }

  try {
    const authHeader = req.headers.get('Authorization');
    if (!authHeader) {
      return new Response(
        JSON.stringify({ success: false, error: 'Missing authorization header' }),
        { status: 401, headers: { ...CORS_HEADERS, 'Content-Type': 'application/json' } }
      );
    }

    const supabaseUrl = Deno.env.get('SUPABASE_URL') ?? '';
    const supabaseKey = Deno.env.get('SUPABASE_ANON_KEY') ?? '';
    const supabase = createClient(supabaseUrl, supabaseKey, {
      global: {
        headers: { Authorization: authHeader },
      },
    });

    const { data: { user }, error: authError } = await supabase.auth.getUser();
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
      console.error('fetch-ebills-cable-packages: unable to parse request body:', error);
    }

    const provider = String(parsedBody.provider || 'DSTV');
    const providerUpper = provider.toUpperCase();
    const serviceId = getEBillsServiceId(provider);

    console.log('Fetching eBills cable packages:', { provider: providerUpper, serviceId });

    try {
      const variationsData = await getEBillsTVVariations(serviceId);

      if (!variationsData.data || variationsData.data.length === 0) {
        return new Response(
          JSON.stringify({
            success: false,
            error: `No packages available for ${providerUpper}`,
          }),
          { status: 200, headers: { ...CORS_HEADERS, 'Content-Type': 'application/json' } }
        );
      }

      console.log('Raw eBills variations sample:', JSON.stringify(variationsData.data[0], null, 2));

      const packages = variationsData.data
        .filter((variation: any) => {
          const availability = String(variation.availability || '').toLowerCase();
          return availability !== 'unavailable';
        })
        .map((variation: any) => {
          const variationId = variation.variation_id;
          const variationCode = variation.variation_code || variationId;
          const bouquet =
            variation.package_bouquet ||
            variation.name ||
            variation.variation_name ||
            variation.title ||
            variation.package_name ||
            variation.description ||
            '';

          const packageName = bouquet
            ? formatBouquetName(providerUpper, String(bouquet))
            : `Package ${String(variationCode || variationId || 'Unknown')}`;

          const price = parsePrice(
            variation.price ??
              variation.variation_amount ??
              variation.amount ??
              variation.cost ??
              variation.fee,
          );

          return {
            provider: providerUpper,
            package_name: packageName,
            package_bouquet: variation.package_bouquet || null,
            price,
            api_code: variationId,
            variation_code: variationCode,
            variation_id: variationId,
          };
        })
        .filter((pkg) => pkg.price > 0 && pkg.variation_id != null && pkg.variation_id !== '');

      // Deduplicate by variation_id only — keep live eBills names/prices as-is
      const seenIds = new Set<string>();
      const uniquePackages = packages.filter((pkg) => {
        const id = String(pkg.variation_id ?? pkg.api_code ?? '');
        if (!id || seenIds.has(id)) return false;
        seenIds.add(id);
        return true;
      });

      console.log(
        `Fetched ${packages.length} packages for ${providerUpper} from eBills (${uniquePackages.length} unique)`,
        uniquePackages.map((p) => ({ name: p.package_name, price: p.price, id: p.variation_id })),
      );

      return new Response(
        JSON.stringify({
          success: true,
          data: uniquePackages,
          metadata: {
            total_packages: packages.length,
            provider: providerUpper,
            service_id: serviceId,
            vending_provider: 'ebills',
          },
        }),
        { status: 200, headers: { ...CORS_HEADERS, 'Content-Type': 'application/json' } }
      );
    } catch (ebillsError) {
      console.error('eBills API error:', {
        error: ebillsError,
        message: ebillsError instanceof Error ? ebillsError.message : String(ebillsError),
        provider: providerUpper,
        serviceId,
      });
      return new Response(
        JSON.stringify({
          success: false,
          error: ebillsError instanceof Error ? ebillsError.message : 'Failed to fetch cable packages from eBills',
        }),
        { status: 200, headers: { ...CORS_HEADERS, 'Content-Type': 'application/json' } }
      );
    }
  } catch (error) {
    console.error('fetch-ebills-cable-packages error:', error);
    return new Response(
      JSON.stringify({
        success: false,
        error: error instanceof Error ? error.message : 'Unexpected error',
      }),
      { status: 500, headers: { ...CORS_HEADERS, 'Content-Type': 'application/json' } }
    );
  }
});
