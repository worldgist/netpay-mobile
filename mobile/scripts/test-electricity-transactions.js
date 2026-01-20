/**
 * Test script to check electricity transactions in the database
 * Run with: node scripts/test-electricity-transactions.js
 */

const { createClient } = require('@supabase/supabase-js');

// Load environment variables
const supabaseUrl = process.env.EXPO_PUBLIC_SUPABASE_URL;
const supabaseAnonKey = process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY;

if (!supabaseUrl || !supabaseAnonKey) {
  console.error('Error: EXPO_PUBLIC_SUPABASE_URL and EXPO_PUBLIC_SUPABASE_ANON_KEY must be set');
  console.error('Please create a .env file with these values');
  process.exit(1);
}

const supabase = createClient(supabaseUrl, supabaseAnonKey);

async function testElectricityTransactions() {
  console.log('Testing electricity transactions...\n');

  try {
    // Test 1: Check if we can query electricity_transactions table (should work with service role or as authenticated user)
    console.log('Test 1: Querying all electricity transactions (last 10)...');
    const { data: allTransactions, error: allError } = await supabase
      .from('electricity_transactions')
      .select('id, user_id, provider, meter_number, amount, status, vending_provider, reference, created_at')
      .order('created_at', { ascending: false })
      .limit(10);

    if (allError) {
      console.error('❌ Error querying electricity transactions:', allError);
      console.error('   This might indicate RLS is blocking the query');
    } else {
      console.log(`✅ Found ${allTransactions?.length || 0} electricity transactions`);
      if (allTransactions && allTransactions.length > 0) {
        console.log('\nSample transactions:');
        allTransactions.forEach((txn, index) => {
          console.log(`  ${index + 1}. ID: ${txn.id}`);
          console.log(`     Provider: ${txn.provider}`);
          console.log(`     Vending Provider: ${txn.vending_provider}`);
          console.log(`     Amount: ₦${txn.amount}`);
          console.log(`     Status: ${txn.status}`);
          console.log(`     Reference: ${txn.reference}`);
          console.log(`     Created: ${txn.created_at}`);
          console.log('');
        });

        // Count by vending provider
        const ebillsCount = allTransactions.filter(t => t.vending_provider === 'ebills').length;
        const mobilenigCount = allTransactions.filter(t => t.vending_provider === 'mobilenig').length;
        const otherCount = allTransactions.filter(t => t.vending_provider !== 'ebills' && t.vending_provider !== 'mobilenig').length;
        
        console.log('Summary by vending provider:');
        console.log(`  eBills: ${ebillsCount}`);
        console.log(`  MobileNig: ${mobilenigCount}`);
        console.log(`  Other/Unknown: ${otherCount}`);
      }
    }

    // Test 2: Check specifically for eBills transactions
    console.log('\n\nTest 2: Checking for eBills electricity transactions...');
    const { data: ebillsTransactions, error: ebillsError } = await supabase
      .from('electricity_transactions')
      .select('*')
      .eq('vending_provider', 'ebills')
      .order('created_at', { ascending: false })
      .limit(5);

    if (ebillsError) {
      console.error('❌ Error querying eBills transactions:', ebillsError);
    } else {
      console.log(`✅ Found ${ebillsTransactions?.length || 0} eBills electricity transactions`);
      if (ebillsTransactions && ebillsTransactions.length > 0) {
        console.log('Latest eBills transaction:');
        const latest = ebillsTransactions[0];
        console.log(`  Reference: ${latest.reference}`);
        console.log(`  Status: ${latest.status}`);
        console.log(`  Amount: ₦${latest.amount}`);
        console.log(`  Provider: ${latest.provider}`);
        console.log(`  Created: ${latest.created_at}`);
      }
    }

    // Test 3: Check RLS policies
    console.log('\n\nTest 3: Checking RLS policies...');
    const { data: policies, error: policiesError } = await supabase
      .rpc('get_table_policies', { table_name: 'electricity_transactions' })
      .catch(() => ({ data: null, error: 'RPC function not available' }));

    if (policiesError || !policies) {
      console.log('⚠️  Cannot check RLS policies (requires custom RPC function)');
      console.log('   Manually check policies in Supabase dashboard');
    } else {
      console.log('✅ RLS Policies:', policies);
    }

    console.log('\n\n=== Summary ===');
    console.log('If you see electricity transactions above, they ARE being recorded.');
    console.log('If the mobile app is not showing them, the issue is likely:');
    console.log('1. RLS policy blocking user queries (check "Users can view their own electricity transactions" policy)');
    console.log('2. Authentication issue in the mobile app');
    console.log('3. The query in the mobile app is using wrong filters');
    console.log('\nTo debug further:');
    console.log('1. Check the mobile app console logs when opening the transactions screen');
    console.log('2. Verify the user ID matches between purchase and query');
    console.log('3. Check if the session is valid when querying transactions');

  } catch (error) {
    console.error('Unexpected error:', error);
  }
}

// Run the test
testElectricityTransactions();
