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
  const key = Deno.env.get("MOBILENIG_PUBLIC_KEY");
  if (!key) {
    throw new Error("MOBILENIG_PUBLIC_KEY is not configured in Supabase Edge Function secrets");
  }
  return key;
}

/** Reads MOBILENIG_SECRET_KEY from Supabase Edge Function secrets. */
export function getMobilenigSecretKey(): string {
  const key = Deno.env.get("MOBILENIG_SECRET_KEY");
  if (!key) {
    throw new Error("MOBILENIG_SECRET_KEY is not configured in Supabase Edge Function secrets");
  }
  return key;
}

export function getMobilenigSecretKeyOptional(): string | null {
  const key = Deno.env.get("MOBILENIG_SECRET_KEY");
  return key && key.trim() ? key : null;
}

export function resolveMobilenigDataServiceId(network: string): string {
  const normalized = network.toUpperCase().trim();
  return MOBILENIG_DATA_SERVICE_IDS[normalized] || "BCA";
}

export function resolveMobilenigAirtimeServiceId(network: string, apiCode?: string): string {
  if (apiCode && apiCode.trim()) {
    return apiCode.trim().toUpperCase();
  }
  const normalized = network.toUpperCase().trim();
  return MOBILENIG_AIRTIME_SERVICE_IDS[normalized] || "BAD";
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
  const key = keyType === "secret" ? getMobilenigSecretKey() : getMobilenigPublicKey();
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
