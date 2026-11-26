import { createConfirmation } from "../lib/confirmations.js";
import { callEdgeFunction } from "../lib/edge.js";
import { getServiceClient, getUserClient } from "../lib/supabase.js";
import { writeAudit } from "../lib/audit.js";
import { checkRateLimit } from "../lib/rate-limit.js";
import { WIDGETS } from "../widgets/html.js";
import { naira, toolError, toolOk, type ToolContext } from "./context.js";

async function getBalance(ctx: ToolContext): Promise<number> {
  const client = getUserClient(ctx.session.accessToken);
  const { data } = await client.rpc("get_my_ledger_balance");
  if (Number.isFinite(Number(data))) return Number(data);
  const { data: profile } = await client
    .from("profiles")
    .select("balance")
    .eq("id", ctx.session.userId)
    .maybeSingle();
  return Number(profile?.balance ?? 0);
}

function rateLimitOrError(ctx: ToolContext, tool: string) {
  const key = `${tool}:${ctx.session.userId}:${ctx.ip || "na"}`;
  const result = checkRateLimit(key, 20, 60_000);
  if (!result.allowed) {
    return toolError(`Rate limit exceeded. Retry in ${result.retryAfterSec}s.`);
  }
  return null;
}

function confirmationResponse(params: {
  confirmationId: string;
  title: string;
  text: string;
  summaryRows: Array<{ label: string; value: string }>;
  extra?: Record<string, unknown>;
}) {
  return toolOk({
    text: params.text,
    structured: {
      requires_confirmation: true,
      confirmation_id: params.confirmationId,
      title: params.title,
      summary_rows: params.summaryRows,
      ...params.extra,
    },
    widgetUri: WIDGETS.confirmation.uri,
  });
}

export async function prepareAirtimePurchase(
  ctx: ToolContext,
  args: { phone_number: string; network: string; amount: number },
) {
  const limited = rateLimitOrError(ctx, "prepare_airtime_purchase");
  if (limited) return limited;

  const phone = String(args.phone_number || "").replace(/\s+/g, "");
  const network = String(args.network || "").toUpperCase().trim();
  const amount = Number(args.amount);
  if (!phone || phone.length < 10) return toolError("Valid phone_number is required");
  if (!["MTN", "AIRTEL", "GLO", "9MOBILE", "ETISALAT"].includes(network)) {
    return toolError("network must be MTN, AIRTEL, GLO, or 9MOBILE");
  }
  if (!Number.isFinite(amount) || amount < 50 || amount > 50_000) {
    return toolError("amount must be between 50 and 50,000");
  }

  const balance = await getBalance(ctx);
  if (balance < amount) {
    return toolError(`Insufficient balance. Available ${naira(balance)}, needed ${naira(amount)}.`);
  }

  const confirmation = await createConfirmation({
    userId: ctx.session.userId,
    tool: "purchase-airtime",
    payload: {
      edge: "purchase-airtime",
      body: {
        phone_number: phone,
        network,
        network_name: network,
        amount,
      },
      display: { title: "Buy airtime", phone, network, amount },
    },
  });

  await writeAudit({
    userId: ctx.session.userId,
    tool: "prepare_airtime_purchase",
    ip: ctx.ip,
    outcome: "prepared",
    reference: confirmation.id,
  });

  return confirmationResponse({
    confirmationId: confirmation.id,
    title: "Buy airtime",
    text: `Ready to buy ${naira(amount)} ${network} airtime for ${phone}. Confirm to proceed.`,
    summaryRows: [
      { label: "Network", value: network },
      { label: "Phone", value: phone },
      { label: "Amount", value: naira(amount) },
      { label: "Balance", value: naira(balance) },
    ],
    extra: { amount, phone_number: phone, network, balance },
  });
}

