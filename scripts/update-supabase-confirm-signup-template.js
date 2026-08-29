#!/usr/bin/env node
/**
 * Backward-compatible wrapper for update-supabase-email-templates.js
 *
 * Usage:
 *   node scripts/update-supabase-confirm-signup-template.js YOUR_ACCESS_TOKEN
 */

const path = require('path');
const { spawnSync } = require('child_process');

const ACCESS_TOKEN = process.argv[2] || process.env.SUPABASE_ACCESS_TOKEN;
const SHARED_SCRIPT = path.join(__dirname, 'update-supabase-email-templates.js');

if (!ACCESS_TOKEN) {
  console.error('');
  console.error('Missing Supabase access token.');
  console.error('Run: node scripts/update-supabase-email-templates.js YOUR_TOKEN_HERE');
  console.error('');
  process.exit(1);
}

const result = spawnSync(process.execPath, [SHARED_SCRIPT, ACCESS_TOKEN], {
  stdio: 'inherit',
  cwd: path.join(__dirname, '..'),
});

process.exit(result.status ?? 1);
