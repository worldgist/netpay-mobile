/**
 * Plustive Impact API (https://api.plustiveimpact.com)
 * Auth: Authorization: Bearer pk_live_… / pk_test_…
 * Money: airtime amount = whole naira; bill amounts and balance = kobo.
 *
 * Idempotency: send one clientReference per order and reuse it on every retry.
 * A matching retry returns the original transaction (Idempotent-Replay: true).
 * Reusing a clientReference for a different order is rejected with HTTP 409.
 *
 * Later checks: GET /transactions/:reference accepts either Plustive's reference
 * or the clientReference. Status is Success, Failed, or Processing.
 */
import { fetchWithRetry } from "./http-client.ts";
import { sanitizeIdempotencyKey } from "./airtime-flow.ts";
import { purchaseReference } from "./purchase-queue.ts";
import { resolvePlustiveApiKey } from "./vendor-secrets.ts";

export const PLUSTIVE_BASE_URL = "https://api.plustiveimpact.com/api/v1";

export type PlustivePurchaseStatus = "Success" | "Failed" | "Processing";

export class PlustiveApiError extends Error {
  readonly status: number;

  constructor(message: string, status: number) {
    super(message);
    this.name = "PlustiveApiError";
    this.status = status;
  }
}

/** The purchase request finished without a trustworthy status. Do not refund yet. */
export class PlustiveUnconfirmedError extends Error {
  readonly clientReference: string;

  constructor(clientReference: string) {
    super(`Plustive purchase ${clientReference} could not be confirmed. Check it before retrying.`);
    this.name = "PlustiveUnconfirmedError";
    this.clientReference = clientReference;
  }
}

export type PlustivePurchaseResponse = {
  reference?: string;
  status?: PlustivePurchaseStatus | string;
  providerReference?: string | null;
  priceCharged?: number;
  balance?: number;
  token?: string | null;
  idempotentReplay?: boolean;
  failureReason?: string | null;
  deliveredDetails?: {
    customerName?: string | null;
    customerAddress?: string | null;
    units?: number | null;
    utilityReceipt?: string | null;
  } | null;
  livemode?: boolean;
};

export type PlustiveNetwork = {
  id: string;
  name?: string;
  code?: string;
};

export type PlustiveProduct = {
  id?: string;
  planId?: string;
  productId?: string;
  name?: string;
  label?: string;
  network?: string;
  networkName?: string;
  meterType?: string;
  price?: number | string | { amount?: number; value?: number; kobo?: number };
  amount?: number | string;
  category?: string;
  biller?: string;
  provider?: string;
  service?: string;
};

export function unwrapPlustiveList(body: unknown): PlustiveProduct[] {
  if (Array.isArray(body)) return body as PlustiveProduct[];
  if (!body || typeof body !== "object") return [];
  const record = body as Record<string, unknown>;
  for (const key of ["data", "plans", "products", "networks", "items", "result", "variations"]) {
    const value = record[key];
    if (Array.isArray(value)) return value as PlustiveProduct[];
    if (value && typeof value === "object") {
      const nested = unwrapPlustiveList(value);
      if (nested.length) return nested;
    }
  }
  return [];
}

export function plustiveProductId(product: PlustiveProduct): string {
  return String(product.productId || product.planId || product.id || "").trim();
}

export function plustiveProductPrice(product: PlustiveProduct): number {
  const raw = product.price ?? product.amount;
  if (typeof raw === "number" && Number.isFinite(raw)) return raw;
  if (typeof raw === "string") {
    const parsed = Number(raw.replace(/[^0-9.-]/g, ""));
    return Number.isFinite(parsed) ? parsed : 0;
  }
  if (raw && typeof raw === "object") {
    const amount = Number(raw.kobo ?? raw.amount ?? raw.value ?? 0);
    return Number.isFinite(amount) ? amount : 0;
  }
  return 0;
}

async function plustiveFetch(path: string, init?: RequestInit): Promise<Response> {
  return fetchWithRetry(`${PLUSTIVE_BASE_URL}${path}`, init ?? {}, {
    timeoutMs: 35_000,
    maxAttempts: 2,
    initialDelayMs: 500,
    maxDelayMs: 4_000,
  });
}

async function parseJson<T>(response: Response): Promise<T> {
  const text = await response.text();
  if (!text?.trim()) {
    throw new Error(`Plustive API empty response (HTTP ${response.status})`);
  }
  try {
    return JSON.parse(text) as T;
  } catch {
    throw new Error(`Plustive API invalid JSON (HTTP ${response.status}): ${text.slice(0, 200)}`);
  }
}

