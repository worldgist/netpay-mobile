import { getServiceClient } from "./supabase.js";

export type ConfirmationRow = {
  id: string;
  user_id: string;
  tool: string;
  payload: Record<string, unknown>;
  status: "pending" | "confirmed" | "expired" | "consumed";
  expires_at: string;
  created_at: string;
};

const CONFIRMATION_TTL_MS = 10 * 60 * 1000;

export async function createConfirmation(params: {
  userId: string;
  tool: string;
  payload: Record<string, unknown>;
}): Promise<ConfirmationRow> {
  const db = getServiceClient();
  const expiresAt = new Date(Date.now() + CONFIRMATION_TTL_MS).toISOString();
  const { data, error } = await db
    .from("chatgpt_tool_confirmations")
    .insert({
      user_id: params.userId,
      tool: params.tool,
      payload: params.payload,
      status: "pending",
      expires_at: expiresAt,
    })
    .select("*")
    .single();
  if (error || !data) {
    throw new Error(error?.message || "Failed to create confirmation");
  }
  return data as ConfirmationRow;
}

export async function getConfirmation(
  id: string,
  userId: string,
): Promise<ConfirmationRow | null> {
  const db = getServiceClient();
  const { data, error } = await db
    .from("chatgpt_tool_confirmations")
    .select("*")
    .eq("id", id)
    .eq("user_id", userId)
    .maybeSingle();
  if (error) throw new Error(error.message);
  return (data as ConfirmationRow) || null;
}

/** Load a still-valid pending confirmation without consuming it (e.g. PIN check first). */
export async function requirePendingConfirmation(
  id: string,
  userId: string,
): Promise<ConfirmationRow> {
  const row = await getConfirmation(id, userId);
  if (!row) throw new Error("Confirmation not found");
  if (row.status !== "pending") {
    throw new Error(`Confirmation is ${row.status}`);
  }
  if (new Date(row.expires_at).getTime() < Date.now()) {
    const db = getServiceClient();
    await db
      .from("chatgpt_tool_confirmations")
      .update({ status: "expired" })
      .eq("id", id);
    throw new Error("Confirmation expired");
  }
  return row;
}

export async function consumeConfirmation(
  id: string,
  userId: string,
): Promise<ConfirmationRow> {
  const row = await requirePendingConfirmation(id, userId);

  const db = getServiceClient();
  const { data, error } = await db
    .from("chatgpt_tool_confirmations")
    .update({ status: "consumed" })
    .eq("id", id)
    .eq("user_id", userId)
    .eq("status", "pending")
    .select("*")
    .single();
  if (error || !data) {
    throw new Error(error?.message || "Confirmation already used");
  }
  return data as ConfirmationRow;
}
