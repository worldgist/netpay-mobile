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
};

export const MOBILENIG_CABLE_SERVICES: Record<string, string> = {
  DSTV: "dstv",
  GOTV: "gotv",
  STARTIMES: "startimes",
};

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
