#!/usr/bin/env node

/**
 * Check how the first user added money to their wallet
 * 
 * Usage: node check-first-credit.js
 * 
 * The script will automatically load SUPABASE_SERVICE_ROLE_KEY from:
 * 1. Environment variables (export SUPABASE_SERVICE_ROLE_KEY=...)
 * 2. .env file (if dotenv is available or if sourced)
 */

// Try to load .env file if it exists and dotenv is available
try {
  const fs = require('fs');
  const path = require('path');
  const envPath = path.join(__dirname, '.env');
  if (fs.existsSync(envPath)) {
    const envContent = fs.readFileSync(envPath, 'utf8');
    envContent.split('\n').forEach(line => {
      const match = line.match(/^SUPABASE_SERVICE_ROLE_KEY=(.+)$/);
      if (match) {
        process.env.SUPABASE_SERVICE_ROLE_KEY = match[1].trim().replace(/^["']|["']$/g, '');
      }
    });
  }
} catch (e) {
  // dotenv not available or .env doesn't exist, that's okay
}

const SUPABASE_URL = process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL || process.env.EXPO_PUBLIC_SUPABASE_URL || 'https://rekkdwpkzkhgnejgzhac.supabase.co';
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;

const EMAIL = 'annaleona90@gmail.com';

// Color codes for terminal output
const colors = {
  reset: '\x1b[0m',
  green: '\x1b[32m',
  red: '\x1b[31m',
  yellow: '\x1b[33m',
  blue: '\x1b[34m',
  cyan: '\x1b[36m',
  magenta: '\x1b[35m',
};

function log(message, color = 'reset') {
  console.log(`${colors[color]}${message}${colors.reset}`);
}

async function main() {
  log('\n🔍 Checking First Credit Transaction', 'cyan');
  log('='.repeat(60), 'cyan');
  
  if (!SUPABASE_URL) {
    log('\n❌ SUPABASE_URL not set!', 'red');
    process.exit(1);
  }
  
  if (!SUPABASE_SERVICE_ROLE_KEY) {
    log('\n❌ SUPABASE_SERVICE_ROLE_KEY not set!', 'red');
    log('   This is required to query transaction details', 'yellow');
    log('\n   To get the service role key:', 'yellow');
    log('   1. Go to your Supabase project dashboard', 'yellow');
    log('   2. Navigate to Settings > API', 'yellow');
    log('   3. Copy the "service_role" key (keep it secret!)', 'yellow');
    log('   4. Run: export SUPABASE_SERVICE_ROLE_KEY=your-key', 'yellow');
    log('   5. Then run this script again', 'yellow');
    log('\n   Alternatively, you can query directly in Supabase SQL Editor:', 'yellow');
    log('   SELECT * FROM user_transactions', 'cyan');
    log('   WHERE user_id = (SELECT id FROM profiles WHERE email = \'annaleona90@gmail.com\')', 'cyan');
    log('   AND transaction_type IN (\'credit\', \'refund\')', 'cyan');
    log('   ORDER BY created_at ASC LIMIT 1;', 'cyan');
    process.exit(1);
  }
  
  const normalizedEmail = EMAIL.trim().toLowerCase();
  
  try {
    // First, get the user ID from profiles
    log(`\n📧 Looking up user: ${EMAIL}`, 'cyan');
    
    const profileResponse = await fetch(
      `${SUPABASE_URL}/rest/v1/profiles?email=eq.${encodeURIComponent(normalizedEmail)}&select=id,email,full_name,balance,created_at`,
      {
        headers: {
          'apikey': SUPABASE_SERVICE_ROLE_KEY,
          'Authorization': `Bearer ${SUPABASE_SERVICE_ROLE_KEY}`,
          'Content-Type': 'application/json',
        }
      }
    );
    
    if (!profileResponse.ok) {
      throw new Error(`Profile lookup failed: ${profileResponse.status}`);
    }
    
    const profileData = await profileResponse.json();
    
    if (!profileData || profileData.length === 0) {
      log(`\n❌ User not found: ${EMAIL}`, 'red');
      process.exit(1);
    }
    
    const profile = profileData[0];
    const userId = profile.id;
    
    log(`  ✅ User found:`, 'green');
    log(`     ID: ${userId}`, 'blue');
    log(`     Name: ${profile.full_name || 'N/A'}`, 'blue');
    log(`     Current Balance: ₦${parseFloat(profile.balance || 0).toFixed(2)}`, 'blue');
    log(`     Account Created: ${profile.created_at || 'N/A'}`, 'blue');
    
    // Now get all credit transactions for this user, ordered by date
    log(`\n💰 Fetching credit transactions...`, 'cyan');
    
    const transactionsResponse = await fetch(
      `${SUPABASE_URL}/rest/v1/user_transactions?user_id=eq.${userId}&transaction_type=in.(credit,refund)&order=created_at.asc&select=*`,
      {
        headers: {
          'apikey': SUPABASE_SERVICE_ROLE_KEY,
          'Authorization': `Bearer ${SUPABASE_SERVICE_ROLE_KEY}`,
          'Content-Type': 'application/json',
        }
      }
    );
    
    if (!transactionsResponse.ok) {
      throw new Error(`Transactions lookup failed: ${transactionsResponse.status}`);
    }
    
    const transactionsData = await transactionsResponse.json();
    
    if (!transactionsData || transactionsData.length === 0) {
      log(`\n⚠️  No credit transactions found for this user`, 'yellow');
      log(`   This user has never added money to their wallet`, 'yellow');
      return;
    }
    
    // Get the first credit transaction
    const firstCredit = transactionsData[0];
    
    log(`\n${'='.repeat(60)}`, 'cyan');
    log(`\n🎯 FIRST CREDIT TRANSACTION`, 'magenta');
    log(`${'='.repeat(60)}`, 'cyan');
    
    log(`\n📅 Date: ${firstCredit.created_at}`, 'green');
    log(`💰 Amount: ₦${parseFloat(firstCredit.amount || 0).toFixed(2)}`, 'green');
    log(`📊 Balance Before: ₦${parseFloat(firstCredit.balance_before || 0).toFixed(2)}`, 'blue');
    log(`📊 Balance After: ₦${parseFloat(firstCredit.balance_after || 0).toFixed(2)}`, 'blue');
    log(`🏷️  Transaction Type: ${firstCredit.transaction_type}`, 'blue');
    log(`📝 Description: ${firstCredit.description || 'N/A'}`, 'blue');
    log(`🔖 Reference: ${firstCredit.reference || 'N/A'}`, 'blue');
    log(`👤 Performed By: ${firstCredit.performed_by || 'N/A'}`, 'blue');
    
    // Try to get more details about who performed it
    if (firstCredit.performed_by && firstCredit.performed_by !== userId) {
      try {
        const performerResponse = await fetch(
          `${SUPABASE_URL}/rest/v1/profiles?id=eq.${firstCredit.performed_by}&select=email,full_name`,
          {
            headers: {
              'apikey': SUPABASE_SERVICE_ROLE_KEY,
              'Authorization': `Bearer ${SUPABASE_SERVICE_ROLE_KEY}`,
              'Content-Type': 'application/json',
            }
          }
        );
        
        if (performerResponse.ok) {
          const performerData = await performerResponse.json();
          if (performerData && performerData.length > 0) {
            const performer = performerData[0];
            log(`   Performed By User: ${performer.email} (${performer.full_name || 'N/A'})`, 'yellow');
          }
        }
      } catch (e) {
        // Ignore errors
      }
    }
    
    // Check if it's from a funding transaction
    if (firstCredit.description && firstCredit.description.includes('funding')) {
      log(`\n💳 This appears to be a WALLET FUNDING transaction`, 'magenta');
      log(`   (Bank transfer or payment gateway)`, 'yellow');
    } else if (firstCredit.description && firstCredit.description.includes('referral')) {
      log(`\n🎁 This appears to be a REFERRAL BONUS`, 'magenta');
    } else if (firstCredit.performed_by && firstCredit.performed_by !== userId) {
      log(`\n👨‍💼 This appears to be a MANUAL ADMIN CREDIT`, 'magenta');
      log(`   (Credited by an admin user)`, 'yellow');
    } else {
      log(`\n📋 Transaction source: ${firstCredit.description || 'Unknown'}`, 'yellow');
    }
    
    // Show all credit transactions summary
    if (transactionsData.length > 1) {
      log(`\n${'='.repeat(60)}`, 'cyan');
      log(`\n📊 ALL CREDIT TRANSACTIONS (${transactionsData.length} total)`, 'cyan');
      log(`${'='.repeat(60)}`, 'cyan');
      
      transactionsData.forEach((tx, index) => {
        log(`\n${index + 1}. ${tx.created_at}`, 'blue');
        log(`   Amount: ₦${parseFloat(tx.amount || 0).toFixed(2)}`, 'blue');
        log(`   Type: ${tx.transaction_type}`, 'blue');
        log(`   Description: ${tx.description || 'N/A'}`, 'blue');
      });
    }
    
    log(`\n`, 'reset');
    
  } catch (error) {
    log(`\n❌ Error: ${error.message}`, 'red');
    if (error.stack) {
      log(`\n${error.stack}`, 'red');
    }
    process.exit(1);
  }
}

main();

