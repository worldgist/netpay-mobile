import { getServiceClient } from "./supabase.js";

export async function writeAudit(params: {
  userId?: string | null;
  tool: string;
  ip?: string | null;
  outcome: string;
  reference?: string | null;
  meta?: Record<string, unknown>;
}): Promise<void> {
  try {
    const db = getServiceClient();
    await db.from("chatgpt_integration_audit").insert({
      user_id: params.userId || null,
      tool: params.tool,
      ip: params.ip || null,
      outcome: params.outcome,
      reference: params.reference || null,
      meta: params.meta || {},
    });
  } catch {
    // Audit must never break tool execution
  }
}
