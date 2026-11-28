import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { listPlustiveCableProducts, plustiveProductId, plustiveProductPrice, type PlustiveProduct } from "../_shared/plustive-api.ts";
import {
  corsHeaders,
  createServiceClient,
  getRequestUser,
  jsonResponse,
} from "../_shared/admin-auth.ts";

function cableProvider(product: PlustiveProduct): string | null {
  const raw = `${product.provider || ""} ${product.biller || ""} ${product.service || ""} ${product.category || ""} ${product.name || ""} ${product.label || ""} ${product.network || ""}`.toUpperCase();
  const key = raw.replace(/[^A-Z0-9]/g, "");
  if (key.includes("STARTIMES") || key.includes("STARTIME")) return "STARTIMES";
  if (key.includes("GOTV")) return "GOTV";
  if (key.includes("DSTV")) return "DSTV";
  return null;
}

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { status: 204, headers: corsHeaders });
  }

  try {
    await getRequestUser(req);
    const supabase = createServiceClient();

    let providerFilter = "";
    try {
      const body = await req.json();
      providerFilter = String(body?.provider || "").trim().toUpperCase();
    } catch {
      providerFilter = "";
    }

    const products = await listPlustiveCableProducts();
    const packages = products
      .map((product) => {
        const provider = cableProvider(product);
        const apiCode = plustiveProductId(product);
        const packageName = String(product.name || product.label || apiCode).trim();
        const priceKobo = plustiveProductPrice(product);
        return {
          provider,
          package_name: packageName,
          price: priceKobo > 0 ? Number((priceKobo / 100).toFixed(2)) : 0,
          api_code: apiCode,
        };
      })
      .filter((row) => row.provider && row.api_code && row.price > 0)
      .filter((row) => !providerFilter || row.provider === providerFilter);

    let stored = 0;
    for (const row of packages) {
      const { data: existing } = await supabase
        .from("cable_tv_plans")
        .select("id, price, custom_price")
        .eq("vending_provider", "plustive")
        .eq("api_code", row.api_code)
        .limit(1)
        .maybeSingle();

      const hasCustom = existing?.custom_price != null && Number(existing.custom_price) > 0;
      const payload: Record<string, unknown> = {
        provider: row.provider,
        package_name: row.package_name,
        api_code: row.api_code,
        original_price: row.price,
        vending_provider: "plustive",
        is_active: true,
        price: hasCustom ? Number(existing?.price) : row.price,
        updated_at: new Date().toISOString(),
      };

      if (existing?.id) {
        const { error } = await supabase.from("cable_tv_plans").update(payload).eq("id", existing.id);
        if (error) throw new Error(error.message);
      } else {
        const { error } = await supabase.from("cable_tv_plans").insert(payload);
        if (error) throw new Error(error.message);
      }
      stored += 1;
    }

    return jsonResponse({
      success: true,
      data: packages.map((row) => ({
        provider: row.provider,
        package_name: row.package_name,
        price: row.price,
        api_code: row.api_code,
      })),
      metadata: { stored },
    });
  } catch (error) {
    console.error("fetch-plustive-cable-packages error:", error);
    const message = error instanceof Error ? error.message : "Failed to fetch Plustive cable packages";
    const unauthorized = message.toLowerCase().includes("authorization") || message.toLowerCase().includes("unauthorized");
    return jsonResponse({ success: false, error: message }, unauthorized ? 401 : 200);
  }
});
