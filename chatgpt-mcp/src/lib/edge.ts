import { env } from "../env.js";

export type EdgeResult<T = unknown> = {
  ok: boolean;
  status: number;
  data: T;
  rawText: string;
};

export async function callEdgeFunction<T = unknown>(
  name: string,
  accessToken: string,
  options: {
    method?: "GET" | "POST";
    body?: unknown;
    query?: Record<string, string | undefined>;
  } = {},
): Promise<EdgeResult<T>> {
  const base = `${env.supabaseUrl()}/functions/v1/${name}`;
  const url = new URL(base);
  if (options.query) {
    for (const [key, value] of Object.entries(options.query)) {
      if (value != null && value !== "") url.searchParams.set(key, value);
    }
  }

  const response = await fetch(url.toString(), {
    method: options.method || (options.body !== undefined ? "POST" : "GET"),
    headers: {
      Authorization: `Bearer ${accessToken}`,
      apikey: env.supabaseAnonKey(),
      "Content-Type": "application/json",
    },
    body: options.body !== undefined ? JSON.stringify(options.body) : undefined,
  });

  const rawText = await response.text();
  let data: T;
  try {
    data = JSON.parse(rawText) as T;
  } catch {
    data = { message: rawText } as T;
  }

  return {
    ok: response.ok,
    status: response.status,
    data,
    rawText,
  };
}

export function parsePurchaseOutcome(payload: unknown): {
  status: "SUCCESS" | "PENDING" | "FAILED";
  reference?: string;
  provider_reference?: string;
  message?: string;
} {
  const obj = (payload && typeof payload === "object" ? payload : {}) as Record<string, unknown>;
  const nested =
    obj.data && typeof obj.data === "object" ? (obj.data as Record<string, unknown>) : obj;
  const statusRaw = String(
    nested.status || nested.transaction_status || obj.status || "PENDING",
  ).toUpperCase();

  let status: "SUCCESS" | "PENDING" | "FAILED" = "PENDING";
  if (["SUCCESS", "SUCCESSFUL", "COMPLETED", "COMPLETE", "OK"].includes(statusRaw)) {
    status = "SUCCESS";
  } else if (["FAILED", "FAILURE", "ERROR", "DECLINED"].includes(statusRaw)) {
    status = "FAILED";
  }

  return {
    status,
    reference: String(nested.reference || nested.transaction_id || nested.id || obj.reference || "") || undefined,
    provider_reference: String(
      nested.provider_reference || nested.providerReference || nested.token || "",
    ) || undefined,
    message: String(nested.message || obj.message || nested.error || "") || undefined,
  };
}
