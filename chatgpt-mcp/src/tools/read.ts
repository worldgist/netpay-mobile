import { getUserClient } from "../lib/supabase.js";
import { callEdgeFunction } from "../lib/edge.js";
import { writeAudit } from "../lib/audit.js";
import { WIDGETS } from "../widgets/html.js";
import { naira, toolError, toolOk, type ToolContext } from "./context.js";

export async function getProfile(ctx: ToolContext) {
  const client = getUserClient(ctx.session.accessToken);
  const { data, error } = await client
    .from("profiles")
    .select("id, full_name, email, phone, created_at")
    .eq("id", ctx.session.userId)
    .maybeSingle();
  if (error || !data) {
    await writeAudit({ userId: ctx.session.userId, tool: "get_profile", ip: ctx.ip, outcome: "error" });
    return toolError(error?.message || "Profile not found");
  }
  await writeAudit({ userId: ctx.session.userId, tool: "get_profile", ip: ctx.ip, outcome: "ok" });
  return toolOk({
    text: `NetPay profile: ${data.full_name || data.email}`,
    structured: {
      connected: true,
      id: data.id,
      full_name: data.full_name,
      email: data.email,
      phone: data.phone,
      created_at: data.created_at,
    },
    widgetUri: WIDGETS.connect.uri,
  });
}

export async function getWalletBalance(ctx: ToolContext) {
  const client = getUserClient(ctx.session.accessToken);
  const { data: ledger, error: ledgerError } = await client.rpc("get_my_ledger_balance");
  let balance = Number(ledger ?? NaN);
  if (ledgerError || !Number.isFinite(balance)) {
    const { data: profile } = await client
      .from("profiles")
      .select("balance, full_name, email")
      .eq("id", ctx.session.userId)
      .maybeSingle();
    balance = Number(profile?.balance ?? 0);
    await writeAudit({
      userId: ctx.session.userId,
      tool: "get_wallet_balance",
      ip: ctx.ip,
      outcome: "ok",
      meta: { source: "profiles.balance" },
    });
    return toolOk({
      text: `Wallet balance: ${naira(balance)}`,
      structured: {
        balance,
        full_name: profile?.full_name,
        email: profile?.email,
      },
      widgetUri: WIDGETS.balance.uri,
    });
  }

  const { data: profile } = await client
    .from("profiles")
    .select("full_name, email")
    .eq("id", ctx.session.userId)
    .maybeSingle();

  await writeAudit({ userId: ctx.session.userId, tool: "get_wallet_balance", ip: ctx.ip, outcome: "ok" });
  return toolOk({
    text: `Wallet balance: ${naira(balance)}`,
    structured: {
      balance,
      full_name: profile?.full_name,
      email: profile?.email,
    },
    widgetUri: WIDGETS.balance.uri,
  });
}

export async function getFundingDetails(ctx: ToolContext) {
  const result = await callEdgeFunction<{
    success?: boolean;
    error?: string;
    account?: Record<string, unknown>;
    data?: Record<string, unknown>;
  }>("get-flutterwave-virtual-account", ctx.session.accessToken, { method: "GET" });

  if (!result.ok) {
    await writeAudit({
      userId: ctx.session.userId,
      tool: "get_funding_details",
      ip: ctx.ip,
      outcome: "error",
    });
    return toolError(
      (result.data as { error?: string })?.error ||
        "Unable to load funding account. You may need to set one up in the NetPay app first.",
    );
  }

  const account =
    (result.data as { account?: Record<string, unknown> }).account ||
    (result.data as { data?: Record<string, unknown> }).data ||
    (result.data as Record<string, unknown>);

  await writeAudit({ userId: ctx.session.userId, tool: "get_funding_details", ip: ctx.ip, outcome: "ok" });
  return toolOk({
    text: `Fund NetPay via ${account.bank_name || "bank transfer"} — ${account.account_number || "see details"}`,
    structured: {
      bank_name: account.bank_name,
      account_number: account.account_number,
      account_name: account.account_name,
      bank_code: account.bank_code,
    },
  });
}

type TxRow = {
  id: string;
  category: string;
  amount: number;
  status?: string | null;
  reference?: string | null;
  description?: string | null;
  created_at: string;
};

