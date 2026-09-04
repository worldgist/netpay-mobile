import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import {
  getEBillsDataVariations,
  getEBillsMobileNetworkServiceId,
  extractEBillsDataPlanValidity,
  extractEBillsDataPlanSize,
} from "../_shared/ebills-api.ts";
import {
  getMobilenigPackages,
  getMobilenigPublicKey,
  resolveMobilenigDataServiceId,
} from "../_shared/mobilenig-api.ts";

const CORS_HEADERS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

type ProviderId = "smeplug" | "ebills" | "mobilenig";

type SyncNetwork = {
  label: string; // stored network name in data_plans
  smeplugId?: string;
  fetchName: string; // name passed to vendor APIs
};

const NETWORKS: SyncNetwork[] = [
  { label: "MTN", fetchName: "MTN", smeplugId: "1" },
  { label: "Airtel", fetchName: "AIRTEL", smeplugId: "2" },
  { label: "Glo", fetchName: "GLO", smeplugId: "4" },
  { label: "T2", fetchName: "9MOBILE", smeplugId: "3" },
];

const MOBILENIG_REQUEST_TYPES = ["SME", "GIFTING", "CORPORATE"] as const;

type NormalizedPlan = {
  network: string;
  plan_name: string;
  price: number;
  validity: string;
  api_code: string;
  provider: ProviderId;
  original_price: number;
  vendor_price: number;
  size: string | null;
  plan_type: string;
  smeplug_code?: string | null;
  mobilenig_code?: string | null;
  is_active: boolean;
};

function inferPlanType(planName: string, explicit?: string | null): string {
  if (explicit && explicit.trim()) return explicit.trim();
  const normalized = planName.toUpperCase();
  if (normalized.includes("T2")) return "T2";
  if (normalized.includes("GIFTING") || normalized.includes("GIFT")) return "Gifting";
  if (normalized.includes("CORPORATE")) return "Corporate";
  if (normalized.includes("DIRECT")) return "Direct";
  if (normalized.includes("SME")) return "SME";
  return "SME";
}

function extractSize(planName: string): string | null {
  const match = planName.match(/(\d+(?:\.\d+)?\s*(?:GB|MB|TB))/i);
  return match ? match[1].replace(/\s+/g, "") : null;
}

function toPrice(value: unknown): number {
  if (typeof value === "number" && Number.isFinite(value)) return Number(value.toFixed(2));
  if (typeof value === "string") {
    const n = Number(value.replace(/[^0-9.-]/g, ""));
    return Number.isFinite(n) ? Number(n.toFixed(2)) : 0;
  }
  return 0;
}

async function assertAdmin(supabase: ReturnType<typeof createClient>, authHeader: string | null) {
  if (!authHeader) {
    return { ok: false as const, status: 401, error: "Unauthorized" };
  }

  const token = authHeader.replace(/^Bearer\s+/i, "");
  const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") || "";

  // Allow service-role invokes (admin UI cron / CLI backfill).
  if (serviceRoleKey && token === serviceRoleKey) {
    return { ok: true as const, userId: "service-role" };
  }

  const { data: { user }, error } = await supabase.auth.getUser(token);
  if (error || !user) {
    return { ok: false as const, status: 401, error: "Unauthorized" };
  }

  const { data: roles } = await supabase
    .from("user_roles")
    .select("role")
    .eq("user_id", user.id)
    .eq("role", "admin")
    .limit(1);

  if (!roles?.length) {
    return { ok: false as const, status: 403, error: "Admin access required" };
  }

  return { ok: true as const, userId: user.id };
}

