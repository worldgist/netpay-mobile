import { SupabaseClient } from "https://esm.sh/@supabase/supabase-js@2";
import type { AccountClosedActivity } from "./admin-account-closed-email.ts";

export type DeleteUserArchiveMetadata = Record<string, unknown>;

export type DeleteUserOptions = {
  userId: string;
  deletedBy: string | null;
  deletionReason?: string | null;
  metadata?: DeleteUserArchiveMetadata;
  source?: "admin" | "self";
};

export type DeletedAccountSnapshot = {
  deletionRecordId: string | null;
  email: string | null;
  fullName: string;
  phone: string | null;
  balance: number;
  transactionCount: number;
  createdAt: string | null;
  closedAt: string;
  activities: AccountClosedActivity[];
};

async function safeUpdate(
  supabase: SupabaseClient,
  table: string,
  values: Record<string, unknown>,
  column: string,
  userId: string,
): Promise<void> {
  try {
    const { error } = await supabase.from(table).update(values).eq(column, userId);
    if (error) {
      console.warn(`delete-user-core: could not update ${table}.${column}`, error.message);
    }
  } catch (error) {
    console.warn(`delete-user-core: exception updating ${table}.${column}`, error);
  }
}

async function clearUserForeignKeys(supabase: SupabaseClient, userId: string): Promise<void> {
  await safeUpdate(supabase, "notifications", { sent_by: null }, "sent_by", userId);
  await safeUpdate(supabase, "deleted_accounts", { deleted_by: null }, "deleted_by", userId);
  await safeUpdate(supabase, "user_transactions", { performed_by: null }, "performed_by", userId);
  await safeUpdate(supabase, "email_logs", { sent_by: null }, "sent_by", userId);
}

function textValue(...values: unknown[]): string {
  for (const value of values) {
    if (typeof value === "string" && value.trim()) return value.trim();
    if (typeof value === "number" && Number.isFinite(value)) return String(value);
  }
  return "";
}

function mapActivity(
  row: Record<string, unknown>,
  type: string,
  description: string,
  extras: Partial<AccountClosedActivity> = {},
): AccountClosedActivity {
  return {
    date: String(row.created_at || ""),
    type,
    description: description || textValue(row.description, row.reference, row.id) || "Account activity",
    amount: Number(row.amount) || 0,
    balance_after: row.balance_after == null ? null : Number(row.balance_after),
    reference: textValue(row.reference, row.id),
    status: textValue(row.status) || undefined,
    ...extras,
  };
}

async function fetchTableRows(
  supabase: SupabaseClient,
  table: string,
  filters: Record<string, string>,
): Promise<Record<string, unknown>[]> {
  let query = supabase.from(table).select("*").order("created_at", { ascending: false }).limit(300);
  for (const [column, value] of Object.entries(filters)) {
    query = query.eq(column, value);
  }

  const { data, error } = await query;
  if (error) {
    console.warn(`delete-user-core: failed to load ${table}`, error.message);
    return [];
  }
  return (data || []) as Record<string, unknown>[];
}

function mergeActivities(groups: AccountClosedActivity[][]): AccountClosedActivity[] {
  const byKey = new Map<string, AccountClosedActivity>();

  for (const group of groups) {
    for (const item of group) {
      const key = (
        item.reference ||
        `${item.date}|${item.type}|${item.amount}|${item.description}`
      ).toLowerCase();
      const existing = byKey.get(key);
      if (!existing || item.description.length > existing.description.length) {
        byKey.set(key, item);
      }
    }
  }

  return [...byKey.values()].sort(
    (a, b) => new Date(b.date).getTime() - new Date(a.date).getTime(),
  );
}

