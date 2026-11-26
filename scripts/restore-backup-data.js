import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import pg from "pg";

const { Client } = pg;
const __dirname = path.dirname(fileURLToPath(import.meta.url));
const rootDir = path.resolve(__dirname, "..");

function parseEnvFile(filePath) {
  if (!fs.existsSync(filePath)) return {};
  const values = {};
  for (const line of fs.readFileSync(filePath, "utf8").split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;
    const i = trimmed.indexOf("=");
    if (i === -1) continue;
    const key = trimmed.slice(0, i).trim();
    let value = trimmed.slice(i + 1).trim();
    if (
      (value.startsWith('"') && value.endsWith('"')) ||
      (value.startsWith("'") && value.endsWith("'"))
    ) {
      value = value.slice(1, -1);
    }
    values[key] = value;
  }
  return values;
}

const backupPath = path.join(
  rootDir,
  "backups",
  "supabase-20260917-042615",
  "data.sql",
);

async function main() {
  const env = { ...process.env, ...parseEnvFile(path.join(rootDir, ".env")) };
  const databaseUrl = env.DATABASE_URL || env.POSTGRES_URL;
  if (!databaseUrl) throw new Error("DATABASE_URL missing");
  if (!fs.existsSync(backupPath)) throw new Error(`Backup not found: ${backupPath}`);

  const client = new Client({
    connectionString: databaseUrl,
    ssl: { rejectUnauthorized: false },
  });
  await client.connect();

  console.log("Connected. Clearing seeded/auth tables that collide with backup...");
  await client.query("SET session_replication_role = replica");
  await client.query(`
    TRUNCATE TABLE
      auth.refresh_tokens,
      auth.mfa_amr_claims,
      auth.sessions,
      auth.one_time_tokens,
      auth.identities,
      auth.users
    CASCADE
  `);

  // Wipe public + storage metadata so INSERT restore can reload backup rows.
  const { rows: publicTables } = await client.query(`
    SELECT tablename
    FROM pg_tables
    WHERE schemaname = 'public'
      AND tablename NOT IN ('schema_migrations', 'supabase_migrations')
    ORDER BY tablename
  `);
  if (publicTables.length > 0) {
    const list = publicTables.map((r) => `public."${r.tablename}"`).join(", ");
    await client.query(`TRUNCATE TABLE ${list} CASCADE`);
    console.log(`Truncated ${publicTables.length} public tables`);
  }
  await client.query(`
    TRUNCATE TABLE storage.objects, storage.buckets CASCADE
  `);

  let sql = fs.readFileSync(backupPath, "utf8");
  sql = sql.replace(/^\\restrict.*$/gm, "").replace(/^\\unrestrict.*$/gm, "");

  console.log(`Restoring ${backupPath} (${sql.length} bytes)...`);
  try {
    await client.query(sql);
    console.log("Restore completed.");
  } catch (error) {
    console.error("Restore failed:", error.message);
    process.exitCode = 1;
  }

  const { rows } = await client.query(`
    SELECT
      (SELECT count(*)::int FROM auth.users) AS users,
      (SELECT count(*)::int FROM auth.identities) AS identities,
      (SELECT count(*)::int FROM public.profiles) AS profiles,
      (SELECT count(*)::int FROM public.data_plans) AS data_plans,
      (SELECT count(*)::int FROM public.data_transactions) AS data_tx,
      (SELECT count(*)::int FROM public.app_settings) AS settings,
      (SELECT count(*)::int FROM public.user_roles) AS roles,
      (SELECT count(*)::int FROM storage.buckets) AS buckets,
      (SELECT count(*)::int FROM storage.objects) AS storage_objects
  `);
  console.log("Counts:", rows[0]);

  await client.query("SET session_replication_role = DEFAULT");
  await client.end();
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
