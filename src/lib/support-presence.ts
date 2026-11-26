import type { SupabaseClient } from "@supabase/supabase-js";

export type SupportConversationPresence = {
  status: string;
  last_seen_customer_at: string | null;
  last_seen_staff_at: string | null;
  typing_customer_until: string | null;
  typing_staff_until: string | null;
};

export function isTypingActive(untilIso: string | null | undefined): boolean {
  if (!untilIso) return false;
  return new Date(untilIso).getTime() > Date.now();
}

export function formatSupportLastSeen(iso: string | null | undefined): string {
  if (!iso) return "No activity yet";
  const t = new Date(iso).getTime();
  if (Number.isNaN(t)) return "No activity yet";
  const diff = Date.now() - t;
  if (diff < 45_000) return "Active now";
  if (diff < 3600_000) {
    const m = Math.floor(diff / 60_000);
    return `Last seen ${m}m ago`;
  }
  if (diff < 86400_000) {
    const h = Math.floor(diff / 3600_000);
    return `Last seen ${h}h ago`;
  }
  return `Last seen ${new Date(iso).toLocaleDateString(undefined, { month: "short", day: "numeric" })}`;
}

export async function rpcSupportPresencePing(
  client: SupabaseClient,
  conversationId: string,
  typing: boolean,
): Promise<void> {
  const { error } = await client.rpc("support_presence_ping", {
    p_conversation_id: conversationId,
    p_typing: typing,
  });
  if (error) throw error;
}

export async function rpcSupportEndChat(client: SupabaseClient, conversationId: string): Promise<void> {
  const { error } = await client.rpc("support_end_chat", { p_conversation_id: conversationId });
  if (error) throw error;
}