export async function prepareDataPurchase(
  ctx: ToolContext,
  args: { phone_number: string; plan_id: string; network?: string; plan_name?: string; amount?: number },
) {
  const limited = rateLimitOrError(ctx, "prepare_data_purchase");
  if (limited) return limited;

  const phone = String(args.phone_number || "").replace(/\s+/g, "");
  const planId = String(args.plan_id || "").trim();
  if (!phone || !planId) return toolError("phone_number and plan_id are required");

  // data_plans is admin-RLS; use service role for authoritative price (never trust args.amount)
  const { data: plan, error: planError } = await getServiceClient()
    .from("data_plans")
    .select("id, plan_name, network, price, validity")
    .eq("id", planId)
    .maybeSingle();
  if (planError || !plan) {
    return toolError("Unknown data plan_id. Look up a valid NetPay plan first.");
  }

  const amount = Number(plan.price);
  const planName = String(plan.plan_name || "Data plan");
  const network = String(plan.network || args.network || "").toUpperCase();
  if (!Number.isFinite(amount) || amount <= 0) {
    return toolError("Plan has an invalid price in NetPay catalog.");
  }
  if (
    args.amount != null &&
    Number.isFinite(Number(args.amount)) &&
    Math.abs(Number(args.amount) - amount) > 0.01
  ) {
    return toolError(
      `Amount mismatch: catalog price is ${naira(amount)}, not ${naira(Number(args.amount))}.`,
    );
  }

  const balance = await getBalance(ctx);
  if (balance < amount) {
    return toolError(`Insufficient balance. Available ${naira(balance)}, needed ${naira(amount)}.`);
  }

  const confirmation = await createConfirmation({
    userId: ctx.session.userId,
    tool: "purchase-data",
    payload: {
      edge: "purchase-data",
      body: { phone_number: phone, plan_id: planId },
      display: { title: "Buy data", phone, planName, network, amount },
    },
  });

  await writeAudit({
    userId: ctx.session.userId,
    tool: "prepare_data_purchase",
    ip: ctx.ip,
    outcome: "prepared",
    reference: confirmation.id,
  });

  return confirmationResponse({
    confirmationId: confirmation.id,
    title: "Buy data",
    text: `Ready to buy ${planName} for ${phone} (${naira(amount)}). Confirm to proceed.`,
    summaryRows: [
      { label: "Plan", value: planName },
      { label: "Network", value: network || "—" },
      { label: "Phone", value: phone },
      { label: "Amount", value: naira(amount) },
      { label: "Balance", value: naira(balance) },
    ],
    extra: { amount, phone_number: phone, plan_id: planId, balance },
  });
}

export async function prepareElectricityPayment(
  ctx: ToolContext,
  args: {
    meter_number: string;
    provider: string;
    meter_type: string;
    amount: number;
    customer_name?: string;
  },
) {
  const limited = rateLimitOrError(ctx, "prepare_electricity_payment");
  if (limited) return limited;

  const meter = String(args.meter_number || "").trim();
  const provider = String(args.provider || "").trim();
  const meterType = String(args.meter_type || "").trim();
  const amount = Number(args.amount);
  if (!meter || !provider || !meterType) {
    return toolError("meter_number, provider, and meter_type are required");
  }
  if (!Number.isFinite(amount) || amount < 500) {
    return toolError("amount must be at least 500");
  }

  const validate = await callEdgeFunction(
    "validate-meter-number",
    ctx.session.accessToken,
    {
      method: "POST",
      body: {
        meter_number: meter,
        provider,
        meter_type: meterType,
      },
    },
  );

  const customerName =
    args.customer_name ||
    String(
      (validate.data as { customer_name?: string; name?: string; data?: { name?: string } })
        ?.customer_name ||
        (validate.data as { name?: string })?.name ||
        (validate.data as { data?: { name?: string } })?.data?.name ||
        "",
    );

  if (!validate.ok && !(validate.data as { success?: boolean })?.success) {
    const err =
      (validate.data as { error?: string; message?: string })?.error ||
      (validate.data as { message?: string })?.message ||
      "Meter validation failed";
    return toolError(err);
  }

  const balance = await getBalance(ctx);
  if (balance < amount) {
    return toolError(`Insufficient balance. Available ${naira(balance)}, needed ${naira(amount)}.`);
  }

  const confirmation = await createConfirmation({
    userId: ctx.session.userId,
    tool: "purchase-electricity",
    payload: {
      edge: "purchase-electricity",
      body: {
        meter_number: meter,
        provider,
        meter_type: meterType,
        amount,
        customer_name: customerName || undefined,
      },
      display: { title: "Pay electricity", meter, provider, meterType, amount, customerName },
    },
  });

  await writeAudit({
    userId: ctx.session.userId,
    tool: "prepare_electricity_payment",
    ip: ctx.ip,
    outcome: "prepared",
    reference: confirmation.id,
  });

  return confirmationResponse({
    confirmationId: confirmation.id,
    title: "Pay electricity",
    text: `Ready to pay ${naira(amount)} to ${provider} meter ${meter}. Confirm to proceed.`,
    summaryRows: [
      { label: "Provider", value: provider },
      { label: "Meter", value: meter },
      { label: "Type", value: meterType },
      { label: "Customer", value: customerName || "—" },
      { label: "Amount", value: naira(amount) },
      { label: "Balance", value: naira(balance) },
    ],
    extra: { amount, meter_number: meter, provider, balance },
  });
}

