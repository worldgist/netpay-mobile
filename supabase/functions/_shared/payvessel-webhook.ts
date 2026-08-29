/** PayVessel webhook helpers — https://docs.payvessel.com/api-reference/webhook/verifying-webhooks */

export const PAYVESSEL_TRUSTED_IPS = ["3.255.23.38", "162.246.254.36"];

export const PAYVESSEL_CREDIT_EVENTS = new Set([
  "reserved_account.credit",
  "transaction.success",
  "transaction.completed",
  "payment.success",
  "credit",
  "success",
]);

export const PAYVESSEL_IGNORE_EVENTS = new Set([
  "transaction.pending",
  "transaction.failed",
  "transfer.pending",
  "transfer.failed",
  "transfer.reversed",
]);

export function getPayvesselWebhookUrl(): string {
  const base = (Deno.env.get("SUPABASE_URL") || "").replace(/\/$/, "");
  return base ? `${base}/functions/v1/payvessel-webhook` : "";
}

export function getClientIp(req: Request): string | null {
  const forwarded = req.headers.get("x-forwarded-for") || req.headers.get("x-real-ip");
  if (forwarded) {
    return forwarded.split(",")[0]?.trim() || null;
  }
  return req.headers.get("cf-connecting-ip");
}

export function isTrustedPayvesselIp(ip: string | null): boolean {
  if (!ip) return false;
  return PAYVESSEL_TRUSTED_IPS.includes(ip);
}

export function getPayvesselSignature(req: Request): string | null {
  return (
    req.headers.get("http_payvessel_http_signature") ||
    req.headers.get("HTTP_PAYVESSEL_HTTP_SIGNATURE") ||
    req.headers.get("payvessel-http-signature") ||
    req.headers.get("Payvessel-Http-Signature")
  );
}

export async function computePayvesselSignature(secret: string, payload: string): Promise<string> {
  const key = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(secret),
    { name: "HMAC", hash: "SHA-512" },
    false,
    ["sign"],
  );

  const signature = await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(payload));
  return Array.from(new Uint8Array(signature))
    .map((byte) => byte.toString(16).padStart(2, "0"))
    .join("");
}

export async function verifyPayvesselWebhook(
  req: Request,
  rawBody: string,
  secret: string | undefined,
): Promise<{ ok: true } | { ok: false; status: number; message: string }> {
  const skipIpCheck = Deno.env.get("PAYVESSEL_WEBHOOK_SKIP_IP_CHECK") === "true";

  if (!skipIpCheck) {
    const clientIp = getClientIp(req);
    if (clientIp && !isTrustedPayvesselIp(clientIp)) {
      console.warn("PayVessel webhook from untrusted IP:", clientIp);
      return { ok: false, status: 403, message: "Untrusted source IP" };
    }
  }

  if (!secret) {
    console.warn("PAYVESSEL_SECRET_KEY not configured — skipping signature verification");
    return { ok: true };
  }

  const signature = getPayvesselSignature(req);
  if (!signature) {
    console.warn("PayVessel webhook missing signature header");
    return { ok: false, status: 401, message: "Missing webhook signature" };
  }

  const expected = await computePayvesselSignature(secret, rawBody);
  if (signature.toLowerCase() !== expected.toLowerCase()) {
    console.error("PayVessel webhook signature mismatch");
    return { ok: false, status: 401, message: "Invalid webhook signature" };
  }

  return { ok: true };
}

export function shouldProcessPayvesselEvent(payload: Record<string, unknown>): boolean {
  const event = String(payload.event || payload.event_type || payload.type || "").toLowerCase().trim();
  const code = payload.code;

  if (event && PAYVESSEL_IGNORE_EVENTS.has(event)) {
    return false;
  }

  if (code && code !== "00" && code !== 0 && code !== "0") {
    return false;
  }

  if (event && PAYVESSEL_CREDIT_EVENTS.has(event)) {
    return true;
  }

  // Legacy payloads without event — process when payment fields exist
  if (
    payload.virtualAccount ||
    payload.reservedAccount ||
    payload.reserved_account ||
    payload.order ||
    payload.transaction ||
    payload.account_number ||
    payload.amount
  ) {
    return true;
  }

  return !event;
}

export function extractPayvesselPaymentFields(payload: Record<string, unknown>) {
  const data = (payload.data && typeof payload.data === "object"
    ? payload.data
    : payload) as Record<string, unknown>;

  const reservedAccount = (payload.reservedAccount ||
    payload.reserved_account ||
    data.reservedAccount ||
    data.reserved_account) as Record<string, unknown> | undefined;
  const virtualAccount = (payload.virtualAccount ||
    payload.virtual_account ||
    data.virtualAccount ||
    data.virtual_account) as Record<string, unknown> | undefined;
  const order = (payload.order || data.order) as Record<string, unknown> | undefined;
  const transaction = (payload.transaction || data.transaction) as Record<string, unknown> | undefined;
  const sender = (payload.sender || data.sender) as Record<string, unknown> | undefined;

  const account_number =
    virtualAccount?.virtualAccountNumber ||
    virtualAccount?.account_number ||
    virtualAccount?.accountNumber ||
    reservedAccount?.accountNumber ||
    reservedAccount?.account_number ||
    reservedAccount?.virtualAccountNumber ||
    data.account_number ||
    data.accountNumber ||
    data.account ||
    data.virtual_account_number;

  const amount =
    order?.amount ||
    order?.settlement_amount ||
    data.amount ||
    data.credit_amount ||
    data.transaction_amount;

  const reference =
    transaction?.reference ||
    data.reference ||
    data.transaction_reference ||
    data.ref ||
    data.trackingReference ||
    data.tracking_reference;

  const sender_name =
    sender?.senderName ||
    data.sender_name ||
    data.senderName ||
    data.sender ||
    data.customer_name;

  const sender_account_number =
    sender?.senderAccountNumber ||
    data.sender_account_number ||
    data.senderAccountNumber ||
    data.sender_account;

  const sender_bank =
    sender?.senderBankName ||
    data.sender_bank ||
    data.senderBank ||
    data.bank_name ||
    data.bank;

  return {
    event: String(payload.event || payload.event_type || payload.type || ""),
    account_number: account_number ? String(account_number).trim() : null,
    amount,
    reference: reference ? String(reference) : null,
    transaction_reference: reference ? String(reference) : null,
    sender_name: sender_name ? String(sender_name) : null,
    sender_account_number: sender_account_number ? String(sender_account_number) : null,
    sender_bank: sender_bank ? String(sender_bank) : null,
  };
}