function authHeaders(apiKey: string): HeadersInit {
  return {
    Authorization: `Bearer ${apiKey}`,
    "Content-Type": "application/json",
    Accept: "application/json",
  };
}

export type PlustiveTransaction = {
  reference?: string;
  clientReference?: string;
  service?: string;
  status?: string;
  network?: string;
  plan?: string | null;
  mobileNumber?: string;
  priceCharged?: number;
  providerReference?: string | null;
  createdOn?: string;
  completedOn?: string | null;
  token?: string | null;
  failureReason?: string | null;
  deliveredDetails?: PlustivePurchaseResponse["deliveredDetails"];
  livemode?: boolean;
};

function problemMessage(body: Record<string, unknown>, fallback: string): string {
  const detail = typeof body.detail === "string" ? body.detail : "";
  const title = typeof body.title === "string" ? body.title : "";
  const errors = Array.isArray(body.errors) ? body.errors : [];
  const firstReason =
    errors[0] && typeof errors[0] === "object"
      ? String((errors[0] as { reason?: string }).reason || "")
      : "";
  return firstReason || detail || title || fallback;
}

export async function requirePlustiveKey(
  supabase?: Parameters<typeof resolvePlustiveApiKey>[0],
): Promise<string> {
  const key = await resolvePlustiveApiKey(supabase);
  if (!key) {
    throw new Error("PLUSTIVE_API_KEY is not configured in Supabase Edge Function secrets");
  }
  return key;
}

/**
 * One clientReference per order. A queued replay keeps the reference already
 * debited. A customer retry with the same idempotency key hashes to the same
 * value, so Plustive replays the original purchase instead of charging again.
 */
export async function plustiveClientReference(
  req: Request,
  body: { __queued_reference?: unknown; idempotency_key?: unknown; request_id?: unknown },
  userId: string,
  service: string,
): Promise<string> {
  const queued = purchaseReference(req, body, "");
  if (queued) return queued;

  const key = sanitizeIdempotencyKey(
    req.headers.get("Idempotency-Key") || body.idempotency_key || body.request_id,
  );
  const material = `plustive:${service}:${userId}:${key || crypto.randomUUID()}`;
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(material));
  const hex = Array.from(new Uint8Array(digest))
    .map((byte) => byte.toString(16).padStart(2, "0"))
    .join("");
  const prefix: Record<string, string> = {
    airtime: "AIR",
    data: "DATA",
    electricity: "ELEC",
    cable: "CABLE",
    education: "EDU",
  };
  return `${prefix[service] || "PLS"}-PLS-${hex.slice(0, 12).toUpperCase()}`;
}

async function readPurchase(response: Response, fallback: string): Promise<PlustivePurchaseResponse> {
  const body = await parseJson<PlustivePurchaseResponse & Record<string, unknown>>(response);
  if (!response.ok) {
    throw new PlustiveApiError(
      problemMessage(body, `${fallback} (HTTP ${response.status})`),
      response.status,
    );
  }
  const replayHeader = response.headers.get("Idempotent-Replay");
  if (body.idempotentReplay == null && replayHeader) {
    body.idempotentReplay = /^true$/i.test(replayHeader.trim());
  }
  return body;
}

/** Lookup by Plustive reference or by the clientReference sent at purchase time. */
export async function getPlustiveTransaction(
  reference: string,
  apiKey?: string,
): Promise<PlustiveTransaction | null> {
  const lookup = reference.trim();
  if (!lookup) return null;
  const key = apiKey || (await requirePlustiveKey());
  const response = await plustiveFetch(`/transactions/${encodeURIComponent(lookup)}`, {
    method: "GET",
    headers: authHeaders(key),
  });
  if (response.status === 404) return null;
  const body = await parseJson<PlustiveTransaction & Record<string, unknown>>(response);
  if (!response.ok) {
    throw new PlustiveApiError(
      problemMessage(body, `Plustive transaction lookup failed (HTTP ${response.status})`),
      response.status,
    );
  }
  return body;
}

export function purchaseFromTransaction(tx: PlustiveTransaction): PlustivePurchaseResponse {
  return {
    reference: tx.reference,
    status: tx.status,
    providerReference: tx.providerReference,
    priceCharged: tx.priceCharged,
    token: tx.token,
    failureReason: tx.failureReason,
    deliveredDetails: tx.deliveredDetails,
    livemode: tx.livemode,
    idempotentReplay: true,
  };
}

