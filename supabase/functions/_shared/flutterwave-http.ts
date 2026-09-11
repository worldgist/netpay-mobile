import { fetchWithRetry } from "./http-client.ts";
import type { FlutterwaveChargeData } from "./flutterwave-references.ts";

export const FLUTTERWAVE_API_BASE = "https://api.flutterwave.com/v3";

export type FlutterwaveApiPayload = Record<string, unknown> & {
  status?: string;
  message?: string;
  error?: string;
  data?: unknown;
};

export async function flutterwaveFetch(
  secretKey: string,
  path: string,
  init: RequestInit = {},
): Promise<Response> {
  const url = path.startsWith("http") ? path : `${FLUTTERWAVE_API_BASE}${path}`;
  return fetchWithRetry(url, {
    ...init,
    headers: {
      Authorization: `Bearer ${secretKey}`,
      Accept: "application/json",
      "Content-Type": "application/json",
      ...(init.headers || {}),
    },
  }, {
    timeoutMs: 25_000,
    maxAttempts: 3,
    initialDelayMs: 600,
    maxDelayMs: 6_000,
  });
}

export async function flutterwaveJson<T extends FlutterwaveApiPayload>(
  secretKey: string,
  path: string,
  init?: RequestInit,
): Promise<T> {
  const response = await flutterwaveFetch(secretKey, path, init);
  const text = await response.text();
  let payload: T;
  try {
    payload = (text ? JSON.parse(text) : {}) as T;
  } catch {
    throw new Error(`Invalid JSON from Flutterwave (${response.status})`);
  }

  if (!response.ok || payload.status !== "success") {
    const message =
      (typeof payload.message === "string" && payload.message) ||
      (typeof payload.error === "string" && payload.error) ||
      `Flutterwave API error (${response.status})`;
    throw new Error(message);
  }

  return payload;
}

/** Confirm payment status with Flutterwave before crediting a wallet. */
export async function verifyFlutterwaveTransactionWithProvider(
  secretKey: string,
  charge: FlutterwaveChargeData,
): Promise<FlutterwaveChargeData | null> {
  const txRef = String(charge.tx_ref || charge.txRef || "").trim();
  const transactionId = charge.id != null ? String(charge.id) : "";

  try {
    if (txRef) {
      const payload = await flutterwaveJson<FlutterwaveApiPayload>(
        secretKey,
        `/transactions/verify_by_reference?tx_ref=${encodeURIComponent(txRef)}`,
        { method: "GET" },
      );
      if (payload.data && typeof payload.data === "object") {
        return payload.data as FlutterwaveChargeData;
      }
    }

    if (transactionId) {
      const payload = await flutterwaveJson<FlutterwaveApiPayload>(
        secretKey,
        `/transactions/${encodeURIComponent(transactionId)}/verify`,
        { method: "GET" },
      );
      if (payload.data && typeof payload.data === "object") {
        return payload.data as FlutterwaveChargeData;
      }
    }
  } catch (error) {
    console.error("Flutterwave provider verification failed:", error);
    return null;
  }

  return null;
}
