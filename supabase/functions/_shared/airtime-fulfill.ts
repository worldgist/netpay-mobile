import { getEBillsToken, purchaseEBillsAirtime, requeryEBillsOrder } from "./ebills-api.ts";
import { payFlutterwaveAirtimeBill } from "./flutterwave-bills.ts";
import {
  resolveMobilenigAirtimeServiceId,
  searchMobilenigWalletHistory,
  toMobilenigTransId,
} from "./mobilenig-api.ts";
import { classifyHttpFailure, smeplugNetworkId, type ProviderOutcome } from "./airtime-flow.ts";
import { resolveMobilenigSecretKey, resolveSmeplugSecretKey } from "./vendor-secrets.ts";

export type AirtimeJob = {
  id: string;
  transaction_id: string;
  user_id: string;
  reference: string;
  provider: string;
  phone_number: string;
  network: string;
  service_id: string;
  amount: number;
  retry_count: number;
  max_retries: number;
  provider_reference: string | null;
  payload: Record<string, unknown>;
};

export type FulfillmentResult = {
  outcome: ProviderOutcome;
  providerReference?: string;
  response?: unknown;
  error?: string;
};

function payloadString(payload: Record<string, unknown>, key: string): string {
  const value = payload[key];
  return typeof value === "string" ? value : "";
}

async function withTimeout<T>(work: Promise<T>, timeoutMs: number): Promise<T> {
  let timer: number | undefined;
  const timeout = new Promise<never>((_, reject) => {
    timer = setTimeout(() => {
      const error = new Error("provider_timeout");
      error.name = "TimeoutError";
      reject(error);
    }, timeoutMs);
  });
  try {
    return await Promise.race([work, timeout]);
  } finally {
    if (timer !== undefined) clearTimeout(timer);
  }
}

function isTimeout(error: unknown): boolean {
  const name = error instanceof Error ? error.name : "";
  const message = error instanceof Error ? error.message : String(error ?? "");
  return name === "TimeoutError" || /timeout|timed out|abort/i.test(message);
}

export async function fulfillAirtimeJob(job: AirtimeJob, timeoutMs: number): Promise<FulfillmentResult> {
  if (job.payload.demo === true) {
    return { outcome: "success", providerReference: `${job.reference}-DEMO`, response: { demo: true } };
  }

  try {
    return await withTimeout(dispatchProvider(job), timeoutMs);
  } catch (error) {
    if (isTimeout(error)) {
      return verifyAfterTimeout(job);
    }
    const message = error instanceof Error ? error.message : "Airtime provider request failed";
    if (/insufficient|invalid phone|invalid network|validation/i.test(message)) {
      return { outcome: "failed", error: message };
    }
    return { outcome: "retry", error: message };
  }
}

async function dispatchProvider(job: AirtimeJob): Promise<FulfillmentResult> {
  const provider = job.provider;
  if (provider === "ebills") return fulfillEbills(job);
  if (provider === "mobilenig") return fulfillMobilenig(job);
  if (provider === "flutterwave") return fulfillFlutterwave(job);
  return fulfillSmeplug(job);
}

function smeplugMessage(parsed: Record<string, unknown> | string): string {
  if (typeof parsed !== "object" || parsed === null) return typeof parsed === "string" ? parsed : "";
  const nested = parsed.data && typeof parsed.data === "object" ? parsed.data as Record<string, unknown> : {};
  return String(parsed.message || parsed.error || nested.message || nested.error || "");
}

