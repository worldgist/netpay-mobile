import {
  getMobilenigPublicKeyFromEnv,
  getMobilenigSecretKeyFromEnv,
  requireMobilenigPublicKey,
  requireMobilenigSecretKey,
} from "./vendor-secrets.ts";

export const MOBILENIG_BASE_URL = "https://enterprise.mobilenig.com/api/v2";

export type MobilenigKeyType = "public" | "secret";

export const MOBILENIG_DATA_SERVICE_IDS: Record<string, string> = {
  MTN: "BCA",
  "MTN NIGERIA": "BCA",
  AIRTEL: "ACA",
  "AIRTEL NIGERIA": "ACA",
  GLO: "GCA",
  GLOBACOM: "GCA",
  "9MOBILE": "9CA",
  "9 MOBILE": "9CA",
  ETISALAT: "9CA",
  T2: "9CA",
};

/** MobileNig VTU airtime service IDs (distinct from data service IDs). */
export const MOBILENIG_AIRTIME_SERVICE_IDS: Record<string, string> = {
  MTN: "BAD",
  "MTN NIGERIA": "BAD",
  AIRTEL: "BAA",
  "AIRTEL NIGERIA": "BAA",
  GLO: "BAB",
  GLOBACOM: "BAB",
  "9MOBILE": "BAC",
  "9 MOBILE": "BAC",
  ETISALAT: "BAC",
  T2: "BAC",
};

export const MOBILENIG_CABLE_SERVICES: Record<string, string> = {
  DSTV: "dstv",
  GOTV: "gotv",
  STARTIMES: "startimes",
};

export type MobilenigServiceHealth = {
  id: string;
  label: string;
  online: boolean;
  status: string;
};

export type MobilenigHealthSummary = {
  apiReachable: boolean;
  credentialsConfigured: boolean;
  servicesOnline: number;
  servicesTotal: number;
  overall: "healthy" | "degraded" | "down" | "unknown";
  services: MobilenigServiceHealth[];
  message?: string;
};

const MOBILENIG_HEALTH_PROBE_SERVICES: Array<{ id: string; label: string }> = [
  { id: "dstv", label: "DStv" },
  { id: "gotv", label: "GOtv" },
  { id: "startimes", label: "StarTimes" },
  { id: "BCA", label: "MTN Data" },
  { id: "ACA", label: "Airtel Data" },
  { id: "GCA", label: "Glo Data" },
  { id: "9CA", label: "9Mobile Data" },
];

/** Reads MOBILENIG_PUBLIC_KEY from Supabase Edge Function secrets. */
export function getMobilenigPublicKey(): string {
  // Sync path for existing callers; prefer env (including aliases).
  const key = getMobilenigPublicKeyFromEnv();
  if (!key) {
    throw new Error("MOBILENIG_PUBLIC_KEY is not configured in Supabase Edge Function secrets");
  }
  return key;
}

/** Async resolve — Edge secrets first, then vendors table. */
export async function getMobilenigPublicKeyAsync(): Promise<string> {
  return await requireMobilenigPublicKey();
}

/** Reads MOBILENIG_SECRET_KEY from Supabase Edge Function secrets. */
export function getMobilenigSecretKey(): string {
  const key = getMobilenigSecretKeyFromEnv();
  if (!key) {
    throw new Error("MOBILENIG_SECRET_KEY is not configured in Supabase Edge Function secrets");
  }
  return key;
}

/** Async resolve — Edge secrets first, then vendors table. */
export async function getMobilenigSecretKeyAsync(): Promise<string> {
  return await requireMobilenigSecretKey();
}

export function getMobilenigSecretKeyOptional(): string | null {
  return getMobilenigSecretKeyFromEnv();
}

export function resolveMobilenigDataServiceId(network: string): string {
  const normalized = network.toUpperCase().trim();
  return MOBILENIG_DATA_SERVICE_IDS[normalized] || "BCA";
}