export async function prepareCablePayment(
  ctx: ToolContext,
  args: {
    smartcard_number: string;
    provider: string;
    plan_id: string;
    package_name: string;
    amount: number;
    customer_name?: string;
    customer_number?: string;
    api_code?: string;
  },
) {
  const limited = rateLimitOrError(ctx, "prepare_cable_payment");
  if (limited) return limited;

  const smartcard = String(args.smartcard_number || "").trim();
  const provider = String(args.provider || "").trim();
  const planId = String(args.plan_id || "").trim();
  const packageName = String(args.package_name || "").trim();
  const amount = Number(args.amount);
  if (!smartcard || !provider) {
    return toolError("smartcard_number and provider are required");
  }
  if (!planId || !packageName) {
    return toolError("plan_id and package_name are required");
  }
  if (!Number.isFinite(amount) || amount < 500 || amount > 500_000) {
    return toolError("amount must be between 500 and 500,000");
  }

  const validate = await callEdgeFunction(
    "validate-cable-customer",
    ctx.session.accessToken,
    {
      method: "POST",
      body: {
        card_number: smartcard,
        smartcard_number: smartcard,
        provider,
      },
    },
  );

  const validateData =
    (validate.data as { data?: Record<string, unknown> })?.data ||
    (validate.data as Record<string, unknown>);

  const customerName =
    args.customer_name ||
    String(validateData?.customer_name || validateData?.name || "");
  const customerNumber =
    args.customer_number ||
    String(validateData?.customer_number || smartcard);

  if (!validate.ok && !(validate.data as { success?: boolean })?.success) {
    const err =
      (validate.data as { error?: string; message?: string })?.error ||
      (validate.data as { message?: string })?.message ||
      "Smartcard validation failed";
    return toolError(err);
  }
  if (!customerName) {
    return toolError("Could not resolve cable customer name. Re-validate the smartcard.");
  }

  const balance = await getBalance(ctx);
  if (balance < amount) {
    return toolError(`Insufficient balance. Available ${naira(balance)}, needed ${naira(amount)}.`);
  }

  const confirmation = await createConfirmation({
    userId: ctx.session.userId,
    tool: "purchase-cable-tv",
    payload: {
      edge: "purchase-cable-tv",
      body: {
        card_number: smartcard,
        plan_id: planId,
        provider,
        customer_number: customerNumber,
        customer_name: customerName,
        package_name: packageName,
        price: amount,
        api_code: args.api_code || planId,
      },
      display: {
        title: "Pay cable TV",
        smartcard,
        provider,
        amount,
        customerName,
        packageName,
        plan_id: planId,
      },
    },
  });

  await writeAudit({
    userId: ctx.session.userId,
    tool: "prepare_cable_payment",
    ip: ctx.ip,
    outcome: "prepared",
    reference: confirmation.id,
  });

  return confirmationResponse({
    confirmationId: confirmation.id,
    title: "Pay cable TV",
    text: `Ready to renew ${packageName} (${provider}) for ${smartcard} — ${naira(amount)}. Confirm to proceed.`,
    summaryRows: [
      { label: "Provider", value: provider },
      { label: "Package", value: packageName },
      { label: "Smartcard", value: smartcard },
      { label: "Customer", value: customerName },
      { label: "Amount", value: naira(amount) },
      { label: "Balance", value: naira(balance) },
    ],
    extra: { amount, smartcard_number: smartcard, provider, balance },
  });
}