async function fetchAccountActivities(
  supabase: SupabaseClient,
  userId: string,
): Promise<{ count: number; activities: AccountClosedActivity[] }> {
  const [
    ledgerRows,
    airtimeRows,
    dataRows,
    electricityRows,
    cableRows,
    bettingRows,
    educationRows,
    fundingRows,
    sentTransfers,
    receivedTransfers,
  ] = await Promise.all([
    fetchTableRows(supabase, "user_transactions", { user_id: userId }),
    fetchTableRows(supabase, "airtime_transactions", { user_id: userId }),
    fetchTableRows(supabase, "data_transactions", { user_id: userId }),
    fetchTableRows(supabase, "electricity_transactions", { user_id: userId }),
    fetchTableRows(supabase, "cable_tv_transactions", { user_id: userId }),
    fetchTableRows(supabase, "betting_transactions", { user_id: userId }),
    fetchTableRows(supabase, "education_transactions", { user_id: userId }),
    fetchTableRows(supabase, "funding_transactions", { user_id: userId }),
    fetchTableRows(supabase, "transfer_transactions", { sender_id: userId }),
    fetchTableRows(supabase, "transfer_transactions", { recipient_id: userId }),
  ]);

  const activities = mergeActivities([
    ledgerRows.map((row) =>
      mapActivity(row, textValue(row.transaction_type) || "Ledger", textValue(row.description)),
    ),
    airtimeRows.map((row) =>
      mapActivity(
        row,
        "Airtime",
        [textValue(row.network), textValue(row.phone_number)].filter(Boolean).join(" · "),
      ),
    ),
    dataRows.map((row) =>
      mapActivity(
        row,
        "Data",
        [textValue(row.network), textValue(row.plan_name), textValue(row.phone_number)]
          .filter(Boolean)
          .join(" · "),
      ),
    ),
    electricityRows.map((row) =>
      mapActivity(
        row,
        "Electricity",
        [textValue(row.provider), textValue(row.meter_number), textValue(row.customer_name)]
          .filter(Boolean)
          .join(" · "),
      ),
    ),
    cableRows.map((row) =>
      mapActivity(
        row,
        "Cable TV",
        [textValue(row.plan_name), textValue(row.smartcard_number), textValue(row.provider)]
          .filter(Boolean)
          .join(" · "),
      ),
    ),
    bettingRows.map((row) =>
      mapActivity(
        row,
        "Betting",
        [textValue(row.betting_provider), textValue(row.account_number)].filter(Boolean).join(" · "),
      ),
    ),
    educationRows.map((row) =>
      mapActivity(
        row,
        "Education",
        [textValue(row.exam_type), textValue(row.provider)].filter(Boolean).join(" · "),
      ),
    ),
    fundingRows.map((row) =>
      mapActivity(
        row,
        "Wallet Funding",
        [textValue(row.bank_name), textValue(row.account_number)].filter(Boolean).join(" · "),
      ),
    ),
    sentTransfers.map((row) =>
      mapActivity(row, "Transfer Sent", textValue(row.description, "Wallet transfer sent"), {
        balance_after: row.sender_balance_after == null ? null : Number(row.sender_balance_after),
      }),
    ),
    receivedTransfers.map((row) =>
      mapActivity(row, "Transfer Received", textValue(row.description, "Wallet transfer received"), {
        balance_after: row.recipient_balance_after == null ? null : Number(row.recipient_balance_after),
      }),
    ),
  ]);

  return {
    count: activities.length,
    activities,
  };
}

export async function deleteUserAccount(
  supabase: SupabaseClient,
  options: DeleteUserOptions,
): Promise<DeletedAccountSnapshot> {
  const { userId, deletedBy, deletionReason, metadata = {}, source = "self" } = options;
  const closedAt = new Date().toISOString();

  const { data: profileRows } = await supabase
    .from("profiles")
    .select("*")
    .eq("id", userId)
    .limit(1);

  const profile = profileRows?.[0] ?? null;
  const { data: authUserData } = await supabase.auth.admin.getUserById(userId);
  const authUser = authUserData?.user ?? null;
  const { count: transactionCount, activities } = await fetchAccountActivities(supabase, userId);

  const email = String(profile?.email || authUser?.email || "").trim().toLowerCase() || null;
  const fullName = String(profile?.full_name || authUser?.user_metadata?.full_name || "").trim();
  const phone = profile?.phone ? String(profile.phone) : null;
  const balance = Number(profile?.balance ?? 0);

  const archiveMetadata: DeleteUserArchiveMetadata = {
    ...metadata,
    source,
    archived_at: closedAt,
    profile_status: profile?.status ?? null,
    balance_at_deletion: balance,
    transaction_count: transactionCount,
    email_confirmed_at: authUser?.email_confirmed_at ?? null,
    last_sign_in_at: authUser?.last_sign_in_at ?? null,
    profile_created_at: profile?.created_at ?? null,
    recent_transactions: activities,
  };

  const insertPayload = {
    user_id: userId,
    email,
    full_name: fullName || null,
    phone,
    deletion_reason: deletionReason || null,
    status: "processing",
    metadata: archiveMetadata,
    deleted_by: deletedBy,
  };

  let deletionRecord: { id: string } | null = null;
  const { data: inserted, error: recordError } = await supabase
    .from("deleted_accounts")
    .insert(insertPayload)
    .select("id")
    .limit(1);

  if (recordError) {
    const { data: retryData, error: retryError } = await supabase
      .from("deleted_accounts")
      .insert({
        user_id: userId,
        email,
        full_name: fullName || null,
        phone,
        deletion_reason: deletionReason || null,
        status: "processing",
        metadata: archiveMetadata,
      })
      .select("id")
      .limit(1);

    if (retryError || !retryData?.[0]) {
      throw new Error(`Failed to archive account data: ${recordError.message}`);
    }
    deletionRecord = retryData[0];
  } else {
    deletionRecord = inserted?.[0] ?? null;
  }

  if (!deletionRecord) {
    throw new Error("Failed to archive account data");
  }

  try {
    await supabase.auth.admin.signOut(userId);
  } catch {
    // Continue even if sign-out fails.
  }

  await clearUserForeignKeys(supabase, userId);

  const { error: deleteError } = await supabase.auth.admin.deleteUser(userId);
  if (deleteError) {
    await supabase
      .from("deleted_accounts")
      .update({ status: "cancelled" })
      .eq("id", deletionRecord.id);
    throw new Error(`Failed to delete account: ${deleteError.message}`);
  }

  await supabase
    .from("deleted_accounts")
    .update({
      status: "completed",
      deleted_at: closedAt,
    })
    .eq("id", deletionRecord.id);

  return {
    deletionRecordId: deletionRecord.id,
    email,
    fullName,
    phone,
    balance,
    transactionCount,
    createdAt: profile?.created_at ?? authUser?.created_at ?? null,
    closedAt,
    activities,
  };
}
