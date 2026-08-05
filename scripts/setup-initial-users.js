import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import pg from 'pg';

const { Client } = pg;
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const rootDir = path.resolve(__dirname, '..');

function parseEnvFile(filePath) {
  if (!fs.existsSync(filePath)) {
    return {};
  }

  const content = fs.readFileSync(filePath, 'utf8');
  const values = {};

  for (const line of content.split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) {
      continue;
    }

    const separatorIndex = trimmed.indexOf('=');
    if (separatorIndex === -1) {
      continue;
    }

    const key = trimmed.slice(0, separatorIndex).trim();
    let value = trimmed.slice(separatorIndex + 1).trim();

    if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) {
      value = value.slice(1, -1);
    }

    values[key] = value;
  }

  return values;
}

function getEnv() {
  return {
    ...process.env,
    ...parseEnvFile(path.join(rootDir, '.env')),
  };
}

const BUILTIN_USERS = [
  {
    email: 'demo@netppay.com',
    password: 'Demo@1234',
    full_name: 'Demo User',
    phone: '08012345678',
    balance: 100000,
    pin: '1234',
    role: 'user',
    demo: true,
  },
  {
    email: 'demo-recipient@netppay.com',
    password: 'Demo@1234',
    full_name: 'Demo Recipient',
    phone: '08098765432',
    balance: 10000,
    pin: null,
    role: 'user',
  },
  {
    email: 'jetway463@gmail.com',
    password: 'Salifu147@',
    full_name: 'NetPay User',
    phone: '08105393046',
    balance: 17406,
    pin: null,
    role: 'user',
  },
  {
    email: 'netpay0147@gmail.com',
    password: 'Salifu114477@',
    full_name: 'Mustapha Suleiman',
    phone: '07067398399',
    balance: 0,
    pin: null,
    role: 'user',
  },
  {
    email: 'oluwapainz@gmail.com',
    password: 'Salifu114477@',
    full_name: 'NetPay Admin',
    phone: null,
    balance: 0,
    pin: null,
    role: 'admin',
  },
];

function loadExtraUsers() {
  const dataDir = path.join(rootDir, 'data');
  const candidates = [
    path.join(dataDir, 'users-seed.json'),
    path.join(dataDir, 'users-export.json'),
  ];

  const merged = new Map(BUILTIN_USERS.map((user) => [user.email.toLowerCase(), user]));

  for (const filePath of candidates) {
    if (!fs.existsSync(filePath)) {
      continue;
    }

    const payload = JSON.parse(fs.readFileSync(filePath, 'utf8'));
    const rows = Array.isArray(payload) ? payload : payload.users;

    if (!Array.isArray(rows)) {
      continue;
    }

    for (const row of rows) {
      const email = row.email?.trim();
      if (!email) {
        continue;
      }

      merged.set(email.toLowerCase(), {
        email,
        password: row.password || 'ChangeMe123!',
        full_name: row.full_name || row.fullName || email.split('@')[0],
        phone: row.phone || row.phoneNumber || null,
        balance: Number(row.balance ?? 0),
        pin: row.pin || null,
        role: row.role === 'admin' ? 'admin' : 'user',
        demo: Boolean(row.demo),
      });
    }
  }

  return [...merged.values()];
}

async function findUserId(client, email) {
  const { rows } = await client.query(
    'SELECT id FROM auth.users WHERE email = $1 LIMIT 1',
    [email],
  );
  return rows[0]?.id ?? null;
}

async function createAuthUser(client, user) {
  let userId = await findUserId(client, user.email);

  if (userId) {
    await client.query(
      `UPDATE auth.users
       SET encrypted_password = crypt($2, gen_salt('bf')),
           email_confirmed_at = COALESCE(email_confirmed_at, NOW()),
           raw_user_meta_data = COALESCE(raw_user_meta_data, '{}'::jsonb) || $3::jsonb,
           updated_at = NOW()
       WHERE id = $1`,
      [
        userId,
        user.password,
        JSON.stringify({
          full_name: user.full_name,
          ...(user.phone ? { phone: user.phone } : {}),
        }),
      ],
    );
    return { userId, created: false };
  }

  userId = crypto.randomUUID();
  const metadata = JSON.stringify({
    full_name: user.full_name,
    ...(user.phone ? { phone: user.phone } : {}),
  });

  await client.query(
    `INSERT INTO auth.users (
      instance_id,
      id,
      aud,
      role,
      email,
      encrypted_password,
      email_confirmed_at,
      recovery_sent_at,
      last_sign_in_at,
      raw_app_meta_data,
      raw_user_meta_data,
      created_at,
      updated_at,
      confirmation_token,
      email_change,
      email_change_token_new,
      recovery_token
    ) VALUES (
      '00000000-0000-0000-0000-000000000000',
      $1,
      'authenticated',
      'authenticated',
      $2,
      crypt($3, gen_salt('bf')),
      NOW(),
      NOW(),
      NOW(),
      '{"provider":"email","providers":["email"]}'::jsonb,
      $4::jsonb,
      NOW(),
      NOW(),
      '',
      '',
      '',
      ''
    )`,
    [userId, user.email, user.password, metadata],
  );

  await client.query(
    `INSERT INTO auth.identities (
      id,
      user_id,
      identity_data,
      provider,
      last_sign_in_at,
      created_at,
      updated_at,
      provider_id
    ) VALUES (
      gen_random_uuid(),
      $1::uuid,
      jsonb_build_object('sub', $1::text, 'email', $2::text),
      'email',
      NOW(),
      NOW(),
      NOW(),
      $1::text
    )
    ON CONFLICT DO NOTHING`,
    [userId, user.email],
  );

  return { userId, created: true };
}

