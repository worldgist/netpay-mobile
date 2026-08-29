import { SupabaseClient } from "https://esm.sh/@supabase/supabase-js@2";

export type DeleteUserArchiveMetadata = Record<string, unknown>;

export type DeleteUserOptions = {
  userId: string;
  deletedBy: string | null;
  deletionReason?: string | null;
  metadata?: DeleteUserArchiveMetadata;
  source?: "admin" | "self";
};

async function clearUserForeignKeys(supabase: SupabaseClient, userId: string): Promise<void> {
  await supabase.from("notifications").update({ sent_by: null }).eq("sent_by", userId);
  await supabase.from("deleted_accounts").update({ deleted_by: null }).eq("deleted_by", userId);
  await supabase.from("user_transactions").update({ performed_by: null }).eq("performed_by", userId);
}

export async function deleteUserAccount(
  supabase: SupabaseClient,
  options: DeleteUserOptions,
): Promise<{ deletionRecordId: string | null }> {
  const { userId, deletedBy, deletionReason, metadata = {}, source = "self" } = options;

  const { data: profile } = await supabase
    .from("profiles")
    .select("*")
    .eq("id", userId)
    .maybeSingle();

  const { data: authUserData } = await supabase.auth.admin.getUserById(userId);
  const authUser = authUserData?.user ?? null;

  const { count: transactionCount } = await supabase
    .from("user_transactions")
    .select("*", { count: "exact", head: true })
    .eq("user_id", userId);

  const { data: recentTransactions } = await supabase
    .from("user_transactions")
    .select("id, transaction_type, amount, balance_before, balance_after, description, reference, created_at")
    .eq("user_id", userId)
    .order("created_at", { ascending: false })
    .limit(50);

  const archiveMetadata: DeleteUserArchiveMetadata = {
    ...metadata,
    source,
    archived_at: new Date().toISOString(),
    profile_status: profile?.status ?? null,
    balance_at_deletion: profile?.balance ?? null,
    transaction_count: transactionCount ?? 0,
    email_confirmed_at: authUser?.email_confirmed_at ?? null,
    last_sign_in_at: authUser?.last_sign_in_at ?? null,
    profile_created_at: profile?.created_at ?? null,
    recent_transactions: recentTransactions ?? [],
  };

  const insertPayload = {
    user_id: userId,
    email: profile?.email || authUser?.email || null,
    full_name: profile?.full_name || null,
    phone: profile?.phone || null,
    deletion_reason: deletionReason || null,
    status: "processing",
    metadata: archiveMetadata,
    deleted_by: deletedBy,
  };

  const { data: deletionRecord, error: recordError } = await supabase
    .from("deleted_accounts")
    .insert(insertPayload)
    .select("id")
    .single();

  if (recordError) {
    throw new Error(`Failed to archive account data: ${recordError.message}`);
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
      deleted_at: new Date().toISOString(),
    })
    .eq("id", deletionRecord.id);

  return { deletionRecordId: deletionRecord.id };
}
