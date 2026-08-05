import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import {
  getMobilenigPackages,
  getMobilenigPublicKey,
  resolveMobilenigDataServiceId,
} from "../_shared/mobilenig-api.ts";

const CORS_HEADERS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const DATA_REQUEST_TYPES = ["SME", "GIFTING", "CORPORATE"] as const;

const inferPlanType = (planName: string, requestType: string) => {
  const normalized = planName.toUpperCase();
  if (requestType === "GIFTING" || normalized.includes("GIFT")) return "Gifting";
  if (requestType === "CORPORATE" || normalized.includes("CORPORATE")) return "Corporate";
  if (normalized.includes("SME")) return "SME";
  return requestType || "SME";
};

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: CORS_HEADERS });
  }

  try {
    getMobilenigPublicKey();

    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const supabase = createClient(supabaseUrl, supabaseKey);

    const authHeader = req.headers.get("Authorization");
    if (!authHeader) {
      return new Response(
        JSON.stringify({ success: false, error: "Unauthorized" }),
        { status: 401, headers: { ...CORS_HEADERS, "Content-Type": "application/json" } },
      );
    }

    const token = authHeader.replace("Bearer ", "");
    const { data: { user }, error: authError } = await supabase.auth.getUser(token);

    if (authError || !user) {
      return new Response(
        JSON.stringify({ success: false, error: "Unauthorized" }),
        { status: 401, headers: { ...CORS_HEADERS, "Content-Type": "application/json" } },
      );
    }

    const body = await req.json().catch(() => ({}));
    const network = typeof body.network === "string" ? body.network.trim() : "";

    if (!network) {
      return new Response(
        JSON.stringify({
          success: false,
          error: "Network is required. Supported networks: MTN, Airtel, Glo, 9Mobile",
        }),
        { status: 400, headers: { ...CORS_HEADERS, "Content-Type": "application/json" } },
      );
    }

    const serviceId = resolveMobilenigDataServiceId(network);
    const networkName = network.toUpperCase().trim();
    const packageSets = await Promise.allSettled(
      DATA_REQUEST_TYPES.map((requestType) => getMobilenigPackages(serviceId, requestType)),
    );

    const mergedPlans: Record<string, {
      id: string;
      name: string;
      code: string;
      productCode: string;
      api_code: string;
      price: number;
      amount: number;
      network: string;
      plan_type: string;
      requestType: string;
    }> = {};

    for (const [index, result] of packageSets.entries()) {
      if (result.status !== "fulfilled") {
        console.warn(`MobileNig ${DATA_REQUEST_TYPES[index]} packages unavailable:`, result.reason);
        continue;
      }

      const requestType = DATA_REQUEST_TYPES[index];

      for (const rawPlan of result.value) {
        const plan = rawPlan as Record<string, unknown>;
        const code = String(plan.productCode ?? plan.code ?? plan.id ?? "").trim();
        const name = String(plan.name ?? plan.description ?? "Unknown Plan").trim();
        const price = Number(plan.price ?? plan.amount ?? 0);

        if (!code || !Number.isFinite(price) || price <= 0) {
          continue;
        }

        const dedupeKey = `${requestType}:${code}`;
        mergedPlans[dedupeKey] = {
          id: code,
          name,
          code,
          productCode: code,
          api_code: code,
          price,
          amount: price,
          network: networkName,
          plan_type: inferPlanType(name, requestType),
          requestType,
        };
      }
    }

    const mappedPlans = Object.values(mergedPlans).sort((a, b) => a.price - b.price);

    return new Response(
      JSON.stringify({
        success: true,
        data: mappedPlans,
        metadata: {
          total_plans: mappedPlans.length,
          service_id: serviceId,
          network: networkName,
          source: "mobilenig",
        },
      }),
      { status: 200, headers: { ...CORS_HEADERS, "Content-Type": "application/json" } },
    );
  } catch (error) {
    console.error("Error in fetch-mobilenig-data-plans:", error);
    const message = error instanceof Error ? error.message : "Unknown error";
    const notConfigured = message.includes("not configured");

    return new Response(
      JSON.stringify({
        success: false,
        error: notConfigured ? "MobileNig API credentials not configured" : message,
      }),
      {
        status: notConfigured ? 500 : 502,
        headers: { ...CORS_HEADERS, "Content-Type": "application/json" },
      },
    );
  }
});
