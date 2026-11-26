-- Fix: support_conversations may exist from a partial run where CREATE TABLE IF NOT EXISTS
-- skipped DDL, leaving a table without user_id. PostgREST then errors on user_id filters.

DO $fix$
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
$fix$;

-- Enforce NOT NULL on user_id (drop invalid rows: threads without a customer are unusable)
DO $nn$
DECLARE
  null_count bigint;
  total bigint;
BEGIN
  IF to_regclass('public.support_conversations') IS NULL THEN
    RETURN;
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns c
    WHERE c.table_schema = 'public' AND c.table_name = 'support_conversations' AND c.column_name = 'user_id'
  ) THEN
    RETURN;
  END IF;

  SELECT COUNT(*) INTO null_count FROM public.support_conversations WHERE user_id IS NULL;
  SELECT COUNT(*) INTO total FROM public.support_conversations;
  IF total > 0 AND null_count = total THEN
    DELETE FROM public.support_messages;
    DELETE FROM public.support_conversations;
  END IF;

  SELECT COUNT(*) INTO null_count FROM public.support_conversations WHERE user_id IS NULL;
  IF null_count = 0 THEN
    ALTER TABLE public.support_conversations
      ALTER COLUMN user_id SET NOT NULL;
  END IF;
EXCEPTION
  WHEN others THEN
    -- If NOT NULL cannot be applied (mixed nulls), leave nullable; app still works for new rows
    NULL;
END
$nn$;

DO $idx$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'support_conversations' AND column_name = 'user_id'
  ) AND EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'support_conversations' AND column_name = 'status'
  ) THEN
    CREATE UNIQUE INDEX IF NOT EXISTS support_conversations_one_open_per_user
      ON public.support_conversations (user_id)
      WHERE (status = 'open');
  END IF;
END
$idx$;
