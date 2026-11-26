-- Seed one open support conversation + starter message for the existing App Review demo account (demo@netppay.com).
-- Safe to run repeatedly: skips if an open thread already exists; only adds the welcome message when the thread is empty.

CREATE OR REPLACE FUNCTION public.seed_demo_support_chat()
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  demo_uid uuid;
  conv_id uuid;
  msg_count int;
  inserted_starter boolean := false;
BEGIN
  SELECT u.id
  INTO demo_uid
  FROM auth.users u
  WHERE lower(u.email) = lower('demo@netppay.com')
  LIMIT 1;

  IF demo_uid IS NULL THEN
    RETURN jsonb_build_object(
      'skipped', true,
      'reason', 'No auth user with email demo@netppay.com. Create the demo user first (e.g. create-demo-user edge function).'
    );
  END IF;

  IF to_regclass('public.support_conversations') IS NULL OR to_regclass('public.support_messages') IS NULL THEN
    RETURN jsonb_build_object('skipped', true, 'reason', 'Support chat tables are not installed.');
  END IF;

  SELECT c.id
  INTO conv_id
  FROM public.support_conversations c
  WHERE c.user_id = demo_uid
    AND c.status = 'open'
  LIMIT 1;

  IF conv_id IS NULL THEN
    INSERT INTO public.support_conversations (user_id, subject, status, last_message_at)
    VALUES (demo_uid, 'Demo · Support chat', 'open', now())
    RETURNING id INTO conv_id;
  END IF;

  SELECT count(*)::int INTO msg_count FROM public.support_messages m WHERE m.conversation_id = conv_id;

  IF msg_count = 0 THEN
    INSERT INTO public.support_messages (conversation_id, sender_id, body, kind)
    VALUES (
      conv_id,
      demo_uid,
      'Hi! This is a demo message for App Review and QA. Staff can reply from Support center.',
      'text'
    );
    inserted_starter := true;
  END IF;

  RETURN jsonb_build_object(
    'skipped', false,
    'user_id', demo_uid,
    'conversation_id', conv_id,
    'starter_message_inserted', inserted_starter
  );
END;
$$;

REVOKE ALL ON FUNCTION public.seed_demo_support_chat() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.seed_demo_support_chat() TO service_role;

COMMENT ON FUNCTION public.seed_demo_support_chat() IS
  'Creates an open support_conversations row for demo@netppay.com and one starter message if the thread is empty. Idempotent.';

SELECT public.seed_demo_support_chat();