function shouldLookupAfterError(error: unknown): boolean {
  if (error instanceof PlustiveApiError) {
    return error.status === 408 || error.status === 429 || error.status >= 500;
  }
  return true;
}

/**
 * Buy, and on a timeout or 5xx look the order up by clientReference.
 * HTTP 409/422 and other definite rejections are returned as errors.
 * If the lookup itself fails, throw PlustiveUnconfirmedError so the caller
 * keeps the debit until a later check.
 */
export async function completePlustiveBuy(
  clientReference: string,
  buy: () => Promise<PlustivePurchaseResponse>,
  apiKey?: string,
): Promise<PlustivePurchaseResponse> {
  try {
    return await buy();
  } catch (error) {
    if (!shouldLookupAfterError(error)) throw error;
    try {
      const found = await getPlustiveTransaction(clientReference, apiKey);
      if (!found) throw error;
      return purchaseFromTransaction(found);
    } catch (lookupError) {
      if (lookupError === error) throw error;
      console.error("Plustive transaction lookup failed:", lookupError);
      throw new PlustiveUnconfirmedError(clientReference);
    }
  }
}

export async function getPlustiveBalance(apiKey?: string): Promise<{ balance: number; currency: string }> {
  const key = apiKey || (await requirePlustiveKey());
  const response = await plustiveFetch("/balance", {
    method: "GET",
    headers: authHeaders(key),
  });
  const body = await parseJson<Record<string, unknown>>(response);
  if (!response.ok) {
    throw new Error(problemMessage(body, `Plustive balance failed (HTTP ${response.status})`));
  }
  return {
    balance: Number(body.balance ?? 0) / 100, // kobo → NGN
    currency: String(body.currency || "NGN"),
  };
}

export async function listPlustiveNetworks(apiKey?: string): Promise<PlustiveNetwork[]> {
  const key = apiKey || (await requirePlustiveKey());
  const response = await plustiveFetch("/networks", {
    method: "GET",
    headers: authHeaders(key),
  });
  const body = await parseJson<PlustiveNetwork[] | { data?: PlustiveNetwork[] }>(response);
  if (!response.ok) {
    const err = body as Record<string, unknown>;
    throw new Error(problemMessage(err, `Plustive networks failed (HTTP ${response.status})`));
  }
  return unwrapPlustiveList(body);
}

export async function resolvePlustiveNetworkId(
  networkName: string,
  apiKey?: string,
): Promise<string> {
  const networks = await listPlustiveNetworks(apiKey);
  const needle = networkName.toLowerCase().replace(/[^a-z0-9]/g, "");
  const aliases: Record<string, string[]> = {
    mtn: ["mtn"],
    airtel: ["airtel"],
    glo: ["glo", "globacom"],
    "9mobile": ["9mobile", "etisalat", "t2"],
  };
  const wanted = aliases[needle] || [needle];
  const match = networks.find((n) => {
    const hay = `${n.name || ""} ${n.code || ""} ${n.id || ""}`.toLowerCase().replace(/[^a-z0-9]/g, "");
    return wanted.some((w) => hay.includes(w));
  });
  if (!match?.id) {
    throw new Error(`Plustive has no airtime network matching "${networkName}"`);
  }
  return match.id;
}

export async function buyPlustiveAirtime(params: {
  networkId: string;
  phone: string;
  amountNaira: number;
  clientReference: string;
  apiKey?: string;
}): Promise<PlustivePurchaseResponse> {
  const key = params.apiKey || (await requirePlustiveKey());
  const response = await plustiveFetch("/airtime", {
    method: "POST",
    headers: authHeaders(key),
    body: JSON.stringify({
      networkId: params.networkId,
      phone: params.phone,
      amount: Math.round(params.amountNaira),
      clientReference: params.clientReference,
    }),
  });
  return readPurchase(response, "Plustive airtime failed");
}

export async function listPlustiveDataPlans(apiKey?: string): Promise<PlustiveProduct[]> {
  const key = apiKey || (await requirePlustiveKey());
  const response = await plustiveFetch("/plans", {
    method: "GET",
    headers: authHeaders(key),
  });
  const body = await parseJson<PlustiveProduct[] | { data?: PlustiveProduct[] }>(response);
  if (!response.ok) {
    throw new Error(problemMessage(body as Record<string, unknown>, `Plustive plans failed (HTTP ${response.status})`));
  }
  return unwrapPlustiveList(body);
}

