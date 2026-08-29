const FLUTTERWAVE_API_BASE = "https://api.flutterwave.com/v3";

export type FlutterwaveBillPaymentResult = {
  success: boolean;
  status: "success" | "pending" | "failed";
  reference?: string;
  message?: string;
  error?: string;
  vendorResponse?: Record<string, unknown>;
  fee?: number;
};

export function getFlutterwaveSecretKey(): string {
  const key = Deno.env.get("FLUTTERWAVE_SECRET_KEY");
  if (!key?.trim()) {
    throw new Error("FLUTTERWAVE_SECRET_KEY is not configured in Supabase Edge Function secrets");
  }
  return key.trim();
}

export function getFlutterwaveSecretKeyOptional(): string | null {
  const key = Deno.env.get("FLUTTERWAVE_SECRET_KEY");
  return key?.trim() ? key.trim() : null;
}

function normalizeNetworkKey(value: string): string {
  let key = value.trim().toUpperCase().replace(/[^A-Z0-9]/g, "");
  if (key === "T2" || key === "ETISALAT") {
    key = "9MOBILE";
  }
  return key;
}

export function parseFlutterwaveApiCode(apiCode: string): { billerCode?: string; itemCode: string; networkKey?: string } {
  const trimmed = apiCode.trim();
  if (!trimmed) {
    return { itemCode: "" };
  }

  const parts = trimmed.split(/[|:]/).map((part) => part.trim()).filter(Boolean);
  if (parts.length >= 3) {
    return {
      billerCode: parts[0],
      itemCode: parts[1],
      networkKey: parts[2],
    };
  }

  const separator = trimmed.includes("|") ? "|" : trimmed.includes(":") ? ":" : null;
  if (separator) {
    const [biller, item] = trimmed.split(separator, 2);
    return {
      billerCode: biller.trim() || undefined,
      itemCode: item.trim(),
    };
  }

  return { itemCode: trimmed };
}

export type FlutterwaveAirtimeBiller = {
  network_name: string;
  biller_code: string;
  biller_name: string;
  item_code: string;
  item_name: string;
  api_code: string;
  min_amount: number;
  max_amount: number;
};

function normalizePhoneForFlutterwave(value: string): string {
  let normalized = value.trim().replace(/\s+/g, "");
  if (normalized.startsWith("+234")) return normalized;
  if (normalized.startsWith("234") && normalized.length === 13) return `+${normalized}`;
  normalized = normalized.replace(/[^0-9]/g, "");
  if (/^0\d{10}$/.test(normalized)) return `+234${normalized.slice(1)}`;
  if (/^[789]\d{9}$/.test(normalized)) return `+234${normalized}`;
  return normalized.startsWith("+") ? normalized : `+${normalized}`;
}

export function mapFlutterwaveBillPaymentError(message: string): string {
  const normalized = message.toLowerCase();

  if (
    normalized.includes("cannot be processed") &&
    normalized.includes("account administrator")
  ) {
    return "Flutterwave blocked this bill payment. In your Flutterwave dashboard, enable Bill Payments, fund your Flutterwave wallet, and whitelist server IPs (use 0.0.0.0 in test mode).";
  }

  if (normalized.includes("ip") && normalized.includes("whitelist")) {
    return "Flutterwave rejected the request because the server IP is not whitelisted. Add 0.0.0.0 in test mode or whitelist Supabase egress IPs in Flutterwave API settings.";
  }

  if (normalized.includes("insufficient") && normalized.includes("balance")) {
    return "Your Flutterwave merchant wallet does not have enough balance for this airtime purchase. Fund your Flutterwave balance in the dashboard.";
  }

  return message;
}

export async function getFlutterwaveNgnBalance(): Promise<number | null> {
  try {
    const payload = await flutterwaveApi<Record<string, unknown>>("/balances/NGN");
    const data = (payload.data && typeof payload.data === "object")
      ? payload.data as Record<string, unknown>
      : {};
    return Number(data.available_balance ?? data.ledger_balance ?? 0) || 0;
  } catch (error) {
    console.warn("Unable to fetch Flutterwave NGN balance:", error);
    return null;
  }
}

