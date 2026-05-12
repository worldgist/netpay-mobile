import { File as ExpoFsFile } from 'expo-file-system';
import type { SupabaseClient } from '@supabase/supabase-js';

export const SUPPORT_CHAT_BUCKET = 'support-chat';
const MAX_BYTES = 25 * 1024 * 1024;

const IMAGE_EXT = new Set(['jpg', 'jpeg', 'png', 'gif', 'webp', 'heic', 'heif', 'bmp', 'tif', 'tiff']);

export type SupportAttachmentMessageRow = {
  id: string;
  sender_id: string;
  body: string;
  created_at: string;
  kind: string | null;
  attachment_path: string | null;
  attachment_mime: string | null;
  attachment_name: string | null;
};

function safeFileName(name: string): string {
  const base = name.replace(/[^a-zA-Z0-9._-]+/g, '_').slice(0, 120);
  return base || 'file';
}

function inferAttachmentKind(mimeType: string, fileName: string): 'image' | 'file' {
  const m = (mimeType || '').toLowerCase();
  if (m.startsWith('image/')) return 'image';
  const ext = (fileName.split('.').pop() || '').toLowerCase();
  if (IMAGE_EXT.has(ext)) return 'image';
  return 'file';
}

/** Read a local `file://` or `content://` URI into a Blob (`fetch` often fails on Android gallery URIs). */
async function readLocalUriAsBlob(uri: string, mimeType: string): Promise<Blob> {
  try {
    const res = await fetch(uri);
    if (res.ok) {
      const blob = await res.blob();
      if (blob.size > 0) return blob;
    }
  } catch {
    /* fall through */
  }

  try {
    const file = new ExpoFsFile(uri);
    const buf = await file.arrayBuffer();
    if (buf.byteLength > 0) {
      return new Blob([buf], { type: mimeType || 'application/octet-stream' });
    }
  } catch {
    /* handled below */
  }

  throw new Error('Could not read the selected file.');
}

export async function uploadAndInsertSupportAttachment(
  client: SupabaseClient,
  opts: {
    conversationId: string;
    senderId: string;
    localUri: string;
    mimeType: string;
    fileName: string;
    caption?: string;
  }
): Promise<SupportAttachmentMessageRow> {
  const blob = await readLocalUriAsBlob(opts.localUri, opts.mimeType || 'application/octet-stream');
  if (blob.size > MAX_BYTES) {
    throw new Error('File is too large (max 25 MB).');
  }

  const ext = (opts.fileName.split('.').pop() || 'bin').toLowerCase().slice(0, 8);
  const objectId =
    typeof globalThis !== 'undefined' && globalThis.crypto?.randomUUID
      ? globalThis.crypto.randomUUID()
      : `${Date.now()}-${Math.random().toString(36).slice(2, 11)}`;
  const path = `${opts.conversationId}/${objectId}.${ext}`;

  const kind = inferAttachmentKind(opts.mimeType, opts.fileName);
  const contentType =
    (opts.mimeType && opts.mimeType.trim()) ||
    (kind === 'image' ? 'image/jpeg' : 'application/octet-stream');

  const { error: upErr } = await client.storage.from(SUPPORT_CHAT_BUCKET).upload(path, blob, {
    contentType,
    upsert: false,
  });
  if (upErr) throw upErr;

  const caption = opts.caption?.trim() ?? '';

  const { data: row, error: insErr } = await client
    .from('support_messages')
    .insert({
      conversation_id: opts.conversationId,
      sender_id: opts.senderId,
      body: caption,
      kind,
      attachment_path: path,
      attachment_mime: contentType,
      attachment_name: safeFileName(opts.fileName),
    })
    .select('id, sender_id, body, created_at, kind, attachment_path, attachment_mime, attachment_name')
    .single();
  if (insErr) {
    await client.storage.from(SUPPORT_CHAT_BUCKET).remove([path]).catch(() => {});
    throw insErr;
  }
  if (!row) {
    await client.storage.from(SUPPORT_CHAT_BUCKET).remove([path]).catch(() => {});
    throw new Error('Message was not returned after insert.');
  }
  return row as SupportAttachmentMessageRow;
}