/** MobileNig rejects trans_id values longer than 15 characters (EXC009). */
export function toMobilenigTransId(requestId?: string | number | null): number {
  const fromRequest = String(requestId ?? "").replace(/\D/g, "");
  const now = String(Date.now());
  const candidate = (fromRequest.slice(-15) || now).slice(0, 15);
  const parsed = Number(candidate);
  if (Number.isFinite(parsed) && parsed > 0 && String(Math.trunc(parsed)).length <= 15) {
    return Math.trunc(parsed);
  }
  return Number(now.slice(-15));
}

export const MOBILENIG_DATA_REQUEST_TYPES = ["SME", "GIFTING", "CORPORATE"] as const;
export type MobilenigDataRequestType = (typeof MOBILENIG_DATA_REQUEST_TYPES)[number];

export type MobilenigNormalizedDataPlan = {
  code: string;
  name: string;
  price: number;
  requestType: MobilenigDataRequestType;
  plan_type: string;
  api_code: string;
  validity: string;
  productCode: string;
};

/** Parse Naira amounts; ignore size-like strings such as "22GB". */
export function parseMobilenigMoney(value: unknown): number {
  if (typeof value === "number") {
    return Number.isFinite(value) && value > 0 ? value : 0;
  }
  if (typeof value !== "string") return 0;
  const trimmed = value.trim();
  if (!trimmed) return 0;
  if (/\d\s*(GB|MB|TB)\b/i.test(trimmed)) return 0;
  const numeric = Number(trimmed.replace(/,/g, "").replace(/[^\d.-]/g, ""));
  return Number.isFinite(numeric) && numeric > 0 ? numeric : 0;
}

/**
 * Real MobileNig product codes are alphanumeric (e.g. MBMG30D1).
 * Pure short numerics are usually row ids, not buyable product codes.
 */
export function parseMobilenigProductCode(plan: Record<string, unknown>): string {
  const candidates = [
    plan.productCode,
    plan.product_code,
    plan.packageCode,
    plan.package_code,
    plan.code,
    plan.variation_code,
    plan.api_code,
  ];

  for (const candidate of candidates) {
    const code = String(candidate ?? "").replace(/^(SME|GIFTING|CORPORATE):/i, "").trim();
    if (!code) continue;
    if (/^\d{1,6}$/.test(code)) continue;
    return code;
  }

  return "";
}

export function inferMobilenigDataPlanType(planName: string, requestType: string): string {
  const normalized = planName.toUpperCase();
  if (requestType === "GIFTING" || normalized.includes("GIFT")) return "Gifting";
  if (requestType === "CORPORATE" || normalized.includes("CORPORATE")) return "Corporate";
  if (normalized.includes("SME")) return "SME";
  return requestType || "SME";
}

export function normalizeMobilenigDataPackage(
  raw: Record<string, unknown>,
  requestType: string,
): MobilenigNormalizedDataPlan | null {
  const code = parseMobilenigProductCode(raw);
  const name = String(raw.name ?? raw.description ?? raw.plan_name ?? raw.plan ?? "").trim();
  // Prefer explicit price fields. `amount` is last because MobileNig sometimes puts size/volume there.
  const price =
    parseMobilenigMoney(raw.price) ||
    parseMobilenigMoney(raw.selling_price) ||
    parseMobilenigMoney(raw.sellingPrice) ||
    parseMobilenigMoney(raw.package_amount) ||
    parseMobilenigMoney(raw.packageAmount) ||
    parseMobilenigMoney(raw.fixedPrice) ||
    parseMobilenigMoney(raw.variation_amount) ||
    parseMobilenigMoney(raw.amount);

  if (!code || price <= 0) return null;

  const rt = (MOBILENIG_DATA_REQUEST_TYPES.includes(
    requestType.toUpperCase() as MobilenigDataRequestType,
  )
    ? requestType.toUpperCase()
    : "SME") as MobilenigDataRequestType;

  return {
    code,
    name: name || `Data Plan ${code}`,
    price,
    requestType: rt,
    plan_type: inferMobilenigDataPlanType(name, rt),
    api_code: `${rt}:${code}`,
    validity: String(raw.validity ?? raw.duration ?? "N/A"),
    productCode: code,
  };
}