async function flutterwaveApi<T = Record<string, unknown>>(
  path: string,
  init?: RequestInit,
): Promise<T> {
  const secretKey = getFlutterwaveSecretKey();
  const response = await fetch(`${FLUTTERWAVE_API_BASE}${path}`, {
    ...init,
    headers: {
      Authorization: `Bearer ${secretKey}`,
      "Content-Type": "application/json",
      ...(init?.headers || {}),
    },
  });

  const text = await response.text();
  let payload: Record<string, unknown>;
  try {
    payload = text ? JSON.parse(text) as Record<string, unknown> : {};
  } catch {
    throw new Error(`Invalid JSON from Flutterwave (${response.status})`);
  }

  if (!response.ok || payload.status !== "success") {
    const message =
      (typeof payload.message === "string" && payload.message) ||
      (typeof payload.error === "string" && payload.error) ||
      `Flutterwave API error (${response.status})`;
    throw new Error(mapFlutterwaveBillPaymentError(message));
  }

  return payload as T;
}

export async function payFlutterwaveBill(params: {
  billerCode: string;
  itemCode: string;
  customerId: string;
  amount: number;
  reference: string;
  country?: string;
}): Promise<FlutterwaveBillPaymentResult> {
  const customerCandidates = buildAirtimeCustomerCandidates(params.customerId);
  let lastError = "Flutterwave bill payment failed";

  for (const customerId of customerCandidates) {
    const formattedCustomer = customerId.includes("+")
      ? customerId
      : normalizePhoneForFlutterwave(customerId);

    try {
      const payload = await flutterwaveApi<Record<string, unknown>>(
        `/billers/${encodeURIComponent(params.billerCode)}/items/${encodeURIComponent(params.itemCode)}/payment`,
        {
          method: "POST",
          body: JSON.stringify({
            country: params.country || "NG",
            customer_id: formattedCustomer,
            amount: params.amount,
            reference: params.reference,
          }),
        },
      );

      const data = (payload.data && typeof payload.data === "object")
        ? payload.data as Record<string, unknown>
        : {};

      const flwReference = String(data.reference || data.tx_ref || params.reference);
      const code = String(data.code || "200");
      const isSuccess = code === "200" || payload.status === "success";

      return {
        success: isSuccess,
        status: isSuccess ? "success" : "pending",
        reference: flwReference,
        message: typeof payload.message === "string" ? payload.message : "Bill payment successful",
        vendorResponse: payload,
        fee: Number(data.fee || 0) || undefined,
      };
    } catch (error) {
      lastError = error instanceof Error ? error.message : lastError;
      if (lastError.toLowerCase().includes("account administrator")) {
        break;
      }
    }
  }

  return {
    success: false,
    status: "failed",
    error: lastError,
  };
}

function buildAirtimeCustomerCandidates(customerId: string): string[] {
  const candidates = new Set<string>();
  const digits = customerId.replace(/\D/g, "");

  if (digits.startsWith("234") && digits.length === 13) {
    candidates.add(`+${digits}`);
    candidates.add(`0${digits.slice(3)}`);
    candidates.add(digits);
  } else if (/^0\d{10}$/.test(digits)) {
    candidates.add(digits);
    candidates.add(`+234${digits.slice(1)}`);
    candidates.add(`234${digits.slice(1)}`);
  } else if (/^[789]\d{9}$/.test(digits)) {
    candidates.add(`0${digits}`);
    candidates.add(`+234${digits}`);
    candidates.add(`234${digits}`);
  } else if (customerId.trim()) {
    candidates.add(customerId.trim());
    candidates.add(normalizePhoneForFlutterwave(customerId));
  }

  return Array.from(candidates).filter(Boolean);
}

function mapNetworkToFlutterwaveBillerName(network: string): string | undefined {
  const key = normalizeNetworkKey(network);
  const map: Record<string, string> = {
    MTN: "MTN",
    AIRTEL: "AIRTEL",
    GLO: "GLO",
    "9MOBILE": "9MOBILE",
  };
  return map[key];
}

async function postFlutterwaveAirtimeViaBillsApi(body: Record<string, unknown>): Promise<FlutterwaveBillPaymentResult> {
  try {
    const payload = await flutterwaveApi<Record<string, unknown>>("/bills", {
      method: "POST",
      body: JSON.stringify(body),
    });

    const data = (payload.data && typeof payload.data === "object")
      ? payload.data as Record<string, unknown>
      : {};

    const flwReference = String(
      data.reference || data.tx_ref || data.flw_ref || body.reference || "",
    );

    return {
      success: true,
      status: "success",
      reference: flwReference,
      message: typeof payload.message === "string" ? payload.message : "Bill payment successful",
      vendorResponse: payload,
      fee: Number(data.fee || 0) || undefined,
    };
  } catch (error) {
    return {
      success: false,
      status: "failed",
      error: error instanceof Error ? error.message : "Flutterwave airtime payment failed",
    };
  }
}

