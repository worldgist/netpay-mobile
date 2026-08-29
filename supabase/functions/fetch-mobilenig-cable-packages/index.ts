import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient, SupabaseClient } from "https://esm.sh/@supabase/supabase-js@2";
import {
  getMobilenigBalance,
  getMobilenigHealthSummary,
  getMobilenigPackages,
  getMobilenigPublicKey,
  getMobilenigUniqueAccountDetails,
  getMobilenigWalletHistory,
  MOBILENIG_CABLE_SERVICES,
  resolveMobilenigDataServiceId,
  searchMobilenigWalletHistory,
} from "../_shared/mobilenig-api.ts";

const CORS_HEADERS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
};

const DATA_REQUEST_TYPES = ["SME", "GIFTING", "CORPORATE"] as const;

function inferPlanType(planName: string, requestType: string) {
  const normalized = planName.toUpperCase();
  if (requestType === "GIFTING" || normalized.includes("GIFT")) return "Gifting";
  if (requestType === "CORPORATE" || normalized.includes("CORPORATE")) return "Corporate";
  if (normalized.includes("SME")) return "SME";
  return requestType || "SME";
}

function jsonResponse(body: Record<string, unknown>, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...CORS_HEADERS, "Content-Type": "application/json" },
  });
}

async function requireAuth(req: Request) {
  const authHeader = req.headers.get("Authorization");
  if (!authHeader) {
    return { error: jsonResponse({ success: false, error: "Missing authorization header" }, 401) };
  }

  const supabaseUrl = Deno.env.get("SUPABASE_URL") ?? "";
  const supabaseKey = Deno.env.get("SUPABASE_ANON_KEY") ?? "";
  const supabase = createClient(supabaseUrl, supabaseKey, {
    global: { headers: { Authorization: authHeader } },
  });

  const { data: { user }, error: authError } = await supabase.auth.getUser();
  if (authError || !user) {
    return { error: jsonResponse({ success: false, error: "Unauthorized" }, 401) };
  }

  return { supabase, user, authHeader };
}

async function requireAdmin(supabase: SupabaseClient, userId: string) {
  const { data: roleData, error: roleError } = await supabase
    .from("user_roles")
    .select("role")
    .eq("user_id", userId)
    .eq("role", "admin")
    .maybeSingle();

  if (roleError) {
    return { error: jsonResponse({ success: false, error: "Error verifying permissions" }, 500) };
  }

  if (!roleData) {
    return { error: jsonResponse({ success: false, error: "Unauthorized - Admin access required" }, 403) };
  }

  return {};
}

async function handleBalance(supabase: SupabaseClient, userId: string) {
  const adminCheck = await requireAdmin(supabase, userId);
  if (adminCheck.error) return adminCheck.error;

  const [balanceResult, accountResult, healthResult] = await Promise.allSettled([
    getMobilenigBalance(),
    getMobilenigUniqueAccountDetails(),
    getMobilenigHealthSummary(),
  ]);

  if (balanceResult.status === "rejected") {
    throw balanceResult.reason;
  }

  const health = healthResult.status === "fulfilled"
    ? healthResult.value
    : {
      apiReachable: false,
      credentialsConfigured: true,
      servicesOnline: 0,
      servicesTotal: 0,
      overall: "unknown" as const,
      services: [],
      message: healthResult.reason instanceof Error ? healthResult.reason.message : "Health check failed",
    };

  const account = accountResult.status === "fulfilled"
    ? accountResult.value
    : {
      accountNumber: "",
      accountName: "",
      bankName: "",
      businessName: "MobileNig Account",
    };

  return jsonResponse({
    success: true,
    balance: {
      amount: balanceResult.value.balance,
      currency: balanceResult.value.currency,
    },
    account,
    health,
  });
}