export async function buyPlustiveData(params: {
  planId: string;
  phone: string;
  clientReference: string;
  apiKey?: string;
}): Promise<PlustivePurchaseResponse> {
  const key = params.apiKey || (await requirePlustiveKey());
  const response = await plustiveFetch("/data", {
    method: "POST",
    headers: authHeaders(key),
    body: JSON.stringify({
      planId: params.planId,
      phone: params.phone,
      clientReference: params.clientReference,
    }),
  });
  return readPurchase(response, "Plustive data failed");
}

export async function listPlustiveElectricityProducts(apiKey?: string): Promise<PlustiveProduct[]> {
  const key = apiKey || (await requirePlustiveKey());
  const response = await plustiveFetch("/electricity/products", {
    method: "GET",
    headers: authHeaders(key),
  });
  // Some docs also expose via /plans — try primary then fallback
  if (response.status === 404) {
    const fallback = await plustiveFetch("/plans?service=electricity", {
      method: "GET",
      headers: authHeaders(key),
    });
    const body = await parseJson<PlustiveProduct[] | { data?: PlustiveProduct[] }>(fallback);
    if (!fallback.ok) {
      throw new Error(problemMessage(body as Record<string, unknown>, "Plustive electricity catalog failed"));
    }
    return unwrapPlustiveList(body);
  }
  const body = await parseJson<PlustiveProduct[] | { data?: PlustiveProduct[] }>(response);
  if (!response.ok) {
    throw new Error(problemMessage(body as Record<string, unknown>, "Plustive electricity catalog failed"));
  }
  return unwrapPlustiveList(body);
}

/** Map NetPay disco + meter type → Plustive productId (catalog match or slug fallback). */
export async function resolvePlustiveElectricityProductId(
  disco: string,
  meterType: string,
  apiKey?: string,
): Promise<string> {
  const discoKey = disco.toLowerCase().replace(/[^a-z0-9]/g, "");
  const typeKey = (meterType || "prepaid").toLowerCase().includes("post") ? "postpaid" : "prepaid";
  const slug = `${discoKey}-${typeKey}`;

  try {
    const products = await listPlustiveElectricityProducts(apiKey);
    const match = products.find((p) => {
      const id = String(p.productId || p.planId || p.id || "").toLowerCase();
      const name = String(p.name || p.label || "").toLowerCase().replace(/[^a-z0-9]/g, "");
      const mt = String(p.meterType || "").toLowerCase();
      const discoHit = id.includes(discoKey) || name.includes(discoKey);
      const typeHit = !mt || mt.includes(typeKey.slice(0, 4)) || id.includes(typeKey);
      return discoHit && typeHit;
    });
    const resolved = match?.productId || match?.planId || match?.id;
    if (resolved) return String(resolved);
  } catch (error) {
    console.warn("Plustive electricity catalog lookup failed, using slug:", error);
  }

  return slug;
}

export async function verifyPlustiveElectricity(params: {
  productId: string;
  meterNumber: string;
  meterType?: string;
  apiKey?: string;
}): Promise<{
  status: string;
  customerName?: string;
  customerAddress?: string;
  minimumPurchase?: number;
  raw: Record<string, unknown>;
}> {
  const key = params.apiKey || (await requirePlustiveKey());
  const response = await plustiveFetch("/electricity/verify", {
    method: "POST",
    headers: authHeaders(key),
    body: JSON.stringify({
      productId: params.productId,
      planId: params.productId,
      meterNumber: params.meterNumber,
      meterType: params.meterType || "prepaid",
    }),
  });
  const body = await parseJson<Record<string, unknown>>(response);
  if (!response.ok) {
    throw new Error(problemMessage(body, `Plustive meter verify failed (HTTP ${response.status})`));
  }
  const status = String(body.status || "valid").toLowerCase();
  const minKobo = Number(body.minimumPurchase ?? body.minimum_purchase ?? 0);
  return {
    status,
    customerName: String(body.customerName || body.customer_name || body.name || "") || undefined,
    customerAddress: String(body.customerAddress || body.customer_address || body.address || "") || undefined,
    minimumPurchase: minKobo > 0 ? minKobo / 100 : undefined,
    raw: body,
  };
}

