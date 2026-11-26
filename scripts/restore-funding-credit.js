import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const rootDir = path.resolve(__dirname, '..');

function parseEnvFile(filePath) {
  if (!fs.existsSync(filePath)) return {};
  const values = {};
  for (const line of fs.readFileSync(filePath, 'utf8').split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) continue;
    const separatorIndex = trimmed.indexOf('=');
    if (separatorIndex === -1) continue;
    const key = trimmed.slice(0, separatorIndex).trim();
    let value = trimmed.slice(separatorIndex + 1).trim();
    if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) {
      value = value.slice(1, -1);
    }
    values[key] = value;
  }
  return values;
}

const env = {
  ...process.env,
  ...parseEnvFile(path.join(rootDir, '.env')),
  ...parseEnvFile(path.join(rootDir, 'mobile', '.env')),
};

const SUPABASE_URL = env.SUPABASE_URL || env.EXPO_PUBLIC_SUPABASE_URL;
const ANON_KEY = env.EXPO_PUBLIC_SUPABASE_ANON_KEY;
const ADMIN_EMAIL = env.DEDUCT_ADMIN_EMAIL || 'jetway463@gmail.com';
const ADMIN_PASSWORD = env.DEDUCT_ADMIN_PASSWORD || 'Salifu147@';
const TARGET_USER_ID = env.TARGET_USER_ID || '39811af5-7541-47cb-be32-297ef2114c35';
const CREDIT_AMOUNT = Number(env.CREDIT_AMOUNT || 90);

async function login(email, password) {
  const res = await fetch(`${SUPABASE_URL}/auth/v1/token?grant_type=password`, {
    method: 'POST',
    headers: { apikey: ANON_KEY, 'Content-Type': 'application/json' },
    body: JSON.stringify({ email, password }),
  });
  const data = await res.json();
  if (!data.access_token) throw new Error(data.error_description || data.msg || 'Login failed');
  return data.access_token;
}

async function main() {
  const token = await login(ADMIN_EMAIL, ADMIN_PASSWORD);
  const res = await fetch(`${SUPABASE_URL}/functions/v1/credit-user`, {
    method: 'POST',
    headers: {
      apikey: ANON_KEY,
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      userId: TARGET_USER_ID,
      amount: CREDIT_AMOUNT,
      description: 'Restore single valid Flutterwave funding credit after duplicate reversal',
    }),
  });
  console.log(await res.text());
}

main().catch((error) => {
  console.error(error.message || error);
  process.exit(1);
});
