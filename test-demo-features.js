#!/usr/bin/env node

/**
 * Comprehensive Demo Account Feature Test Script
 * 
 * This script tests all features of the NetPay app using the demo account.
 * Run with: node test-demo-features.js
 * 
 * Prerequisites:
 * - Set SUPABASE_URL and SUPABASE_ANON_KEY environment variables
 * - Demo user must exist (run create-demo-user function if needed)
 */

const SUPABASE_URL = process.env.VITE_SUPABASE_URL || process.env.SUPABASE_URL;
const SUPABASE_ANON_KEY = process.env.VITE_SUPABASE_ANON_KEY || process.env.SUPABASE_ANON_KEY;

const DEMO_EMAIL = 'demo@netpayy.ng';
const DEMO_PASSWORD = 'Demo@1234';
const DEMO_PIN = '1234';

// Test results tracker
const testResults = {
  passed: [],
  failed: [],
  skipped: [],
};

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

function logTest(name, passed, details = '') {
  if (passed) {
    testResults.passed.push(name);
    log(`✅ PASS: ${name}`, 'green');
  } else {
    testResults.failed.push({ name, details });
    log(`❌ FAIL: ${name}`, 'red');
    if (details) log(`   ${details}`, 'red');
  }
}

function logSkip(name, reason = '') {
  testResults.skipped.push({ name, reason });
  log(`⏭️  SKIP: ${name}${reason ? ` - ${reason}` : ''}`, 'yellow');
}

async function checkEnvironment() {
  log('\n🔍 Checking Environment...', 'cyan');
  
  if (!SUPABASE_URL) {
    log('❌ SUPABASE_URL not set!', 'red');
    process.exit(1);
  }
  
  if (!SUPABASE_ANON_KEY) {
    log('❌ SUPABASE_ANON_KEY not set!', 'red');
    process.exit(1);
  }
  
  log(`✅ Supabase URL: ${SUPABASE_URL}`, 'green');
  log(`✅ Supabase Key: ${SUPABASE_ANON_KEY.substring(0, 20)}...`, 'green');
}

async function ensureDemoUser() {
  log('\n👤 Ensuring Demo User Exists...', 'cyan');
  
  try {
    const response = await fetch(`${SUPABASE_URL}/functions/v1/create-demo-user`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
    });
    
    const data = await response.json();
    
    if (response.ok && data.success) {
      log(`✅ Demo user ready: ${data.email}`, 'green');
      log(`   Balance: ₦${data.balance || 50000}`, 'green');
      log(`   Referral Code: ${data.referral_code || 'DEMO-REF'}`, 'green');
      return true;
    } else {
      log(`⚠️  Demo user creation returned: ${JSON.stringify(data)}`, 'yellow');
      return false;
    }
  } catch (error) {
    log(`⚠️  Could not ensure demo user (may already exist): ${error.message}`, 'yellow');
    return false;
  }
}

async function testAuthentication() {
  log('\n🔐 Testing Authentication...', 'cyan');
  
  try {
    // Test email/password login
    const authResponse = await fetch(`${SUPABASE_URL}/auth/v1/token?grant_type=password`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'apikey': SUPABASE_ANON_KEY,
      },
      body: JSON.stringify({
        email: DEMO_EMAIL,
        password: DEMO_PASSWORD,
      }),
    });
    
    const authData = await authResponse.json();
    
    if (authResponse.ok && authData.access_token) {
      logTest('Email/Password Login', true);
      return authData.access_token;
    } else {
      logTest('Email/Password Login', false, authData.error_description || JSON.stringify(authData));
      return null;
    }
  } catch (error) {
    logTest('Email/Password Login', false, error.message);
    return null;
  }
}

async function testProfile(accessToken) {
  log('\n👤 Testing Profile Features...', 'cyan');
  
  try {
    const response = await fetch(`${SUPABASE_URL}/rest/v1/profiles?select=*&email=eq.${DEMO_EMAIL}`, {
      headers: {
        'Authorization': `Bearer ${accessToken}`,
        'apikey': SUPABASE_ANON_KEY,
      },
    });
    
    const profile = await response.json();
    
    if (response.ok && profile && profile[0]) {
      const p = profile[0];
      logTest('Fetch Profile', true);
      log(`   Name: ${p.full_name || 'N/A'}`, 'blue');
      log(`   Balance: ₦${p.balance || 0}`, 'blue');
      log(`   Phone: ${p.phone || 'N/A'}`, 'blue');
      log(`   PIN Enabled: ${p.pin_enabled || false}`, 'blue');
      log(`   Referral Code: ${p.referral_code || 'N/A'}`, 'blue');
      return p;
    } else {
      logTest('Fetch Profile', false, 'Profile not found');
      return null;
    }
  } catch (error) {
    logTest('Fetch Profile', false, error.message);
    return null;
  }
}

