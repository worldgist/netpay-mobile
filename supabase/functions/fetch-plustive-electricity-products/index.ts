import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { listPlustiveElectricityProducts, plustiveProductId, type PlustiveProduct } from "../_shared/plustive-api.ts";
import {
  corsHeaders,
  createServiceClient,
  jsonResponse,
  requireAdmin,
} from "../_shared/admin-auth.ts";

function discoName(product: PlustiveProduct): string {
  const raw = String(product.name || product.label || product.network || product.id || "Disco").trim();
  return raw.replace(/\s+/g, " ").slice(0, 80);
}

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { status: 204, headers: corsHeaders });
  }

  try {
    const supabase = createServiceClient();
    await requireAdmin(req, supabase);

    const products = await listPlustiveElectricityProducts();
    const rows = products
      .map((product) => {
        const apiCode = plustiveProductId(product);
        const name = discoName(product);
        const meter = String(product.meterType || "").trim();
        return {
          provider: name,
          package_name: meter ? `${name} ${meter}` : name,
          api_code: apiCode,
          price: 0,
        };
      })
      .filter((row) => row.api_code);

    let stored = 0;
    for (const row of rows) {
      const { data: existing } = await supabase
        .from("electricity_plans")
        .select("id")
        .eq("api_code", row.api_code)
        .limit(1)
        .maybeSingle();

      const payload = {
        provider: row.provider,
        package_name: row.package_name,
        api_code: row.api_code,
        price: row.price,
        original_price: row.price,
        is_active: true,
        updated_at: new Date().toISOString(),
      };

      if (existing?.id) {
        const { error } = await supabase.from("electricity_plans").update(payload).eq("id", existing.id);
        if (error) throw new Error(error.message);
      } else {
        const { error } = await supabase.from("electricity_plans").insert(payload);
        if (error) throw new Error(error.message);
      }
      stored += 1;
    }

    return jsonResponse({
      success: true,
      data: rows,
      metadata: { stored },
    });
  } catch (error) {
    console.error("fetch-plustive-electricity-products error:", error);
    const message = error instanceof Error ? error.message : "Failed to fetch Plustive electricity products";
    return jsonResponse({ success: false, error: message });
  }
});