export async function prepareEducationPurchase(
  ctx: ToolContext,
  args: {
    exam_type: string;
    amount: number;
    quantity?: number;
    phone_number?: string;
    billers_code?: string;
    education_service_id?: string;
  },
) {
  const limited = rateLimitOrError(ctx, "prepare_education_purchase");
  if (limited) return limited;

  const examType = String(args.exam_type || "").toUpperCase().trim();
  const amount = Number(args.amount);
  const quantity = Math.max(1, Number(args.quantity) || 1);
  if (!examType) return toolError("exam_type is required (WAEC, NECO, JAMB, …)");
  if (!Number.isFinite(amount) || amount <= 0) return toolError("Valid amount is required");

  const balance = await getBalance(ctx);
  const total = amount * quantity;
  if (balance < total) {
    return toolError(`Insufficient balance. Available ${naira(balance)}, needed ${naira(total)}.`);
  }

  const confirmation = await createConfirmation({
    userId: ctx.session.userId,
    tool: "purchase-education",
    payload: {
      edge: "purchase-education",
      body: {
        exam_type: examType,
        amount,
        quantity,
        phone_number: args.phone_number,
        billers_code: args.billers_code,
        education_service_id: args.education_service_id,
      },
      display: { title: "Buy education PIN", examType, amount, quantity },
    },
  });

  await writeAudit({
    userId: ctx.session.userId,
    tool: "prepare_education_purchase",
    ip: ctx.ip,
    outcome: "prepared",
    reference: confirmation.id,
  });

  return confirmationResponse({
    confirmationId: confirmation.id,
    title: "Buy education PIN",
    text: `Ready to buy ${quantity}× ${examType} for ${naira(total)}. Confirm to proceed.`,
    summaryRows: [
      { label: "Exam", value: examType },
      { label: "Quantity", value: String(quantity) },
      { label: "Amount", value: naira(total) },
      { label: "Balance", value: naira(balance) },
    ],
    extra: { amount: total, exam_type: examType, balance },
  });
}

export async function prepareTransfer(
  ctx: ToolContext,
  args: { recipient_email: string; amount: number; description?: string },
) {
  const limited = rateLimitOrError(ctx, "prepare_transfer");
  if (limited) return limited;

  const email = String(args.recipient_email || "").trim().toLowerCase();
  const amount = Number(args.amount);
  if (!email.includes("@")) return toolError("Valid recipient_email is required");
  if (!Number.isFinite(amount) || amount < 1) return toolError("Valid amount is required");

  const verify = await callEdgeFunction<{
    success?: boolean;
    error?: string;
    recipient?: { id: string; email: string; full_name?: string };
  }>("verify-transfer-recipient", ctx.session.accessToken, {
    method: "POST",
    body: { email },
  });

  if (!verify.ok || !verify.data?.success || !verify.data.recipient) {
    return toolError(verify.data?.error || "Recipient not found on NetPay");
  }

  const fee = Math.max(10, Math.round(amount * 0.05 * 100) / 100);
  const total = amount + fee;
  const balance = await getBalance(ctx);
  if (balance < total) {
    return toolError(
      `Insufficient balance. Available ${naira(balance)}, needed ${naira(total)} (incl. ${naira(fee)} fee).`,
    );
  }

  const recipient = verify.data.recipient;
  const confirmation = await createConfirmation({
    userId: ctx.session.userId,
    tool: "transfer-funds",
    payload: {
      edge: "transfer-funds",
      body: {
        recipientEmail: recipient.email,
        amount,
        description: args.description || "ChatGPT transfer",
      },
      display: {
        title: "Transfer funds",
        recipient: recipient.full_name || recipient.email,
        email: recipient.email,
        amount,
        fee,
        total,
      },
    },
  });

  await writeAudit({
    userId: ctx.session.userId,
    tool: "prepare_transfer",
    ip: ctx.ip,
    outcome: "prepared",
    reference: confirmation.id,
  });

  return confirmationResponse({
    confirmationId: confirmation.id,
    title: "Transfer funds",
    text: `Ready to send ${naira(amount)} to ${recipient.full_name || recipient.email}. Confirm to proceed.`,
    summaryRows: [
      { label: "To", value: recipient.full_name || recipient.email },
      { label: "Email", value: recipient.email },
      { label: "Amount", value: naira(amount) },
      { label: "Fee", value: naira(fee) },
      { label: "Total debit", value: naira(total) },
      { label: "Balance", value: naira(balance) },
    ],
    extra: { amount, fee, total, recipient_email: recipient.email, balance },
  });
}
