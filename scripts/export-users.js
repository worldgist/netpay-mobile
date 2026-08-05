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

function createPgClient(connectionString) {
  if (!connectionString || connectionString.includes('[YOUR-DB-PASSWORD]') || connectionString.includes('username:password')) {
    throw new Error('Database URL is missing or still uses placeholder credentials.');
  }

  return new Client({
    connectionString,
    ssl: { rejectUnauthorized: false },
  });
}

const AUTH_USER_COLUMNS = [
  'instance_id',
  'id',
  'aud',
  'role',
  'email',
  'encrypted_password',
  'email_confirmed_at',
  'invited_at',
  'confirmation_token',
  'confirmation_sent_at',
  'recovery_token',
  'recovery_sent_at',
  'email_change_token_new',
  'email_change',
  'email_change_sent_at',
  'last_sign_in_at',
  'raw_app_meta_data',
  'raw_user_meta_data',
  'is_super_admin',
  'created_at',
  'updated_at',
  'phone',
  'phone_confirmed_at',
  'phone_change',
  'phone_change_token',
  'phone_change_sent_at',
  'confirmed_at',
  'email_change_token_current',
  'email_change_confirm_status',
  'banned_until',
  'reauthentication_token',
  'reauthentication_sent_at',
  'is_sso_user',
  'deleted_at',
  'is_anonymous',
];

const IDENTITY_COLUMNS = [
  'provider_id',
  'user_id',
  'identity_data',
  'provider',
  'last_sign_in_at',
  'created_at',
  'updated_at',
  'email',
  'id',
];

const PROFILE_COLUMNS = [
  'id',
  'full_name',
  'email',
  'phone',
  'balance',
  'status',
  'created_at',
  'updated_at',
  'biometric_enabled',
  'pin_enabled',
  'pin_hash',
];

async function getExistingColumns(client, schema, table, preferredColumns) {
  const { rows } = await client.query(
    `
      SELECT column_name
      FROM information_schema.columns
      WHERE table_schema = $1 AND table_name = $2
    `,
    [schema, table],
  );

  const existing = new Set(rows.map((row) => row.column_name));
  return preferredColumns.filter((column) => existing.has(column));
}

async function fetchRows(client, schema, table, preferredColumns) {
  const columns = await getExistingColumns(client, schema, table, preferredColumns);
  if (columns.length === 0) {
    return { columns: [], rows: [] };
  }

  const colList = columns.map((column) => `"${column}"`).join(', ');
  const { rows } = await client.query(`SELECT ${colList} FROM ${schema}.${table}`);
  return { columns, rows };
}

async function main() {
  const env = {
    ...process.env,
    ...parseEnvFile(path.join(rootDir, '.env')),
  };

  const sourceUrl = env.SOURCE_DATABASE_URL;
  if (!sourceUrl) {
    throw new Error('Set SOURCE_DATABASE_URL in .env to the old Supabase database connection string.');
  }

  const client = createPgClient(sourceUrl);
  await client.connect();

  try {
    const authUsers = await fetchRows(client, 'auth', 'users', AUTH_USER_COLUMNS);
    const identities = await fetchRows(client, 'auth', 'identities', IDENTITY_COLUMNS);
    const profiles = await fetchRows(client, 'public', 'profiles', PROFILE_COLUMNS);
    const roles = await getExistingColumns(client, 'public', 'user_roles', ['id', 'user_id', 'role']);
    const roleRows = roles.length
      ? (await client.query(`SELECT ${roles.map((column) => `"${column}"`).join(', ')} FROM public.user_roles`)).rows
      : [];

    const output = {
      exportedAt: new Date().toISOString(),
      authUsers,
      identities,
      profiles,
      userRoles: {
        columns: roles,
        rows: roleRows,
      },
    };

    const outputPath = path.join(rootDir, 'data', 'users-export.json');
    fs.mkdirSync(path.dirname(outputPath), { recursive: true });
    fs.writeFileSync(outputPath, JSON.stringify(output, null, 2));

    console.log(`Exported users to ${outputPath}`);
    console.log(`  auth.users: ${authUsers.rows.length}`);
    console.log(`  auth.identities: ${identities.rows.length}`);
    console.log(`  public.profiles: ${profiles.rows.length}`);
    console.log(`  public.user_roles: ${roleRows.length}`);
  } finally {
    await client.end();
  }
}

main().catch((error) => {
  console.error('User export failed:', error.message);
  process.exit(1);
});
