import {
  consumeConfirmation,
  requirePendingConfirmation,
} from "../lib/confirmations.js";
import { callEdgeFunction, parsePurchaseOutcome } from "../lib/edge.js";
import { writeAudit } from "../lib/audit.js";
import { checkRateLimit } from "../lib/rate-limit.js";
import { verifyTransactionPinHash } from "../lib/pin.js";
import {
  buildReceiptFromConfirm,
  receiptStructured,
  type ReceiptRow,
} from "../lib/receipt.js";
import { revokeAllForUser } from "../oauth/tokens.js";
import { WIDGETS } from "../widgets/html.js";
import { naira, toolError, toolOk, type ToolContext } from "./context.js";

/** Only these edge functions may be invoked from confirmations. */
const ALLOWED_EDGE_FUNCTIONS = new Set([
  "purchase-airtime",
  "purchase-data",
  "purchase-electricity",
  "purchase-cable-tv",
  "purchase-education",
  "transfer-funds",
]);

export async function confirmTransaction(
  ctx: ToolContext,
  args: { confirmation_id: string; pin_hash: string },
) {
  const limited = checkRateLimit(
    `confirm_transaction:${ctx.session.userId}:${ctx.ip || "na"}`,
    15,
    60_000,
  );
  if (!limited.allowed) {
    return toolError(`Rate limit exceeded. Retry in ${limited.retryAfterSec}s.`);
  }

  const confirmationId = String(args.confirmation_id || "").trim();
  if (!confirmationId) return toolError("confirmation_id is required");

  // Never accept raw PIN digits through the ChatGPT tool path.
  if (
    typeof (args as { pin?: unknown }).pin === "string" ||
    typeof (args as { transaction_pin?: unknown }).transaction_pin === "string"
  ) {
    return toolError(
      "For your security, enter your PIN only in the NetPay confirmation modal. Raw PINs are not accepted.",
      { requires_pin_modal: true, confirmation_id: confirmationId },
    );
  }

  // Validate confirmation is still pending BEFORE PIN check / consume,
  // so a wrong PIN does not burn the confirmation.
  let pending;
  try {
    pending = await requirePendingConfirmation(confirmationId, ctx.session.userId);
  } catch (error) {
    await writeAudit({
      userId: ctx.session.userId,
      tool: "confirm_transaction",
      ip: ctx.ip,
      outcome: "error",
      reference: confirmationId,
      meta: { error: error instanceof Error ? error.message : String(error) },
    });
    return toolError(error instanceof Error ? error.message : "Invalid confirmation");
  }

  const pinResult = await verifyTransactionPinHash(ctx.session.userId, args.pin_hash);
  if (!pinResult.ok) {
    await writeAudit({
      userId: ctx.session.userId,
      tool: "confirm_transaction",
      ip: ctx.ip,
      outcome: "pin_failed",
      reference: confirmationId,
      meta: {
        code: pinResult.code,
        attemptsRemaining: pinResult.attemptsRemaining,
      },
    });
    return toolError(pinResult.error, {
      code: pinResult.code,
      requires_pin: true,
      requires_pin_modal: true,
      confirmation_id: confirmationId,
      attempts_remaining: pinResult.attemptsRemaining,
      attempts_used: pinResult.attemptsUsed,
    });
  }

  let confirmation;
  try {
    confirmation = await consumeConfirmation(confirmationId, ctx.session.userId);
  } catch (error) {
    await writeAudit({
      userId: ctx.session.userId,
      tool: "confirm_transaction",
      ip: ctx.ip,
      outcome: "error",
      reference: confirmationId,
      meta: { error: error instanceof Error ? error.message : String(error) },
    });
    return toolError(error instanceof Error ? error.message : "Invalid confirmation");
  }

  // Prefer freshly consumed row; fall back to pending snapshot if needed
  const payload = confirmation.payload || pending.payload || {};
  const edge = String(payload.edge || "");
  const body = (payload.body && typeof payload.body === "object"
    ? { ...(payload.body as Record<string, unknown>) }
    : {}) as Record<string, unknown>;

  if (!edge || !ALLOWED_EDGE_FUNCTIONS.has(edge)) {
    return toolError("Confirmation targets an unsupported operation");
  }

  // Idempotency: confirmation UUID
  body.idempotency_key = confirmation.id;
  // Never trust client vending overrides / never forward PIN to edge
  delete body.vending_provider;
  delete body.pin;
  delete body.transaction_pin;

  const result = await callEdgeFunction(edge, ctx.session.accessToken, {
    method: "POST",
    body,
  });

  const outcome = parsePurchaseOutcome(result.data);
  const display = (payload.display || {}) as Record<string, unknown>;
  const amount = Number(display.amount ?? body.amount ?? 0);
  const title = String(display.title || confirmation.tool || "Transaction");

  const summaryRows: ReceiptRow[] = Array.isArray(display.summary_rows)
    ? (display.summary_rows as ReceiptRow[])
    : Object.entries(display)
        .filter(([key, value]) => {
          if (["title", "amount", "summary_rows", "fee", "total"].includes(key)) return false;
          return value != null && String(value).trim().length > 0;
        })
        .map(([key, value]) => ({
          label: key.replace(/_/g, " ").replace(/\b\w/g, (c) => c.toUpperCase()),
          value: String(value),
        }));
  if (amount > 0 && !summaryRows.some((row) => /amount/i.test(row.label))) {
    summaryRows.push({ label: "Amount", value: naira(amount) });
  }

  if (!result.ok && outcome.status !== "SUCCESS" && outcome.status !== "PENDING") {
    const err =
      (result.data as { error?: string; message?: string })?.error ||
      (result.data as { message?: string })?.message ||
      outcome.message ||
      "Transaction failed";
    const failedReceipt = buildReceiptFromConfirm({
      title,
      amount,
      status: "FAILED",
      reference: outcome.reference || confirmation.id,
      provider_reference: outcome.provider_reference,
      message: err,
      datetime: new Date().toISOString(),
      summary_rows: summaryRows,
    });
    const receiptPayload = receiptStructured(failedReceipt);
    await writeAudit({
      userId: ctx.session.userId,
      tool: "confirm_transaction",
      ip: ctx.ip,
      outcome: "failed",
      reference: confirmation.id,
      meta: { edge, status: result.status },
    });
    return toolOk({
      text: `${title} failed: ${err}`,
      structured: {
        ...receiptPayload,
        success: false,
        status: "FAILED",
        title,
        amount,
        reference: outcome.reference,
        provider_reference: outcome.provider_reference,
        message: err,
        confirmation_id: confirmation.id,
        datetime: new Date().toISOString(),
        amount_display: naira(amount),
        receipt: {
          ...receiptPayload,
          title,
          status: "FAILED",
          amount_display: failedReceipt.amountText,
        },
      },
      widgetUri: WIDGETS.receipt.uri,
    });
  }

  const status =
    outcome.status === "FAILED" && result.ok
      ? "PENDING"
      : result.ok
        ? outcome.status
        : outcome.status === "SUCCESS"
          ? "SUCCESS"
          : outcome.status;

  const receipt = buildReceiptFromConfirm({
    title,
    amount,
    status,
    reference: outcome.reference || confirmation.id,
    provider_reference: outcome.provider_reference,
    message: outcome.message,
    datetime: new Date().toISOString(),
    summary_rows: summaryRows,
  });
  const receiptPayload = receiptStructured(receipt);

  await writeAudit({
    userId: ctx.session.userId,
    tool: "confirm_transaction",
    ip: ctx.ip,
    outcome: status.toLowerCase(),
    reference: outcome.reference || confirmation.id,
    meta: { edge, pin_verified: true },
  });

  return toolOk({
    text: `${title}: ${status}${outcome.reference ? ` (ref ${outcome.reference})` : ""}`,
    structured: {
      ...receiptPayload,
      success: status !== "FAILED",
      status,
      title,
      amount,
      reference: outcome.reference,
      provider_reference: outcome.provider_reference,
      message: outcome.message,
      confirmation_id: confirmation.id,
      datetime: new Date().toISOString(),
      amount_display: naira(amount),
      receipt: {
        ...receiptPayload,
        title,
        status,
        amount_display: receipt.amountText,
      },
      // Do not echo full edge payload (may contain PII / internal fields)
    },
    widgetUri: WIDGETS.receipt.uri,
  });
}

export async function disconnectAccount(ctx: ToolContext) {
  await revokeAllForUser(ctx.session.userId);
  await writeAudit({
    userId: ctx.session.userId,
    tool: "disconnect_account",
    ip: ctx.ip,
    outcome: "revoked",
  });
  return toolOk({
    text: "NetPay disconnected from ChatGPT. Tokens revoked.",
    structured: { connected: false, revoked: true },
    widgetUri: WIDGETS.connect.uri,
  });
}
