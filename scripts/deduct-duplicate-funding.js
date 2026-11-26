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
const SERVICE_ROLE_KEY = env.SUPABASE_SERVICE_ROLE_KEY;
const ADMIN_EMAIL = env.DEDUCT_ADMIN_EMAIL || 'jetway463@gmail.com';
const ADMIN_PASSWORD = env.DEDUCT_ADMIN_PASSWORD || 'Salifu147@';
const TARGET_EMAIL = env.DEDUCT_TARGET_EMAIL || 'mustynetpay14@gmail.com';
const DEDUCT_AMOUNT = env.DEDUCT_AMOUNT ? Number(env.DEDUCT_AMOUNT) : null;
const KEEP_BALANCE = env.KEEP_BALANCE ? Number(env.KEEP_BALANCE) : null;

if (!SUPABASE_URL || !ANON_KEY) {
  console.error('Missing SUPABASE_URL or EXPO_PUBLIC_SUPABASE_ANON_KEY');
  process.exit(1);
}

async function rest(pathname, { method = 'GET', body, token, useServiceRole = false } = {}) {
  const authToken = useServiceRole ? SERVICE_ROLE_KEY : token;
  const apiKey = useServiceRole ? SERVICE_ROLE_KEY : ANON_KEY;
  const headers = {
    apikey: apiKey,
    Authorization: `Bearer ${authToken}`,
    'Content-Type': 'application/json',
  };
  const res = await fetch(`${SUPABASE_URL}${pathname}`, {
    method,
    headers,
    body: body ? JSON.stringify(body) : undefined,
  });
  const text = await res.text();
  let data;
  try {
    data = text ? JSON.parse(text) : null;
  } catch {
    data = text;
  }
  if (!res.ok) {
    throw new Error(typeof data === 'object' ? JSON.stringify(data) : String(data));
  }
  return data;
}

async function login(email, password) {
  const res = await fetch(`${SUPABASE_URL}/auth/v1/token?grant_type=password`, {
    method: 'POST',
    headers: {
      apikey: ANON_KEY,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ email, password }),
  });
  const data = await res.json();
  if (!data.access_token) {
    throw new Error(data.error_description || data.msg || 'Login failed');
  }
  return data.access_token;
}

async function main() {
  const adminToken = await login(ADMIN_EMAIL, ADMIN_PASSWORD);

  const profiles = await rest(
    `/rest/v1/profiles?select=id,email,full_name,balance&email=eq.${encodeURIComponent(TARGET_EMAIL)}`,
    { token: adminToken },
  );
  const profile = profiles?.[0];
  if (!profile) {
    throw new Error(`Profile not found for ${TARGET_EMAIL}`);
  }

  const credits = await rest(
    `/rest/v1/user_transactions?select=id,reference,amount,description,created_at&user_id=eq.${profile.id}&transaction_type=eq.credit&description=ilike.*Flutterwave*&order=created_at.desc&limit=1000`,
    { token: adminToken },
  );

  console.log('User:', profile.email, profile.id);
  console.log('Current balance:', profile.balance);
  console.log('Recent Flutterwave credits:');
  for (const row of credits || []) {
    console.log(`  - ₦${row.amount} ref=${row.reference} at ${row.created_at}`);
  }

  const creditCount = (credits || []).length;
  const creditAmount = Number(credits?.[0]?.amount || 90);
  const keepCount = 1;
  const deductCount = Math.max(0, creditCount - keepCount);
  const targetBalance = KEEP_BALANCE ?? keepCount * creditAmount;
  const currentBalance = Number(profile.balance || 0);
  const amountToDeduct = DEDUCT_AMOUNT ?? Math.max(0, currentBalance - targetBalance);

  if (amountToDeduct <= 0) {
    console.log(`Nothing to deduct. Balance ₦${currentBalance}; target ₦${targetBalance}.`);
    return;
  }

  console.log(`Deducting ₦${amountToDeduct} to leave ₦${targetBalance} (${creditCount} Flutterwave credit entries found)`);

  const result = await rest('/functions/v1/debit-user', {
    method: 'POST',
    token: adminToken,
    body: {
      userId: profile.id,
      amount: amountToDeduct,
      description: `Reversal of duplicate Flutterwave wallet funding credits (keeping ${keepCount} credit of ₦${creditAmount})`,
    },
  });

  console.log('Debit result:', JSON.stringify(result, null, 2));

  const refreshed = await rest(
    `/rest/v1/profiles?select=balance&id=eq.${profile.id}`,
    { token: adminToken },
  );
  console.log('New balance:', refreshed?.[0]?.balance);
}

main().catch((error) => {
  console.error(error.message || error);
  process.exit(1);
});
