-- Support chat: optional image/file attachments via private storage bucket `support-chat`.

ALTER TABLE public.support_messages
  ADD COLUMN IF NOT EXISTS kind text NOT NULL DEFAULT 'text'
    CHECK (kind IN ('text', 'image', 'file')),
  ADD COLUMN IF NOT EXISTS attachment_path text,
  ADD COLUMN IF NOT EXISTS attachment_mime text,
  ADD COLUMN IF NOT EXISTS attachment_name text;

ALTER TABLE public.support_messages DROP CONSTRAINT IF EXISTS support_messages_body_nonempty;

ALTER TABLE public.support_messages
  ADD CONSTRAINT support_messages_body_or_attachment CHECK (
    (attachment_path IS NULL AND char_length(trim(body)) > 0)
    OR (attachment_path IS NOT NULL)
  );

COMMENT ON COLUMN public.support_messages.kind IS 'text | image | file';
COMMENT ON COLUMN public.support_messages.attachment_path IS 'Object path inside support-chat bucket (conversation_id/...).';

-- Private bucket for chat uploads
INSERT INTO storage.buckets (id, name, public, file_size_limit)
VALUES ('support-chat', 'support-chat', false, 52428800)
ON CONFLICT (id) DO UPDATE SET file_size_limit = EXCLUDED.file_size_limit;

-- First path segment must be a conversation the user can access
DROP POLICY IF EXISTS "support_chat_objects_insert" ON storage.objects;
CREATE POLICY "support_chat_objects_insert"
  ON storage.objects
  FOR INSERT
  TO authenticated
  WITH CHECK (
    bucket_id = 'support-chat'
    AND split_part(name, '/', 1) IN (
      SELECT c.id::text
      FROM public.support_conversations c
      WHERE c.user_id = auth.uid()
        OR public.has_role(auth.uid(), 'admin'::public.app_role)
    )
  );

DROP POLICY IF EXISTS "support_chat_objects_select" ON storage.objects;
CREATE POLICY "support_chat_objects_select"
  ON storage.objects
  FOR SELECT
  TO authenticated
  USING (
    bucket_id = 'support-chat'
    AND split_part(name, '/', 1) IN (
      SELECT c.id::text
      FROM public.support_conversations c
      WHERE c.user_id = auth.uid()
        OR public.has_role(auth.uid(), 'admin'::public.app_role)
    )
  );
