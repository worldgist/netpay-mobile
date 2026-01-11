#!/usr/bin/env node

/**
 * Apply migration to add admin policies for user_push_tokens table
 * This script uses the Supabase service role to execute the migration SQL
 */

const { createClient } = require('@supabase/supabase-js');
const fs = require('fs');
const path = require('path');

// Read environment variables
require('dotenv').config();

const supabaseUrl = process.env.VITE_SUPABASE_URL || process.env.EXPO_PUBLIC_SUPABASE_URL || process.env.SUPABASE_URL;
const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!supabaseUrl || !serviceRoleKey) {
  console.error('Error: Missing required environment variables');
  console.error('Required: SUPABASE_URL (or VITE_SUPABASE_URL/EXPO_PUBLIC_SUPABASE_URL)');
  console.error('Required: SUPABASE_SERVICE_ROLE_KEY');
  process.exit(1);
}

const supabase = createClient(supabaseUrl, serviceRoleKey);

async function applyMigration() {
  try {
    console.log('Reading migration file...');
    const migrationPath = path.join(__dirname, 'supabase', 'migrations', '20251220000000_add_admin_policies_user_push_tokens.sql');
    const sql = fs.readFileSync(migrationPath, 'utf8');

    console.log('Applying migration...');
    console.log('SQL:', sql);

    // Execute the SQL using RPC or direct query
    // Note: Supabase JS client doesn't support raw SQL execution directly
    // We need to use the REST API or create a function
    // For now, we'll use the REST API approach
    
    const response = await fetch(`${supabaseUrl}/rest/v1/rpc/exec_sql`, {
      method: 'POST',
      headers: {
        'apikey': serviceRoleKey,
        'Authorization': `Bearer ${serviceRoleKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ sql }),
    });

    if (!response.ok) {
      // If RPC doesn't exist, try direct SQL execution via pg REST API
      console.log('Trying alternative method...');
      
      // Split SQL into individual statements
      const statements = sql
        .split(';')
        .map(s => s.trim())
        .filter(s => s.length > 0 && !s.startsWith('--'));

      for (const statement of statements) {
        if (statement) {
          console.log(`Executing: ${statement.substring(0, 50)}...`);
          // Note: Direct SQL execution requires pg REST API which may not be enabled
          // The best approach is to run this in Supabase SQL Editor
        }
      }

      console.log('\n⚠️  Direct SQL execution via JS client is limited.');
      console.log('Please run this migration in the Supabase SQL Editor:');
      console.log(`https://supabase.com/dashboard/project/${supabaseUrl.split('//')[1].split('.')[0]}/sql\n`);
      console.log('SQL to execute:');
      console.log('─'.repeat(60));
      console.log(sql);
      console.log('─'.repeat(60));
      return;
    }

    const result = await response.json();
    console.log('✅ Migration applied successfully!');
    console.log('Result:', result);
  } catch (error) {
    console.error('❌ Error applying migration:', error.message);
    console.log('\nPlease run this migration manually in the Supabase SQL Editor:');
    console.log(`https://supabase.com/dashboard/project/${supabaseUrl.split('//')[1].split('.')[0]}/sql\n`);
    
    const migrationPath = path.join(__dirname, 'supabase', 'migrations', '20251220000000_add_admin_policies_user_push_tokens.sql');
    const sql = fs.readFileSync(migrationPath, 'utf8');
    console.log('SQL to execute:');
    console.log('─'.repeat(60));
    console.log(sql);
    console.log('─'.repeat(60));
    process.exit(1);
  }
}

applyMigration();