/** Look up the live MobileNig catalog entry so purchase uses the real product code + price. */
export async function resolveMobilenigDataCatalogItem(params: {
  network: string;
  code?: string;
  serviceType?: string;
  planName?: string;
}): Promise<{ code: string; amount: number; serviceType: MobilenigDataRequestType; name: string } | null> {
  const serviceId = resolveMobilenigDataServiceId(params.network);
  const bareCode = String(params.code || "").replace(/^(SME|GIFTING|CORPORATE):/i, "").trim();
  const preferred = String(params.serviceType || "").toUpperCase();
  const order = [
    preferred,
    ...MOBILENIG_DATA_REQUEST_TYPES,
  ].filter((value, index, arr): value is MobilenigDataRequestType =>
    MOBILENIG_DATA_REQUEST_TYPES.includes(value as MobilenigDataRequestType) &&
    arr.indexOf(value) === index
  );

  const targetName = String(params.planName || "").toLowerCase().replace(/\s+/g, " ").trim();
  let nameFallback: { code: string; amount: number; serviceType: MobilenigDataRequestType; name: string } | null = null;

  for (const requestType of order) {
    let packages: unknown[] = [];
    try {
      packages = await getMobilenigPackages(serviceId, requestType);
    } catch (error) {
      console.warn(`MobileNig package lookup failed for ${serviceId}/${requestType}:`, error);
      continue;
    }

    for (const raw of packages) {
      const normalized = normalizeMobilenigDataPackage(
        (raw && typeof raw === "object" ? raw : {}) as Record<string, unknown>,
        requestType,
      );
      if (!normalized) continue;

      if (bareCode && normalized.code.toUpperCase() === bareCode.toUpperCase()) {
        return {
          code: normalized.code,
          amount: normalized.price,
          serviceType: requestType,
          name: normalized.name,
        };
      }

      if (
        !nameFallback &&
        targetName &&
        normalized.name.toLowerCase().replace(/\s+/g, " ").trim() === targetName
      ) {
        nameFallback = {
          code: normalized.code,
          amount: normalized.price,
          serviceType: requestType,
          name: normalized.name,
        };
      }
    }
  }

  // Numeric "codes" (e.g. imported row id "22") cannot be purchased — fall back to plan name.
  if (nameFallback && (!bareCode || /^\d{1,6}$/.test(bareCode))) {
    return nameFallback;
  }

  return nameFallback;
}

const VALID_MOBILENIG_AIRTIME_SERVICE_IDS = new Set(Object.values(MOBILENIG_AIRTIME_SERVICE_IDS));

/** Accept only real MobileNig VTU codes (BAD/BAA/BAB/BAC). Ignore network names like "MTN". */
export function resolveMobilenigAirtimeServiceId(network: string, apiCode?: string): string {
  const code = (apiCode || "").trim().toUpperCase();
  if (VALID_MOBILENIG_AIRTIME_SERVICE_IDS.has(code)) {
    return code;
  }

  const normalized = network.toUpperCase().trim();
  if (VALID_MOBILENIG_AIRTIME_SERVICE_IDS.has(normalized)) {
    return normalized;
  }

  return (
    MOBILENIG_AIRTIME_SERVICE_IDS[normalized] ||
    MOBILENIG_AIRTIME_SERVICE_IDS[normalized.replace(/[^A-Z0-9]/g, "")] ||
    "BAD"
  );
}

export function assertMobilenigSuccess(data: Record<string, unknown>, context: string): void {
  if (data.statusCode !== "200" || data.message !== "success") {
    const details = typeof data.details === "string"
      ? data.details
      : JSON.stringify(data.details ?? data.message ?? context);
    throw new Error(`${context} failed: ${details}`);
  }
}