async function fetchSmeplugPlans(network: SyncNetwork): Promise<NormalizedPlan[]> {
  const secret = Deno.env.get("SMEPLUG_SECRET_KEY");
  if (!secret) throw new Error("SMEPLUG_SECRET_KEY not configured");
  if (!network.smeplugId) return [];

  const response = await fetch(
    `https://smeplug.ng/api/v1/data/plans?network_id=${network.smeplugId}`,
    {
      method: "GET",
      headers: {
        Authorization: `Bearer ${secret}`,
        "Content-Type": "application/json",
      },
    },
  );

  if (!response.ok) {
    const text = await response.text();
    throw new Error(`SMEPLUG ${network.label}: ${response.status} ${text}`);
  }

  const payload = await response.json();
  const raw = payload?.data ?? payload;
  let plansArray: any[] = [];

  if (Array.isArray(raw)) {
    plansArray = raw;
  } else if (raw && typeof raw === "object") {
    const keyed = raw[network.smeplugId] ?? raw[String(network.smeplugId)];
    if (Array.isArray(keyed)) {
      plansArray = keyed;
    } else if (Array.isArray(raw.plans)) {
      plansArray = raw.plans;
    } else {
      const arrays = Object.values(raw).filter((v) => Array.isArray(v)) as any[][];
      plansArray = arrays.length ? arrays.flat() : [];
    }
  }

  return plansArray
    .map((plan) => {
      const apiCode = String(
        plan.api_code || plan.id || plan.plan_id || plan.code || "",
      ).trim();
      const planName = String(
        plan.plan_name || plan.plan || plan.name || plan.description || "Data Plan",
      ).trim();
      const price = toPrice(plan.amount ?? plan.price ?? plan.plan_amount);
      const validity = String(plan.validity || plan.duration || "N/A").trim() || "N/A";

      if (!apiCode || price <= 0) return null;

      return {
        network: network.label,
        plan_name: planName,
        price,
        validity,
        api_code: apiCode,
        provider: "smeplug" as const,
        original_price: price,
        vendor_price: price,
        size: extractSize(planName),
        plan_type: inferPlanType(planName, plan.plan_type),
        smeplug_code: apiCode,
        is_active: true,
      };
    })
    .filter(Boolean) as NormalizedPlan[];
}

async function fetchEbillsPlans(network: SyncNetwork): Promise<NormalizedPlan[]> {
  const serviceId = getEBillsMobileNetworkServiceId(network.fetchName);
  const variationsData = await getEBillsDataVariations(serviceId);
  const rawVariations = Array.isArray(variationsData.data) ? variationsData.data : [];

  return rawVariations
    .filter((variation) => {
      const availability = String(variation.availability || "Available").trim().toLowerCase();
      return availability === "available";
    })
    .map((variation) => {
      const apiCode = String(variation.variation_id ?? "").trim();
      const planName = String(variation.data_plan || `Data Plan ${apiCode}`).trim();
      const price = toPrice(variation.price);
      if (!apiCode || price <= 0) return null;

      return {
        network: network.label,
        plan_name: planName,
        price,
        validity: extractEBillsDataPlanValidity(planName) || "N/A",
        api_code: apiCode,
        provider: "ebills" as const,
        original_price: price,
        vendor_price: price,
        size: extractEBillsDataPlanSize(planName) || extractSize(planName),
        plan_type: inferPlanType(planName),
        is_active: true,
      };
    })
    .filter(Boolean) as NormalizedPlan[];
}

async function fetchMobilenigPlans(network: SyncNetwork): Promise<NormalizedPlan[]> {
  getMobilenigPublicKey();
  const serviceId = resolveMobilenigDataServiceId(network.fetchName);
  const packageSets = await Promise.allSettled(
    MOBILENIG_REQUEST_TYPES.map((requestType) => getMobilenigPackages(serviceId, requestType)),
  );

  const merged = new Map<string, NormalizedPlan>();

  for (const [index, result] of packageSets.entries()) {
    if (result.status !== "fulfilled") continue;
    const requestType = MOBILENIG_REQUEST_TYPES[index];

    for (const rawPlan of result.value) {
      const plan = rawPlan as Record<string, unknown>;
      const apiCode = String(plan.productCode ?? plan.code ?? plan.id ?? "").trim();
      const planName = String(plan.name ?? plan.description ?? "Data Plan").trim();
      const price = toPrice(plan.price ?? plan.amount);
      if (!apiCode || price <= 0) continue;

      const key = `${requestType}:${apiCode}`;
      merged.set(key, {
        network: network.label,
        plan_name: planName,
        price,
        validity: String(plan.validity || plan.duration || "N/A"),
        api_code: `${requestType}:${apiCode}`,
        provider: "mobilenig",
        original_price: price,
        vendor_price: price,
        size: extractSize(planName),
        plan_type: inferPlanType(planName, requestType),
        mobilenig_code: apiCode,
        is_active: true,
      });
    }
  }

  return [...merged.values()];
}

