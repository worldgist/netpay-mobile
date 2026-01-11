#!/usr/bin/env node

/**
 * Check current provider settings in app_settings table
 */

// Try to load .env file if it exists
try {
  const fs = require('fs');
  const path = require('path');
  const envPath = path.join(__dirname, '.env');
  if (fs.existsSync(envPath)) {
    const envContent = fs.readFileSync(envPath, 'utf8');
    envContent.split('\n').forEach(line => {
      const match = line.match(/^([^=:#]+)=(.*)$/);
      if (match) {
        const key = match[1].trim();
        const value = match[2].trim().replace(/^["']|["']$/g, '');
        if (!process.env[key]) {
          process.env[key] = value;
        }
      }
    });
  }
} catch (e) {
  // Ignore
}

const SUPABASE_URL = process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL || process.env.EXPO_PUBLIC_SUPABASE_URL || 'https://rekkdwpkzkhgnejgzhac.supabase.co';
const SUPABASE_ANON_KEY = process.env.VITE_SUPABASE_ANON_KEY || process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY || process.env.SUPABASE_ANON_KEY;

async function main() {
  console.log('\n🔍 Checking Provider Settings');
  console.log('='.repeat(60));
  
  if (!SUPABASE_URL) {
    console.error('\n❌ SUPABASE_URL not set!');
    process.exit(1);
  }
  
  try {
    // Check cable_provider
    console.log('\n📺 Cable TV Provider Setting:');
    const cableResponse = await fetch(
      `${SUPABASE_URL}/rest/v1/app_settings?setting_key=eq.cable_provider&select=setting_key,setting_value,description,updated_at`,
      {
        headers: {
          'apikey': SUPABASE_ANON_KEY || '',
          'Authorization': `Bearer ${SUPABASE_ANON_KEY || ''}`,
          'Content-Type': 'application/json',
        }
      }
    );
    
    if (cableResponse.ok) {
      const cableData = await cableResponse.json();
      if (cableData && cableData.length > 0) {
        const setting = cableData[0];
        console.log('  ✅ Setting exists');
        console.log('  Provider:', setting.setting_value?.provider || 'NOT SET');
        console.log('  Full Value:', JSON.stringify(setting.setting_value, null, 2));
        console.log('  Description:', setting.description || 'N/A');
        console.log('  Last Updated:', setting.updated_at || 'N/A');
      } else {
        console.log('  ⚠️  NOT SET (defaults to mobilenig)');
      }
    } else {
      console.log('  ❌ Error:', cableResponse.status, cableResponse.statusText);
      const errorText = await cableResponse.text();
      console.log('  Details:', errorText);
    }
    
    console.log('\n' + '='.repeat(60));
    
  } catch (error) {
    console.error('\n❌ Error:', error.message);
    process.exit(1);
  }
}

main();