export async function mobilenigRequest(
  method: "GET" | "POST",
  path: string,
  keyType: MobilenigKeyType,
  options: {
    body?: Record<string, unknown>;
    query?: Record<string, string | number>;
  } = {},
): Promise<Record<string, unknown>> {
  const key = keyType === "secret"
    ? await requireMobilenigSecretKey()
    : await requireMobilenigPublicKey();
  const normalizedPath = path.replace(/^\//, "");
  const url = new URL(`${MOBILENIG_BASE_URL}/${normalizedPath}`);

  if (options.query) {
    for (const [name, value] of Object.entries(options.query)) {
      if (value !== undefined && value !== null) {
        url.searchParams.set(name, String(value));
      }
    }
  }

  const response = await fetch(url.toString(), {
    method,
    headers: {
      Authorization: `Bearer ${key}`,
      "Content-Type": "application/json",
      Accept: "application/json",
    },
    body: method === "POST" && options.body ? JSON.stringify(options.body) : undefined,
  });

  const responseText = await response.text();
  let data: Record<string, unknown>;

  try {
    data = responseText ? JSON.parse(responseText) : {};
  } catch {
    throw new Error(
      `MobileNig API returned invalid JSON (HTTP ${response.status}): ${responseText.substring(0, 200)}`,
    );
  }

  if (!response.ok) {
    throw new Error(
      `MobileNig API error (HTTP ${response.status}): ${
        typeof data.details === "string" ? data.details : JSON.stringify(data)
      }`,
    );
  }

  return data;
}

export async function getMobilenigBalance(): Promise<{ balance: number; currency: string }> {
  const data = await mobilenigRequest("GET", "control/balance", "public");
  assertMobilenigSuccess(data, "Balance lookup");

  const details = data.details as Record<string, unknown> | undefined;
  const balance = Number(details?.balance ?? 0);

  return {
    balance: Number.isFinite(balance) ? balance : 0,
    currency: "NGN",
  };
}

export async function getMobilenigUniqueAccountDetails(): Promise<{
  accountNumber: string;
  accountName: string;
  bankName: string;
  businessName: string;
}> {
  const data = await mobilenigRequest("GET", "control/unique_account_details", "public");
  assertMobilenigSuccess(data, "Account details lookup");

  const details = data.details as Record<string, unknown> | undefined;

  return {
    accountNumber: String(details?.account_number ?? ""),
    accountName: String(details?.account_name ?? ""),
    bankName: String(details?.bank_name ?? ""),
    businessName: String(details?.account_name ?? "MobileNig Account"),
  };
}

export async function getMobilenigWalletHistory(page = 1, perPage = 10): Promise<unknown[]> {
  const data = await mobilenigRequest("GET", "control/wallet_history", "public", {
    query: { page, per_page: perPage },
  });
  assertMobilenigSuccess(data, "Wallet history lookup");
  return Array.isArray(data.details) ? data.details : [];
}

export async function searchMobilenigWalletHistory(transId: string): Promise<unknown[]> {
  const data = await mobilenigRequest("GET", "control/search_wallet_history", "public", {
    query: { trans_id: transId },
  });
  assertMobilenigSuccess(data, "Wallet history search");

  if (Array.isArray(data.details)) {
    return data.details;
  }

  return data.details ? [data.details] : [];
}

export async function getMobilenigPackages(
  serviceId: string,
  requestType?: string,
): Promise<unknown[]> {
  const body: Record<string, unknown> = { service_id: serviceId };
  if (requestType) {
    body.requestType = requestType;
  }

  const data = await mobilenigRequest("POST", "services/packages", "public", { body });
  assertMobilenigSuccess(data, "Package lookup");
  return Array.isArray(data.details) ? data.details : [];
}

function isMobilenigServiceOnline(status: unknown): boolean {
  const normalized = String(status ?? "").trim().toLowerCase();
  if (!normalized) return false;
  if (["offline", "down", "inactive", "unavailable", "0", "false", "error"].includes(normalized)) {
    return false;
  }
  return (
    normalized.includes("online") ||
    normalized.includes("active") ||
    normalized.includes("available") ||
    normalized.includes("success") ||
    normalized === "ok" ||
    normalized === "1" ||
    normalized === "true" ||
    normalized === "up"
  );
}

function parseMobilenigServiceStatuses(details: unknown): MobilenigServiceHealth[] {
  if (!details) return [];

  if (Array.isArray(details)) {
    return details.map((item, index) => {
      const row = item as Record<string, unknown>;
      const id = String(row.service_id ?? row.serviceId ?? row.id ?? row.code ?? index);
      const label = String(row.service ?? row.name ?? row.service_name ?? id);
      const status = String(row.status ?? row.state ?? row.availability ?? row.message ?? "unknown");
      return { id, label, status, online: isMobilenigServiceOnline(status) };
    });
  }

  if (typeof details === "object") {
    return Object.entries(details as Record<string, unknown>).map(([key, value]) => {
      if (value && typeof value === "object") {
        const row = value as Record<string, unknown>;
        const status = String(row.status ?? row.state ?? row.availability ?? "unknown");
        return {
          id: String(row.service_id ?? row.serviceId ?? key),
          label: String(row.service ?? row.name ?? key),
          status,
          online: isMobilenigServiceOnline(status),
        };
      }

      const status = String(value);
      return { id: key, label: key, status, online: isMobilenigServiceOnline(status) };
    });
  }

  return [];
}

async function fetchMobilenigServiceStatus(serviceId: string): Promise<MobilenigServiceHealth[]> {
  const data = await mobilenigRequest("GET", "control/services_status", "public", {
    query: { service_id: serviceId },
  });
  assertMobilenigSuccess(data, `Service status ${serviceId}`);

  const parsed = parseMobilenigServiceStatuses(data.details);
  if (parsed.length > 0) {
    return parsed;
  }

  const details = data.details as Record<string, unknown> | undefined;
  const status = String(details?.status ?? details?.state ?? "unknown");
  return [{
    id: serviceId,
    label: serviceId,
    status,
    online: isMobilenigServiceOnline(status),
  }];
}

export async function getMobilenigHealthSummary(): Promise<MobilenigHealthSummary> {
  try {
    getMobilenigPublicKey();
  } catch {
    return {
      apiReachable: false,
      credentialsConfigured: false,
      servicesOnline: 0,
      servicesTotal: 0,
      overall: "unknown",
      services: [],
      message: "MOBILENIG_PUBLIC_KEY is not configured in Supabase Edge Function secrets",
    };
  }

  let apiReachable = false;
  let services: MobilenigServiceHealth[] = [];

  try {
    const allStatus = await mobilenigRequest("GET", "control/services_status", "public", {
      query: { service_id: "All" },
    });

    if (allStatus.statusCode === "200" && allStatus.message === "success") {
      apiReachable = true;
      services = parseMobilenigServiceStatuses(allStatus.details);
    }
  } catch (error) {
    console.warn("MobileNig bulk service status check failed:", error);
  }

  if (services.length === 0) {
    const probeResults = await Promise.allSettled(
      MOBILENIG_HEALTH_PROBE_SERVICES.map(async ({ id, label }) => {
        const rows = await fetchMobilenigServiceStatus(id);
        return rows.map((row) => ({
          ...row,
          id: row.id || id,
          label: row.label === row.id ? label : row.label,
        }));
      }),
    );

    for (const result of probeResults) {
      if (result.status === "fulfilled") {
        apiReachable = true;
        services.push(...result.value);
      }
    }
  }

  const deduped = new Map<string, MobilenigServiceHealth>();
  for (const service of services) {
    deduped.set(`${service.id}:${service.label}`, service);
  }
  services = Array.from(deduped.values());

  const servicesOnline = services.filter((service) => service.online).length;
  const servicesTotal = services.length;

  let overall: MobilenigHealthSummary["overall"] = "unknown";
  if (!apiReachable && servicesTotal === 0) {
    overall = "down";
  } else if (servicesTotal === 0) {
    overall = "unknown";
  } else if (servicesOnline === servicesTotal) {
    overall = "healthy";
  } else if (servicesOnline > 0) {
    overall = "degraded";
  } else {
    overall = "down";
  }

  return {
    apiReachable,
    credentialsConfigured: true,
    servicesOnline,
    servicesTotal,
    overall,
    services,
  };
}
