import { consumeConfirmation } from "../lib/confirmations.js";
import { callEdgeFunction, parsePurchaseOutcome } from "../lib/edge.js";
import { writeAudit } from "../lib/audit.js";
import { checkRateLimit } from "../lib/rate-limit.js";
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
  args: { confirmation_id: string },
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

  const payload = confirmation.payload || {};
  const edge = String(payload.edge || "");
  const body = (payload.body && typeof payload.body === "object"
    ? { ...(payload.body as Record<string, unknown>) }
    : {}) as Record<string, unknown>;

  if (!edge || !ALLOWED_EDGE_FUNCTIONS.has(edge)) {
    return toolError("Confirmation targets an unsupported operation");
  }

  // Idempotency: confirmation UUID
  body.idempotency_key = confirmation.id;
  // Never trust client vending overrides
  delete body.vending_provider;

  const result = await callEdgeFunction(edge, ctx.session.accessToken, {
    method: "POST",
    body,
  });

  const outcome = parsePurchaseOutcome(result.data);
  const display = (payload.display || {}) as Record<string, unknown>;
  const amount = Number(display.amount ?? body.amount ?? 0);
  const title = String(display.title || confirmation.tool || "Transaction");

  if (!result.ok && outcome.status !== "SUCCESS" && outcome.status !== "PENDING") {
    const err =
      (result.data as { error?: string; message?: string })?.error ||
      (result.data as { message?: string })?.message ||
      outcome.message ||
      "Transaction failed";
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
        success: false,
        status: "FAILED",
        title,
        amount,
        reference: outcome.reference,
        provider_reference: outcome.provider_reference,
        message: err,
        confirmation_id: confirmation.id,
        datetime: new Date().toISOString(),
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

  await writeAudit({
    userId: ctx.session.userId,
    tool: "confirm_transaction",
    ip: ctx.ip,
    outcome: status.toLowerCase(),
    reference: outcome.reference || confirmation.id,
    meta: { edge },
  });

  return toolOk({
    text: `${title}: ${status}${outcome.reference ? ` (ref ${outcome.reference})` : ""}`,
    structured: {
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
