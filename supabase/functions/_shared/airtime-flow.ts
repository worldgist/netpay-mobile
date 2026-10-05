export const AIRTIME_STATUSES = [
  "pending",
  "processing",
  "success",
  "failed",
  "refunded",
  "requires_review",
] as const;

export type AirtimeStatus = (typeof AIRTIME_STATUSES)[number];

const TRANSITIONS: Record<AirtimeStatus, AirtimeStatus[]> = {
  pending: ["processing", "failed", "refunded", "requires_review"],
  processing: ["success", "failed", "refunded", "requires_review"],
  requires_review: ["success", "failed", "refunded"],
  failed: ["refunded"],
  success: [],
  refunded: [],
};

export function canTransitionAirtimeStatus(from: string, to: string): boolean {
  const current = from.trim().toLowerCase() as AirtimeStatus;
  const next = to.trim().toLowerCase() as AirtimeStatus;
  if (current === next) return true;
  return (TRANSITIONS[current] || []).includes(next);
}

export function publicAirtimeStatus(status: string): string {
  const normalized = status.trim().toLowerCase();
  if (normalized === "pending" || normalized === "processing" || normalized === "queued") {
    return "PROCESSING";
  }
  if (normalized === "success" || normalized === "completed") return "SUCCESS";
  if (normalized === "refunded") return "REFUNDED";
  if (normalized === "requires_review" || normalized === "review") return "REQUIRES_REVIEW";
  if (normalized === "failed") return "FAILED";
  return normalized.toUpperCase();
}

export function airtimeBackoffMs(retryCount: number): number {
  const attempt = Math.max(0, retryCount);
  return Math.min(5 * 60 * 1000, 5000 * (2 ** attempt));
}

export function normalizeAirtimePhone(value: unknown): string {
  if (typeof value !== "string") return "";
  let normalized = value.trim().replace(/\s+/g, "");
  if (normalized.startsWith("+234")) normalized = `0${normalized.slice(4)}`;
  else if (normalized.startsWith("234") && normalized.length === 13) normalized = `0${normalized.slice(3)}`;
  normalized = normalized.replace(/[^0-9]/g, "");
  if (/^[789]\d{9}$/.test(normalized)) normalized = `0${normalized}`;
  return normalized;
}

export function isValidAirtimePhone(phone: string): boolean {
  return /^0\d{10}$/.test(phone);
}

export function parseAirtimeAmount(value: unknown): number | null {
  const amount = typeof value === "number" ? value : Number(String(value ?? "").replace(/,/g, ""));
  if (!Number.isFinite(amount) || amount <= 0) return null;
  const rounded = Math.round(amount * 100) / 100;
  if (rounded < 50 || rounded > 50000) return null;
  return rounded;
}

const NETWORKS: Record<string, string> = {
  "1": "MTN",
  "2": "Airtel",
  "3": "9Mobile",
  "4": "Glo",
  MTN: "MTN",
  AIRTEL: "Airtel",
  GLO: "Glo",
  GLOBACOM: "Glo",
  "9MOBILE": "9Mobile",
  "9 MOBILE": "9Mobile",
  ETISALAT: "9Mobile",
  T2: "9Mobile",
};

export function resolveAirtimeNetwork(networkId: unknown, networkName: unknown): string | null {
  const candidates = [networkName, networkId];
  for (const candidate of candidates) {
    const raw = String(candidate ?? "").trim();
    if (!raw) continue;
    const key = raw.toUpperCase().replace(/\s+/g, " ");
    if (NETWORKS[key]) return NETWORKS[key];
    const compact = key.replace(/[^A-Z0-9]/g, "");
    if (NETWORKS[compact]) return NETWORKS[compact];
  }
  return null;
}

export function smeplugNetworkId(network: string): number | null {
  const map: Record<string, number> = { MTN: 1, Airtel: 2, "9Mobile": 3, Glo: 4 };
  return map[network] ?? null;
}

export function sanitizeIdempotencyKey(value: unknown): string {
  const trimmed = typeof value === "string" ? value.trim() : "";
  if (trimmed && trimmed.length <= 80 && /^[A-Za-z0-9._-]+$/.test(trimmed)) return trimmed;
  return "";
}

export function readAirtimeLimits(env: { get(name: string): string | undefined }) {
  const concurrency = Number(env.get("AIRTIME_MAX_CONCURRENCY") || "8");
  const timeout = Number(env.get("AIRTIME_REQUEST_TIMEOUT") || "25000");
  const retries = Number(env.get("AIRTIME_MAX_RETRIES") || "4");
  return {
    maxConcurrency: Number.isFinite(concurrency) ? Math.min(Math.max(concurrency, 1), 50) : 8,
    requestTimeoutMs: Number.isFinite(timeout) ? Math.min(Math.max(timeout, 3000), 60000) : 25000,
    maxRetries: Number.isFinite(retries) ? Math.min(Math.max(retries, 1), 8) : 4,
  };
}

export type ProviderOutcome = "success" | "failed" | "retry" | "uncertain";

export function classifyHttpFailure(status: number, timedOut: boolean): ProviderOutcome {
  if (timedOut) return "uncertain";
  if (status === 408 || status === 429 || status >= 500) return "retry";
  if (status >= 400) return "failed";
  return "uncertain";
}
