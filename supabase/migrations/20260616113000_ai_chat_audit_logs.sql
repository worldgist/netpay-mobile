-- Audit trail for AI chat intent/action decisions and security outcomes.
CREATE TABLE IF NOT EXISTS public.ai_chat_audit_logs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  request_message_count integer NOT NULL DEFAULT 0,
  request_total_chars integer NOT NULL DEFAULT 0,
  detected_intent text,
  selected_action_type text,
  selected_action_route text,
  model_action_type text,
  model_action_route text,
  blocked_reason text,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_ai_chat_audit_logs_user_created_at
  ON public.ai_chat_audit_logs(user_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_ai_chat_audit_logs_created_at
  ON public.ai_chat_audit_logs(created_at DESC);

ALTER TABLE public.ai_chat_audit_logs ENABLE ROW LEVEL SECURITY;
