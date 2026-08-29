#!/usr/bin/env node
/**
 * Push the Confirm signup email template to hosted Supabase.
 *
 * Usage (any one):
 *   node scripts/update-supabase-confirm-signup-template.js YOUR_ACCESS_TOKEN
 *   set SUPABASE_ACCESS_TOKEN=YOUR_ACCESS_TOKEN && node scripts/update-supabase-confirm-signup-template.js
 *
 * Token: https://supabase.com/dashboard/account/tokens
 */

const fs = require('fs');
const path = require('path');

const PROJECT_REF =
  process.env.SUPABASE_PROJECT_REF ||
  fs.readFileSync(path.join(__dirname, '../supabase/config.toml'), 'utf8').match(/^project_id\s*=\s*"([^"]+)"/)?.[1];

const ACCESS_TOKEN = process.argv[2] || process.env.SUPABASE_ACCESS_TOKEN;
const TEMPLATE_PATH = path.join(__dirname, '../supabase/templates/confirm-signup.html');

async function main() {
  if (!ACCESS_TOKEN) {
    console.error('');
    console.error('Missing Supabase access token.');
    console.error('');
    console.error('1. Open: https://supabase.com/dashboard/account/tokens');
    console.error('2. Generate a token (name it "email-template")');
    console.error('3. Run:');
    console.error('   node scripts/update-supabase-confirm-signup-template.js YOUR_TOKEN_HERE');
    console.error('');
    process.exit(1);
  }

  if (!PROJECT_REF) {
    console.error('Could not resolve Supabase project ref from supabase/config.toml');
    process.exit(1);
  }

  const content = fs.readFileSync(TEMPLATE_PATH, 'utf8').trim();
  const payload = {
    mailer_subjects_confirmation: 'Your NetPay verification code',
    mailer_templates_confirmation_content: content,
    mailer_otp_length: 6,
    mailer_otp_exp: 600,
  };

  console.log(`Applying Confirm signup template to project ${PROJECT_REF}...`);

  const response = await fetch(`https://api.supabase.com/v1/projects/${PROJECT_REF}/config/auth`, {
    method: 'PATCH',
    headers: {
      Authorization: `Bearer ${ACCESS_TOKEN}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(payload),
  });

  const body = await response.text();
  if (!response.ok) {
    console.error(`Failed (${response.status}):`, body);
    process.exit(1);
  }

  console.log('');
  console.log('Success! Confirm signup email template is live.');
  console.log('Subject: Your NetPay verification code');
  console.log('OTP length: 6 digits (expires in 10 minutes)');
  console.log(`Project: ${PROJECT_REF}`);
  console.log('');
  console.log('Next: sign up with a NEW email and check the inbox.');
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
