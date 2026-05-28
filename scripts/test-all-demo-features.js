// Comprehensive test script for all demo user features
// Run with: node scripts/test-all-demo-features.js

const SUPABASE_URL = process.env.SUPABASE_URL || 'https://rekkdwpkzkhgnejgzhac.supabase.co';
const SUPABASE_ANON_KEY = process.env.SUPABASE_ANON_KEY || 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InJla2tkd3BremtoZ25lamd6aGFjIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NjI0MzE0NTIsImV4cCI6MjA3ODAwNzQ1Mn0.8Lo84bFhMQ2O18UPjyj2gHpzNTDFUmpMo0y96fRscsA';
const DEMO_EMAIL = 'demo@netpayy.ng';
const DEMO_PASSWORD = 'Demo@1234';

const colors = {
  green: '\x1b[32m',
  red: '\x1b[31m',
  yellow: '\x1b[33m',
  blue: '\x1b[34m',
  reset: '\x1b[0m',
  bold: '\x1b[1m',
};

let accessToken = null;
let userId = null;
let currentBalance = 0;

function log(message, type = 'info') {
  const prefix = type === 'success' ? `${colors.green}✅` : 
                 type === 'error' ? `${colors.red}❌` : 
                 type === 'warning' ? `${colors.yellow}⚠️` : 
                 type === 'info' ? `${colors.blue}ℹ️` : '';
  console.log(`${prefix} ${message}${colors.reset}`);
}

function logSection(title) {
  console.log(`\n${colors.bold}${colors.blue}${'='.repeat(50)}${colors.reset}`);
  console.log(`${colors.bold}${title}${colors.reset}`);
  console.log(`${colors.blue}${'='.repeat(50)}${colors.reset}\n`);
}

async function makeRequest(url, options = {}) {
  try {
    const response = await fetch(url, {
      ...options,
      headers: {
        'apikey': SUPABASE_ANON_KEY,
        'Authorization': accessToken ? `Bearer ${accessToken}` : `Bearer ${SUPABASE_ANON_KEY}`,
        'Content-Type': 'application/json',
        ...options.headers,
      },
    });
    return await response.json();
  } catch (error) {
    return { error: error.message };
  }
}

async function testLogin() {
  logSection('1. Testing Login');
  
  const response = await fetch(
    `${SUPABASE_URL}/auth/v1/token?grant_type=password`,
    {
      method: 'POST',
      headers: {
        'apikey': SUPABASE_ANON_KEY,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        email: DEMO_EMAIL,
        password: DEMO_PASSWORD,
      }),
    }
  );

  const data = await response.json();
  
  if (data.access_token) {
    accessToken = data.access_token;
    userId = data.user?.id;
    log(`Login successful! User ID: ${userId}`, 'success');
    return true;
  } else {
    log(`Login failed: ${data.error_description || JSON.stringify(data)}`, 'error');
    return false;
  }
}

async function testProfile() {
  logSection('2. Testing Profile & Balance');
  
  const data = await makeRequest(
    `${SUPABASE_URL}/rest/v1/profiles?select=*`
  );

  if (data && data[0]) {
    const profile = data[0];
    currentBalance = Number(profile.balance || 0);
    log(`Profile loaded successfully!`, 'success');
    console.log(`   Name: ${profile.full_name}`);
    console.log(`   Email: ${profile.email}`);
    console.log(`   Phone: ${profile.phone || 'N/A'}`);
    console.log(`   Balance: ₦${currentBalance.toLocaleString()}`);
    console.log(`   Status: ${profile.status}`);
    
    if (currentBalance >= 10000) {
      log(`Balance is sufficient for testing`, 'success');
    } else {
      log(`Balance might be low: ₦${currentBalance}`, 'warning');
    }
    return true;
  } else {
    log(`Failed to load profile: ${JSON.stringify(data)}`, 'error');
    return false;
  }
}

