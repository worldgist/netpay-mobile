import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { listPlustiveDataPlans, plustiveProductId, plustiveProductPrice } from "../_shared/plustive-api.ts";
import {
  corsHeaders,
  createServiceClient,
  jsonResponse,
  requireAdmin,
} from "../_shared/admin-auth.ts";

function networkLabel(raw: string): string {
  const key = raw.toUpperCase().replace(/[^A-Z0-9]/g, "");
  if (key.includes("AIRTEL")) return "Airtel";
  if (key.includes("GLO")) return "Glo";
  if (key.includes("9MOBILE") || key.includes("T2") || key.includes("ETISALAT")) return "T2";
  if (key.includes("MTN")) return "MTN";
  return raw.trim() || "MTN";
}

function extractSize(planName: string): string | null {
  const match = planName.match(/(\d+(?:\.\d+)?\s*(?:GB|MB|TB))/i);
  return match ? match[1].replace(/\s+/g, "") : null;
}

function inferPlanType(planName: string): string {
  const normalized = planName.toUpperCase();
  if (normalized.includes("GIFT")) return "Gifting";
  if (normalized.includes("CORPORATE")) return "Corporate";
  if (normalized.includes("DIRECT")) return "Direct";
  if (normalized.includes("SME")) return "SME";
  return "SME";
}

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { status: 204, headers: corsHeaders });
  }

  try {
    const supabase = createServiceClient();
    await requireAdmin(req, supabase);

    let networkFilter = "";
    try {
      const body = await req.json();
      networkFilter = String(body?.network || "").trim().toUpperCase();
    } catch {
      networkFilter = "";
    }

    const plans = await listPlustiveDataPlans();
    const mapped = plans
      .map((plan) => {
        const planId = plustiveProductId(plan);
        const network = networkLabel(String(plan.network || plan.networkName || plan.provider || ""));
        const name = String(plan.name || plan.label || planId).trim();
        const priceKobo = plustiveProductPrice(plan);
        const price = priceKobo > 0 ? Number((priceKobo / 100).toFixed(2)) : 0;
        return {
          plan_name: name,
          network,
          api_code: planId,
          plustive_code: planId,
          provider: "plustive",
          price,
          vendor_price: price,
          original_price: price,
          size: extractSize(name),
          validity: "N/A",
          plan_type: inferPlanType(name),
        };
      })
      .filter((plan) => plan.api_code && plan.price > 0)
      .filter((plan) => {
        if (!networkFilter) return true;
        const net = plan.network.replace(/[^A-Z0-9]/g, "");
        const wanted = networkFilter.replace(/[^A-Z0-9]/g, "");
        if (wanted === "T2" || wanted === "9MOBILE" || wanted === "ETISALAT") {
          return net === "T2" || net.includes("9MOBILE") || net.includes("ETISALAT");
        }
        return net.includes(wanted);
      });

    const existingByCode = new Map<string, { price: number; custom_price: number | null }>();
    const codes = mapped.map((plan) => plan.api_code);
    for (let i = 0; i < codes.length; i += 100) {
      const chunk = codes.slice(i, i + 100);
      const { data: existingRows, error } = await supabase
        .from("data_plans")
        .select("api_code, price, custom_price")
        .eq("provider", "plustive")
        .in("api_code", chunk);
      if (error) throw new Error(error.message);
      for (const row of existingRows || []) {
        existingByCode.set(String(row.api_code), {
          price: Number(row.price),
          custom_price: row.custom_price == null ? null : Number(row.custom_price),
        });
      }
    }

    let stored = 0;
    for (let i = 0; i < mapped.length; i += 80) {
      const rows = mapped.slice(i, i + 80).map((plan) => {
        const existing = existingByCode.get(plan.api_code);
        const hasCustom = existing?.custom_price != null && existing.custom_price > 0;
        const row: Record<string, unknown> = {
          network: plan.network,
          plan_name: plan.plan_name,
          validity: plan.validity,
          api_code: plan.api_code,
          provider: "plustive",
          plustive_code: plan.plustive_code,
          original_price: plan.price,
          vendor_price: plan.vendor_price,
          size: plan.size,
          plan_type: plan.plan_type,
          is_active: true,
          updated_at: new Date().toISOString(),
        };
        if (hasCustom && existing) {
          row.price = existing.price;
        } else {
          row.price = plan.price;
          row.user_price = plan.price;
        }
        return row;
      });
      if (!rows.length) continue;
      const { error } = await supabase
        .from("data_plans")
        .upsert(rows, { onConflict: "provider,api_code" });
      if (error) throw new Error(`Failed to store Plustive data plans: ${error.message}`);
      stored += rows.length;
    }

    return jsonResponse({
      success: true,
      plans: mapped,
      data: mapped,
      count: mapped.length,
      metadata: { stored },
    });
  } catch (error) {
    console.error("fetch-plustive-data-plans error:", error);
    const message = error instanceof Error ? error.message : "Failed to fetch Plustive data plans";
    return jsonResponse({ success: false, error: message });
  }
});