async function upsertProfile(client, user, userId) {
  let pinClause = '';
  const params = [userId, user.email, user.full_name, user.phone, user.balance];

  if (user.pin) {
    pinClause = `, pin_hash = crypt($6, gen_salt('bf')), pin_enabled = true`;
    params.push(user.pin);
  }

  await client.query(
    `INSERT INTO public.profiles (id, email, full_name, phone, balance, status)
     VALUES ($1, $2, $3, $4, $5, 'active')
     ON CONFLICT (id) DO UPDATE SET
       email = EXCLUDED.email,
       full_name = EXCLUDED.full_name,
       phone = COALESCE(EXCLUDED.phone, profiles.phone),
       balance = EXCLUDED.balance,
       status = 'active',
       updated_at = NOW()
       ${pinClause}`,
    params,
  );
}

async function grantAdminRole(client, email) {
  await client.query('SELECT public.grant_admin_role_by_email($1)', [email]);
}

async function setupDemoExtras(client, userId) {
  await client.query(
    `INSERT INTO public.virtual_accounts (
      user_id, business_id, bank_code, bank_name, account_number, account_name, tracking_reference
    ) VALUES ($1, 'DEMO_BUSINESS', '999991', 'PalmPay', '1234567890', 'DEMO USER', $2)
    ON CONFLICT (user_id, bank_code) DO UPDATE SET
      account_number = EXCLUDED.account_number,
      account_name = EXCLUDED.account_name,
      tracking_reference = EXCLUDED.tracking_reference`,
    [userId, `DEMO-${userId}`],
  );

  await client.query(
    `DELETE FROM public.user_transactions
     WHERE user_id = $1 AND reference LIKE 'DEMO-%'`,
    [userId],
  );

  await client.query(
    `INSERT INTO public.user_transactions (
      user_id, transaction_type, amount, balance_before, balance_after, description, reference, performed_by, created_at
    ) VALUES
      ($1::uuid, 'credit', 100000, 0, 100000, 'Demo account initial funding', 'DEMO-INITIAL-001', $1::uuid, NOW() - INTERVAL '10 days'),
      ($1::uuid, 'debit', 1000, 100000, 99000, 'Demo airtime purchase - MTN ₦1,000', 'DEMO-AIRTIME-001', $1::uuid, NOW() - INTERVAL '9 days'),
      ($1::uuid, 'debit', 2000, 99000, 97000, 'Demo data purchase - 5GB MTN', 'DEMO-DATA-001', $1::uuid, NOW() - INTERVAL '7 days')`,
    [userId],
  );
}

async function setupJetwayTransaction(client, userId) {
  const { rows } = await client.query(
    `SELECT id FROM public.user_transactions
     WHERE user_id = $1 AND reference = 'SEED-INITIAL-001'
     LIMIT 1`,
    [userId],
  );

  if (rows.length > 0) {
    return;
  }

  await client.query(
    `INSERT INTO public.user_transactions (
      user_id, transaction_type, amount, balance_before, balance_after, description, reference, performed_by
    ) VALUES ($1, 'credit', 17406, 0, 17406, 'Account balance restored on new database', 'SEED-INITIAL-001', $1)`,
    [userId],
  );
}

async function verifyLogin(supabaseUrl, anonKey, email, password) {
  const res = await fetch(`${supabaseUrl}/auth/v1/token?grant_type=password`, {
    method: 'POST',
    headers: {
      apikey: anonKey,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ email, password }),
  });

  const data = await res.json();
  return Boolean(data.access_token);
}

async function main() {
  const env = getEnv();
  const databaseUrl = env.TARGET_DATABASE_URL || env.DATABASE_URL || env.POSTGRES_URL;

  if (!databaseUrl) {
    throw new Error('DATABASE_URL is not set in .env');
  }

  const client = new Client({
    connectionString: databaseUrl,
    ssl: { rejectUnauthorized: false },
  });

  await client.connect();

  try {
    await client.query('CREATE EXTENSION IF NOT EXISTS pgcrypto');

    const users = loadExtraUsers();
    const results = [];

    for (const user of users) {
      const { userId, created } = await createAuthUser(client, user);
      await upsertProfile(client, user, userId);

      if (user.role === 'admin') {
        await grantAdminRole(client, user.email);
      }

      if (user.demo) {
        await setupDemoExtras(client, userId);
      }

      if (user.email === 'jetway463@gmail.com') {
        await setupJetwayTransaction(client, userId);
      }

      results.push({
        email: user.email,
        userId,
        created,
        role: user.role,
        balance: user.balance,
        phone: user.phone,
      });
    }

    console.log('\nUsers set up successfully:\n');
    for (const result of results) {
      console.log(`  ${result.created ? 'Created' : 'Updated'}: ${result.email}`);
      console.log(`    ID: ${result.userId}`);
      console.log(`    Role: ${result.role}`);
      console.log(`    Balance: ₦${users.find((u) => u.email === result.email)?.balance?.toLocaleString() ?? '0'}`);
      if (result.phone) {
        console.log(`    Phone: ${result.phone}`);
      }
      console.log('');
    }

    const supabaseUrl = env.SUPABASE_URL || env.VITE_SUPABASE_URL;
    const anonKey = env.SUPABASE_ANON_KEY || env.VITE_SUPABASE_ANON_KEY;

    if (supabaseUrl && anonKey) {
      console.log('Verifying logins...\n');
      for (const user of users) {
        const ok = await verifyLogin(supabaseUrl, anonKey, user.email, user.password);
        console.log(`  ${user.email}: ${ok ? 'OK' : 'FAILED'}`);
      }
    }
  } finally {
    await client.end();
  }
}

main().catch((error) => {
  console.error('Setup failed:', error.message);
  process.exit(1);
});
