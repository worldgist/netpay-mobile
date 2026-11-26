/**
 * Upload local mobile logo assets into the public `service-logos` storage bucket
 * and refresh service_logos.logo_url rows.
 *
 * Usage (from repo root, with SUPABASE_SERVICE_ROLE_KEY set):
 *   node scripts/upload-service-logos.mjs
 */
import { createClient } from '@supabase/supabase-js';
import { readFileSync, existsSync } from 'node:fs';
import { resolve, join } from 'node:path';

const SUPABASE_URL = process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL || process.env.EXPO_PUBLIC_SUPABASE_URL;
const SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!SUPABASE_URL || !SERVICE_ROLE_KEY) {
  console.error('Set SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY before running this script.');
  process.exit(1);
}

const imagesDir = resolve('mobile/assets/images');
const bucket = 'service-logos';

/** [storagePath, localFilename] */
const FILES = [
  ['airtime/mtn.png', 'mtn.png'],
  ['airtime/airtel.png', 'airtel.png'],
  ['airtime/glo.png', 'glo.png'],
  ['airtime/t2.png', 't2.png'],
  ['airtime/9mobile.png', '9mobile.png'],
  ['data/mtn.png', 'mtn.png'],
  ['data/airtel.png', 'airtel.png'],
  ['data/glo.png', 'glo.png'],
  ['data/t2.png', 't2.png'],
  ['data/9mobile.png', '9mobile.png'],
  ['electricity/IKEDC.png', 'IKEDC.png'],
  ['electricity/EKEDC.png', 'EKEDC.png'],
  ['electricity/AEDC.png', 'AEDC.png'],
  ['electricity/KAEDCO.png', 'KAEDCO.png'],
  ['electricity/IBEDC.png', 'IBEDC.png'],
  ['electricity/KEDCO.png', 'KEDCO.png'],
  ['electricity/PHEDC.png', 'PHEDC.png'],
  ['electricity/JED.png', 'JED.png'],
  ['electricity/BEDC.png', 'BEDC.png'],
  ['electricity/YEDC.png', 'YEDC.png'],
  ['electricity/EEDC.png', 'EEDC.png'],
  ['cable/dstv.png', 'dstv.png'],
  ['cable/gotv.png', 'gotv.png'],
  ['cable/startimes.png', 'startimes.png'],
  ['education/waec.png', 'waec.png'],
  ['education/neco.png', 'neco.png'],
  ['education/jamb.png', 'jamb.png'],
  ['betting/bet9ja.png', 'bet9ja.png'],
  ['betting/nairabet.png', 'nairabet.png'],
  ['betting/1xbet.png', '1xbet.png'],
  ['betting/betking.png', 'betking.png'],
  ['betting/betway.png', 'betway.png'],
  ['betting/merrybet.png', 'merrybet.png'],
  ['betting/bangbet.png.jpeg', 'bangbet.png.jpeg'],
  ['betting/betland.png.jpeg', 'betland.png.jpeg'],
  ['betting/betlion.png.jpeg', 'betlion.png.jpeg'],
  ['betting/cloudbet.png.jpeg', 'cloudbet.png.jpeg'],
  ['betting/livescorebet.png.jpeg', 'livescorebet.png.jpeg'],
  ['betting/naijabet.png.jpeg', 'naijabet.png.jpeg'],
  ['betting/supabet.png.jpeg', 'supabet.png.jpeg'],
  ['betting/sportybet.png', 'sportybet.png'],
  ['betting/accessbet.png', 'accessbet.png'],
];

function contentType(filename) {
  if (filename.endsWith('.png')) return 'image/png';
  if (filename.endsWith('.jpg') || filename.endsWith('.jpeg') || filename.endsWith('.png.jpeg')) {
    return 'image/jpeg';
  }
  if (filename.endsWith('.webp')) return 'image/webp';
  return 'application/octet-stream';
}

const supabase = createClient(SUPABASE_URL, SERVICE_ROLE_KEY, {
  auth: { persistSession: false, autoRefreshToken: false },
});

let uploaded = 0;
let skipped = 0;

for (const [storagePath, filename] of FILES) {
  const localPath = join(imagesDir, filename);
  if (!existsSync(localPath)) {
    console.warn(`Missing local file: ${filename}`);
    skipped += 1;
    continue;
  }

  const body = readFileSync(localPath);
  const { error } = await supabase.storage.from(bucket).upload(storagePath, body, {
    contentType: contentType(filename),
    upsert: true,
  });

  if (error) {
    console.error(`Failed ${storagePath}:`, error.message);
    skipped += 1;
    continue;
  }

  uploaded += 1;
  console.log(`Uploaded ${storagePath}`);
}

console.log(`Done. uploaded=${uploaded} skipped=${skipped}`);