async function fulfillSmeplug(job: AirtimeJob): Promise<FulfillmentResult> {
  const secret = (await resolveSmeplugSecretKey()) || "";
  if (!secret) return { outcome: "retry", error: "Airtime provider is not configured" };
  const networkId = smeplugNetworkId(job.network);
  if (!networkId) return { outcome: "failed", error: "Invalid network" };

  const response = await fetch("https://smeplug.ng/api/v1/airtime/purchase", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${secret}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      network_id: networkId,
      phone: job.phone_number,
      amount: Math.round(job.amount),
      customer_reference: job.reference,
    }),
  });
  const text = await response.text();
  let parsed: Record<string, unknown> | string = text;
  try {
    parsed = JSON.parse(text) as Record<string, unknown>;
  } catch {
    parsed = text;
  }
  const providerMessage = smeplugMessage(parsed);
  const walletLow = /insufficient|wallet|balance/i.test(providerMessage);
  if (!response.ok) {
    return {
      outcome: classifyHttpFailure(response.status, false),
      response: parsed,
      error: walletLow
        ? "Airtime is temporarily unavailable. Please try again later."
        : providerMessage || "Airtime provider could not complete this purchase",
    };
  }
  if (typeof parsed !== "object") {
    return { outcome: "uncertain", response: parsed, error: "Unrecognized provider response" };
  }
  const nested = parsed.data && typeof parsed.data === "object" ? parsed.data as Record<string, unknown> : {};
  const topStatus = String(parsed.status ?? "").toLowerCase();
  const nestedStatus = String(nested.status ?? "").toLowerCase();
  const success = parsed.status === true || parsed.success === true || parsed.code === 200 || parsed.code === "200" ||
    ["success", "successful", "completed", "delivered"].includes(topStatus) ||
    nested.success === true || ["success", "successful", "completed", "delivered"].includes(nestedStatus);
  if (success) return { outcome: "success", providerReference: job.reference, response: parsed };
  const failed = parsed.success === false || ["failed", "failure", "error"].includes(topStatus) ||
    ["failed", "failure", "error"].includes(nestedStatus);
  if (failed) {
    return {
      outcome: "failed",
      response: parsed,
      error: walletLow
        ? "Airtime is temporarily unavailable. Please try again later."
        : providerMessage || "Airtime provider rejected this purchase",
    };
  }
  return { outcome: "uncertain", response: parsed, error: "Unrecognized provider response" };
}

async function fulfillEbills(job: AirtimeJob): Promise<FulfillmentResult> {
  const requestId = job.provider_reference || payloadString(job.payload, "provider_request_id");
  if (!requestId) return { outcome: "uncertain", error: "Missing provider request id" };
  const token = await getEBillsToken();
  const serviceId = payloadString(job.payload, "service_id") || job.service_id;
  try {
    const result = await purchaseEBillsAirtime(token, requestId, job.phone_number, serviceId, job.amount);
    const accepted = `${result.data?.status || ""} ${result.message || ""}`.toLowerCase();
    const acceptedOrder = /process|complete|success|deliver|pending/.test(accepted);
    if (/refund/.test(accepted) || (/fail/.test(accepted) && !acceptedOrder)) {
      return { outcome: "failed", providerReference: requestId, response: result, error: result.message };
    }
    if (acceptedOrder) {
      return { outcome: "success", providerReference: requestId, response: result };
    }
    return { outcome: "uncertain", providerReference: requestId, response: result, error: result.message };
  } catch (error) {
    const message = error instanceof Error ? error.message : "eBills airtime failed";
    if (/duplicate/i.test(message)) {
      return verifyEbills(job, token, requestId);
    }
    if (/invalid|not authorized|missing/i.test(message)) {
      return { outcome: "failed", providerReference: requestId, error: message };
    }
    return { outcome: "retry", providerReference: requestId, error: message };
  }
}

async function verifyEbills(job: AirtimeJob, token: string, requestId: string): Promise<FulfillmentResult> {
  try {
    const result = await requeryEBillsOrder(token, requestId);
    const status = String(result.data?.status || "").toLowerCase();
    if (/success|complete|delivered/.test(status)) {
      return { outcome: "success", providerReference: requestId, response: result };
    }
    if (/fail|refund/.test(status)) {
      return { outcome: "failed", providerReference: requestId, response: result, error: result.message };
    }
    return { outcome: "uncertain", providerReference: requestId, response: result };
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unable to verify airtime";
    if (/not found/i.test(message) && job.retry_count < job.max_retries) {
      return { outcome: "retry", providerReference: requestId, error: message };
    }
    return { outcome: "uncertain", providerReference: requestId, error: message };
  }
}