async function testAirtimePurchase(accessToken) {
  log('\n📱 Testing Airtime Purchase...', 'cyan');
  
  try {
    const response = await fetch(`${SUPABASE_URL}/functions/v1/purchase-smeplug-airtime`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${accessToken}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        phone_number: '08012345678',
        network_id: 1, // MTN
        amount: 100,
      }),
    });
    
    const data = await response.json();
    
    if (response.ok && data.success) {
      logTest('Airtime Purchase', true);
      log(`   Reference: ${data.data?.reference || 'N/A'}`, 'blue');
      return true;
    } else {
      logTest('Airtime Purchase', false, data.error || JSON.stringify(data));
      return false;
    }
  } catch (error) {
    logTest('Airtime Purchase', false, error.message);
    return false;
  }
}

async function testDataPurchase(accessToken) {
  log('\n📶 Testing Data Purchase...', 'cyan');
  
  try {
    // First, get available data plans
    const plansResponse = await fetch(`${SUPABASE_URL}/rest/v1/data_plans?network=eq.MTN&limit=1`, {
      headers: {
        'Authorization': `Bearer ${accessToken}`,
        'apikey': SUPABASE_ANON_KEY,
      },
    });
    
    const plans = await plansResponse.json();
    
    if (!plans || plans.length === 0) {
      logSkip('Data Purchase', 'No data plans available');
      return false;
    }
    
    const planId = plans[0].id;
    
    // Attempt purchase
    const response = await fetch(`${SUPABASE_URL}/functions/v1/purchase-data`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${accessToken}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        phone_number: '08012345678',
        plan_id: planId,
      }),
    });
    
    const data = await response.json();
    
    if (response.ok && data.success) {
      logTest('Data Purchase', true);
      log(`   Reference: ${data.data?.reference || 'N/A'}`, 'blue');
      return true;
    } else {
      logTest('Data Purchase', false, data.error || JSON.stringify(data));
      return false;
    }
  } catch (error) {
    logTest('Data Purchase', false, error.message);
    return false;
  }
}

async function testElectricityPurchase(accessToken) {
  log('\n⚡ Testing Electricity Payment...', 'cyan');
  
  try {
    const response = await fetch(`${SUPABASE_URL}/functions/v1/purchase-electricity`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${accessToken}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        meter_number: '1111111111111',
        provider: 'ikeja-electric',
        meter_type: 'prepaid',
        amount: 500,
        phone: '08012345678',
      }),
    });
    
    const data = await response.json();
    
    if (response.ok && data.success) {
      logTest('Electricity Payment', true);
      log(`   Reference: ${data.data?.reference || 'N/A'}`, 'blue');
      return true;
    } else {
      logTest('Electricity Payment', false, data.error || JSON.stringify(data));
      return false;
    }
  } catch (error) {
    logTest('Electricity Payment', false, error.message);
    return false;
  }
}

async function testCableTVPurchase(accessToken) {
  log('\n📺 Testing Cable TV Subscription...', 'cyan');
  
  try {
    // First, get available cable packages
    const packagesResponse = await fetch(`${SUPABASE_URL}/functions/v1/fetch-cable-packages?provider=dstv`, {
      headers: {
        'Authorization': `Bearer ${accessToken}`,
      },
    });
    
    const packages = await packagesResponse.json();
    
    if (!packages || !packages.data || packages.data.length === 0) {
      logSkip('Cable TV Purchase', 'No cable packages available');
      return false;
    }
    
    const packageId = packages.data[0].id;
    
    const response = await fetch(`${SUPABASE_URL}/functions/v1/purchase-cable-tv`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${accessToken}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        smart_card_number: '1234567890',
        provider: 'dstv',
        package_id: packageId,
        phone: '08012345678',
      }),
    });
    
    const data = await response.json();
    
    if (response.ok && data.success) {
      logTest('Cable TV Purchase', true);
      log(`   Reference: ${data.data?.reference || 'N/A'}`, 'blue');
      return true;
    } else {
      logTest('Cable TV Purchase', false, data.error || JSON.stringify(data));
      return false;
    }
  } catch (error) {
    logTest('Cable TV Purchase', false, error.message);
    return false;
  }
}

async function testEducationPurchase(accessToken) {
  log('\n🎓 Testing Education Service Purchase...', 'cyan');
  
  try {
    // First, get available education services
    const servicesResponse = await fetch(`${SUPABASE_URL}/functions/v1/fetch-education-services?exam_type=waec`, {
      headers: {
        'Authorization': `Bearer ${accessToken}`,
      },
    });
    
    const services = await servicesResponse.json();
    
    if (!services || !services.data || services.data.length === 0) {
      logSkip('Education Purchase', 'No education services available');
      return false;
    }
    
    const serviceId = services.data[0].id;
    
    const response = await fetch(`${SUPABASE_URL}/functions/v1/purchase-education`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${accessToken}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        service_id: serviceId,
        quantity: 1,
      }),
    });
    
    const data = await response.json();
    
    if (response.ok && data.success) {
      logTest('Education Purchase', true);
      log(`   Reference: ${data.data?.reference || 'N/A'}`, 'blue');
      return true;
    } else {
      logTest('Education Purchase', false, data.error || JSON.stringify(data));
      return false;
    }
  } catch (error) {
    logTest('Education Purchase', false, error.message);
    return false;
  }
}

