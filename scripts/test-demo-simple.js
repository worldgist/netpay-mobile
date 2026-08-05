// Simple Node.js script to test demo user
// Run with: node scripts/test-demo-simple.js

const SUPABASE_URL = process.env.SUPABASE_URL || 'https://xrpuvnhmdmpgelfxpdcx.supabase.co';
const SUPABASE_ANON_KEY = process.env.SUPABASE_ANON_KEY || '';
const DEMO_EMAIL = 'demo@netpayy.ng';
const DEMO_PASSWORD = 'Demo@1234';

async function testDemoUser() {
  console.log('🧪 Testing Demo User Functionality\n');
  console.log('====================================\n');

  try {
    // Step 1: Create/Setup demo user
    console.log('Step 1: Creating/Setting up demo user...');
    const setupResponse = await fetch(
      `${SUPABASE_URL}/functions/v1/create-and-setup-demo-user`,
      {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${SUPABASE_ANON_KEY}`,
          'Content-Type': 'application/json',
        },
      }
    );

    const setupData = await setupResponse.json();
    if (setupData.success) {
      console.log('✅ Demo user setup successful!');
      console.log(`   User ID: ${setupData.demo_user_id}`);
      console.log(`   Final Balance: ₦${setupData.final_balance?.toLocaleString() || 'N/A'}`);
      console.log(`   Transactions Created:`, setupData.transactions_created);
    } else {
      console.log('❌ Demo user setup failed:', setupData.error);
      return;
    }

    console.log('\n');

    // Step 2: Test login
    console.log('Step 2: Testing demo user login...');
    const loginResponse = await fetch(
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

    const loginData = await loginResponse.json();
    const accessToken = loginData.access_token;

    if (!accessToken) {
      console.log('❌ Login failed:', loginData);
      return;
    }

    console.log('✅ Login successful!');
    console.log(`   Token: ${accessToken.substring(0, 20)}...`);

    console.log('\n');

    // Step 3: Check profile and balance
    console.log('Step 3: Checking demo user profile...');
    const profileResponse = await fetch(
      `${SUPABASE_URL}/rest/v1/profiles?email=eq.${DEMO_EMAIL}&select=*`,
      {
        headers: {
          'apikey': SUPABASE_ANON_KEY,
          'Authorization': `Bearer ${accessToken}`,
          'Content-Type': 'application/json',
        },
      }
    );

    const profileData = await profileResponse.json();
    if (profileData && profileData[0]) {
      const profile = profileData[0];
      console.log('✅ Profile found!');
      console.log(`   Name: ${profile.full_name}`);
      console.log(`   Email: ${profile.email}`);
      console.log(`   Balance: ₦${Number(profile.balance || 0).toLocaleString()}`);
      console.log(`   Status: ${profile.status}`);

      if (Number(profile.balance) >= 10000) {
        console.log('   ✅ Balance is sufficient for testing');
      } else {
        console.log('   ⚠️  Balance might be low');
      }
    } else {
      console.log('❌ Profile not found');
    }

    console.log('\n');

    // Step 4: Check transactions
    console.log('Step 4: Checking demo transactions...');
    const transactionsResponse = await fetch(
      `${SUPABASE_URL}/rest/v1/user_transactions?user_id=eq.${setupData.demo_user_id}&select=*&order=created_at.desc&limit=5`,
      {
        headers: {
          'apikey': SUPABASE_ANON_KEY,
          'Authorization': `Bearer ${accessToken}`,
          'Content-Type': 'application/json',
        },
      }
    );

    const transactionsData = await transactionsResponse.json();
    console.log(`✅ Found ${transactionsData.length} recent transactions`);
    if (transactionsData.length > 0) {
      console.log('   Recent transactions:');
      transactionsData.slice(0, 3).forEach((txn, idx) => {
        console.log(`   ${idx + 1}. ${txn.description || 'N/A'} - ${txn.transaction_type} - ₦${Number(txn.amount || 0).toLocaleString()}`);
      });
    }

    console.log('\n');

    // Step 5: Test auto-credit
    console.log('Step 5: Testing demo auto-credit...');
    const autoCreditResponse = await fetch(
      `${SUPABASE_URL}/functions/v1/demo-auto-credit`,
      {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${accessToken}`,
          'Content-Type': 'application/json',
        },
      }
    );

    const autoCreditData = await autoCreditResponse.json();
    if (autoCreditData.success) {
      console.log('✅ Auto-credit function works!');
      console.log(`   New Balance: ₦${Number(autoCreditData.balanceAfter ?? autoCreditData.newBalance ?? 0).toLocaleString()}`);
    } else {
      console.log('⚠️  Auto-credit response:', autoCreditData);
    }

    console.log('\n');
    console.log('====================================');
    console.log('✅ Demo user testing completed!');
    console.log('\nDemo User Credentials:');
    console.log(`  Email: ${DEMO_EMAIL}`);
    console.log(`  Password: ${DEMO_PASSWORD}`);
    console.log('\nYou can now test the demo user in the mobile app!');

  } catch (error) {
    console.error('❌ Error during testing:', error.message);
    process.exit(1);
  }
}

// Run the test
testDemoUser();





















