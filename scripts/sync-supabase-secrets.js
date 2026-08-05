import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { spawnSync } from 'child_process';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const rootDir = path.resolve(__dirname, '..');

const EDGE_FUNCTION_SECRETS = [
  'SMEPLUG_SECRET_KEY',
  'SMEPLUG_PUBLIC_KEY',
  'EBILLS_USERNAME',
  'EBILLS_PASSWORD',
  'MOBILENIG_PUBLIC_KEY',
  'MOBILENIG_SECRET_KEY',
  'PAYVESSEL_API_KEY',
  'PAYVESSEL_SECRET_KEY',
  'PAYVESSEL_BUSINESS_ID',
  'VTPASS_API_KEY',
  'VTPASS_PUBLIC_KEY',
  'VTPASS_SECRET_KEY',
  'VTPASS_MODE',
  'FLUTTERWAVE_PUBLIC_KEY',
  'FLUTTERWAVE_SECRET_KEY',
  'FLUTTERWAVE_SECRET_HASH',
  'RESEND_API_KEY',
  'RESEND_FROM_EMAIL',
  'RESEND_TO_EMAIL',
  'OPENAI_API_KEY',
  'ENCRYPTION_KEY',
  'NETPAY_SITE_URL',
  'SITE_URL',
  'NETPAY_LOGO_URL',
  'BLOCK_VPN_PROXY',
  'REFERRAL_REWARD_AMOUNT',
  'WEB_APP_HOST_BLOCK_DISABLED',
  'BLOCK_WEB_APP_ON_HOSTS',
];

const PLACEHOLDER_PATTERNS = [
  /^your-/i,
  /^change-?me/i,
  /^placeholder/i,
  /^xxx+$/i,
  /^<.+>$/,
];

function parseEnvFile(filePath) {
  if (!fs.existsSync(filePath)) {
    return {};
  }

  const values = {};
  for (const line of fs.readFileSync(filePath, 'utf8').split(/\r?\n/)) {
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

function isPlaceholder(value) {
  if (!value || !value.trim()) {
    return true;
  }

  return PLACEHOLDER_PATTERNS.some((pattern) => pattern.test(value.trim()));
}

function buildSecretArgs(env) {
  const args = [];

  for (const key of EDGE_FUNCTION_SECRETS) {
    const value = env[key];
    if (isPlaceholder(value)) {
      continue;
    }
    args.push(`${key}=${value}`);
  }

  return args;
}

function main() {
  const dryRun = process.argv.includes('--dry-run');
  const env = {
    ...parseEnvFile(path.join(rootDir, '.env')),
    ...process.env,
  };

  const secretArgs = buildSecretArgs(env);

  if (secretArgs.length === 0) {
    console.log('No non-placeholder edge function secrets found in .env');
    console.log('Add real values to .env, then run: npm run supabase:sync-secrets');
    process.exit(0);
  }

  console.log(`Syncing ${secretArgs.length} secret(s) to linked Supabase project...\n`);
  for (const arg of secretArgs) {
    const key = arg.split('=')[0];
    console.log(`  - ${key}`);
  }
  console.log('');

  if (dryRun) {
    console.log('Dry run only. No secrets were sent.');
    return;
  }

  const supabaseBin = path.join(rootDir, 'node_modules', '.bin', process.platform === 'win32' ? 'supabase.cmd' : 'supabase');

  const spawnArgs = process.platform === 'win32'
    ? ['cmd.exe', '/c', supabaseBin, 'secrets', 'set', ...secretArgs]
    : [supabaseBin, 'secrets', 'set', ...secretArgs];

  const result = spawnSync(spawnArgs[0], spawnArgs.slice(1), {
    cwd: rootDir,
    stdio: 'inherit',
  });

  if (result.status !== 0) {
    process.exit(result.status ?? 1);
  }

  console.log('\nSecrets synced. Redeploy functions so they pick up changes:');
  console.log('  npm run supabase:deploy-functions');
}

main();
