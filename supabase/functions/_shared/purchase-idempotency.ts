import type { SupabaseClient } from "https://esm.sh/@supabase/supabase-js@2";

export function resolveClientPurchaseReference(
  userId: string,
  prefix: string,
  clientReference?: unknown,
): string {
  const trimmed = typeof clientReference === "string" ? clientReference.trim() : "";
  if (trimmed && trimmed.length <= 64 && /^[A-Za-z0-9._-]+$/.test(trimmed)) {
    return trimmed;
  }
  return `${prefix}-${Date.now()}-${userId.replace(/-/g, "").slice(0, 8)}`;
}

export async function findExistingPurchaseByReference(
  supabase: SupabaseClient,
  table: string,
  userId: string,
  reference: string,
): Promise<Record<string, unknown> | null> {
  const { data } = await supabase
    .from(table)
    .select("*")
    .eq("user_id", userId)
    .eq("reference", reference)
    .maybeSingle();
  return data as Record<string, unknown> | null;
}
