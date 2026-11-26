/**
 * Upsert Terms & Privacy into content_pages on the linked Supabase project.
 * Uses SUPABASE_URL + SUPABASE_SERVICE_ROLE_KEY or SUPABASE_ANON_KEY from .env
 * (service role required for write under RLS).
 */
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { createClient } from '@supabase/supabase-js';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

function loadEnv() {
  const env = {};
  const file = path.join(root, '.env');
  if (!fs.existsSync(file)) return env;
  for (const line of fs.readFileSync(file, 'utf8').split(/\r?\n/)) {
    const trimmed = line.trim().replace(/^\uFEFF/, '');
    if (!trimmed || trimmed.startsWith('#') || !trimmed.includes('=')) continue;
    const i = trimmed.indexOf('=');
    let value = trimmed.slice(i + 1).trim();
    if (
      (value.startsWith('"') && value.endsWith('"')) ||
      (value.startsWith("'") && value.endsWith("'"))
    ) {
      value = value.slice(1, -1);
    }
    env[trimmed.slice(0, i).trim()] = value;
  }
  return env;
}

function loadLegalFromTs() {
  const file = path.join(root, 'src', 'content', 'legal-content.ts');
  const text = fs.readFileSync(file, 'utf8');
  const extract = (name) => {
    const re = new RegExp(`export const ${name} = \`([\\s\\S]*?)\`;`);
    const m = text.match(re);
    if (!m) throw new Error(`Could not parse ${name}`);
    return m[1];
  };
  const extractStr = (name) => {
    const re = new RegExp(`export const ${name} =\\s*'([^']*)'`);
    const m = text.match(re);
    if (!m) throw new Error(`Could not parse ${name}`);
    return m[1];
  };
  return {
    termsTitle: extractStr('LEGAL_TERMS_TITLE'),
    termsMeta: extractStr('LEGAL_TERMS_META'),
    termsMd: extract('LEGAL_TERMS_MARKDOWN'),
    privacyTitle: extractStr('LEGAL_PRIVACY_TITLE'),
    privacyMeta: extractStr('LEGAL_PRIVACY_META'),
    privacyMd: extract('LEGAL_PRIVACY_MARKDOWN'),
  };
}

const env = loadEnv();
const url = env.SUPABASE_URL || env.VITE_SUPABASE_URL || env.EXPO_PUBLIC_SUPABASE_URL;
const key = env.SUPABASE_SERVICE_ROLE_KEY || env.SERVICE_ROLE_KEY;

if (!url || !key) {
  console.error('Need SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY in .env to upsert content_pages.');
  console.error('Landing pages will still show the new fallback content from the app bundle.');
  process.exit(0);
}

const legal = loadLegalFromTs();
const supabase = createClient(url, key, { auth: { persistSession: false } });

async function upsert(pageType, title, content, meta) {
  const { data: existing, error: findError } = await supabase
    .from('content_pages')
    .select('id')
    .eq('page_type', pageType)
    .maybeSingle();
  if (findError) throw findError;

  const row = {
    page_type: pageType,
    title,
    content,
    meta_description: meta,
    is_published: true,
  };

  if (existing?.id) {
    const { error } = await supabase.from('content_pages').update(row).eq('id', existing.id);
    if (error) throw error;
    console.log(`updated ${pageType}`);
  } else {
    const { error } = await supabase.from('content_pages').insert(row);
    if (error) throw error;
    console.log(`inserted ${pageType}`);
  }
}

await upsert('terms_conditions', legal.termsTitle, legal.termsMd, legal.termsMeta);
await upsert('privacy_policy', legal.privacyTitle, legal.privacyMd, legal.privacyMeta);
console.log('done');
