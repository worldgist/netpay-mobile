/**
 * Test Script for DSTV Purchase
 * 
 * Tests DSTV Compact purchase with smart card number 80665679
 * 
 * Usage: node test-dstv-purchase.js
 */

import { createClient } from '@supabase/supabase-js';

// Supabase configuration
const SUPABASE_URL = 'https://rekkdwpkzkhgnejgzhac.supabase.co';
const SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InJla2tkd3BremtoZ25lamd6aGFjIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NjI0MzE0NTIsImV4cCI6MjA3ODAwNzQ1Mn0.8Lo84bFhMQ2O18UPjyj2gHpzNTDFUmpMo0y96fRscsA';

// Test configuration
const TEST_CONFIG = {
  email: 'Jetway463@gmail.com',
  password: 'Salifu147@',
  provider: 'DSTV',
  smartcardNumber: '80665679',
  packageName: 'DSTV Compact', // Will search for this in packages
};

async function testDSTVPurchase() {
  console.log('🧪 Testing DSTV Purchase');
  console.log('============================\n');
  
  try {
    // Step 1: Sign in using Supabase client
    console.log('1️⃣ Signing in...');
    const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);
    
    const { data: authData, error: authError } = await supabase.auth.signInWithPassword({
      email: TEST_CONFIG.email,
      password: TEST_CONFIG.password,
    });
    
    if (authError || !authData.session) {
      throw new Error(`Sign in failed: ${authError?.message || 'No session created'}`);
    }
    
    const access_token = authData.session.access_token;
    console.log('✅ Signed in successfully\n');
    
    // Step 2: Validate smartcard number
    console.log('2️⃣ Validating smartcard number:', TEST_CONFIG.smartcardNumber);
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
    
    // Step 3: Fetch DSTV packages
    console.log('3️⃣ Fetching DSTV packages...');
    const fetchPackagesResponse = await fetch(`${SUPABASE_URL}/functions/v1/fetch-cable-packages`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${access_token}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        provider: TEST_CONFIG.provider,
        vending_provider: 'mobilenig',
      }),
    });
    
    const packagesResult = await fetchPackagesResponse.json();
    console.log('Packages fetch result:', packagesResult.success ? 'Success' : 'Failed');
    
    if (!packagesResult.success || !packagesResult.data || packagesResult.data.length === 0) {
      throw new Error('Failed to fetch packages or no packages available');
    }
    
    // Find DSTV Compact package
    const compactPackage = packagesResult.data.find((pkg) => 
      pkg.package_name && pkg.package_name.toLowerCase().includes('compact')
    );
    
    if (!compactPackage) {
      console.log('Available packages:');
      packagesResult.data.slice(0, 5).forEach((pkg, idx) => {
        console.log(`  ${idx + 1}. ${pkg.package_name} - ₦${pkg.price}`);
      });
      throw new Error('DSTV Compact package not found');
    }
    
    console.log(`✅ Found package: ${compactPackage.package_name} - ₦${compactPackage.price}\n`);
    
    // Step 4: Get user balance
    console.log('4️⃣ Checking user balance...');
    const { data: profile, error: profileError } = await supabase
      .from('profiles')
      .select('balance, email')
      .single();
    
    if (profileError) {
      throw new Error(`Failed to fetch profile: ${profileError.message}`);
    }
    
    if (!profile) {
      throw new Error('User profile not found');
    }
    
    const balance = Number(profile.balance) || 0;
    const packagePrice = Number(compactPackage.price) || 0;
    const chargeFee = packagePrice * 0.02; // 2% charge fee
    const totalAmount = packagePrice + chargeFee;
    
    console.log(`Balance: ₦${balance.toFixed(2)}`);
    console.log(`Package Price: ₦${packagePrice.toFixed(2)}`);
    console.log(`Charge Fee (2%): ₦${chargeFee.toFixed(2)}`);
    console.log(`Total Amount: ₦${totalAmount.toFixed(2)}\n`);
    
    if (balance < totalAmount) {
      throw new Error(`Insufficient balance. Need ₦${totalAmount.toFixed(2)}, have ₦${balance.toFixed(2)}`);
    }
    
    // Step 5: Make purchase
    console.log('5️⃣ Making DSTV purchase...');
    console.log('Purchase details:', {
      provider: TEST_CONFIG.provider,
      smartcard: TEST_CONFIG.smartcardNumber,
      package: compactPackage.package_name,
      price: compactPackage.price,
      api_code: compactPackage.api_code,
    });
    
    const purchaseResponse = await fetch(`${SUPABASE_URL}/functions/v1/purchase-cable-tv`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${access_token}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        card_number: TEST_CONFIG.smartcardNumber,
        plan_id: compactPackage.api_code || compactPackage.id,
        provider: TEST_CONFIG.provider,
        customer_number: TEST_CONFIG.smartcardNumber,
        customer_name: validateResult.data?.customer_name || TEST_CONFIG.provider,
        package_name: compactPackage.package_name,
        price: compactPackage.price,
        api_code: compactPackage.api_code,
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
console.log('Starting DSTV Purchase Test...\n');
testDSTVPurchase();

