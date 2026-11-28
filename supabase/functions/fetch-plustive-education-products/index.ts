import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { listPlustiveEducationProducts, plustiveProductId, plustiveProductPrice, type PlustiveProduct } from "../_shared/plustive-api.ts";
import {
  corsHeaders,
  createServiceClient,
  jsonResponse,
  requireAdmin,
} from "../_shared/admin-auth.ts";

function examTypeOf(product: PlustiveProduct): string {
  const raw = `${product.name || ""} ${product.label || ""} ${product.provider || ""} ${product.category || ""}`.toUpperCase();
  if (raw.includes("JAMB")) return "JAMB";
  if (raw.includes("WAEC")) return "WAEC";
  if (raw.includes("NECO")) return "NECO";
  return "EDUCATION";
}

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { status: 204, headers: corsHeaders });
  }

  try {
    const supabase = createServiceClient();
    await requireAdmin(req, supabase);

    const products = await listPlustiveEducationProducts();
    const catalog = products
      .map((product) => {
        const productId = plustiveProductId(product);
        const priceKobo = plustiveProductPrice(product);
        return {
          exam_type: examTypeOf(product),
          service_name: String(product.name || product.label || productId).trim(),
          api_code: productId,
          price: priceKobo > 0 ? Number((priceKobo / 100).toFixed(2)) : 0,
        };
      })
      .filter((row) => row.api_code && row.service_name);

    if (!catalog.length) {
      return jsonResponse({
        success: false,
        error: "Plustive returned no education products",
      });
    }

    const { data: existingRows, error: existingError } = await supabase
      .from("education_services")
      .select("id, exam_type, api_code, custom_price");
    if (existingError) throw new Error(existingError.message);

    const existingByKey = new Map(
      (existingRows || []).map((row) => [`${String(row.exam_type).toUpperCase()}|${row.api_code}`, row]),
    );

    let stored = 0;
    for (const product of catalog) {
      const key = `${product.exam_type}|${product.api_code}`;
      const existing = existingByKey.get(key);
      const hasCustom = existing?.custom_price != null && Number(existing.custom_price) > 0;
      if (existing?.id) {
        const updates: Record<string, unknown> = {
          service_name: product.service_name,
          is_active: true,
          updated_at: new Date().toISOString(),
        };
        if (!hasCustom && product.price > 0) {
          updates.price = product.price;
          updates.original_price = product.price;
        }
        const { error } = await supabase.from("education_services").update(updates).eq("id", existing.id);
        if (error) throw new Error(error.message);
      } else {
        const { error } = await supabase.from("education_services").insert({
          exam_type: product.exam_type,
          service_name: product.service_name,
          api_code: product.api_code,
          price: product.price,
          original_price: product.price,
          is_active: true,
        });
        if (error) throw new Error(error.message);
      }
      stored += 1;
    }

    return jsonResponse({
      success: true,
      data: catalog,
      metadata: { stored },
    });
  } catch (error) {
    console.error("fetch-plustive-education-products error:", error);
    const message = error instanceof Error ? error.message : "Failed to fetch Plustive education products";
    return jsonResponse({ success: false, error: message });
  }
});
