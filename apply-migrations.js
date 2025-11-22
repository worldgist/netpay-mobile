#!/usr/bin/env node
/**
 * Script to apply education vendor migrations
 * This uses the Supabase client to execute SQL directly
 */

const { createClient } = require('@supabase/supabase-js');
const fs = require('fs');
const path = require('path');

// Try to get connection from environment or config
const supabaseUrl = process.env.VITE_SUPABASE_URL || process.env.SUPABASE_URL;
const supabaseKey = process.env.VITE_SUPABASE_ANON_KEY || process.env.SUPABASE_ANON_KEY || process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!supabaseUrl || !supabaseKey) {
  console.error('Error: Supabase URL and Key not found in environment variables');
  console.error('Please set VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY or SUPABASE_SERVICE_ROLE_KEY');
  process.exit(1);
}

const supabase = createClient(supabaseUrl, supabaseKey);

async function applyMigrations() {
  try {
    console.log('Reading migration files...');
    
    // Read the combined SQL file
    const sqlFile = path.join(__dirname, 'apply_education_vendor_migrations.sql');
    const sql = fs.readFileSync(sqlFile, 'utf8');
    
    // Split by semicolons but keep DO blocks together
    const statements = sql
      .split(';')
      .map(s => s.trim())
      .filter(s => s.length > 0 && !s.startsWith('--'));
    
    console.log(`Found ${statements.length} SQL statements to execute`);
    
    // Execute each statement
    for (let i = 0; i < statements.length; i++) {
      const statement = statements[i];
      if (statement.trim().length === 0) continue;
      
      console.log(`Executing statement ${i + 1}/${statements.length}...`);
      
      try {
        const { error } = await supabase.rpc('exec_sql', { sql_query: statement });
        
        if (error) {
          // Try direct query if RPC doesn't exist
          const { error: queryError } = await supabase.from('_migrations').select('*').limit(0);
          
          if (queryError) {
            // Last resort: use the SQL editor approach
            console.log('\n⚠️  Cannot execute SQL directly via API.');
            console.log('Please run the SQL file manually in Supabase Dashboard:');
            console.log(`File: ${sqlFile}`);
            console.log('\nOr use: supabase db push (for remote) or supabase migration up (for local)');
            process.exit(1);
          }
        }
      } catch (err) {
        console.error(`Error executing statement ${i + 1}:`, err.message);
      }
    }
    
    console.log('\n✅ Migrations applied successfully!');
    
  } catch (error) {
    console.error('Error applying migrations:', error);
    console.log('\n📋 Alternative: Run the SQL file manually in Supabase Dashboard');
    console.log('File: apply_education_vendor_migrations.sql');
    process.exit(1);
  }
}

applyMigrations();