export async function payFlutterwaveAirtimeBill(params: {
  customerId: string;
  amount: number;
  reference: string;
  network?: string;
  billerCode?: string;
  itemCode?: string;
  country?: string;
}): Promise<FlutterwaveBillPaymentResult> {
  const customers = buildAirtimeCustomerCandidates(params.customerId);
  const billerName = params.network ? mapNetworkToFlutterwaveBillerName(params.network) : undefined;
  let lastError = "Flutterwave airtime purchase failed";

  for (const customer of customers) {
    const body: Record<string, unknown> = {
      country: params.country || "NG",
      customer,
      amount: params.amount,
      recurrence: "ONCE",
      type: "AIRTIME",
      reference: params.reference,
    };

    if (billerName) {
      body.biller_name = billerName;
    }

    const result = await postFlutterwaveAirtimeViaBillsApi(body);
    if (result.success) {
      return result;
    }

    lastError = result.error || lastError;
    if (lastError.toLowerCase().includes("account administrator")) {
      return result;
    }
  }

  if (params.billerCode && params.itemCode) {
    const fallback = await payFlutterwaveBill({
      billerCode: params.billerCode,
      itemCode: params.itemCode,
      customerId: params.customerId,
      amount: params.amount,
      reference: params.reference,
      country: params.country,
    });

    if (fallback.success || fallback.error) {
      return fallback;
    }
  }

  return {
    success: false,
    status: "failed",
    error: lastError,
  };
}

function readEnvBillCodes(service: string, network: string): { billerCode: string; itemCode: string } | null {
  const networkKey = normalizeNetworkKey(network);
  const biller = Deno.env.get(`FLUTTERWAVE_${service.toUpperCase()}_${networkKey}_BILLER`)?.trim();
  const item = Deno.env.get(`FLUTTERWAVE_${service.toUpperCase()}_${networkKey}_ITEM`)?.trim();
  if (biller && item) {
    return { billerCode: biller, itemCode: item };
  }
  return null;
}

function extractFlutterwaveList(payload: Record<string, unknown>): Array<Record<string, unknown>> {
  const data = payload.data;
  if (Array.isArray(data)) {
    return data as Array<Record<string, unknown>>;
  }

  if (data && typeof data === "object") {
    const obj = data as Record<string, unknown>;
    for (const key of ["categories", "billers", "items", "results"]) {
      if (Array.isArray(obj[key])) {
        return obj[key] as Array<Record<string, unknown>>;
      }
    }
  }

  return [];
}

async function fetchFlutterwaveBillCategories(): Promise<Array<Record<string, unknown>>> {
  const paths = [
    "/top-bill-categories?country=NG",
    "/bill-categories?country=NG",
    "/top-bill-categories",
  ];

  for (const path of paths) {
    try {
      const payload = await flutterwaveApi<Record<string, unknown>>(path);
      const categories = extractFlutterwaveList(payload);
      if (categories.length > 0) {
        return categories;
      }
    } catch (error) {
      console.warn(`Flutterwave categories fetch failed for ${path}:`, error);
    }
  }

  return [];
}

async function fetchFlutterwaveBillItems(billerCode: string): Promise<Array<Record<string, unknown>>> {
  const payload = await flutterwaveApi<Record<string, unknown>>(
    `/billers/${encodeURIComponent(billerCode)}/items`,
  );
  return extractFlutterwaveList(payload);
}

async function fetchFlutterwaveBillers(categoryCode: string): Promise<Array<Record<string, unknown>>> {
  const paths = [
    `/bills/${encodeURIComponent(categoryCode)}/billers?country=NG`,
    `/bill-categories/${encodeURIComponent(categoryCode)}/billers?country=NG`,
  ];

  for (const path of paths) {
    try {
      const payload = await flutterwaveApi<Record<string, unknown>>(path);
      const billers = extractFlutterwaveList(payload);
      if (billers.length > 0) {
        return billers;
      }
    } catch (error) {
      console.warn(`Flutterwave billers fetch failed for ${path}:`, error);
    }
  }

  return [];
}