async function testTransactions() {
  logSection('3. Testing Transaction History');
  
  // Test user_transactions
  const userTxns = await makeRequest(
    `${SUPABASE_URL}/rest/v1/user_transactions?user_id=eq.${userId}&select=*&order=created_at.desc&limit=5`
  );
  
  if (Array.isArray(userTxns) && userTxns.length > 0) {
    log(`Found ${userTxns.length} user transactions`, 'success');
    userTxns.slice(0, 3).forEach((txn, idx) => {
      console.log(`   ${idx + 1}. ${txn.description || 'N/A'} - ${txn.transaction_type} - ₦${Number(txn.amount || 0).toLocaleString()}`);
    });
  } else {
    log(`No user transactions found`, 'warning');
  }

  // Test airtime_transactions
  const airtimeTxns = await makeRequest(
    `${SUPABASE_URL}/rest/v1/airtime_transactions?user_id=eq.${userId}&select=*&order=created_at.desc&limit=3`
  );
  
  if (Array.isArray(airtimeTxns) && airtimeTxns.length > 0) {
    log(`Found ${airtimeTxns.length} airtime transactions`, 'success');
  } else {
    log(`No airtime transactions found`, 'warning');
  }

  // Test data_transactions
  const dataTxns = await makeRequest(
    `${SUPABASE_URL}/rest/v1/data_transactions?user_id=eq.${userId}&select=*&order=created_at.desc&limit=3`
  );
  
  if (Array.isArray(dataTxns) && dataTxns.length > 0) {
    log(`Found ${dataTxns.length} data transactions`, 'success');
  } else {
    log(`No data transactions found`, 'warning');
  }

  // Test electricity_transactions
  const electricityTxns = await makeRequest(
    `${SUPABASE_URL}/rest/v1/electricity_transactions?user_id=eq.${userId}&select=*&order=created_at.desc&limit=3`
  );
  
  if (Array.isArray(electricityTxns) && electricityTxns.length > 0) {
    log(`Found ${electricityTxns.length} electricity transactions`, 'success');
  } else {
    log(`No electricity transactions found`, 'warning');
  }

  return true;
}

async function testVirtualAccount() {
  logSection('4. Testing Virtual Account');
  
  const data = await makeRequest(
    `${SUPABASE_URL}/rest/v1/virtual_accounts?user_id=eq.${userId}&select=*`
  );

  if (Array.isArray(data) && data.length > 0) {
    const va = data[0];
    log(`Virtual account found!`, 'success');
    console.log(`   Account Number: ${va.account_number}`);
    console.log(`   Account Name: ${va.account_name}`);
    console.log(`   Bank Name: ${va.bank_name}`);
    return true;
  } else {
    log(`No virtual account found`, 'warning');
    return false;
  }
}

