-- Customer ↔ admin support chat: conversations + messages, RLS, realtime

CREATE TABLE IF NOT EXISTS public.support_conversations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES public.profiles (id) ON DELETE CASCADE,
  subject text NOT NULL DEFAULT 'Support',
  status text NOT NULL DEFAULT 'open' CHECK (status IN ('open', 'closed')),
  last_message_at timestamptz NOT NULL DEFAULT now(),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

-- Table may already exist without user_id (older partial deploy); add column before indexes/policies.
DO $support_conv_user_id$
BEGIN
  IF to_regclass('public.support_conversations') IS NULL THEN
    RETURN;
  END IF;
  IF NOT EXISTS (
    SELECT 1
    FROM information_schema.columns c
    WHERE c.table_schema = 'public'
      AND c.table_name = 'support_conversations'
      AND c.column_name = 'user_id'
  ) THEN
    ALTER TABLE public.support_conversations
      ADD COLUMN user_id uuid REFERENCES public.profiles (id) ON DELETE CASCADE;
  END IF;
END
$support_conv_user_id$;

CREATE UNIQUE INDEX IF NOT EXISTS support_conversations_one_open_per_user
  ON public.support_conversations (user_id)
  WHERE (status = 'open');

CREATE TABLE IF NOT EXISTS public.support_messages (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  conversation_id uuid NOT NULL REFERENCES public.support_conversations (id) ON DELETE CASCADE,
  sender_id uuid NOT NULL REFERENCES auth.users (id) ON DELETE CASCADE,
  body text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT support_messages_body_nonempty CHECK (char_length(trim(body)) > 0),
  CONSTRAINT support_messages_body_max CHECK (char_length(body) <= 4000)
);

CREATE INDEX IF NOT EXISTS support_messages_conversation_created_at
  ON public.support_messages (conversation_id, created_at);

CREATE INDEX IF NOT EXISTS support_conversations_last_msg
  ON public.support_conversations (last_message_at DESC);

CREATE OR REPLACE FUNCTION public.support_messages_touch_conversation()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  UPDATE public.support_conversations
  SET
    last_message_at = NEW.created_at,
    updated_at = now()
  WHERE id = NEW.conversation_id;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS support_messages_touch_conversation_trigger ON public.support_messages;
CREATE TRIGGER support_messages_touch_conversation_trigger
AFTER INSERT ON public.support_messages
FOR EACH ROW
EXECUTE FUNCTION public.support_messages_touch_conversation();

CREATE OR REPLACE FUNCTION public.support_conversations_prevent_user_change()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF TG_OP = 'UPDATE' AND NEW.user_id IS DISTINCT FROM OLD.user_id THEN
    RAISE EXCEPTION 'support_conversations.user_id is immutable';
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS support_conversations_prevent_user_change_trigger ON public.support_conversations;
CREATE TRIGGER support_conversations_prevent_user_change_trigger
BEFORE UPDATE ON public.support_conversations
FOR EACH ROW
EXECUTE FUNCTION public.support_conversations_prevent_user_change();

DROP TRIGGER IF EXISTS support_conversations_updated_at ON public.support_conversations;
CREATE TRIGGER support_conversations_updated_at
BEFORE UPDATE ON public.support_conversations
FOR EACH ROW
EXECUTE FUNCTION public.update_updated_at_column();

ALTER TABLE public.support_conversations ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.support_messages ENABLE ROW LEVEL SECURITY;

-- Conversations: customer sees own; admins see all
DROP POLICY IF EXISTS support_conversations_select ON public.support_conversations;
CREATE POLICY support_conversations_select
  ON public.support_conversations
  FOR SELECT
  TO authenticated
  USING (
    user_id = auth.uid()
    OR public.has_role(auth.uid(), 'admin'::public.app_role)
  );

DROP POLICY IF EXISTS support_conversations_insert ON public.support_conversations;
CREATE POLICY support_conversations_insert
  ON public.support_conversations
  FOR INSERT
  TO authenticated
  WITH CHECK (user_id = auth.uid());

DROP POLICY IF EXISTS support_conversations_update_customer ON public.support_conversations;
CREATE POLICY support_conversations_update_customer
  ON public.support_conversations
  FOR UPDATE
  TO authenticated
  USING (user_id = auth.uid())
  WITH CHECK (user_id = auth.uid());

DROP POLICY IF EXISTS support_conversations_update_admin ON public.support_conversations;
CREATE POLICY support_conversations_update_admin
  ON public.support_conversations
  FOR UPDATE
  TO authenticated
  USING (public.has_role(auth.uid(), 'admin'::public.app_role))
  WITH CHECK (public.has_role(auth.uid(), 'admin'::public.app_role));

-- Messages: participants on the conversation thread
DROP POLICY IF EXISTS support_messages_select ON public.support_messages;
CREATE POLICY support_messages_select
  ON public.support_messages
  FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1
      FROM public.support_conversations c
      WHERE c.id = support_messages.conversation_id
        AND (
          c.user_id = auth.uid()
          OR public.has_role(auth.uid(), 'admin'::public.app_role)
        )
    )
  );

DROP POLICY IF EXISTS support_messages_insert ON public.support_messages;
CREATE POLICY support_messages_insert
  ON public.support_messages
  FOR INSERT
  TO authenticated
  WITH CHECK (
    sender_id = auth.uid()
    AND EXISTS (
      SELECT 1
      FROM public.support_conversations c
      WHERE c.id = conversation_id
        AND (
          c.user_id = auth.uid()
          OR public.has_role(auth.uid(), 'admin'::public.app_role)
        )
    )
  );

-- Realtime: new messages to subscribed clients (idempotent if table already published)
DO $support_realtime$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_publication_tables
    WHERE pubname = 'supabase_realtime'
      AND schemaname = 'public'
      AND tablename = 'support_messages'
  ) THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.support_messages;
  END IF;
END
$support_realtime$;

COMMENT ON TABLE public.support_conversations IS 'One open thread per customer (partial unique); admins can list and reply.';
COMMENT ON TABLE public.support_messages IS 'Chat messages between customer and support (sender_id = auth user).';