async function testTransactions(accessToken) {
  log('\n📋 Testing Transaction History...', 'cyan');
  
  try {
    const response = await fetch(`${SUPABASE_URL}/rest/v1/transactions?order=created_at.desc&limit=10`, {
      headers: {
        'Authorization': `Bearer ${accessToken}`,
        'apikey': SUPABASE_ANON_KEY,
      },
    });
    
    const transactions = await response.json();
    
    if (response.ok) {
      logTest('Fetch Transactions', true);
      log(`   Found ${transactions.length} recent transactions`, 'blue');
      return true;
    } else {
      logTest('Fetch Transactions', false, 'Failed to fetch transactions');
      return false;
    }
  } catch (error) {
    logTest('Fetch Transactions', false, error.message);
    return false;
  }
}

async function testReferrals(accessToken) {
  log('\n👥 Testing Referral System...', 'cyan');
  
  try {
    const response = await fetch(`${SUPABASE_URL}/rest/v1/referrals?order=created_at.desc&limit=10`, {
      headers: {
        'Authorization': `Bearer ${accessToken}`,
        'apikey': SUPABASE_ANON_KEY,
      },
    });
    
    const referrals = await response.json();
    
    if (response.ok) {
      logTest('Fetch Referrals', true);
      log(`   Found ${referrals.length} referrals`, 'blue');
      return true;
    } else {
      logTest('Fetch Referrals', false, 'Failed to fetch referrals');
      return false;
    }
  } catch (error) {
    logTest('Fetch Referrals', false, error.message);
    return false;
  }
}

async function testNotifications(accessToken) {
  log('\n🔔 Testing Notifications...', 'cyan');
  
  try {
    const response = await fetch(`${SUPABASE_URL}/rest/v1/notifications?order=created_at.desc&limit=10`, {
      headers: {
        'Authorization': `Bearer ${accessToken}`,
        'apikey': SUPABASE_ANON_KEY,
      },
    });
    
    const notifications = await response.json();
    
    if (response.ok) {
      logTest('Fetch Notifications', true);
      log(`   Found ${notifications.length} notifications`, 'blue');
      return true;
    } else {
      logTest('Fetch Notifications', false, 'Failed to fetch notifications');
      return false;
    }
  } catch (error) {
    logTest('Fetch Notifications', false, error.message);
    return false;
  }
}

async function runAllTests() {
  log('\n🚀 Starting Comprehensive Demo Account Feature Tests\n', 'cyan');
  log('=' .repeat(60), 'cyan');
  
  await checkEnvironment();
  await ensureDemoUser();
  
  const accessToken = await testAuthentication();
  
  if (!accessToken) {
    log('\n❌ Authentication failed. Cannot continue with other tests.', 'red');
    printSummary();
    process.exit(1);
  }
  
  // Test all features
  await testProfile(accessToken);
  await testAirtimePurchase(accessToken);
  await testDataPurchase(accessToken);
  await testElectricityPurchase(accessToken);
  await testCableTVPurchase(accessToken);
  await testEducationPurchase(accessToken);
  await testTransactions(accessToken);
  await testReferrals(accessToken);
  await testNotifications(accessToken);
  
  // Note: We skip delete account test as it would delete the demo user
  logSkip('Delete Account', 'Skipped to preserve demo account for future tests');
  
  printSummary();
}

function printSummary() {
  log('\n' + '='.repeat(60), 'cyan');
  log('\n📊 Test Summary\n', 'cyan');
  
  log(`✅ Passed: ${testResults.passed.length}`, 'green');
  log(`❌ Failed: ${testResults.failed.length}`, 'red');
  log(`⏭️  Skipped: ${testResults.skipped.length}`, 'yellow');
  
  if (testResults.failed.length > 0) {
    log('\n❌ Failed Tests:', 'red');
    testResults.failed.forEach(({ name, details }) => {
      log(`   - ${name}: ${details}`, 'red');
    });
  }
  
  if (testResults.skipped.length > 0) {
    log('\n⏭️  Skipped Tests:', 'yellow');
    testResults.skipped.forEach(({ name, reason }) => {
      log(`   - ${name}${reason ? `: ${reason}` : ''}`, 'yellow');
    });
  }
  
  log('\n' + '='.repeat(60), 'cyan');
  
  const totalTests = testResults.passed.length + testResults.failed.length + testResults.skipped.length;
  const successRate = totalTests > 0 
    ? ((testResults.passed.length / (testResults.passed.length + testResults.failed.length)) * 100).toFixed(1)
    : 0;
  
  log(`\nSuccess Rate: ${successRate}%`, successRate >= 80 ? 'green' : 'yellow');
  
  if (testResults.failed.length === 0) {
    log('\n🎉 All tests passed!', 'green');
  }
}

// Run tests
runAllTests().catch((error) => {
  log(`\n❌ Fatal error: ${error.message}`, 'red');
  console.error(error);
  process.exit(1);
});






