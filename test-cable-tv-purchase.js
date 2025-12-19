/**
 * Test Script for Cable TV Purchase
 * 
 * This script tests the cable TV purchase functionality using the MobileNig test keys.
 * 
 * Usage:
 * 1. Make sure you're logged in to Supabase CLI: `supabase login`
 * 2. Run: `node test-cable-tv-purchase.js`
 * 
 * Demo Smartcard Numbers:
 * - DSTV: 1234567890
 * - GOTV: 3456789012
 * - StarTimes: 5678901234
 */

const SUPABASE_URL = process.env.SUPABASE_URL || 'https://rekkdwpkzkhgnejgzhac.supabase.co';
const SUPABASE_ANON_KEY = process.env.SUPABASE_ANON_KEY || 'your-anon-key-here';

// Test configuration
const TEST_CONFIG = {
  // Demo user credentials
  email: 'demo@netpayy.ng',
  password: 'Demo@1234',
  
  // Test purchase details
  provider: 'DSTV',
  smartcardNumber: '1234567890',
  packageName: 'DStv Yanga Bouquet E36',
  price: 3500,
  apiCode: 'MBDYB',
};

async function testCableTVPurchase() {
  console.log('🧪 Testing Cable TV Purchase');
  console.log('============================\n');
  
  try {
    // Step 1: Sign in to get access token
    console.log('1️⃣ Signing in as demo user...');
    const signInResponse = await fetch(`${SUPABASE_URL}/auth/v1/token?grant_type=password`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'apikey': SUPABASE_ANON_KEY,
      },
      body: JSON.stringify({
        email: TEST_CONFIG.email,
        password: TEST_CONFIG.password,
      }),
    });
    
    if (!signInResponse.ok) {
      const error = await signInResponse.text();
      throw new Error(`Sign in failed: ${error}`);
    }
    
    const { access_token } = await signInResponse.json();
    console.log('✅ Signed in successfully\n');
    
    // Step 2: Validate smartcard number
    console.log('2️⃣ Validating smartcard number...');
    const validateResponse = await fetch(`${SUPABASE_URL}/functions/v1/validate-cable-customer`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${access_token}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        card_number: TEST_CONFIG.smartcardNumber,
        provider: TEST_CONFIG.provider,
      }),
    });
    
    const validateResult = await validateResponse.json();
    console.log('Validation result:', JSON.stringify(validateResult, null, 2));
    
    if (validateResult.success) {
      console.log(`✅ Smartcard validated. Customer: ${validateResult.data?.customer_name || 'N/A'}\n`);
    } else {
      console.log(`⚠️ Validation warning: ${validateResult.error}\n`);
    }
    
    // Step 3: Make purchase
    console.log('3️⃣ Making cable TV purchase...');
    console.log('Purchase details:', {
      provider: TEST_CONFIG.provider,
      smartcard: TEST_CONFIG.smartcardNumber,
      package: TEST_CONFIG.packageName,
      price: TEST_CONFIG.price,
    });
    
    const purchaseResponse = await fetch(`${SUPABASE_URL}/functions/v1/purchase-cable-tv`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${access_token}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        card_number: TEST_CONFIG.smartcardNumber,
        plan_id: TEST_CONFIG.apiCode,
        provider: TEST_CONFIG.provider,
        customer_number: TEST_CONFIG.smartcardNumber,
        customer_name: validateResult.data?.customer_name || TEST_CONFIG.provider,
        package_name: TEST_CONFIG.packageName,
        price: TEST_CONFIG.price,
        api_code: TEST_CONFIG.apiCode,
      }),
    });
    
    const purchaseResult = await purchaseResponse.json();
    console.log('\n📦 Purchase Response:');
    console.log(JSON.stringify(purchaseResult, null, 2));
    
    if (purchaseResult.success) {
      console.log('\n✅ Purchase successful!');
      console.log('Transaction Reference:', purchaseResult.data?.reference);
      console.log('Amount Charged:', purchaseResult.data?.amount);
      console.log('Charge Fee (2%):', purchaseResult.data?.charge_fee);
      console.log('Balance Before:', purchaseResult.data?.balance_before);
      console.log('Balance After:', purchaseResult.data?.balance_after);
    } else {
      console.log('\n❌ Purchase failed:', purchaseResult.error);
      if (purchaseResult.details) {
        console.log('Details:', JSON.stringify(purchaseResult.details, null, 2));
      }
    }
    
  } catch (error) {
    console.error('\n❌ Test failed:', error.message);
    console.error(error.stack);
  }
}

// Run the test
console.log('Starting Cable TV Purchase Test...\n');
testCableTVPurchase();


