#!/usr/bin/env node

/**
 * Test Electricity Purchase with Real User Credentials
 * 
 * This script tests electricity purchase with the provided user credentials
 * to verify the "LOW WALLET BALANCE" error message replacement.
 * Run with: node test-electricity-purchase.js
 * 
 * Prerequisites:
 * - Set SUPABASE_URL and SUPABASE_ANON_KEY environment variables
 */

const SUPABASE_URL = process.env.VITE_SUPABASE_URL || process.env.SUPABASE_URL || process.env.EXPO_PUBLIC_SUPABASE_URL || 'https://rekkdwpkzkhgnejgzhac.supabase.co';
const SUPABASE_ANON_KEY = process.env.VITE_SUPABASE_ANON_KEY || process.env.SUPABASE_ANON_KEY || process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY;

const TEST_EMAIL = 'jetway463@gmail.com';
const TEST_PASSWORD = 'Salifu147@';
const TEST_METER_NUMBER = '45056810570';
const TEST_PROVIDER = 'ABUJA';
const TEST_METER_TYPE = 'prepaid';
const TEST_AMOUNT = 1000;
const TEST_PHONE = '08012345678';

// Color codes for terminal output
const colors = {
  reset: '\x1b[0m',
  green: '\x1b[32m',
  red: '\x1b[31m',
  yellow: '\x1b[33m',
  blue: '\x1b[34m',
  cyan: '\x1b[36m',
};

function log(message, color = 'reset') {
  console.log(`${colors[color]}${message}${colors.reset}`);
}

async function checkEnvironment() {
  log('\n🔍 Checking Environment...', 'cyan');
  
  if (!SUPABASE_URL) {
    log('❌ SUPABASE_URL not set!', 'red');
    log('   Please set it via: export SUPABASE_URL=your-url', 'yellow');
    process.exit(1);
  }
  
  if (!SUPABASE_ANON_KEY) {
    log('❌ SUPABASE_ANON_KEY not set!', 'red');
    log('   Please set it via: export SUPABASE_ANON_KEY=your-key', 'yellow');
    log('   Or run: SUPABASE_ANON_KEY=your-key node test-electricity-purchase.js', 'yellow');
    process.exit(1);
  }
  
  log(`✅ Supabase URL: ${SUPABASE_URL}`, 'green');
  log(`✅ Supabase Key: ${SUPABASE_ANON_KEY.substring(0, 20)}...`, 'green');
}

async function authenticate() {
  log('\n🔐 Authenticating...', 'cyan');
  
  try {
    const authResponse = await fetch(`${SUPABASE_URL}/auth/v1/token?grant_type=password`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'apikey': SUPABASE_ANON_KEY,
      },
      body: JSON.stringify({
        email: TEST_EMAIL,
        password: TEST_PASSWORD,
      }),
    });
    
    const authData = await authResponse.json();
    
    if (authResponse.ok && authData.access_token) {
      log(`✅ Authentication successful for ${TEST_EMAIL}`, 'green');
      return authData.access_token;
    } else {
      log(`❌ Authentication failed: ${authData.error_description || JSON.stringify(authData)}`, 'red');
      return null;
    }
  } catch (error) {
    log(`❌ Authentication error: ${error.message}`, 'red');
    return null;
  }
}

async function getProfile(accessToken) {
  log('\n👤 Fetching Profile...', 'cyan');
  
  try {
    const response = await fetch(`${SUPABASE_URL}/rest/v1/profiles?select=*&email=eq.${encodeURIComponent(TEST_EMAIL)}`, {
      headers: {
        'Authorization': `Bearer ${accessToken}`,
        'apikey': SUPABASE_ANON_KEY,
      },
    });
    
    const profile = await response.json();
    
    if (response.ok && profile && profile[0]) {
      const p = profile[0];
      log(`✅ Profile loaded`, 'green');
      log(`   Name: ${p.full_name || 'N/A'}`, 'blue');
      log(`   Balance: ₦${Number(p.balance || 0).toLocaleString('en-NG', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`, 'blue');
      return p;
    } else {
      log(`❌ Profile not found`, 'red');
      return null;
    }
  } catch (error) {
    log(`❌ Profile fetch error: ${error.message}`, 'red');
    return null;
  }
}

async function validateMeter(accessToken) {
  log('\n🔍 Validating Meter Number...', 'cyan');
  
  try {
    const response = await fetch(`${SUPABASE_URL}/functions/v1/validate-meter-number`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${accessToken}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        meter_number: TEST_METER_NUMBER,
        provider: TEST_PROVIDER,
        meter_type: TEST_METER_TYPE,
        vending_provider: 'mobilenig',
      }),
    });
    
    const data = await response.json();
    
    if (response.ok && data.success && data.data) {
      log(`✅ Meter validation successful`, 'green');
      log(`   Customer Name: ${data.data.customer_name || 'N/A'}`, 'blue');
      log(`   Address: ${data.data.address || 'N/A'}`, 'blue');
      return data.data;
    } else {
      log(`⚠️  Meter validation failed: ${data.error || 'Unknown error'}`, 'yellow');
      log(`   Will proceed with purchase anyway (may fail)`, 'yellow');
      return null;
    }
  } catch (error) {
    log(`⚠️  Meter validation error: ${error.message}`, 'yellow');
    return null;
  }
}

