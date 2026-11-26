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

function createPgClient(connectionString) {
  if (!connectionString || connectionString.includes('username:password')) {
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

function buildUpsertQuery(table, columns, conflictTarget, updateColumns = []) {
  const colList = columns.map((column) => `"${column}"`).join(', ');
  const placeholders = columns.map((_, index) => `$${index + 1}`).join(', ');
  const updates = updateColumns
    .map((column) => `"${column}" = EXCLUDED."${column}"`)
    .join(', ');

  return `
    INSERT INTO ${table} (${colList})
    VALUES (${placeholders})
    ON CONFLICT (${conflictTarget}) DO UPDATE SET ${updates}
  `;
}

async function tableExists(client, schema, table) {
  const { rows } = await client.query(
    `
      SELECT 1
      FROM information_schema.tables
      WHERE table_schema = $1 AND table_name = $2
      LIMIT 1
    `,
    [schema, table],
  );
  return rows.length > 0;
}

async function getExistingColumns(client, schema, table) {
  const { rows } = await client.query(
    `
      SELECT column_name
      FROM information_schema.columns
      WHERE table_schema = $1 AND table_name = $2
    `,
    [schema, table],
  );
  return new Set(rows.map((row) => row.column_name));
}

async function fetchRows(client, schema, table, preferredColumns) {
  const existingColumns = await getExistingColumns(client, schema, table);
  const columns = preferredColumns.filter((column) => existingColumns.has(column));

  if (columns.length === 0) {
    throw new Error(`No matching columns found for ${schema}.${table}`);
  }

  const colList = columns.map((column) => `"${column}"`).join(', ');
  const { rows } = await client.query(`SELECT ${colList} FROM ${schema}.${table}`);
  return { columns, rows };
}

async function importRows(client, table, columns, rows, conflictTarget, updateColumns) {
  if (rows.length === 0) {
    return 0;
  }

  const query = buildUpsertQuery(table, columns, conflictTarget, updateColumns);
  let imported = 0;

  for (const row of rows) {
    const values = columns.map((column) => row[column]);
    await client.query(query, values);
    imported += 1;
  }

  return imported;
}

async function setAuthTriggerEnabled(client, enabled) {
  const exists = await tableExists(client, 'auth', 'users');
  if (!exists) {
    return;
  }

  await client.query(`ALTER TABLE auth.users ${enabled ? 'ENABLE' : 'DISABLE'} TRIGGER on_auth_user_created`);
}

async function importFromDatabase(sourceUrl, targetUrl, dryRun) {
  const source = createPgClient(sourceUrl);
  const target = createPgClient(targetUrl);

  await source.connect();
  await target.connect();

  try {
    const authUsers = await fetchRows(source, 'auth', 'users', AUTH_USER_COLUMNS);
    const identities = await fetchRows(source, 'auth', 'identities', IDENTITY_COLUMNS);
    const profiles = await fetchRows(source, 'public', 'profiles', PROFILE_COLUMNS);
    const roles = await fetchRows(source, 'public', 'user_roles', ['id', 'user_id', 'role']);

    console.log('Source counts:');
    console.log(`  auth.users: ${authUsers.rows.length}`);
    console.log(`  auth.identities: ${identities.rows.length}`);
    console.log(`  public.profiles: ${profiles.rows.length}`);
    console.log(`  public.user_roles: ${roles.rows.length}`);

    if (dryRun) {
      console.log('Dry run only. No data was written.');
      return;
    }

    await target.query('BEGIN');
    await setAuthTriggerEnabled(target, false);

    const importedUsers = await importRows(
      target,
      'auth.users',
      authUsers.columns,
      authUsers.rows,
      'id',
      authUsers.columns.filter((column) => column !== 'id'),
    );

    const importedIdentities = await importRows(
      target,
      'auth.identities',
      identities.columns,
      identities.rows,
      'id',
      identities.columns.filter((column) => column !== 'id'),
    );

    const importedProfiles = await importRows(
      target,
      'public.profiles',
      profiles.columns,
      profiles.rows,
      'id',
      profiles.columns.filter((column) => column !== 'id'),
    );

    const importedRoles = await importRows(
      target,
      'public.user_roles',
      roles.columns,
      roles.rows,
      roles.columns.includes('user_id') && roles.columns.includes('role') ? '(user_id, role)' : 'id',
      roles.columns.filter((column) => !['id', 'user_id', 'role'].includes(column)),
    );

    await setAuthTriggerEnabled(target, true);
    await target.query('COMMIT');

    console.log('Import completed:');
    console.log(`  auth.users: ${importedUsers}`);
    console.log(`  auth.identities: ${importedIdentities}`);
    console.log(`  public.profiles: ${importedProfiles}`);
    console.log(`  public.user_roles: ${importedRoles}`);
  } catch (error) {
    await target.query('ROLLBACK').catch(() => undefined);
    throw error;
  } finally {
    await source.end();
    await target.end();
  }
}

async function importFromJson(filePath, targetUrl, dryRun) {
  const payload = JSON.parse(fs.readFileSync(filePath, 'utf8'));
  const target = createPgClient(targetUrl);
  await target.connect();

  try {
    const authUsers = {
      columns: payload.authUsers?.columns || AUTH_USER_COLUMNS,
      rows: payload.authUsers?.rows || payload.users || [],
    };
    const identities = {
      columns: payload.identities?.columns || IDENTITY_COLUMNS,
      rows: payload.identities?.rows || [],
    };
    const profiles = {
      columns: payload.profiles?.columns || PROFILE_COLUMNS,
      rows: payload.profiles?.rows || [],
    };
    const roles = {
      columns: payload.userRoles?.columns || ['id', 'user_id', 'role'],
      rows: payload.userRoles?.rows || payload.roles || [],
    };

    console.log('Export file counts:');
    console.log(`  auth.users: ${authUsers.rows.length}`);
    console.log(`  auth.identities: ${identities.rows.length}`);
    console.log(`  public.profiles: ${profiles.rows.length}`);
    console.log(`  public.user_roles: ${roles.rows.length}`);

    if (dryRun) {
      console.log('Dry run only. No data was written.');
      return;
    }

    await target.query('BEGIN');
    await setAuthTriggerEnabled(target, false);

    await importRows(target, 'auth.users', authUsers.columns, authUsers.rows, 'id', authUsers.columns.filter((column) => column !== 'id'));
    await importRows(target, 'auth.identities', identities.columns, identities.rows, 'id', identities.columns.filter((column) => column !== 'id'));
    await importRows(target, 'public.profiles', profiles.columns, profiles.rows, 'id', profiles.columns.filter((column) => column !== 'id'));
    await importRows(
      target,
      'public.user_roles',
      roles.columns,
      roles.rows,
      roles.columns.includes('user_id') && roles.columns.includes('role') ? '(user_id, role)' : 'id',
      roles.columns.filter((column) => !['id', 'user_id', 'role'].includes(column)),
    );

    await setAuthTriggerEnabled(target, true);
    await target.query('COMMIT');
    console.log('Import from JSON completed.');
  } catch (error) {
    await target.query('ROLLBACK').catch(() => undefined);
    throw error;
  } finally {
    await target.end();
  }
}

async function main() {
  const env = getEnv();
  const args = process.argv.slice(2);
  const dryRun = args.includes('--dry-run');
  const fileArgIndex = args.findIndex((arg) => arg === '--file');
  const filePath = fileArgIndex >= 0 ? args[fileArgIndex + 1] : null;

  const targetUrl = env.TARGET_DATABASE_URL || env.DATABASE_URL || env.POSTGRES_URL;
  const sourceUrl = env.SOURCE_DATABASE_URL;

  if (!targetUrl) {
    throw new Error('Set TARGET_DATABASE_URL or DATABASE_URL in .env before importing users.');
  }

  if (filePath) {
    await importFromJson(path.resolve(filePath), targetUrl, dryRun);
    return;
  }

  if (!sourceUrl) {
    throw new Error('Set SOURCE_DATABASE_URL in .env or pass --file path/to/users-export.json');
  }

  await importFromDatabase(sourceUrl, targetUrl, dryRun);
}

main().catch((error) => {
  console.error('User import failed:', error.message);
  process.exit(1);
});