async function handleWalletHistory(supabase: SupabaseClient, userId: string, body: Record<string, unknown>) {
  const adminCheck = await requireAdmin(supabase, userId);
  if (adminCheck.error) return adminCheck.error;

  const transId = typeof body.trans_id === "string" ? body.trans_id.trim() : "";
  const page = Number(body.page) > 0 ? Number(body.page) : 1;
  const perPage = Number(body.per_page) > 0 ? Number(body.per_page) : 10;

  const transactions = transId
    ? await searchMobilenigWalletHistory(transId)
    : await getMobilenigWalletHistory(page, perPage);

  return jsonResponse({
    success: true,
    transactions,
    message: "success",
    statusCode: 200,
  });
}

async function handleDataPlans(body: Record<string, unknown>) {
  const network = typeof body.network === "string" ? body.network.trim() : "";
  if (!network) {
    return jsonResponse({
      success: false,
      error: "Network is required. Supported networks: MTN, Airtel, Glo, 9Mobile",
    }, 400);
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

  return jsonResponse({
    success: true,
    data: mappedPlans,
    metadata: {
      total_plans: mappedPlans.length,
      service_id: serviceId,
      network: networkName,
      source: "mobilenig",
    },
  });
}

async function handleCablePackages(body: Record<string, unknown>) {
  const provider = typeof body.provider === "string" ? body.provider.trim() : "";
  if (!provider) {
    return jsonResponse({ success: false, error: "Provider is required" }, 400);
  }

  const serviceId = MOBILENIG_CABLE_SERVICES[provider.toUpperCase()];
  if (!serviceId) {
    return jsonResponse({
      success: false,
      error: `Unsupported cable TV provider: ${provider}`,
    }, 400);
  }

  const packages = await getMobilenigPackages(serviceId);
  if (!Array.isArray(packages) || packages.length === 0) {
    return jsonResponse({
      success: true,
      data: [],
      message: "No packages available for this provider",
    });
  }

  const transformedPackages = packages
    .filter((pkg: Record<string, unknown>) => pkg.name && pkg.price && pkg.productCode)
    .map((pkg: Record<string, unknown>) => ({
      package_name: String(pkg.name).trim() || "Unknown Package",
      price: parseFloat(String(pkg.price)) || 0,
      api_code: pkg.productCode,
      variation_code: pkg.productCode,
      provider: provider.toUpperCase(),
      description: pkg.description || "",
    }))
    .filter((pkg) => pkg.price > 0)
    .sort((a, b) => a.price - b.price);

  return jsonResponse({
    success: true,
    data: transformedPackages,
    count: transformedPackages.length,
    provider: provider.toUpperCase(),
    source: "mobilenig",
  });
}

function resolveAction(body: Record<string, unknown>): string {
  if (typeof body.action === "string" && body.action.trim()) {
    return body.action.trim().toLowerCase();
  }
  if (typeof body.network === "string" && body.network.trim()) {
    return "data-plans";
  }
  if (typeof body.provider === "string" && body.provider.trim()) {
    return "cable-packages";
  }
  return "";
}

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: CORS_HEADERS });
  }

  try {
    getMobilenigPublicKey();

    const auth = await requireAuth(req);
    if (auth.error) return auth.error;

    const body = await req.json().catch(() => ({}));
    const action = resolveAction(body);

    switch (action) {
      case "balance":
        return await handleBalance(auth.supabase!, auth.user!.id);
      case "wallet-history":
        return await handleWalletHistory(auth.supabase!, auth.user!.id, body);
      case "data-plans":
        return await handleDataPlans(body);
      case "cable-packages":
        return await handleCablePackages(body);
      default:
        return jsonResponse({
          success: false,
          error: "Unknown action. Use action: balance | wallet-history | data-plans, or provide provider/network.",
        }, 400);
    }
  } catch (error) {
    console.error("Error in fetch-mobilenig-cable-packages:", error);
    const message = error instanceof Error ? error.message : "Unknown error";
    const notConfigured = message.includes("not configured");

    return jsonResponse({
      success: false,
      error: notConfigured ? "MobileNig API credentials not configured" : message,
      details: String(error),
    }, notConfigured ? 500 : 502);
  }
});