export async function listTransactions(
  ctx: ToolContext,
  args: { limit?: number },
) {
  const limit = Math.min(Math.max(Number(args.limit) || 20, 1), 50);
  const client = getUserClient(ctx.session.accessToken);
  const userId = ctx.session.userId;

  const [wallet, airtime, data, electricity, education, transfers] = await Promise.all([
    client
      .from("user_transactions")
      .select("id, amount, transaction_type, description, reference, created_at")
      .eq("user_id", userId)
      .order("created_at", { ascending: false })
      .limit(limit),
    client
      .from("airtime_transactions")
      .select("id, amount, network, status, reference, phone_number, created_at")
      .eq("user_id", userId)
      .order("created_at", { ascending: false })
      .limit(limit),
    client
      .from("data_transactions")
      .select("id, amount, network, plan_name, status, reference, phone_number, created_at")
      .eq("user_id", userId)
      .order("created_at", { ascending: false })
      .limit(limit),
    client
      .from("electricity_transactions")
      .select("id, amount, provider, status, reference, meter_number, created_at")
      .eq("user_id", userId)
      .order("created_at", { ascending: false })
      .limit(limit),
    client
      .from("education_transactions")
      .select("id, amount, exam_type, status, reference, created_at")
      .eq("user_id", userId)
      .order("created_at", { ascending: false })
      .limit(limit),
    client
      .from("transfer_transactions")
      .select("id, amount, status, reference, description, created_at, sender_id, recipient_id")
      .or(`sender_id.eq.${userId},recipient_id.eq.${userId}`)
      .order("created_at", { ascending: false })
      .limit(limit),
  ]);

  const rows: TxRow[] = [];

  for (const t of wallet.data || []) {
    rows.push({
      id: t.id,
      category: "wallet",
      amount: Number(t.amount),
      status: t.transaction_type,
      reference: t.reference,
      description: t.description,
      created_at: t.created_at,
    });
  }
  for (const t of airtime.data || []) {
    rows.push({
      id: t.id,
      category: "airtime",
      amount: Number(t.amount),
      status: t.status,
      reference: t.reference,
      description: `Airtime ${t.network} ${t.phone_number}`,
      created_at: t.created_at,
    });
  }
  for (const t of data.data || []) {
    rows.push({
      id: t.id,
      category: "data",
      amount: Number(t.amount),
      status: t.status,
      reference: t.reference,
      description: `Data ${t.plan_name || t.network} ${t.phone_number}`,
      created_at: t.created_at,
    });
  }
  for (const t of electricity.data || []) {
    rows.push({
      id: t.id,
      category: "electricity",
      amount: Number(t.amount),
      status: t.status,
      reference: t.reference,
      description: `Electricity ${t.provider} ${t.meter_number}`,
      created_at: t.created_at,
    });
  }
  for (const t of education.data || []) {
    rows.push({
      id: t.id,
      category: "education",
      amount: Number(t.amount),
      status: t.status,
      reference: t.reference,
      description: `Education ${t.exam_type}`,
      created_at: t.created_at,
    });
  }
  for (const t of transfers.data || []) {
    rows.push({
      id: t.id,
      category: t.sender_id === userId ? "transfer_sent" : "transfer_received",
      amount: Number(t.amount),
      status: t.status,
      reference: t.reference,
      description: t.description || "Transfer",
      created_at: t.created_at,
    });
  }

  rows.sort((a, b) => Date.parse(b.created_at) - Date.parse(a.created_at));
  const transactions = rows.slice(0, limit);

  await writeAudit({
    userId: ctx.session.userId,
    tool: "list_transactions",
    ip: ctx.ip,
    outcome: "ok",
    meta: { count: transactions.length },
  });

  return toolOk({
    text: `Found ${transactions.length} recent transactions`,
    structured: { transactions },
    widgetUri: WIDGETS.transactions.uri,
  });
}

export async function getTransaction(
  ctx: ToolContext,
  args: { id: string; category?: string },
) {
  if (!args.id) return toolError("Transaction id is required");
  const client = getUserClient(ctx.session.accessToken);
  const userId = ctx.session.userId;
  const category = (args.category || "").toLowerCase();

  const tables: Array<{ name: string; category: string }> = [
    { name: "airtime_transactions", category: "airtime" },
    { name: "data_transactions", category: "data" },
    { name: "electricity_transactions", category: "electricity" },
    { name: "cable_tv_transactions", category: "cable" },
    { name: "education_transactions", category: "education" },
    { name: "user_transactions", category: "wallet" },
    { name: "transfer_transactions", category: "transfer" },
    { name: "funding_transactions", category: "funding" },
  ];

  const candidates = category
    ? tables.filter((t) => t.category === category || category.startsWith(t.category))
    : tables;

  for (const table of candidates) {
    let query = client.from(table.name).select("*").eq("id", args.id);
    if (table.name === "transfer_transactions") {
      query = query.or(`sender_id.eq.${userId},recipient_id.eq.${userId}`);
    } else {
      query = query.eq("user_id", userId);
    }
    const { data } = await query.maybeSingle();
    if (data) {
      await writeAudit({
        userId,
        tool: "get_transaction",
        ip: ctx.ip,
        outcome: "ok",
        reference: data.reference || args.id,
      });
      return toolOk({
        text: `Transaction ${args.id}`,
        structured: { category: table.category, transaction: data },
        widgetUri: WIDGETS.receipt.uri,
      });
    }
  }

  await writeAudit({ userId, tool: "get_transaction", ip: ctx.ip, outcome: "not_found" });
  return toolError("Transaction not found");
}
