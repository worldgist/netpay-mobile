import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { fetchSmeplugWalletBalance } from "../_shared/smeplug-balance.ts";

const CORS_HEADERS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const NETWORK_ORDER: Record<string, number> = { MTN: 0, AIRTEL: 1, "9MOBILE": 2, T2: 2, GLO: 3 };

const DISPLAY_NAME_ALIASES: Record<string, string> = {
  T2: "9Mobile",
};

const FALLBACK_OPTIONS = [
  { id: "1", name: "MTN", display_name: "MTN", network_id: "1", min_amount: 50, max_amount: 50000 },
  { id: "2", name: "Airtel", display_name: "Airtel", network_id: "2", min_amount: 50, max_amount: 50000 },
  { id: "3", name: "9Mobile", display_name: "9Mobile", network_id: "3", min_amount: 50, max_amount: 50000 },
  { id: "4", name: "Glo", display_name: "Glo", network_id: "4", min_amount: 50, max_amount: 50000 },
];

const EBILLS_NETWORKS = [
  { id: "mtn", name: "MTN", display_name: "MTN", network_id: "mtn", min_amount: 10, max_amount: 50000 },
  { id: "airtel", name: "Airtel", display_name: "Airtel", network_id: "airtel", min_amount: 50, max_amount: 50000 },
  { id: "glo", name: "Glo", display_name: "Glo", network_id: "glo", min_amount: 50, max_amount: 50000 },
  { id: "9mobile", name: "9Mobile", display_name: "9Mobile", network_id: "9mobile", min_amount: 50, max_amount: 50000 },
];

const normalizeNetworkKey = (value: string) =>
  value.trim().toUpperCase().replace(/[^A-Z0-9]/g, "");

const toSmeplugPurchaseOption = (networkId: string, networkName: string) => {
  const id = String(networkId).trim();
  const rawName = String(networkName).trim();
  const aliasKey = rawName.toUpperCase().replace(/[^A-Z0-9]/g, "");
  const name = DISPLAY_NAME_ALIASES[aliasKey] ?? rawName;
  return {
    id,
    name,
    display_name: name,
    network_id: id,
    min_amount: 50,
    max_amount: 50000,
    identifier_label: "Phone Number",
    placeholder: "Phone Number",
    item_code: null,
    vending_provider: "smeplug",
  };
};

const toMobilenigPurchaseOption = (provider: {
  id: string;
  network_name: string;
  api_code?: string | null;
  min_amount?: number | null;
  max_amount?: number | null;
}) => ({
  id: provider.id,
  name: provider.network_name,
  display_name: provider.network_name,
  network_id: provider.api_code || provider.id,
  min_amount: Number(provider.min_amount) || 50,
  max_amount: Number(provider.max_amount) || 50000,
  identifier_label: "Phone Number",
  placeholder: "Phone Number",
  item_code: provider.api_code || null,
  vending_provider: "mobilenig",
});

const toFlutterwavePurchaseOption = (provider: {
  id: string;
  network_name: string;
  api_code?: string | null;
  min_amount?: number | null;
  max_amount?: number | null;
}) => ({
  id: provider.id,
  name: provider.network_name,
  display_name: provider.network_name,
  network_id: provider.network_name,
  min_amount: Number(provider.min_amount) || 50,
  max_amount: Number(provider.max_amount) || 50000,
  identifier_label: "Phone Number",
  placeholder: "Phone Number",
  item_code: provider.api_code || null,
  vending_provider: "flutterwave",
});

const toEbillsPurchaseOption = (network: typeof EBILLS_NETWORKS[number]) => ({
  ...network,
  identifier_label: "Phone Number",
  placeholder: "Phone Number",
  item_code: null,
  vending_provider: "ebills",
});

const fetchAirtimeProvidersFromDb = async (supabase: ReturnType<typeof createClient>) => {
  const { data, error } = await supabase
    .from("airtime_providers")
    .select("id, network_name, api_code, min_amount, max_amount, is_active")
    .eq("is_active", true)
    .order("network_name", { ascending: true });

  if (error) throw error;
  return data || [];
};

