import type { SupabaseClient } from "@supabase/supabase-js";

export type SupportConversationWithProfile = {
  id: string;
  user_id: string;
  subject: string;
  status: string;
  last_message_at: string;
  profiles: { full_name: string | null; email: string | null } | null;
};

/** Avoid PostgREST `profiles(...)` embed issues; batch-load profiles by id. */
export async function listSupportConversationsForAdmin(
  client: SupabaseClient,
  statusFilter: "open" | "all",
): Promise<SupportConversationWithProfile[]> {
  let q = client
    .from("support_conversations")
    .select("id, user_id, subject, status, last_message_at")
    .order("last_message_at", { ascending: false })
    .limit(150);
  if (statusFilter === "open") q = q.eq("status", "open");
  const { data: convs, error } = await q;
  if (error) throw error;
  const list = convs || [];
  const userIds = [...new Set(list.map((c) => c.user_id).filter(Boolean))] as string[];
  const profileMap = new Map<string, { full_name: string | null; email: string | null }>();
  if (userIds.length > 0) {
    const { data: profs, error: pErr } = await client.from("profiles").select("id, full_name, email").in("id", userIds);
    if (!pErr && profs) {
      for (const p of profs) {
        profileMap.set(p.id, { full_name: p.full_name, email: p.email });
      }
    }
  }
  return list.map((c) => ({
    ...c,
    profiles: c.user_id ? (profileMap.get(c.user_id) ?? null) : null,
  }));
}