async function resolveDynamicAirtimeCodes(network: string): Promise<{ billerCode: string; itemCode: string } | null> {
  const networkKey = normalizeNetworkKey(network);
  const categories = await fetchFlutterwaveBillCategories();

  const airtimeCategory = categories.find((entry) => {
    const name = String(entry.name || entry.category || "").toLowerCase();
    const code = String(entry.code || entry.category_code || "").toLowerCase();
    return name.includes("airtime") || code.includes("airtime");
  });

  if (!airtimeCategory) return null;

  const categoryCode = String(airtimeCategory.code || airtimeCategory.category_code || "");
  if (!categoryCode) return null;

  const billers = await fetchFlutterwaveBillers(categoryCode);
  const networkMatchers: Record<string, RegExp> = {
    MTN: /mtn/i,
    AIRTEL: /airtel/i,
    GLO: /glo/i,
    "9MOBILE": /9\s*mobile|etisalat|t2/i,
  };

  const matcher = networkMatchers[networkKey] || new RegExp(networkKey, "i");
  const biller = billers.find((entry) => matcher.test(String(entry.name || entry.biller_name || "")));
  if (!biller) return null;

  const billerCode = String(biller.biller_code || biller.code || "");
  if (!billerCode) return null;

  const items = await fetchFlutterwaveBillItems(billerCode);
  const vtuItem = items.find((entry) => {
    const name = String(entry.name || entry.item_name || "").toLowerCase();
    return name.includes("vtu") || name.includes("airtime") || name.includes("top up") || name.includes("topup");
  }) || items[0];

  const itemCode = String(vtuItem?.item_code || vtuItem?.code || "");
  if (!itemCode) return null;

  return { billerCode, itemCode };
}

export async function resolveFlutterwaveAirtimeBillCodes(params: {
  network: string;
  itemCodeOverride?: string;
  billerCodeOverride?: string;
}): Promise<{ billerCode: string; itemCode: string }> {
  const network = params.network;
  const parsedOverride = params.itemCodeOverride && !params.billerCodeOverride
    ? parseFlutterwaveApiCode(params.itemCodeOverride)
    : null;

  const itemCodeOverride = parsedOverride?.itemCode || params.itemCodeOverride?.trim();
  const billerCodeOverride = params.billerCodeOverride?.trim() || parsedOverride?.billerCode;

  if (billerCodeOverride && itemCodeOverride) {
    return { billerCode: billerCodeOverride, itemCode: itemCodeOverride };
  }

  const fromEnv = readEnvBillCodes("AIRTIME", network);
  if (fromEnv) {
    if (itemCodeOverride) {
      return { billerCode: billerCodeOverride || fromEnv.billerCode, itemCode: itemCodeOverride };
    }
    return fromEnv;
  }

  if (itemCodeOverride) {
    const billerOnly = Deno.env.get(`FLUTTERWAVE_AIRTIME_${normalizeNetworkKey(network)}_BILLER`)?.trim();
    if (billerOnly) {
      return { billerCode: billerOnly, itemCode: itemCodeOverride };
    }
  }

  const dynamic = await resolveDynamicAirtimeCodes(network);
  if (dynamic) {
    if (itemCodeOverride) {
      return { billerCode: billerCodeOverride || dynamic.billerCode, itemCode: itemCodeOverride };
    }
    return dynamic;
  }

  throw new Error(
    `Flutterwave airtime bill codes not configured for ${network}. Set FLUTTERWAVE_AIRTIME_${normalizeNetworkKey(network)}_BILLER and _ITEM secrets, or configure api_code in airtime_providers.`,
  );
}

async function getAirtimeCategoryCode(): Promise<string> {
  const fallback = "AIRTIME";

  try {
    const categories = await fetchFlutterwaveBillCategories();
    const ngCategories = categories.filter((entry) => {
      const country = String(entry.country_code || entry.country || "NG").trim().toUpperCase();
      return !country || country === "NG";
    });

    const airtimeCategory = ngCategories.find((entry) => {
      const name = String(entry.name || entry.category || entry.description || "").toLowerCase();
      const code = String(entry.code || entry.category_code || "").toLowerCase();
      return name.includes("airtime") || code.includes("airtime");
    });

    const code = String(airtimeCategory?.code || airtimeCategory?.category_code || "").trim();
    if (code) return code;
  } catch (error) {
    console.warn("Flutterwave airtime category discovery failed:", error);
  }

  return fallback;
}

const KNOWN_NG_AIRTIME_BILLER = "BIL099";
const KNOWN_NG_AIRTIME_ITEM = "AT099";
const KNOWN_NG_AIRTIME_NETWORKS = ["MTN", "Airtel", "Glo", "9Mobile"] as const;

