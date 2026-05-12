-- Typing + last seen on support_conversations; RPCs so only each side updates its own fields.
-- Block new messages when thread is closed.

ALTER TABLE public.support_conversations
  ADD COLUMN IF NOT EXISTS last_seen_customer_at timestamptz,
  ADD COLUMN IF NOT EXISTS last_seen_staff_at timestamptz,
  ADD COLUMN IF NOT EXISTS typing_customer_until timestamptz,
  ADD COLUMN IF NOT EXISTS typing_staff_until timestamptz;

COMMENT ON COLUMN public.support_conversations.last_seen_customer_at IS 'Last activity ping from the customer in this thread.';
COMMENT ON COLUMN public.support_conversations.last_seen_staff_at IS 'Last activity ping from support staff in this thread.';
COMMENT ON COLUMN public.support_conversations.typing_customer_until IS 'Server time until which customer is considered typing (client extends while composing).';
COMMENT ON COLUMN public.support_conversations.typing_staff_until IS 'Server time until which staff is considered typing.';

-- Realtime: conversation updates (typing / last seen / status)
DO $support_conv_rt$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_publication_tables
    WHERE pubname = 'supabase_realtime'
      AND schemaname = 'public'
      AND tablename = 'support_conversations'
  ) THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.support_conversations;
  END IF;
END
$support_conv_rt$;

CREATE OR REPLACE FUNCTION public.support_presence_ping(p_conversation_id uuid, p_typing boolean)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  conv public.support_conversations%ROWTYPE;
BEGIN
  SELECT * INTO conv FROM public.support_conversations WHERE id = p_conversation_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Conversation not found';
  END IF;

  IF conv.status = 'closed' THEN
    RETURN;
  END IF;

  IF conv.user_id = auth.uid() THEN
    UPDATE public.support_conversations
    SET
      last_seen_customer_at = now(),
      typing_customer_until = CASE
        WHEN p_typing THEN now() + interval '6 seconds'
        ELSE NULL
      END,
      updated_at = now()
    WHERE id = p_conversation_id;
    RETURN;
  END IF;

  IF public.has_role(auth.uid(), 'admin'::public.app_role) THEN
    UPDATE public.support_conversations
    SET
      last_seen_staff_at = now(),
      typing_staff_until = CASE
        WHEN p_typing THEN now() + interval '6 seconds'
        ELSE NULL
      END,
      updated_at = now()
    WHERE id = p_conversation_id;
    RETURN;
  END IF;

  RAISE EXCEPTION 'Forbidden';
END;
$$;

CREATE OR REPLACE FUNCTION public.support_end_chat(p_conversation_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  conv public.support_conversations%ROWTYPE;
BEGIN
  SELECT * INTO conv FROM public.support_conversations WHERE id = p_conversation_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Conversation not found';
  END IF;

  IF conv.user_id = auth.uid() OR public.has_role(auth.uid(), 'admin'::public.app_role) THEN
    UPDATE public.support_conversations
    SET
      status = 'closed',
      typing_customer_until = NULL,
      typing_staff_until = NULL,
      updated_at = now()
    WHERE id = p_conversation_id;
    RETURN;
  END IF;

  RAISE EXCEPTION 'Forbidden';
END;
$$;

REVOKE ALL ON FUNCTION public.support_presence_ping(uuid, boolean) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.support_end_chat(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.support_presence_ping(uuid, boolean) TO authenticated;
GRANT EXECUTE ON FUNCTION public.support_end_chat(uuid) TO authenticated;

-- Only allow new messages on open threads
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
        AND c.status = 'open'
        AND (
          c.user_id = auth.uid()
          OR public.has_role(auth.uid(), 'admin'::public.app_role)
        )
    )
  );
