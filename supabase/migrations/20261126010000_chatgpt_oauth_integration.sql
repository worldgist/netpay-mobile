-- ChatGPT Apps SDK / MCP OAuth + confirmation + audit tables (additive only).
-- Money movement continues to go through existing edge functions with user JWTs.
-- These tables are service-role only (MCP server).

CREATE TABLE IF NOT EXISTS public.chatgpt_oauth_clients (
  client_id text PRIMARY KEY,
  redirect_uris text[] NOT NULL DEFAULT '{}',
  client_name text,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.chatgpt_oauth_auth_codes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  code_hash text NOT NULL UNIQUE,
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  client_id text NOT NULL REFERENCES public.chatgpt_oauth_clients(client_id) ON DELETE CASCADE,
  redirect_uri text NOT NULL,
  code_challenge text NOT NULL,
  code_challenge_method text NOT NULL DEFAULT 'S256',
  scope text NOT NULL DEFAULT 'netpay',
  encrypted_supabase_refresh text NOT NULL,
  expires_at timestamptz NOT NULL,
  used boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS chatgpt_oauth_auth_codes_user_id_idx
  ON public.chatgpt_oauth_auth_codes (user_id);

CREATE TABLE IF NOT EXISTS public.chatgpt_oauth_tokens (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  client_id text NOT NULL REFERENCES public.chatgpt_oauth_clients(client_id) ON DELETE CASCADE,
  access_jti_hash text NOT NULL,
  refresh_token_hash text NOT NULL UNIQUE,
  refresh_jti_hash text NOT NULL,
  encrypted_supabase_refresh text NOT NULL,
  scope text NOT NULL DEFAULT 'netpay',
  access_expires_at timestamptz NOT NULL,
  refresh_expires_at timestamptz NOT NULL,
  revoked_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS chatgpt_oauth_tokens_user_id_idx
  ON public.chatgpt_oauth_tokens (user_id);
CREATE INDEX IF NOT EXISTS chatgpt_oauth_tokens_access_jti_hash_idx
  ON public.chatgpt_oauth_tokens (access_jti_hash);
CREATE INDEX IF NOT EXISTS chatgpt_oauth_tokens_refresh_hash_idx
  ON public.chatgpt_oauth_tokens (refresh_token_hash);

CREATE TABLE IF NOT EXISTS public.chatgpt_tool_confirmations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  tool text NOT NULL,
  payload jsonb NOT NULL DEFAULT '{}'::jsonb,
  status text NOT NULL DEFAULT 'pending'
    CHECK (status IN ('pending', 'confirmed', 'expired', 'consumed')),
  expires_at timestamptz NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS chatgpt_tool_confirmations_user_status_idx
  ON public.chatgpt_tool_confirmations (user_id, status);

CREATE TABLE IF NOT EXISTS public.chatgpt_integration_audit (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  tool text NOT NULL,
  ip text,
  outcome text NOT NULL,
  reference text,
  meta jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS chatgpt_integration_audit_user_created_idx
  ON public.chatgpt_integration_audit (user_id, created_at DESC);
CREATE INDEX IF NOT EXISTS chatgpt_integration_audit_created_idx
  ON public.chatgpt_integration_audit (created_at DESC);

ALTER TABLE public.chatgpt_oauth_clients ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.chatgpt_oauth_auth_codes ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.chatgpt_oauth_tokens ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.chatgpt_tool_confirmations ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.chatgpt_integration_audit ENABLE ROW LEVEL SECURITY;

-- No policies for authenticated/anon: service role bypasses RLS.
-- Explicit deny-all policies keep PostgREST surface closed.

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public' AND tablename = 'chatgpt_oauth_clients' AND policyname = 'chatgpt_oauth_clients_deny_all'
  ) THEN
    CREATE POLICY chatgpt_oauth_clients_deny_all ON public.chatgpt_oauth_clients
      FOR ALL TO authenticated, anon USING (false) WITH CHECK (false);
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public' AND tablename = 'chatgpt_oauth_auth_codes' AND policyname = 'chatgpt_oauth_auth_codes_deny_all'
  ) THEN
    CREATE POLICY chatgpt_oauth_auth_codes_deny_all ON public.chatgpt_oauth_auth_codes
      FOR ALL TO authenticated, anon USING (false) WITH CHECK (false);
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public' AND tablename = 'chatgpt_oauth_tokens' AND policyname = 'chatgpt_oauth_tokens_deny_all'
  ) THEN
    CREATE POLICY chatgpt_oauth_tokens_deny_all ON public.chatgpt_oauth_tokens
      FOR ALL TO authenticated, anon USING (false) WITH CHECK (false);
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public' AND tablename = 'chatgpt_tool_confirmations' AND policyname = 'chatgpt_tool_confirmations_deny_all'
  ) THEN
    CREATE POLICY chatgpt_tool_confirmations_deny_all ON public.chatgpt_tool_confirmations
      FOR ALL TO authenticated, anon USING (false) WITH CHECK (false);
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public' AND tablename = 'chatgpt_integration_audit' AND policyname = 'chatgpt_integration_audit_deny_all'
  ) THEN
    CREATE POLICY chatgpt_integration_audit_deny_all ON public.chatgpt_integration_audit
      FOR ALL TO authenticated, anon USING (false) WITH CHECK (false);
  END IF;
END $$;

COMMENT ON TABLE public.chatgpt_oauth_clients IS 'ChatGPT / MCP OAuth clients (CIMD/DCR)';
COMMENT ON TABLE public.chatgpt_oauth_auth_codes IS 'Short-lived OAuth auth codes with PKCE + encrypted Supabase refresh';
COMMENT ON TABLE public.chatgpt_oauth_tokens IS 'MCP access/refresh token records; encrypted Supabase refresh for edge calls';
COMMENT ON TABLE public.chatgpt_tool_confirmations IS 'Prepare→confirm single-use money-move confirmations for ChatGPT tools';
COMMENT ON TABLE public.chatgpt_integration_audit IS 'Audit log for ChatGPT MCP tool calls';