const fetchSmeplugNetworks = async (secretKey: string) => {
  const response = await fetch("https://smeplug.ng/api/v1/networks", {
    method: "GET",
    headers: {
      Authorization: `Bearer ${secretKey}`,
      "Content-Type": "application/json",
    },
  });

  const responseText = await response.text();
  let payload: Record<string, unknown>;

  try {
    payload = JSON.parse(responseText) as Record<string, unknown>;
  } catch {
    throw new Error(`Invalid JSON from SMEPLUG networks API (${response.status})`);
  }

  if (!response.ok) {
    const message =
      (typeof payload.message === "string" && payload.message) ||
      (typeof payload.error === "string" && payload.error) ||
      `SMEPLUG networks API error (${response.status})`;
    throw new Error(message);
  }

  const apiOk = payload.status === true || payload.success === true;
  const networks = payload.networks;

  if (!apiOk || !networks || typeof networks !== "object") {
    throw new Error("SMEPLUG networks API returned an unexpected response");
  }

  const options = Object.entries(networks as Record<string, string>)
    .map(([networkId, networkName]) => toSmeplugPurchaseOption(networkId, networkName))
    .sort((a, b) => {
      const orderA = NETWORK_ORDER[normalizeNetworkKey(a.name)] ?? 99;
      const orderB = NETWORK_ORDER[normalizeNetworkKey(b.name)] ?? 99;
      if (orderA !== orderB) return orderA - orderB;
      return a.name.localeCompare(b.name);
    });

  return options;
};

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: CORS_HEADERS });
  }

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const supabase = createClient(supabaseUrl, supabaseKey);

    const authHeader = req.headers.get("Authorization");
    if (!authHeader) {
      return new Response(JSON.stringify({ success: false, error: "Unauthorized" }), {
        status: 401,
        headers: { ...CORS_HEADERS, "Content-Type": "application/json" },
      });
    }

    const token = authHeader.replace("Bearer ", "");
    const { data: { user }, error: authError } = await supabase.auth.getUser(token);

    if (authError || !user) {
      return new Response(JSON.stringify({ success: false, error: "Unauthorized" }), {
        status: 401,
        headers: { ...CORS_HEADERS, "Content-Type": "application/json" },
      });
    }

    const { data: providerSetting } = await supabase
      .from("app_settings")
      .select("setting_value")
      .eq("setting_key", "airtime_provider")
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();

    let activeProvider = "smeplug";
    if (providerSetting?.setting_value) {
      const providerValue = typeof providerSetting.setting_value === "string"
        ? providerSetting.setting_value
        : (providerSetting.setting_value as { provider?: string })?.provider;
      if (providerValue) {
        activeProvider = providerValue.toLowerCase();
      }
    }

    const warnings: string[] = [];
    let options: ReturnType<typeof toSmeplugPurchaseOption>[] = [];
    let source = "fallback";

    if (activeProvider === "ebills" || activeProvider === "ebills.africa") {
      options = EBILLS_NETWORKS.map(toEbillsPurchaseOption);
      source = "ebills";
      activeProvider = "ebills";
    } else if (activeProvider === "mobilenig" || activeProvider === "mobile-nig") {
      try {
        const providers = await fetchAirtimeProvidersFromDb(supabase);
        options = providers.length > 0
          ? providers.map((provider) => toMobilenigPurchaseOption(provider))
          : FALLBACK_OPTIONS.map((item) => toMobilenigPurchaseOption({
            id: item.id,
            network_name: item.name,
            api_code: item.network_id,
            min_amount: item.min_amount,
            max_amount: item.max_amount,
          }));
        source = "mobilenig";
        activeProvider = "mobilenig";
      } catch (dbError) {
        const message = dbError instanceof Error ? dbError.message : String(dbError);
        warnings.push(`Could not load MobileNig airtime providers: ${message}`);
        options = FALLBACK_OPTIONS.map((item) => toMobilenigPurchaseOption({
          id: item.id,
          network_name: item.name,
          api_code: item.network_id,
        }));
        source = "fallback";
      }
    } else if (activeProvider === "flutterwave" || activeProvider === "flutter-wave" || activeProvider === "flw") {
      try {
        const providers = await fetchAirtimeProvidersFromDb(supabase);
        options = providers.length > 0
          ? providers.map((provider) => toFlutterwavePurchaseOption(provider))
          : FALLBACK_OPTIONS.map((item) => toFlutterwavePurchaseOption({
            id: item.id,
            network_name: item.name,
          }));
        source = "flutterwave";
        activeProvider = "flutterwave";
      } catch (dbError) {
        const message = dbError instanceof Error ? dbError.message : String(dbError);
        warnings.push(`Could not load Flutterwave airtime providers: ${message}`);
        options = FALLBACK_OPTIONS.map((item) => toFlutterwavePurchaseOption({
          id: item.id,
          network_name: item.name,
        }));
        source = "fallback";
      }
    } else {
      const secretKey = Deno.env.get("SMEPLUG_SECRET_KEY");
      options = FALLBACK_OPTIONS.map((item) => toSmeplugPurchaseOption(item.network_id, item.name));

      if (!secretKey) {
        warnings.push("SMEPLUG_SECRET_KEY not configured; using default network list.");
      } else {
        try {
          options = await fetchSmeplugNetworks(secretKey);
          source = "smeplug";

          const { balance: providerBalance } = await fetchSmeplugWalletBalance(secretKey);
          if (providerBalance !== null && providerBalance < 100) {
            warnings.push(
              "Airtime purchases may fail until the provider wallet is funded (low SMEPLUG balance).",
            );
          }
        } catch (networkError) {
          const message = networkError instanceof Error ? networkError.message : String(networkError);
          console.error("SMEPLUG networks fetch failed, using fallback:", message);
          warnings.push(`Could not load networks from SMEPLUG: ${message}`);
        }
      }
    }

    return new Response(JSON.stringify({
      success: true,
      data: options,
      metadata: {
        active_provider: activeProvider,
        source,
        total_networks: options.length,
        warnings,
      },
    }), {
      status: 200,
      headers: { ...CORS_HEADERS, "Content-Type": "application/json" },
    });
  } catch (error) {
    console.error("Error in fetch-airtime-purchase-options:", error);

    return new Response(JSON.stringify({
      success: false,
      error: error instanceof Error ? error.message : "Unknown error occurred",
    }), {
      status: 500,
      headers: { ...CORS_HEADERS, "Content-Type": "application/json" },
    });
  }
});