async function upsertPlans(
  supabase: ReturnType<typeof createClient>,
  plans: NormalizedPlan[],
): Promise<{ inserted: number; updated: number }> {
  if (plans.length === 0) return { inserted: 0, updated: 0 };

  const provider = plans[0].provider;
  const apiCodes = plans.map((p) => p.api_code);

  const { data: existingRows } = await supabase
    .from("data_plans")
    .select("id, api_code, custom_price, price")
    .eq("provider", provider)
    .in("api_code", apiCodes);

  const existingByCode = new Map(
    (existingRows || []).map((row: { id: string; api_code: string; custom_price: number | null; price: number }) => [
      row.api_code,
      row,
    ]),
  );

  let inserted = 0;
  let updated = 0;

  // Upsert in chunks to avoid payload limits
  const chunkSize = 80;
  for (let i = 0; i < plans.length; i += chunkSize) {
    const chunk = plans.slice(i, i + chunkSize);
    const rows = chunk.map((plan) => {
      const existing = existingByCode.get(plan.api_code);
      const hasCustom = existing?.custom_price != null && Number(existing.custom_price) > 0;

      const row: Record<string, unknown> = {
        network: plan.network,
        plan_name: plan.plan_name,
        validity: plan.validity,
        api_code: plan.api_code,
        provider: plan.provider,
        original_price: plan.original_price,
        vendor_price: plan.vendor_price,
        size: plan.size,
        plan_type: plan.plan_type,
        is_active: true,
        updated_at: new Date().toISOString(),
      };

      if (plan.smeplug_code) row.smeplug_code = plan.smeplug_code;
      if (plan.mobilenig_code) row.mobilenig_code = plan.mobilenig_code;

      if (hasCustom) {
        row.price = existing!.price;
        row.custom_price = existing!.custom_price;
      } else {
        row.price = plan.price;
      }

      return row;
    });

    const { error } = await supabase
      .from("data_plans")
      .upsert(rows, { onConflict: "provider,api_code" });

    if (error) {
      throw new Error(`Upsert failed for ${provider}: ${error.message}`);
    }

    for (const plan of chunk) {
      if (existingByCode.has(plan.api_code)) updated += 1;
      else inserted += 1;
    }
  }

  return { inserted, updated };
}

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: CORS_HEADERS });
  }

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const supabase = createClient(supabaseUrl, serviceRoleKey, {
      auth: { persistSession: false, autoRefreshToken: false },
    });

    const auth = await assertAdmin(supabase, req.headers.get("Authorization"));
    if (!auth.ok) {
      return new Response(JSON.stringify({ success: false, error: auth.error }), {
        status: auth.status,
        headers: { ...CORS_HEADERS, "Content-Type": "application/json" },
      });
    }

    let body: { providers?: string[]; networks?: string[] } = {};
    try {
      body = await req.json();
    } catch {
      body = {};
    }

    const requestedProviders = (body.providers || ["smeplug", "ebills", "mobilenig"])
      .map((p) => String(p).toLowerCase().trim())
      .filter((p): p is ProviderId => p === "smeplug" || p === "ebills" || p === "mobilenig");

    const requestedNetworks = (body.networks || [])
      .map((n) => String(n).toUpperCase().trim())
      .filter(Boolean);

    const networks = requestedNetworks.length
      ? NETWORKS.filter((n) =>
        requestedNetworks.includes(n.label.toUpperCase()) ||
        requestedNetworks.includes(n.fetchName.toUpperCase())
      )
      : NETWORKS;

    const summary: Record<string, unknown> = {};

    for (const provider of requestedProviders) {
      let inserted = 0;
      let updated = 0;
      const errors: string[] = [];
      let planCount = 0;

      for (const network of networks) {
        try {
          let plans: NormalizedPlan[] = [];
          if (provider === "smeplug") {
            plans = await fetchSmeplugPlans(network);
          } else if (provider === "ebills") {
            plans = await fetchEbillsPlans(network);
          } else {
            plans = await fetchMobilenigPlans(network);
          }

          planCount += plans.length;
          const result = await upsertPlans(supabase, plans);
          inserted += result.inserted;
          updated += result.updated;
          console.log(`sync-data-plans ${provider}/${network.label}: ${plans.length} plans`);
        } catch (error) {
          const message = error instanceof Error ? error.message : String(error);
          console.error(`sync-data-plans ${provider}/${network.label} failed:`, message);
          errors.push(`${network.label}: ${message}`);
        }
      }

      summary[provider] = { planCount, inserted, updated, errors };
    }

    return new Response(
      JSON.stringify({
        success: true,
        message: "Data plans synced into database for instant app loading",
        summary,
      }),
      { status: 200, headers: { ...CORS_HEADERS, "Content-Type": "application/json" } },
    );
  } catch (error) {
    console.error("sync-data-plans error:", error);
    return new Response(
      JSON.stringify({
        success: false,
        error: error instanceof Error ? error.message : "Unknown error",
      }),
      { status: 500, headers: { ...CORS_HEADERS, "Content-Type": "application/json" } },
    );
  }
});
