import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const CORS_HEADERS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const NETWORK_NAME_MAP: Record<string, string> = {
  "1": "MTN",
  "2": "Airtel",
  "3": "9Mobile",
  "4": "Glo",
  MTN: "MTN",
  AIRTEL: "Airtel",
  GLO: "Glo",
  "9MOBILE": "9Mobile",
  ETISALAT: "9Mobile",
  GLOBACOM: "Glo",
};

const normalizeNetworkKey = (value: unknown) =>
  String(value ?? "")
    .trim()
    .toUpperCase()
    .replace(/[^A-Z0-9]/g, "");

const resolveNetworkName = (networkId: unknown, networkName: unknown) => {
  if (typeof networkName === "string" && networkName.trim()) {
    const normalized = networkName.trim().toUpperCase().replace(/\s+/g, "");
    if (NETWORK_NAME_MAP[normalized]) return NETWORK_NAME_MAP[normalized];
    return networkName.trim();
  }

  if (networkId !== undefined && networkId !== null) {
    const key = String(networkId).trim().toUpperCase();
    if (NETWORK_NAME_MAP[key]) return NETWORK_NAME_MAP[key];
  }

  return "Airtime";
};

const extractAirtimeProvider = (value: unknown): "smeplug" | "vtpass" => {
  const normalize = (input: unknown) => String(input ?? "").trim().toLowerCase();

  if (typeof value === "string") {
    const trimmed = value.trim();
    try {
      const parsed = JSON.parse(trimmed);
      const parsedValue = typeof parsed === "string"
        ? parsed
        : (parsed as Record<string, unknown> | null)?.provider ??
          (parsed as Record<string, unknown> | null)?.value ??
          (parsed as Record<string, unknown> | null)?.vending_provider;
      const normalized = normalize(parsedValue);
      return normalized === "vtpass" ? "vtpass" : "smeplug";
    } catch {
      const normalized = normalize(trimmed);
      return normalized === "vtpass" ? "vtpass" : "smeplug";
    }
  }

  if (value && typeof value === "object") {
    const obj = value as Record<string, unknown>;
    const normalized = normalize(obj.provider ?? obj.value ?? obj.vending_provider);
    return normalized === "vtpass" ? "vtpass" : "smeplug";
  }

  return "smeplug";
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

    const { data: providers, error: providersError } = await supabase
      .from("airtime_providers")
      .select("id, network_name, min_amount, max_amount, api_code, is_active")
      .eq("is_active", true)
      .order("network_name", { ascending: true });

    const { data: providerSetting } = await supabase
      .from("app_settings")
      .select("setting_value")
      .eq("setting_key", "airtime_provider")
      .maybeSingle();

    const activeProvider = extractAirtimeProvider(providerSetting?.setting_value);

    if (providersError) {
      throw providersError;
    }

    const options = Array.from(
      (providers || []).reduce((acc, provider) => {
        const resolvedName = resolveNetworkName(provider.api_code, provider.network_name);
        const normalizedNetwork = normalizeNetworkKey(resolvedName);

        const nextItem = {
          id: provider.id,
          name: resolvedName,
          display_name: resolvedName,
          network_id: provider.api_code ? String(provider.api_code).trim() : "",
          min_amount: Number(provider.min_amount) || 0,
          max_amount: Number(provider.max_amount) || 0,
          identifier_label: "Phone Number",
          placeholder: "Phone Number",
          item_code: null,
          vending_provider: activeProvider,
        };

        const existing = acc.get(normalizedNetwork);
        if (!existing) {
          acc.set(normalizedNetwork, nextItem);
          return acc;
        }

        const shouldReplace =
          nextItem.max_amount > existing.max_amount ||
          (nextItem.max_amount === existing.max_amount && nextItem.min_amount < existing.min_amount);

        if (shouldReplace) {
          acc.set(normalizedNetwork, nextItem);
        }

        return acc;
      }, new Map<string, {
        id: string;
        name: string;
        display_name: string;
        network_id: string;
        min_amount: number;
        max_amount: number;
        identifier_label: string;
        placeholder: string;
        item_code: string | null;
        vending_provider: string;
      }>()).values()
    );

    const order: Record<string, number> = { MTN: 0, AIRTEL: 1, "9MOBILE": 2, GLO: 3 };
    options.sort((a, b) => {
      const orderA = order[normalizeNetworkKey(a.name)] ?? 99;
      const orderB = order[normalizeNetworkKey(b.name)] ?? 99;
      if (orderA !== orderB) return orderA - orderB;
      return a.name.localeCompare(b.name);
    });

    return new Response(JSON.stringify({
      success: true,
      data: options,
      metadata: {
        active_provider: activeProvider,
        total_networks: options.length,
        warnings: [],
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
