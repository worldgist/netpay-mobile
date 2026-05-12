-- Legacy public.support_messages stored contact-form rows (message, email, …).
-- Chat needs support_messages(conversation_id, sender_id, body). CREATE TABLE IF NOT EXISTS
-- skipped the real DDL when the legacy table already existed.

DO $rename_legacy_support_messages$
BEGIN
  IF to_regclass('public.support_messages') IS NULL THEN
    RETURN;
  END IF;

  IF EXISTS (
    SELECT 1
    FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name = 'support_messages'
      AND column_name = 'body'
  ) THEN
    RETURN;
  END IF;

  IF EXISTS (
    SELECT 1
    FROM pg_publication_tables
    WHERE pubname = 'supabase_realtime'
      AND schemaname = 'public'
      AND tablename = 'support_messages'
  ) THEN
    ALTER PUBLICATION supabase_realtime DROP TABLE public.support_messages;
  END IF;

  DROP TRIGGER IF EXISTS support_messages_touch_conversation_trigger ON public.support_messages;

  ALTER TABLE public.support_messages RENAME TO support_contact_submissions;
END
$rename_legacy_support_messages$;

COMMENT ON TABLE public.support_contact_submissions IS 'Contact form / landing submissions (legacy table renamed from support_messages).';

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

ALTER TABLE public.support_messages ENABLE ROW LEVEL SECURITY;

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

DO $support_realtime_messages$
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
$support_realtime_messages$;

COMMENT ON TABLE public.support_messages IS 'Chat messages between customer and support (sender_id = auth user).';