export async function buyPlustiveElectricity(params: {
  productId: string;
  meterNumber: string;
  amountNaira: number;
  clientReference: string;
  meterType?: string;
  apiKey?: string;
}): Promise<PlustivePurchaseResponse> {
  const key = params.apiKey || (await requirePlustiveKey());
  const amountKobo = Math.round(params.amountNaira * 100);
  const response = await plustiveFetch("/electricity", {
    method: "POST",
    headers: authHeaders(key),
    body: JSON.stringify({
      productId: params.productId,
      meterNumber: params.meterNumber,
      amountKobo,
      // Some marketing docs use `amount` in kobo — send both for compatibility.
      amount: amountKobo,
      meterType: params.meterType || "prepaid",
      clientReference: params.clientReference,
    }),
  });
  return readPurchase(response, "Plustive electricity failed");
}

export async function listPlustiveCableProducts(apiKey?: string): Promise<PlustiveProduct[]> {
  const key = apiKey || (await requirePlustiveKey());
  const response = await plustiveFetch("/cabletv/products", {
    method: "GET",
    headers: authHeaders(key),
  });
  const body = await parseJson<PlustiveProduct[] | { data?: PlustiveProduct[] }>(response);
  if (!response.ok) {
    throw new Error(problemMessage(body as Record<string, unknown>, "Plustive cable catalog failed"));
  }
  return unwrapPlustiveList(body);
}

export async function listPlustiveEducationProducts(apiKey?: string): Promise<PlustiveProduct[]> {
  const key = apiKey || (await requirePlustiveKey());
  const response = await plustiveFetch("/education/products", {
    method: "GET",
    headers: authHeaders(key),
  });
  if (response.status === 404) {
    const fallback = await plustiveFetch("/plans?service=education", {
      method: "GET",
      headers: authHeaders(key),
    });
    const body = await parseJson<PlustiveProduct[] | { data?: PlustiveProduct[] }>(fallback);
    if (!fallback.ok) {
      throw new Error(problemMessage(body as Record<string, unknown>, "Plustive education catalog failed"));
    }
    return unwrapPlustiveList(body);
  }
  const body = await parseJson<PlustiveProduct[] | { data?: PlustiveProduct[] }>(response);
  if (!response.ok) {
    throw new Error(problemMessage(body as Record<string, unknown>, "Plustive education catalog failed"));
  }
  return unwrapPlustiveList(body);
}

export async function verifyPlustiveCableTv(params: {
  productId: string;
  smartcardNumber: string;
  apiKey?: string;
}): Promise<{
  status: string;
  customerName?: string;
  raw: Record<string, unknown>;
}> {
  const key = params.apiKey || (await requirePlustiveKey());
  const response = await plustiveFetch("/cabletv/verify", {
    method: "POST",
    headers: authHeaders(key),
    body: JSON.stringify({
      productId: params.productId,
      smartcardNumber: params.smartcardNumber,
    }),
  });
  const body = await parseJson<Record<string, unknown>>(response);
  if (!response.ok) {
    throw new Error(problemMessage(body, `Plustive cable verify failed (HTTP ${response.status})`));
  }
  return {
    status: String(body.status || "valid").toLowerCase(),
    customerName: String(body.customerName || body.customer_name || body.name || "") || undefined,
    raw: body,
  };
}

export async function buyPlustiveCableTv(params: {
  productId: string;
  smartcardNumber: string;
  clientReference: string;
  apiKey?: string;
}): Promise<PlustivePurchaseResponse> {
  const key = params.apiKey || (await requirePlustiveKey());
  const response = await plustiveFetch("/cabletv", {
    method: "POST",
    headers: authHeaders(key),
    body: JSON.stringify({
      productId: params.productId,
      smartcardNumber: params.smartcardNumber,
      clientReference: params.clientReference,
    }),
  });
  return readPurchase(response, "Plustive cable TV failed");
}

export async function buyPlustiveEducation(params: {
  productId: string;
  clientReference: string;
  quantity?: number;
  apiKey?: string;
}): Promise<PlustivePurchaseResponse> {
  const key = params.apiKey || (await requirePlustiveKey());
  const response = await plustiveFetch("/education", {
    method: "POST",
    headers: authHeaders(key),
    body: JSON.stringify({
      productId: params.productId,
      planId: params.productId,
      clientReference: params.clientReference,
      quantity: params.quantity || 1,
    }),
  });
  return readPurchase(response, "Plustive education failed");
}

export function mapPlustiveStatus(status: unknown): "success" | "failed" | "pending" {
  const s = String(status || "").toLowerCase();
  if (s === "success" || s === "successful" || s === "completed") return "success";
  if (s === "failed" || s === "failure" || s === "error" || s === "refunded") return "failed";
  return "pending";
}