async function fulfillMobilenig(job: AirtimeJob): Promise<FulfillmentResult> {
  const secret = (await resolveMobilenigSecretKey()) || "";
  if (!secret) return { outcome: "retry", error: "Airtime provider is not configured" };
  const transId = toMobilenigTransId(
    payloadString(job.payload, "provider_trans_id") || job.provider_reference || job.reference,
  );
  const serviceId = resolveMobilenigAirtimeServiceId(
    job.network,
    payloadString(job.payload, "item_code") || job.service_id,
  );
  const response = await fetch("https://enterprise.mobilenig.com/api/v2/services/", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${secret}`,
    },
    body: JSON.stringify({
      service_id: serviceId,
      service_type: "STANDARD",
      beneficiary: job.phone_number.replace(/[^0-9]/g, ""),
      trans_id: transId,
      amount: String(Math.round(job.amount)),
    }),
  });
  const text = await response.text();
  let parsed: Record<string, unknown> = {};
  try {
    parsed = JSON.parse(text) as Record<string, unknown>;
  } catch {
    return { outcome: classifyHttpFailure(response.status || 502, false), error: "Invalid provider response" };
  }
  const details = parsed.details && typeof parsed.details === "object"
    ? parsed.details as Record<string, unknown>
    : {};
  const status = String(details.status || "").toLowerCase();
  const acceptedByProvider = parsed.statusCode === "200" && String(parsed.message || "").toLowerCase() === "success";
  const approved = acceptedByProvider &&
    (status === "approved" || status === "success" || status === "completed" || status === "");
  // MobileNig often returns pending/processing after accepting the order — treat as delivered success.
  const providerPending = acceptedByProvider &&
    (status === "pending" || status === "processing" || status === "queued" || status === "submitted");
  if (approved || providerPending) {
    return { outcome: "success", providerReference: String(details.trans_id || transId), response: parsed };
  }
  if (!response.ok) {
    return { outcome: classifyHttpFailure(response.status, false), providerReference: String(transId), response: parsed };
  }
  const detailText = String(
    (typeof details.details === "string" ? details.details : "") ||
      details.message ||
      parsed.message ||
      "Airtime provider rejected this purchase",
  );
  const unavailable = String(parsed.statusCode || "") === "EXC006" || /unavailable/i.test(detailText);
  return {
    outcome: "failed",
    providerReference: String(transId),
    response: parsed,
    error: unavailable
      ? `${job.network} airtime is temporarily unavailable on MobileNig. Trying another provider if available.`
      : detailText,
  };
}

async function fulfillFlutterwave(job: AirtimeJob): Promise<FulfillmentResult> {
  const itemCode = payloadString(job.payload, "item_code");
  const [billerCode, parsedItem] = itemCode.includes("|") ? itemCode.split("|") : ["", itemCode];
  const result = await payFlutterwaveAirtimeBill({
    customerId: job.phone_number,
    amount: Math.round(job.amount),
    reference: job.reference,
    network: job.network,
    billerCode: billerCode || undefined,
    itemCode: parsedItem || undefined,
  });
  if (result.success || result.status === "success") {
    return { outcome: "success", providerReference: result.reference || job.reference, response: result.vendorResponse };
  }
  if (result.status === "pending") {
    return { outcome: "uncertain", providerReference: job.reference, response: result.vendorResponse, error: result.error };
  }
  return { outcome: "failed", providerReference: job.reference, response: result.vendorResponse, error: result.error };
}

async function verifyAfterTimeout(job: AirtimeJob): Promise<FulfillmentResult> {
  if (job.provider === "ebills") {
    try {
      const token = await getEBillsToken();
      const requestId = job.provider_reference || payloadString(job.payload, "provider_request_id");
      if (!requestId) return { outcome: "uncertain", error: "provider_timeout" };
      return verifyEbills(job, token, requestId);
    } catch (error) {
      return { outcome: "uncertain", error: error instanceof Error ? error.message : "provider_timeout" };
    }
  }
  if (job.provider === "mobilenig") {
    const transId = payloadString(job.payload, "provider_trans_id");
    if (!transId) return { outcome: "uncertain", error: "provider_timeout" };
    try {
      const history = await searchMobilenigWalletHistory(transId);
      if (history.length > 0) {
        return { outcome: "uncertain", providerReference: transId, response: history, error: "provider_timeout" };
      }
      return { outcome: job.retry_count < job.max_retries ? "retry" : "uncertain", providerReference: transId, error: "provider_timeout" };
    } catch {
      return { outcome: "uncertain", providerReference: transId, error: "provider_timeout" };
    }
  }
  return { outcome: "uncertain", error: "provider_timeout" };
}
