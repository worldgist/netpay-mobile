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

function getDatabaseUrl() {
  const envFromFile = parseEnvFile(path.join(rootDir, '.env'));
  const envSource = {
    ...process.env,
    ...envFromFile,
  };

  return envSource.DATABASE_URL || envSource.POSTGRES_URL || envSource.POSTGRES_URL_NON_POOLING || '';
}

function listMigrationFiles() {
  const migrationsDir = path.join(rootDir, 'supabase', 'migrations');
  if (!fs.existsSync(migrationsDir)) {
    throw new Error(`Migrations directory not found: ${migrationsDir}`);
  }

  return fs
    .readdirSync(migrationsDir)
    .filter((name) => name.endsWith('.sql'))
    .sort()
    .map((name) => path.join(migrationsDir, name));
}

function splitSqlStatements(sql) {
  const statements = [];
  let buffer = '';
  let inSingleQuote = false;
  let inDoubleQuote = false;

  for (let i = 0; i < sql.length; i += 1) {
    const char = sql[i];
    const prev = sql[i - 1];
    const next = sql[i + 1];

    if (char === "'" && !inDoubleQuote && (prev !== '\\' || (prev === '\\' && sql[i - 2] === '\\'))) {
      inSingleQuote = !inSingleQuote;
      buffer += char;
      continue;
    }

    if (char === '"' && !inSingleQuote) {
      inDoubleQuote = !inDoubleQuote;
      buffer += char;
      continue;
    }

    if (!inSingleQuote && !inDoubleQuote && char === ';') {
      const statement = buffer.trim();
      if (statement) {
        statements.push(statement);
      }
      buffer = '';
      continue;
    }

    buffer += char;
  }

  const trailing = buffer.trim();
  if (trailing) {
    statements.push(trailing);
  }

  return statements;
}

async function runMigration() {
  const databaseUrl = getDatabaseUrl();
  if (!databaseUrl) {
    console.error('No database connection string found. Set DATABASE_URL in .env or the shell before running this script.');
    process.exit(1);
  }

  const client = new Client({
    connectionString: databaseUrl,
    ssl: databaseUrl.includes('sslmode=require') || databaseUrl.includes('ssl=true') ? { rejectUnauthorized: false } : undefined,
  });

  await client.connect();

  try {
    const migrationFiles = listMigrationFiles();
    console.log(`Found ${migrationFiles.length} migration files.`);

    for (const filePath of migrationFiles) {
      const sql = fs.readFileSync(filePath, 'utf8');
      const statements = splitSqlStatements(sql);

      if (statements.length === 0) {
        continue;
      }

      console.log(`Applying ${path.basename(filePath)} (${statements.length} statements)`);
      for (const statement of statements) {
        await client.query(statement);
      }
      console.log(`Completed ${path.basename(filePath)}`);
    }

    console.log('Database migration completed successfully.');
  } catch (error) {
    console.error('Database migration failed:', error.message);
    process.exit(1);
  } finally {
    await client.end();
  }
}

async function verifyConnection() {
  const databaseUrl = getDatabaseUrl();
  if (!databaseUrl) {
    console.error('No database connection string found. Set DATABASE_URL in .env or the shell before running this script.');
    process.exit(1);
  }

  const client = new Client({
    connectionString: databaseUrl,
    ssl: databaseUrl.includes('sslmode=require') || databaseUrl.includes('ssl=true') ? { rejectUnauthorized: false } : undefined,
  });

  try {
    await client.connect();
    const { rows } = await client.query('SELECT current_database() AS db, current_user AS user');
    console.log(`Connected to PostgreSQL database: ${rows[0].db} as ${rows[0].user}`);
  } catch (error) {
    console.error('Database connection failed:', error.message);
    process.exit(1);
  } finally {
    await client.end();
  }
}

const args = process.argv.slice(2);
const verifyOnly = args.includes('--verify-only');

if (verifyOnly) {
  await verifyConnection();
} else {
  await runMigration();
}
