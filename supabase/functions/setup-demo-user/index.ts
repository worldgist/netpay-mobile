import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const CORS_HEADERS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const DEMO_USER_EMAIL = "demo@netppay.com";
const DEMO_PHONE = "08012345678";
const DEMO_VIRTUAL_ACCOUNT = "1234567890";
const DEMO_BALANCE = 50000.00;

// Demo phone numbers for different networks
const DEMO_PHONE_NUMBERS = {
  MTN: "08012345678",
  AIRTEL: "08023456789",
  GLO: "08034567890",
  "9MOBILE": "08045678901",
};

// Demo smartcard numbers for cable TV
const DEMO_SMARTCARD_NUMBERS = {
  DStv: "1234567890",
  GOtv: "3456789012",
  StarTimes: "5678901234",
};

// Demo meter numbers for electricity
const DEMO_METER_NUMBERS = {
  EKEDC: "12345678901",
  PHEDC: "98765432109",
  IKEDC: "11223344556",
  AEDC: "99887766554",
  KAEDC: "55667788990",
  JED: "44332211009",
};

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: CORS_HEADERS });
  }

  if (req.method !== "POST") {
    return new Response(
      JSON.stringify({ success: false, error: "Method not allowed" }),
      { status: 405, headers: { ...CORS_HEADERS, "Content-Type": "application/json" } },
    );
  }

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    // Get authorization header
    const authHeader = req.headers.get("Authorization");
    if (!authHeader) {
      return new Response(
        JSON.stringify({ success: false, error: "Missing authorization header" }),
        { status: 401, headers: { ...CORS_HEADERS, "Content-Type": "application/json" } },
      );
    }

    // Get user from token
    const token = authHeader.replace("Bearer ", "");
    const { data: { user }, error: userError } = await supabase.auth.getUser(token);

    if (userError || !user) {
      return new Response(
        JSON.stringify({ success: false, error: "Invalid or expired token" }),
        { status: 401, headers: { ...CORS_HEADERS, "Content-Type": "application/json" } },
      );
    }

    // Check if user is demo user
    if (user.email !== DEMO_USER_EMAIL) {
      return new Response(
        JSON.stringify({ 
          success: false, 
          error: "This function is only available for demo users" 
        }),
        { status: 403, headers: { ...CORS_HEADERS, "Content-Type": "application/json" } },
      );
    }

    const demoUserId = user.id;

    // 1. Create/Update profile with demo balance
    const { error: profileError } = await supabase
      .from("profiles")
      .upsert({
        id: demoUserId,
        email: DEMO_USER_EMAIL,
        phone: DEMO_PHONE,
        full_name: "Demo User",
        balance: DEMO_BALANCE,
        status: "active",
      }, {
        onConflict: "id",
      });

    if (profileError) {
      throw profileError;
    }

    // 2. Create virtual account
    // Use PalmPay bank code (999991) which is the default in the mobile app
    const { error: virtualAccountError } = await supabase
      .from("virtual_accounts")
      .upsert({
        user_id: demoUserId,
        business_id: "DEMO_BUSINESS",
        bank_code: "999991", // PalmPay - matches DEFAULT_BANK_CODE in mobile app
        bank_name: "PalmPay",
        account_number: DEMO_VIRTUAL_ACCOUNT,
        account_name: "DEMO USER",
        tracking_reference: `DEMO-${demoUserId}`,
      }, {
        onConflict: "user_id,bank_code",
      });

    if (virtualAccountError) {
      console.warn("Virtual account error (may already exist):", virtualAccountError);
    }

    // 3. Create demo user_transactions (general transaction history)
    const transactions = [
      {
        user_id: demoUserId,
        transaction_type: "credit",
        amount: DEMO_BALANCE,
        balance_before: 0,
        balance_after: DEMO_BALANCE,
        description: "Demo account initial funding",
        reference: "DEMO-INITIAL-001",
        performed_by: demoUserId,
        created_at: new Date(Date.now() - 10 * 24 * 60 * 60 * 1000).toISOString(), // 10 days ago
      },
      {
        user_id: demoUserId,
        transaction_type: "debit",
        amount: 1000,
        balance_before: DEMO_BALANCE,
        balance_after: DEMO_BALANCE - 1000,
        description: "Demo airtime purchase - MTN ₦1,000",
        reference: "DEMO-AIRTIME-001",
        performed_by: demoUserId,
        created_at: new Date(Date.now() - 9 * 24 * 60 * 60 * 1000).toISOString(), // 9 days ago
      },
      {
        user_id: demoUserId,
        transaction_type: "debit",
        amount: 500,
        balance_before: DEMO_BALANCE - 1000,
        balance_after: DEMO_BALANCE - 1500,
        description: "Demo airtime purchase - AIRTEL ₦500",
        reference: "DEMO-AIRTIME-002",
        performed_by: demoUserId,
        created_at: new Date(Date.now() - 8 * 24 * 60 * 60 * 1000).toISOString(), // 8 days ago
      },
      {
        user_id: demoUserId,
        transaction_type: "debit",
        amount: 2000,
        balance_before: DEMO_BALANCE - 1500,
        balance_after: DEMO_BALANCE - 3500,
        description: "Demo data purchase - 5GB MTN",
        reference: "DEMO-DATA-001",
        performed_by: demoUserId,
        created_at: new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString(), // 7 days ago
      },
      {
        user_id: demoUserId,
        transaction_type: "debit",
        amount: 1500,
        balance_before: DEMO_BALANCE - 3500,
        balance_after: DEMO_BALANCE - 5000,
        description: "Demo data purchase - 3GB GLO",
        reference: "DEMO-DATA-002",
        performed_by: demoUserId,
        created_at: new Date(Date.now() - 6 * 24 * 60 * 60 * 1000).toISOString(), // 6 days ago
      },
      {
        user_id: demoUserId,
        transaction_type: "debit",
        amount: 2500,
        balance_before: DEMO_BALANCE - 5000,
        balance_after: DEMO_BALANCE - 7500,
        description: "Demo cable TV - DStv Compact",
        reference: "DEMO-CABLE-001",
        performed_by: demoUserId,
        created_at: new Date(Date.now() - 5 * 24 * 60 * 60 * 1000).toISOString(), // 5 days ago
      },
      {
        user_id: demoUserId,
        transaction_type: "debit",
        amount: 5000,
        balance_before: DEMO_BALANCE - 7500,
        balance_after: DEMO_BALANCE - 12500,
        description: "Demo electricity purchase - EKEDC ₦5,000",
        reference: "DEMO-ELECTRICITY-001",
        performed_by: demoUserId,
        created_at: new Date(Date.now() - 4 * 24 * 60 * 60 * 1000).toISOString(), // 4 days ago
      },
      {
        user_id: demoUserId,
        transaction_type: "debit",
        amount: 3000,
        balance_before: DEMO_BALANCE - 12500,
        balance_after: DEMO_BALANCE - 15500,
        description: "Demo electricity purchase - PHEDC ₦3,000",
        reference: "DEMO-ELECTRICITY-002",
        performed_by: demoUserId,
        created_at: new Date(Date.now() - 3 * 24 * 60 * 60 * 1000).toISOString(), // 3 days ago
      },
      {
        user_id: demoUserId,
        transaction_type: "debit",
        amount: 5000,
        balance_before: DEMO_BALANCE - 15500,
        balance_after: DEMO_BALANCE - 20500,
        description: "Demo transfer sent to friend",
        reference: "DEMO-TRANSFER-SENT-001",
        performed_by: demoUserId,
        created_at: new Date(Date.now() - 2 * 24 * 60 * 60 * 1000).toISOString(), // 2 days ago
      },
      {
        user_id: demoUserId,
        transaction_type: "credit",
        amount: 10000,
        balance_before: DEMO_BALANCE - 20500,
        balance_after: DEMO_BALANCE - 10500,
        description: "Demo transfer received from family",
        reference: "DEMO-TRANSFER-RECEIVED-001",
        performed_by: demoUserId,
        created_at: new Date(Date.now() - 1 * 24 * 60 * 60 * 1000).toISOString(), // 1 day ago
      },
    ];

    // Delete existing demo user transactions first to avoid conflicts
    await supabase
      .from("user_transactions")
      .delete()
      .eq("user_id", demoUserId)
      .like("reference", "DEMO-%");

    const { data: insertedTransactions, error: transactionsError } = await supabase
      .from("user_transactions")
      .insert(transactions)
      .select();

    if (transactionsError) {
      console.error("Failed to create user transactions:", transactionsError);
      throw transactionsError;
    }
    
    console.log(`Created ${insertedTransactions?.length || 0} user transactions`);

    // 4. Create demo funding transaction
    const { error: fundingError } = await supabase
      .from("funding_transactions")
      .upsert({
        user_id: demoUserId,
        amount: DEMO_BALANCE,
        status: "completed",
        reference: "DEMO-FUNDING-001",
        created_at: new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString(),
      }, {
        onConflict: "reference",
        ignoreDuplicates: true,
      });

    if (fundingError) {
      console.warn("Funding transaction error (may already exist):", fundingError);
    }

    // 5. Create demo airtime transactions
    const airtimeTransactions = [
      {
        user_id: demoUserId,
        phone_number: DEMO_PHONE_NUMBERS.MTN,
        amount: 1000,
        network: "MTN",
        service_id: "mtn-airtime",
        balance_before: DEMO_BALANCE,
        balance_after: DEMO_BALANCE - 1000,
        status: "success",
        reference: "DEMO-AIRTIME-001",
        performed_by: demoUserId,
        created_at: new Date(Date.now() - 9 * 24 * 60 * 60 * 1000).toISOString(),
      },
      {
        user_id: demoUserId,
        phone_number: DEMO_PHONE_NUMBERS.AIRTEL,
        amount: 500,
        network: "AIRTEL",
        service_id: "airtel-airtime",
        balance_before: DEMO_BALANCE - 1000,
        balance_after: DEMO_BALANCE - 1500,
        status: "success",
        reference: "DEMO-AIRTIME-002",
        performed_by: demoUserId,
        created_at: new Date(Date.now() - 8 * 24 * 60 * 60 * 1000).toISOString(),
      },
      {
        user_id: demoUserId,
        phone_number: DEMO_PHONE_NUMBERS.GLO,
        amount: 2000,
        network: "GLO",
        service_id: "glo-airtime",
        balance_before: DEMO_BALANCE - 1500,
        balance_after: DEMO_BALANCE - 3500,
        status: "success",
        reference: "DEMO-AIRTIME-003",
        performed_by: demoUserId,
        created_at: new Date(Date.now() - 5 * 24 * 60 * 60 * 1000).toISOString(),
      },
      {
        user_id: demoUserId,
        phone_number: DEMO_PHONE_NUMBERS["9MOBILE"],
        amount: 1500,
        network: "9MOBILE",
        service_id: "9mobile-airtime",
        balance_before: DEMO_BALANCE - 3500,
        balance_after: DEMO_BALANCE - 5000,
        status: "success",
        reference: "DEMO-AIRTIME-004",
        performed_by: demoUserId,
        created_at: new Date(Date.now() - 4 * 24 * 60 * 60 * 1000).toISOString(),
      },
    ];

    // Delete existing demo airtime transactions first
    await supabase
      .from("airtime_transactions")
      .delete()
      .eq("user_id", demoUserId)
      .like("reference", "DEMO-%");

    const { data: insertedAirtime, error: airtimeError } = await supabase
      .from("airtime_transactions")
      .insert(airtimeTransactions)
      .select();

    if (airtimeError) {
      console.error("Failed to create airtime transactions:", airtimeError);
      // Don't throw - continue with other transactions
    } else {
      console.log(`Created ${insertedAirtime?.length || 0} airtime transactions`);
    }

    // 6. Create demo data transactions
    const dataTransactions = [
      {
        user_id: demoUserId,
        amount: 2000,
        balance_before: DEMO_BALANCE - 5000,
        balance_after: DEMO_BALANCE - 7000,
        phone_number: DEMO_PHONE_NUMBERS.MTN,
        network: "MTN",
        plan_name: "5GB Monthly",
        plan_validity: "30 days",
        status: "success",
        reference: "DEMO-DATA-001",
        performed_by: demoUserId,
        created_at: new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString(),
      },
      {
        user_id: demoUserId,
        amount: 1500,
        balance_before: DEMO_BALANCE - 7000,
        balance_after: DEMO_BALANCE - 8500,
        phone_number: DEMO_PHONE_NUMBERS.GLO,
        network: "GLO",
        plan_name: "3GB Monthly",
        plan_validity: "30 days",
        status: "success",
        reference: "DEMO-DATA-002",
        performed_by: demoUserId,
        created_at: new Date(Date.now() - 6 * 24 * 60 * 60 * 1000).toISOString(),
      },
      {
        user_id: demoUserId,
        amount: 3000,
        balance_before: DEMO_BALANCE - 8500,
        balance_after: DEMO_BALANCE - 11500,
        phone_number: DEMO_PHONE_NUMBERS.AIRTEL,
        network: "AIRTEL",
        plan_name: "10GB Monthly",
        plan_validity: "30 days",
        status: "success",
        reference: "DEMO-DATA-003",
        performed_by: demoUserId,
        created_at: new Date(Date.now() - 3 * 24 * 60 * 60 * 1000).toISOString(),
      },
      {
        user_id: demoUserId,
        amount: 1000,
        balance_before: DEMO_BALANCE - 11500,
        balance_after: DEMO_BALANCE - 12500,
        phone_number: DEMO_PHONE_NUMBERS["9MOBILE"],
        network: "9MOBILE",
        plan_name: "2GB Monthly",
        plan_validity: "30 days",
        status: "success",
        reference: "DEMO-DATA-004",
        performed_by: demoUserId,
        created_at: new Date(Date.now() - 2 * 24 * 60 * 60 * 1000).toISOString(),
      },
      {
        user_id: demoUserId,
        amount: 5000,
        balance_before: DEMO_BALANCE - 12500,
        balance_after: DEMO_BALANCE - 17500,
        phone_number: DEMO_PHONE_NUMBERS.MTN,
        network: "MTN",
        plan_name: "20GB Monthly",
        plan_validity: "30 days",
        status: "success",
        reference: "DEMO-DATA-005",
        performed_by: demoUserId,
        created_at: new Date(Date.now() - 1 * 24 * 60 * 60 * 1000).toISOString(),
      },
    ];

    // Delete existing demo data transactions first
    await supabase
      .from("data_transactions")
      .delete()
      .eq("user_id", demoUserId)
      .like("reference", "DEMO-%");

    const { data: insertedData, error: dataError } = await supabase
      .from("data_transactions")
      .insert(dataTransactions)
      .select();

    if (dataError) {
      console.error("Failed to create data transactions:", dataError);
      // Don't throw - continue with other transactions
    } else {
      console.log(`Created ${insertedData?.length || 0} data transactions`);
    }

    // 7. Create demo electricity transactions
    const electricityTransactions = [
      {
        user_id: demoUserId,
        amount: 5000,
        balance_before: DEMO_BALANCE - 5000,
        balance_after: DEMO_BALANCE - 10000,
        meter_number: DEMO_METER_NUMBERS.EKEDC,
        provider: "EKEDC",
        meter_type: "prepaid",
        customer_name: "Demo Customer",
        token: "1234-5678-9012-3456",
        status: "success",
        reference: "DEMO-ELECTRICITY-001",
        performed_by: demoUserId,
        created_at: new Date(Date.now() - 4 * 24 * 60 * 60 * 1000).toISOString(),
      },
      {
        user_id: demoUserId,
        amount: 3000,
        balance_before: DEMO_BALANCE - 10000,
        balance_after: DEMO_BALANCE - 13000,
        meter_number: DEMO_METER_NUMBERS.PHEDC,
        provider: "PHEDC",
        meter_type: "prepaid",
        customer_name: "Demo Customer",
        token: "9876-5432-1098-7654",
        status: "success",
        reference: "DEMO-ELECTRICITY-002",
        performed_by: demoUserId,
        created_at: new Date(Date.now() - 3 * 24 * 60 * 60 * 1000).toISOString(),
      },
    ];

    // Delete existing demo electricity transactions first
    await supabase
      .from("electricity_transactions")
      .delete()
      .eq("user_id", demoUserId)
      .like("reference", "DEMO-%");

    const { data: insertedElectricity, error: electricityError } = await supabase
      .from("electricity_transactions")
      .insert(electricityTransactions)
      .select();

    if (electricityError) {
      console.error("Failed to create electricity transactions:", electricityError);
      // Don't throw - continue with other transactions
    } else {
      console.log(`Created ${insertedElectricity?.length || 0} electricity transactions`);
    }

    // 8. Create demo transfer transactions
    // For demo purposes, we'll create transfers where demo user sends to themselves
    // and receives from themselves to simulate both sent and received transfers
    
    // Delete existing demo transfer transactions first
    await supabase
      .from("transfer_transactions")
      .delete()
      .or(`sender_id.eq.${demoUserId},recipient_id.eq.${demoUserId}`)
      .like("reference", "DEMO-TRANSFER-%");

    // Create demo transfers (demo user to themselves for simplicity)
    // These simulate real-world scenarios where user sends and receives money
    const transferTransactions = [
      {
        sender_id: demoUserId,
        recipient_id: demoUserId, // Self-transfer for demo
        amount: 5000,
        description: "Demo transfer sent to friend",
        reference: "DEMO-TRANSFER-SENT-001",
        status: "completed",
        sender_balance_before: DEMO_BALANCE - 15500,
        sender_balance_after: DEMO_BALANCE - 20500,
        recipient_balance_before: DEMO_BALANCE - 20500,
        recipient_balance_after: DEMO_BALANCE - 15500, // Recipient receives, but it's the same user
        created_at: new Date(Date.now() - 2 * 24 * 60 * 60 * 1000).toISOString(),
      },
      {
        sender_id: demoUserId,
        recipient_id: demoUserId, // Self-transfer for demo
        amount: 10000,
        description: "Demo transfer received from family",
        reference: "DEMO-TRANSFER-RECEIVED-001",
        status: "completed",
        sender_balance_before: DEMO_BALANCE - 20500,
        sender_balance_after: DEMO_BALANCE - 10500,
        recipient_balance_before: DEMO_BALANCE - 10500,
        recipient_balance_after: DEMO_BALANCE - 500, // Net effect: received 10000
        created_at: new Date(Date.now() - 1 * 24 * 60 * 60 * 1000).toISOString(),
      },
      {
        sender_id: demoUserId,
        recipient_id: demoUserId,
        amount: 3000,
        description: "Demo transfer to business partner",
        reference: "DEMO-TRANSFER-SENT-002",
        status: "completed",
        sender_balance_before: DEMO_BALANCE - 500,
        sender_balance_after: DEMO_BALANCE - 3500,
        recipient_balance_before: DEMO_BALANCE - 3500,
        recipient_balance_after: DEMO_BALANCE - 500,
        created_at: new Date(Date.now() - 12 * 60 * 60 * 1000).toISOString(), // 12 hours ago
      },
    ];

    const { data: insertedTransfers, error: transferError } = await supabase
      .from("transfer_transactions")
      .insert(transferTransactions)
      .select();

    if (transferError) {
      console.warn("Transfer transactions error:", transferError);
      // Don't throw - continue with other transactions
    } else {
      console.log(`Created ${insertedTransfers?.length || 0} transfer transactions`);
    }
    
    // Update final balance - ensure demo user has sufficient balance for testing
    // Set to a high amount (₦100,000) to ensure all purchases work
    const finalBalance = 100000.00; // ₦100,000 for comprehensive testing
    const { error: balanceUpdateError } = await supabase
      .from("profiles")
      .update({ balance: finalBalance })
      .eq("id", demoUserId);

    if (balanceUpdateError) {
      console.error("Failed to update final balance:", balanceUpdateError);
      // Don't throw - transactions are more important than final balance
    } else {
      console.log(`Updated demo user balance to ₦${finalBalance.toLocaleString()}`);
    }

    return new Response(
      JSON.stringify({
        success: true,
        message: "Demo user setup completed successfully",
        demo_user_id: demoUserId,
        demo_email: DEMO_USER_EMAIL,
        virtual_account: DEMO_VIRTUAL_ACCOUNT,
        initial_balance: DEMO_BALANCE,
        final_balance: finalBalance,
        transactions_created: {
          user_transactions: insertedTransactions?.length || 0,
          airtime_transactions: insertedAirtime?.length || 0,
          data_transactions: insertedData?.length || 0,
          electricity_transactions: insertedElectricity?.length || 0,
          cable_tv_transactions: insertedCableTv?.length || 0,
          transfer_transactions: insertedTransfers?.length || 0,
          funding_transactions: 1,
        },
      }),
      { status: 200, headers: { ...CORS_HEADERS, "Content-Type": "application/json" } },
    );
  } catch (error) {
    console.error("Error setting up demo user:", error);
    return new Response(
      JSON.stringify({
        success: false,
        error: error instanceof Error ? error.message : "Unknown error occurred",
      }),
      { status: 500, headers: { ...CORS_HEADERS, "Content-Type": "application/json" } },
    );
  }
});