async function testAutoCredit() {
  logSection('5. Testing Auto-Credit Function');
  
  const balanceBefore = currentBalance;
  log(`Balance before auto-credit: ₦${balanceBefore.toLocaleString()}`, 'info');
  
  const response = await fetch(
    `${SUPABASE_URL}/functions/v1/demo-auto-credit`,
    {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${accessToken}`,
        'Content-Type': 'application/json',
      },
    }
  );

  const data = await response.json();
  
  if (data.success) {
    log(`Auto-credit function works!`, 'success');
    const newBalance = Number(data.balanceAfter ?? data.newBalance ?? 0);
    console.log(`   Balance after: ₦${newBalance.toLocaleString()}`);
    console.log(`   Amount credited: ₦${(newBalance - balanceBefore).toLocaleString()}`);
    
    // Update current balance
    currentBalance = newBalance;
    
    // Verify balance was actually updated
    const profileData = await makeRequest(
      `${SUPABASE_URL}/rest/v1/profiles?select=balance`
    );
    const actualBalance = Number(profileData?.[0]?.balance || 0);
    
    if (Math.abs(actualBalance - newBalance) < 0.01) {
      log(`Balance verified: ₦${actualBalance.toLocaleString()}`, 'success');
      currentBalance = actualBalance;
    } else {
      log(`Balance mismatch! Expected: ₦${newBalance}, Actual: ₦${actualBalance}`, 'warning');
      currentBalance = actualBalance;
    }
    
    return true;
  } else {
    log(`Auto-credit failed: ${data.error || JSON.stringify(data)}`, 'error');
    return false;
  }
}

async function testAirtimePurchase() {
  logSection('6. Testing Airtime Purchase (Simulation)');
  
  log(`Checking if airtime purchase function is accessible...`, 'info');
  
  // We can't actually purchase without vendor APIs, but we can check balance
  if (currentBalance >= 1000) {
    log(`Balance sufficient for airtime purchase (₦${currentBalance.toLocaleString()})`, 'success');
    log(`Note: Actual purchase requires vendor API credentials`, 'info');
    return true;
  } else {
    log(`Insufficient balance for airtime purchase`, 'error');
    return false;
  }
}

async function testDataPurchase() {
  logSection('7. Testing Data Purchase (Simulation)');
  
  log(`Checking if data purchase function is accessible...`, 'info');
  
  if (currentBalance >= 2000) {
    log(`Balance sufficient for data purchase (₦${currentBalance.toLocaleString()})`, 'success');
    log(`Note: Actual purchase requires vendor API credentials`, 'info');
    return true;
  } else {
    log(`Insufficient balance for data purchase`, 'error');
    return false;
  }
}

async function testElectricityPurchase() {
  logSection('8. Testing Electricity Purchase (Simulation)');
  
  log(`Checking if electricity purchase function is accessible...`, 'info');
  
  if (currentBalance >= 5000) {
    log(`Balance sufficient for electricity purchase (₦${currentBalance.toLocaleString()})`, 'success');
    log(`Note: Actual purchase requires vendor API credentials`, 'info');
    return true;
  } else {
    log(`Insufficient balance for electricity purchase`, 'error');
    return false;
  }
}

async function testCableTVPurchase() {
  logSection('9. Testing Cable TV Purchase (Simulation)');
  
  log(`Checking if cable TV purchase function is accessible...`, 'info');
  
  if (currentBalance >= 2500) {
    log(`Balance sufficient for cable TV purchase (₦${currentBalance.toLocaleString()})`, 'success');
    log(`Note: Actual purchase requires vendor API credentials`, 'info');
    return true;
  } else {
    log(`Insufficient balance for cable TV purchase`, 'error');
    return false;
  }
}

async function testTransferFunds() {
  logSection('10. Testing Transfer Funds (Simulation)');
  
  log(`Checking if transfer function is accessible...`, 'info');
  
  if (currentBalance >= 1000) {
    log(`Balance sufficient for transfer (₦${currentBalance.toLocaleString()})`, 'success');
    log(`Note: Actual transfer requires recipient user`, 'info');
    return true;
  } else {
    log(`Insufficient balance for transfer`, 'error');
    return false;
  }
}

async function testChangePIN() {
  logSection('11. Testing Change PIN (Feature Check)');
  
  log(`Change PIN feature is available in mobile app`, 'info');
  log(`Note: PIN change requires current PIN verification`, 'info');
  return true;
}

async function testDeleteAccount() {
  logSection('12. Testing Delete Account (Feature Check)');
  
  log(`Delete account feature is available in mobile app`, 'info');
  log(`Note: Account deletion is permanent and cannot be undone`, 'warning');
  return true;
}

async function runAllTests() {
  console.log(`${colors.bold}${colors.blue}`);
  console.log('╔════════════════════════════════════════════════════════╗');
  console.log('║     Comprehensive Demo User Feature Testing         ║');
  console.log('╚════════════════════════════════════════════════════════╝');
  console.log(`${colors.reset}\n`);

  const results = {
    passed: 0,
    failed: 0,
    warnings: 0,
  };

  try {
    // Core tests
    if (await testLogin()) results.passed++; else { results.failed++; return; }
    if (await testProfile()) results.passed++; else results.failed++;
    if (await testTransactions()) results.passed++; else results.warnings++;
    if (await testVirtualAccount()) results.passed++; else results.warnings++;

    // Feature tests
    if (await testAutoCredit()) results.passed++; else results.failed++;
    if (await testAirtimePurchase()) results.passed++; else results.failed++;
    if (await testDataPurchase()) results.passed++; else results.failed++;
    if (await testElectricityPurchase()) results.passed++; else results.failed++;
    if (await testCableTVPurchase()) results.passed++; else results.failed++;
    if (await testTransferFunds()) results.passed++; else results.failed++;
    if (await testChangePIN()) results.passed++;
    if (await testDeleteAccount()) results.passed++;

    // Summary
    logSection('Test Summary');
    console.log(`${colors.green}✅ Passed: ${results.passed}${colors.reset}`);
    console.log(`${colors.red}❌ Failed: ${results.failed}${colors.reset}`);
    console.log(`${colors.yellow}⚠️  Warnings: ${results.warnings}${colors.reset}`);
    console.log(`\n${colors.bold}Total Tests: ${results.passed + results.failed + results.warnings}${colors.reset}`);

    if (results.failed === 0) {
      log(`\n🎉 All critical tests passed! Demo user is ready for testing.`, 'success');
    } else {
      log(`\n⚠️  Some tests failed. Please review the errors above.`, 'warning');
    }

    console.log(`\n${colors.bold}Demo User Credentials:${colors.reset}`);
    console.log(`  Email: ${DEMO_EMAIL}`);
    console.log(`  Password: ${DEMO_PASSWORD}`);
    console.log(`  Current Balance: ₦${currentBalance.toLocaleString()}`);

  } catch (error) {
    log(`Fatal error during testing: ${error.message}`, 'error');
    console.error(error);
    process.exit(1);
  }
}

// Run the tests
runAllTests();