function buildKnownNgAirtimeProviders(): FlutterwaveAirtimeBiller[] {
  return KNOWN_NG_AIRTIME_NETWORKS.map((networkName) => ({
    network_name: networkName,
    biller_code: KNOWN_NG_AIRTIME_BILLER,
    biller_name: networkName,
    item_code: KNOWN_NG_AIRTIME_ITEM,
    item_name: "Airtime VTU",
    api_code: buildAirtimeApiCode(
      KNOWN_NG_AIRTIME_BILLER,
      KNOWN_NG_AIRTIME_ITEM,
      normalizeNetworkKey(networkName),
    ),
    min_amount: 50,
    max_amount: 50000,
  }));
}

function getBillerLabel(biller: Record<string, unknown>): string {
  return String(
    biller.short_name || biller.name || biller.biller_name || biller.description || biller.code || "",
  ).trim();
}

function getAirtimeItemLabel(item: Record<string, unknown>, biller: Record<string, unknown>): string {
  return String(
    item.short_name || item.name || item.group_name || item.biller_name || getBillerLabel(biller) || "",
  ).trim();
}

function isNigeriaRecord(record: Record<string, unknown>): boolean {
  const country = String(record.country || record.country_code || "NG").trim().toUpperCase();
  return !country || country === "NG";
}

function isAirtimeRecord(record: Record<string, unknown>): boolean {
  if (record.is_airtime === true || record.is_airtime === "true") return true;
  const category = String(record.category_name || record.biller_name || "").toLowerCase();
  return category.includes("airtime");
}

function isMajorAirtimeLabel(label: string): boolean {
  return /mtn|airtel|glo|9\s*mobile|etisalat|t2/i.test(label);
}

function inferNetworkName(label: string): string | null {
  const normalized = label.toLowerCase();
  if (/mtn/.test(normalized)) return "MTN";
  if (/airtel/.test(normalized)) return "Airtel";
  if (/glo/.test(normalized)) return "Glo";
  if (/9\s*mobile|etisalat|t2/.test(normalized)) return "9Mobile";
  return null;
}

function scoreAirtimeItem(item: Record<string, unknown>): number {
  let score = 0;
  const amount = Number(item.amount ?? item.minimum ?? 0);
  const name = String(item.short_name || item.name || "").toLowerCase();

  if (item.is_airtime === true) score += 20;
  if (amount === 0) score += 10;
  if (name.includes("vtu") || name.includes("airtime") || name.includes("top up") || name.includes("topup")) {
    score += 5;
  }
  if (isMajorAirtimeLabel(name)) score += 3;

  return score;
}

function buildAirtimeApiCode(billerCode: string, itemCode: string, networkKey: string): string {
  return `${billerCode}|${itemCode}|${networkKey}`;
}

function addAirtimeResult(
  results: Map<string, FlutterwaveAirtimeBiller>,
  params: {
    networkName: string;
    billerCode: string;
    billerName: string;
    item: Record<string, unknown>;
  },
) {
  const networkKey = normalizeNetworkKey(params.networkName);
  const itemCode = String(params.item.item_code || params.item.code || "").trim();
  if (!itemCode) return;

  const itemName = String(
    params.item.short_name || params.item.name || params.item.item_name || itemCode,
  ).trim();

  const candidate: FlutterwaveAirtimeBiller = {
    network_name: params.networkName,
    biller_code: params.billerCode,
    biller_name: params.billerName,
    item_code: itemCode,
    item_name: itemName,
    api_code: buildAirtimeApiCode(params.billerCode, itemCode, networkKey),
    min_amount: Number(params.item.minimum ?? params.item.min_amount ?? 50) || 50,
    max_amount: Number(params.item.maximum ?? params.item.max_amount ?? 50000) || 50000,
  };

  const existing = results.get(networkKey);
  if (!existing || scoreAirtimeItem(params.item) > scoreAirtimeItem({ item_code: existing.item_code, short_name: existing.item_name })) {
    results.set(networkKey, candidate);
  }
}

