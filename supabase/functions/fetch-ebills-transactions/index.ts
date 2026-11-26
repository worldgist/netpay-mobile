import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { type SupabaseClient } from "https://esm.sh/@supabase/supabase-js@2";
import {
  corsHeaders,
  createServiceClient,
  errorResponse,
  jsonResponse,
  requireAdmin,
} from "../_shared/admin-auth.ts";

const PAGE_SIZE = 1000;
const MAX_ROWS_PER_TABLE = 20000;

const SERVICE_TABLES = [
  { table: "airtime_transactions", service: "airtime" },
  { table: "data_transactions", service: "data" },
  { table: "electricity_transactions", service: "electricity" },
  { table: "cable_tv_transactions", service: "cable_tv" },
  { table: "betting_transactions", service: "betting" },
] as const;

const FILTER_ATTEMPTS = [
  "vending_provider.eq.ebills,vending_provider.eq.ebills.africa,reference.ilike.%EBILLS%,reference.ilike.req_%",
  "provider.eq.ebills,reference.ilike.%EBILLS%,reference.ilike.req_%",
  "reference.ilike.%EBILLS%,reference.ilike.req_%",
];

type ServiceType = (typeof SERVICE_TABLES)[number]["service"];

function isEbillsRow(row: Record<string, unknown>): boolean {
  const vendor = String(row.vending_provider ?? "").toLowerCase();
  if (vendor === "ebills" || vendor === "ebills.africa") return true;

  const reference = String(row.reference ?? "");
  if (/ebills/i.test(reference) || reference.startsWith("req_")) return true;

  try {
    const api = JSON.stringify(row.api_response ?? "");
    if (/ebills\.africa/i.test(api)) return true;
  } catch {
    // ignore stringify failures
  }

  return false;
}

function toNumber(value: unknown): number {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : 0;
}

async function fetchTableRows(
  supabase: SupabaseClient,
  table: string,
): Promise<Record<string, unknown>[]> {
  const collected: Record<string, unknown>[] = [];
  let filterIndex = 0;
  let from = 0;
  let acceptedFilter = false;

  while (filterIndex < FILTER_ATTEMPTS.length) {
    const filter = FILTER_ATTEMPTS[filterIndex];
    const { data, error } = await supabase
      .from(table)
      .select("*")
      .or(filter)
      .order("created_at", { ascending: false })
      .range(from, from + PAGE_SIZE - 1);

    if (error) {
      if (!acceptedFilter) {
        filterIndex += 1;
        from = 0;
        continue;
      }
      console.error(`fetch-ebills-transactions: failed paging ${table}`, error);
      break;
    }

    acceptedFilter = true;
    const rows = (data || []) as Record<string, unknown>[];
    collected.push(...rows);

    if (rows.length < PAGE_SIZE || collected.length >= MAX_ROWS_PER_TABLE) {
      break;
    }

    from += PAGE_SIZE;
  }

  return collected.filter(isEbillsRow);
}

function mapTransaction(row: Record<string, unknown>, serviceType: ServiceType) {
  return {
    id: String(row.id),
    service_type: serviceType,
    user_id: String(row.user_id ?? ""),
    amount: toNumber(row.amount),
    purchase_amount: row.purchase_amount == null ? null : toNumber(row.purchase_amount),
    charge_fee: row.charge_fee == null ? null : toNumber(row.charge_fee),
    balance_before: toNumber(row.balance_before),
    balance_after: toNumber(row.balance_after),
    status: String(row.status || "unknown"),
    reference: String(row.reference || row.id),
    created_at: String(row.created_at || new Date().toISOString()),
    meter_number: row.meter_number == null ? undefined : String(row.meter_number),
    provider: row.provider == null ? undefined : String(row.provider),
    meter_type: row.meter_type == null ? undefined : String(row.meter_type),
    customer_name: row.customer_name == null ? undefined : String(row.customer_name),
    betting_provider: row.betting_provider == null ? undefined : String(row.betting_provider),
    account_number: row.account_number == null ? undefined : String(row.account_number),
    smartcard_number: row.smartcard_number == null ? undefined : String(row.smartcard_number),
    plan_name: row.plan_name == null ? undefined : String(row.plan_name),
    phone_number: row.phone_number == null ? undefined : String(row.phone_number),
    network: row.network == null ? undefined : String(row.network),
    exam_type: row.exam_type == null ? undefined : String(row.exam_type),
  };
}

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { status: 200, headers: corsHeaders });
  }

  try {
    const supabase = createServiceClient();
    await requireAdmin(req, supabase);

    const tableResults = await Promise.all(
      SERVICE_TABLES.map(async ({ table, service }) => {
        const rows = await fetchTableRows(supabase, table);
        return rows.map((row) => mapTransaction(row, service));
      }),
    );

    const transactions = tableResults.flat().sort(
      (a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime(),
    );

    const userIds = [...new Set(transactions.map((tx) => tx.user_id).filter(Boolean))];
    const profileMap = new Map<string, { full_name: string | null; email: string | null }>();

    for (let i = 0; i < userIds.length; i += 200) {
      const chunk = userIds.slice(i, i + 200);
      const { data: profiles } = await supabase
        .from("profiles")
        .select("id, full_name, email")
        .in("id", chunk);

      for (const profile of profiles || []) {
        profileMap.set(profile.id, {
          full_name: profile.full_name ?? null,
          email: profile.email ?? null,
        });
      }
    }

    const withProfiles = transactions.map((tx) => ({
      ...tx,
      profiles: profileMap.get(tx.user_id) ?? null,
    }));

    const byService = withProfiles.reduce<Record<string, number>>((acc, tx) => {
      acc[tx.service_type] = (acc[tx.service_type] || 0) + 1;
      return acc;
    }, {});

    return jsonResponse({
      success: true,
      transactions: withProfiles,
      total: withProfiles.length,
      counts: byService,
    });
  } catch (error) {
    console.error("fetch-ebills-transactions error:", error);
    return errorResponse(error);
  }
});
