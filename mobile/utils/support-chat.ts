import type { SupabaseClient } from '@supabase/supabase-js';

export type SupportConversationWithProfile = {
  id: string;
  user_id: string;
  subject: string;
  status: string;
  last_message_at: string;
  profiles: { full_name: string | null; email: string | null } | null;
};

/**
 * List conversations without embedding profiles (avoids PostgREST FK / hint failures).
 * Loads customer names in a second query.
 */
export async function listSupportConversationsForAdmin(
  client: SupabaseClient,
  statusFilter: 'open' | 'all'
): Promise<SupportConversationWithProfile[]> {
  let q = client
    .from('support_conversations')
    .select('id, user_id, subject, status, last_message_at')
    .order('last_message_at', { ascending: false })
    .limit(150);
  if (statusFilter === 'open') {
    q = q.eq('status', 'open');
  }
  const { data: convs, error } = await q;
  if (error) throw error;
  const list = convs || [];
  const userIds = [...new Set(list.map((c) => c.user_id).filter(Boolean))] as string[];
  const profileMap = new Map<string, { full_name: string | null; email: string | null }>();
  if (userIds.length > 0) {
    const { data: profs, error: pErr } = await client.from('profiles').select('id, full_name, email').in('id', userIds);
    if (!pErr && profs) {
      for (const p of profs) {
        profileMap.set(p.id, { full_name: p.full_name, email: p.email });
      }
    }
  }
  return list.map((c) => ({
    ...c,
    profiles: c.user_id ? profileMap.get(c.user_id) ?? null : null,
  }));
}

/** Display name for support chat header (admin view). */
export async function fetchProfileContactHint(client: SupabaseClient, profileId: string): Promise<string> {
  const { data, error } = await client.from('profiles').select('full_name, email').eq('id', profileId).maybeSingle();
  if (error || !data) return 'Customer';
  return data.full_name?.trim() || data.email || 'Customer';
}

export async function fetchUserIsAdmin(client: SupabaseClient, userId: string): Promise<boolean> {
  const { data, error } = await client
    .from('user_roles')
    .select('role')
    .eq('user_id', userId)
    .eq('role', 'admin')
    .maybeSingle();
  if (error || !data) return false;
  return true;
}

/** Returns the customer's single open conversation id, creating one if needed. */
export async function getOrCreateOpenConversation(client: SupabaseClient, userId: string): Promise<string> {
  const { data: existing, error: selErr } = await client
    .from('support_conversations')
    .select('id')
    .eq('user_id', userId)
    .eq('status', 'open')
    .maybeSingle();
  if (selErr) throw selErr;
  if (existing?.id) return existing.id;

  const { data: created, error: insErr } = await client
    .from('support_conversations')
    .insert({ user_id: userId, subject: 'Support chat' })
    .select('id')
    .single();

  if (insErr) {
    const { data: retry, error: retryErr } = await client
      .from('support_conversations')
      .select('id')
      .eq('user_id', userId)
      .eq('status', 'open')
      .maybeSingle();
    if (!retryErr && retry?.id) return retry.id;
    throw insErr;
  }
  if (!created?.id) throw new Error('Could not start support chat');
  return created.id;
}