async function testElectricityPurchase(accessToken, meterInfo = null) {
  log('\n⚡ Testing Electricity Purchase...', 'cyan');
  log(`   Meter: ${TEST_METER_NUMBER}`, 'blue');
  log(`   Provider: ${TEST_PROVIDER}`, 'blue');
  log(`   Type: ${TEST_METER_TYPE}`, 'blue');
  log(`   Amount: ₦${TEST_AMOUNT}`, 'blue');
  
  const purchaseBody = {
    meter_number: TEST_METER_NUMBER,
    provider: TEST_PROVIDER,
    meter_type: TEST_METER_TYPE,
    amount: TEST_AMOUNT,
    phone: TEST_PHONE,
    vending_provider: 'mobilenig',
  };
  
  // Add customer info if available from meter validation
  if (meterInfo) {
    if (meterInfo.customer_name) purchaseBody.customer_name = meterInfo.customer_name;
    if (meterInfo.address) purchaseBody.customer_address = meterInfo.address;
  }
  
  try {
    const response = await fetch(`${SUPABASE_URL}/functions/v1/purchase-electricity`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${accessToken}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(purchaseBody),
    });
    
    const responseText = await response.text();
    log(`\n📥 Response Status: ${response.status}`, 'cyan');
    
    let data;
    try {
      data = JSON.parse(responseText);
    } catch (e) {
      log(`❌ Failed to parse response as JSON`, 'red');
      log(`   Raw response: ${responseText.substring(0, 500)}`, 'yellow');
      return false;
    }
    
    log(`\n📋 Response Data:`, 'cyan');
    console.log(JSON.stringify(data, null, 2));
    
    if (response.ok && data.success) {
      log(`\n✅ Purchase Successful!`, 'green');
      log(`   Reference: ${data.data?.reference || 'N/A'}`, 'blue');
      log(`   Status: ${data.data?.status || 'N/A'}`, 'blue');
      log(`   Token: ${data.data?.token || 'N/A'}`, 'blue');
      
      if (!data.data?.token && data.data?.status === 'pending') {
        log(`\n⚠️  Token not available yet - transaction is pending`, 'yellow');
        log(`   The token will be available once MobileNig completes processing.`, 'yellow');
        log(`   You can check the transaction later or use the process-pending-electricity function.`, 'yellow');
      }
      
      return true;
    } else {
      log(`\n❌ Purchase Failed`, 'red');
      const errorMessage = data.error || data.message || 'Unknown error';
      log(`   Error: ${errorMessage}`, 'red');
      
      // Check if the error message was correctly replaced
      const errorUpper = errorMessage.toUpperCase();
      if (errorUpper.includes('LOW WALLET BALANCE')) {
        log(`\n⚠️  WARNING: Error still contains "LOW WALLET BALANCE"`, 'yellow');
        log(`   The error message replacement may not be working correctly.`, 'yellow');
        return false;
      } else if (errorMessage.includes('Service temporarily unavailable') || 
                 errorMessage.includes('not related to your wallet balance')) {
        log(`\n✅ SUCCESS: Error message was correctly replaced!`, 'green');
        log(`   The clarified message is being shown to users.`, 'green');
        return true;
      } else {
        log(`\nℹ️  Different error occurred (not LOW WALLET BALANCE)`, 'blue');
        return false;
      }
    }
  } catch (error) {
    log(`\n❌ Purchase request failed: ${error.message}`, 'red');
    console.error(error);
    return false;
  }
}

async function runTest() {
  log('\n🚀 Starting Electricity Purchase Test\n', 'cyan');
  log('='.repeat(60), 'cyan');
  
  await checkEnvironment();
  
  const accessToken = await authenticate();
  if (!accessToken) {
    log('\n❌ Authentication failed. Cannot continue.', 'red');
    process.exit(1);
  }
  
  const profile = await getProfile(accessToken);
  if (!profile) {
    log('\n⚠️  Could not fetch profile, but continuing with test...', 'yellow');
  }
  
  // Validate meter first to get customer info
  const meterInfo = await validateMeter(accessToken);
  
  // Now attempt purchase
  const result = await testElectricityPurchase(accessToken, meterInfo);
  
  log('\n' + '='.repeat(60), 'cyan');
  if (result) {
    log('\n✅ Test completed successfully!', 'green');
  } else {
    log('\n❌ Test completed with errors (see above for details)', 'red');
  }
  log('='.repeat(60) + '\n', 'cyan');
  
  process.exit(result ? 0 : 1);
}

// Run test
runTest().catch((error) => {
  log(`\n❌ Fatal error: ${error.message}`, 'red');
  console.error(error);
  process.exit(1);
});