async function collectAirtimeFromBillerItems(
  results: Map<string, FlutterwaveAirtimeBiller>,
  biller: Record<string, unknown>,
): Promise<number> {
  const billerCode = String(biller.biller_code || biller.code || "").trim();
  if (!billerCode) return 0;

  const billerName = getBillerLabel(biller);
  const items = await fetchFlutterwaveBillItems(billerCode);
  let matched = 0;

  for (const item of items) {
    if (!isNigeriaRecord(item)) continue;

    const label = getAirtimeItemLabel(item, biller);
    const networkName = inferNetworkName(label);
    const looksLikeAirtime = isAirtimeRecord(item) || isMajorAirtimeLabel(label);

    if (!networkName || !looksLikeAirtime) continue;

    addAirtimeResult(results, {
      networkName,
      billerCode,
      billerName: billerName || networkName,
      item,
    });
    matched += 1;
  }

  if (matched === 0 && isMajorAirtimeLabel(billerName)) {
    const networkName = inferNetworkName(billerName);
    const vtuItem = pickVtuItem(items);
    if (networkName && vtuItem) {
      addAirtimeResult(results, {
        networkName,
        billerCode,
        billerName,
        item: vtuItem,
      });
      matched += 1;
    }
  }

  return matched;
}

function pickVtuItem(items: Array<Record<string, unknown>>): Record<string, unknown> | null {
  const airtimeItems = items.filter((entry) => entry.is_airtime === true);
  const candidates = airtimeItems.length > 0 ? airtimeItems : items;

  const vtuItem = candidates.find((entry) => {
    const name = String(entry.name || entry.item_name || entry.short_name || "").toLowerCase();
    return name.includes("vtu") || name.includes("airtime") || name.includes("top up") || name.includes("topup");
  }) || candidates[0];

  return vtuItem || null;
}

export async function listFlutterwaveAirtimeBillers(): Promise<FlutterwaveAirtimeBiller[]> {
  const categoryCode = await getAirtimeCategoryCode();
  const results = new Map<string, FlutterwaveAirtimeBiller>();
  const billerCodesToScan = new Set<string>([KNOWN_NG_AIRTIME_BILLER]);

  try {
    const billers = await fetchFlutterwaveBillers(categoryCode);
    for (const biller of billers) {
      const billerCode = String(biller.biller_code || biller.code || "").trim();
      if (billerCode) billerCodesToScan.add(billerCode);
    }
  } catch (error) {
    console.warn(`Could not fetch Flutterwave billers for category ${categoryCode}:`, error);
  }

  for (const billerCode of billerCodesToScan) {
    const biller = { biller_code: billerCode, name: billerCode };

    try {
      await collectAirtimeFromBillerItems(results, biller);
    } catch (error) {
      console.warn(`Skipping Flutterwave biller ${billerCode}:`, error);
    }
  }

  let providers = Array.from(results.values()).sort((a, b) => a.network_name.localeCompare(b.network_name));

  if (!providers.length) {
    providers = buildKnownNgAirtimeProviders();
  }

  if (!providers.length) {
    throw new Error(
      `No Flutterwave Nigeria airtime providers found. Scanned ${billerCodesToScan.size} biller(s) using category ${categoryCode}.`,
    );
  }

  return providers;
}

export type FlutterwaveAirtimeImportMetadata = {
  total: number;
  category_code: string;
  scanned_billers: number;
  vendor: "flutterwave";
};

export async function listFlutterwaveAirtimeBillersWithMetadata(): Promise<{
  billers: FlutterwaveAirtimeBiller[];
  metadata: FlutterwaveAirtimeImportMetadata;
}> {
  const categoryCode = await getAirtimeCategoryCode();
  const billers = await listFlutterwaveAirtimeBillers();
  return {
    billers,
    metadata: {
      total: billers.length,
      category_code: categoryCode,
      scanned_billers: billers.length,
      vendor: "flutterwave",
    },
  };
}
export async function resolveFlutterwaveServiceBillCodes(params: {
  service: "DATA" | "CABLE" | "ELECTRICITY";
  network: string;
  itemCodeOverride?: string;
}): Promise<{ billerCode: string; itemCode: string }> {
  const fromEnv = readEnvBillCodes(params.service, params.network);
  if (fromEnv) {
    if (params.itemCodeOverride) {
      return { billerCode: fromEnv.billerCode, itemCode: params.itemCodeOverride };
    }
    return fromEnv;
  }

  if (params.itemCodeOverride) {
    const billerOnly = Deno.env.get(`FLUTTERWAVE_${params.service}_${normalizeNetworkKey(params.network)}_BILLER`)?.trim();
    if (billerOnly) {
      return { billerCode: billerOnly, itemCode: params.itemCodeOverride };
    }
  }

  throw new Error(
    `Flutterwave ${params.service.toLowerCase()} bill codes not configured for ${params.network}. Set FLUTTERWAVE_${params.service}_${normalizeNetworkKey(params.network)}_BILLER and _ITEM secrets.`,
  );
}

export { normalizePhoneForFlutterwave, normalizeNetworkKey };
