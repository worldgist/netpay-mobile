import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const CORS_HEADERS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: CORS_HEADERS });
  }

  try {
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    // Get authenticated user
    const authHeader = req.headers.get('Authorization');
    if (!authHeader) {
      return new Response(
        JSON.stringify({ success: false, error: 'Unauthorized' }),
        { status: 401, headers: { ...CORS_HEADERS, 'Content-Type': 'application/json' } }
      );
    }

    const token = authHeader.startsWith('Bearer ') 
      ? authHeader.substring(7).trim() 
      : authHeader.trim();
    
    const { data: { user }, error: authError } = await supabase.auth.getUser(token);
    
    if (authError || !user) {
      return new Response(
        JSON.stringify({ success: false, error: 'Unauthorized' }),
        { status: 401, headers: { ...CORS_HEADERS, 'Content-Type': 'application/json' } }
      );
    }

    // Check if user is admin
    const { data: roleData } = await supabase
      .from('user_roles')
      .select('role')
      .eq('user_id', user.id)
      .eq('role', 'admin')
      .maybeSingle();

    if (!roleData) {
      return new Response(
        JSON.stringify({ success: false, error: 'Admin access required' }),
        { status: 403, headers: { ...CORS_HEADERS, 'Content-Type': 'application/json' } }
      );
    }

    const body = await req.json();
    const { userId, startDate, endDate, limit = 100, reference } = body || {};

    // If a specific reference is provided, recover that transaction
    if (reference) {
      return await recoverSpecificTransaction(supabase, reference);
    }

    console.log('Recovering missing electricity transactions:', {
      userId: userId || 'all users',
      startDate,
      endDate,
      limit,
    });

    // First, check what transaction types and descriptions exist for debugging
    const { data: sampleTxns } = await supabase
      .from('user_transactions')
      .select('transaction_type, description')
      .or('description.ilike.%electricity%,description.ilike.%ebills%')
      .limit(10);
    
    console.log('Sample transactions with electricity keywords:', sampleTxns);

    // Find user_transactions for electricity purchases that don't have corresponding electricity_transactions
    // Check both 'electricity_purchase' and 'purchase' transaction types, and filter by description
    let userTxnsQuery = supabase
      .from('user_transactions')
      .select('id, user_id, amount, reference, description, transaction_type, created_at, balance_before, balance_after')
      .or('transaction_type.eq.electricity_purchase,transaction_type.eq.purchase')
      .or('description.ilike.%electricity%,description.ilike.%ebills%')
      .order('created_at', { ascending: false })
      .limit(limit || 100);

    if (userId) {
      userTxnsQuery = userTxnsQuery.eq('user_id', userId);
    }

    if (startDate) {
      userTxnsQuery = userTxnsQuery.gte('created_at', startDate);
    }

    if (endDate) {
      userTxnsQuery = userTxnsQuery.lte('created_at', endDate);
    }

    const { data: userTransactions, error: userTxnsError } = await userTxnsQuery;

    if (userTxnsError) {
      console.error('Error fetching user transactions:', userTxnsError);
      return new Response(
        JSON.stringify({ success: false, error: 'Failed to fetch user transactions' }),
        { status: 500, headers: { ...CORS_HEADERS, 'Content-Type': 'application/json' } }
      );
    }

    if (!userTransactions || userTransactions.length === 0) {
      // Try a broader search to see what exists
      const { data: allRecentTxns } = await supabase
        .from('user_transactions')
        .select('id, transaction_type, description, reference, created_at')
        .order('created_at', { ascending: false })
        .limit(20);
      
      console.log('Recent user_transactions (for debugging):', allRecentTxns);
      
      return new Response(
        JSON.stringify({ 
          success: true, 
          message: 'No electricity purchase transactions found in user_transactions',
          recovered: 0,
          skipped: 0,
          debug: {
            sampleTransactions: sampleTxns,
            recentTransactions: allRecentTxns?.slice(0, 5),
          },
        }),
        { status: 200, headers: { ...CORS_HEADERS, 'Content-Type': 'application/json' } }
      );
    }

    console.log(`Found ${userTransactions.length} potential electricity purchase transactions to check`);
    console.log('Sample user transactions:', userTransactions.slice(0, 3).map(txn => ({
      id: txn.id,
      transaction_type: txn.transaction_type,
      description: txn.description,
      reference: txn.reference,
    })));

    // Get all existing electricity transaction references
    const references = userTransactions.map(txn => txn.reference).filter(Boolean);
    const { data: existingTransactions, error: existingError } = await supabase
      .from('electricity_transactions')
      .select('reference')
      .in('reference', references);

    if (existingError) {
      console.error('Error checking existing transactions:', existingError);
    }

    const existingReferences = new Set(
      (existingTransactions || []).map(txn => txn.reference)
    );

    // Find missing transactions
    const missingTransactions = userTransactions.filter(
      txn => !existingReferences.has(txn.reference)
    );

    console.log(`Found ${missingTransactions.length} missing electricity transactions`);

    if (missingTransactions.length === 0) {
      return new Response(
        JSON.stringify({ 
          success: true, 
          message: 'All transactions already exist',
          recovered: 0,
          skipped: userTransactions.length,
        }),
        { status: 200, headers: { ...CORS_HEADERS, 'Content-Type': 'application/json' } }
      );
    }

    // Also check notifications directly for electricity purchases that might not have user_transactions
    // This helps recover transactions where the wallet debit succeeded but electricity_transaction insert failed
    const { data: allNotifications, error: allNotificationsError } = await supabase
      .from('notifications')
      .select('id, title, message, recipient_ids, created_at')
      .ilike('title', '%Electricity%')
      .order('created_at', { ascending: false })
      .limit(500);

    console.log(`Found ${allNotifications?.length || 0} electricity-related notifications`);

    // Extract references from notifications
    const notificationReferences = new Set<string>();
    (allNotifications || []).forEach(notif => {
      const refMatch = notif.message.match(/Reference:\s*([A-Z0-9-]+)/i);
      if (refMatch && refMatch[1]) {
        notificationReferences.add(refMatch[1]);
      }
    });

    console.log(`Found ${notificationReferences.size} unique references in notifications`);

    // Check which notification references don't have electricity_transactions
    if (notificationReferences.size > 0) {
      const { data: existingFromNotifications } = await supabase
        .from('electricity_transactions')
        .select('reference')
        .in('reference', Array.from(notificationReferences));

      const existingNotificationRefs = new Set(
        (existingFromNotifications || []).map(txn => txn.reference)
      );

      const missingFromNotifications = Array.from(notificationReferences).filter(
        ref => !existingNotificationRefs.has(ref)
      );

      console.log(`Found ${missingFromNotifications.length} notification references without electricity_transactions`);

      if (missingFromNotifications.length > 0) {
        // Add these to missing transactions list
        for (const ref of missingFromNotifications) {
          const notif = (allNotifications || []).find(n => {
            const refMatch = n.message.match(/Reference:\s*([A-Z0-9-]+)/i);
            return refMatch && refMatch[1] === ref;
          });

          if (notif && notif.recipient_ids && notif.recipient_ids.length > 0) {
            // Create a placeholder transaction entry from notification
            const placeholderTxn = {
              id: `notif-${notif.id}`,
              user_id: notif.recipient_ids[0],
              amount: 0, // Will be extracted from notification
              reference: ref,
              description: notif.message,
              transaction_type: 'purchase',
              created_at: notif.created_at,
              balance_before: null,
              balance_after: null,
            };

            // Check if this reference is already in missingTransactions
            if (!missingTransactions.find(txn => txn.reference === ref)) {
              missingTransactions.push(placeholderTxn as any);
            }
          }
        }
      }
    }

    // Try to extract transaction details from notifications
    const userIds = [...new Set(missingTransactions.map(txn => txn.user_id))];
    const { data: notifications, error: notificationsError } = await supabase
      .from('notifications')
      .select('id, message, recipient_ids, created_at')
      .contains('recipient_ids', userIds)
      .ilike('title', '%Electricity%')
      .order('created_at', { ascending: false })
      .limit(500);

    if (notificationsError) {
      console.error('Error fetching notifications:', notificationsError);
    }

    // Create a map of reference to notification data
    const notificationMap = new Map<string, any>();
    (notifications || []).forEach(notif => {
      // Try to extract reference from message
      const refMatch = notif.message.match(/Reference:\s*([A-Z0-9-]+)/i);
      if (refMatch && refMatch[1]) {
        notificationMap.set(refMatch[1], notif);
      }
    });

    // Recover missing transactions
    const recovered: any[] = [];
    const errors: any[] = [];

    for (const userTxn of missingTransactions) {
      try {
        // Extract details from description or notification
        const description = userTxn.description || '';
        const notification = notificationMap.get(userTxn.reference);
        
        // Parse provider and meter number from description
        // Format: "Electricity purchase (eBills) - {PROVIDER} {METER_TYPE}"
        // Also check for other formats
        let providerMatch = description.match(/\(eBills\)\s*-\s*(\w+)\s+(\w+)/i);
        if (!providerMatch) {
          // Try alternative format: "Electricity purchase - {PROVIDER}"
          providerMatch = description.match(/electricity.*?-\s*(\w+)(?:\s+(\w+))?/i);
        }
        const provider = providerMatch ? providerMatch[1] : 'UNKNOWN';
        const meterType = providerMatch && providerMatch[2] ? providerMatch[2] : 'PREPAID';

        // Try to extract meter number, token, and amount from notification message
        let meterNumber = '';
        let token = null;
        let extractedAmount = totalAmount;
        
        if (notification) {
          const meterMatch = notification.message.match(/meter[:\s]+([0-9]+)/i) ||
                            notification.message.match(/([0-9]{10,})/); // Try to find long number sequences
          if (meterMatch) {
            meterNumber = meterMatch[1];
          }
          
          const tokenMatch = notification.message.match(/Token:\s*([0-9A-Z-]+)/i) ||
                            notification.message.match(/token[:\s]+([0-9A-Z-]+)/i);
          if (tokenMatch) {
            token = tokenMatch[1];
          }

          // Extract amount from notification
          const amountMatch = notification.message.match(/₦([0-9,]+\.?[0-9]*)/) ||
                             notification.message.match(/([0-9,]+\.?[0-9]*)\s*(?:electricity|purchased)/i);
          if (amountMatch) {
            extractedAmount = parseFloat(amountMatch[1].replace(/,/g, '')) || totalAmount;
          }
        }

        // If we don't have meter number, try to extract from reference or use a placeholder
        if (!meterNumber) {
          // Reference format might contain meter number info
          meterNumber = 'UNKNOWN-' + userTxn.reference.substring(0, 8);
        }

        // Calculate purchase amount and charge fee
        // Use amount from userTxn if available, otherwise use extractedAmount from notification
        const totalAmount = Number(userTxn.amount) || extractedAmount || 0;
        
        // Assuming 2% charge fee for eBills electricity (changed from 10% to 2% based on recent code)
        const CHARGE_FEE_RATE = 0.02;
        const purchaseAmount = totalAmount > 0 
          ? Math.round((totalAmount / (1 + CHARGE_FEE_RATE)) * 100) / 100
          : 0;
        const chargeFee = Math.round((totalAmount - purchaseAmount) * 100) / 100;

        // Determine status - default to completed if we have a token, otherwise processing
        const status = token ? 'completed' : 'processing';

        // Insert missing electricity transaction
        const transactionData = {
          user_id: userTxn.user_id,
          meter_number: meterNumber,
          provider: provider,
          meter_type: meterType,
          amount: totalAmount,
          purchase_amount: purchaseAmount,
          charge_fee: chargeFee,
          balance_before: userTxn.balance_before || 0,
          balance_after: userTxn.balance_after || 0,
          status: status,
          reference: userTxn.reference,
          token: token,
          vending_provider: 'ebills',
          performed_by: userTxn.user_id,
          created_at: userTxn.created_at, // Preserve original creation time
        };

        const { data: insertedTxn, error: insertError } = await supabase
          .from('electricity_transactions')
          .insert(transactionData)
          .select('id, reference')
          .single();

        if (insertError) {
          console.error(`Error inserting transaction ${userTxn.reference}:`, insertError);
          errors.push({
            reference: userTxn.reference,
            error: insertError.message,
          });
        } else {
          console.log(`Recovered transaction: ${insertedTxn.reference}`);
          recovered.push({
            id: insertedTxn.id,
            reference: insertedTxn.reference,
            status: status,
            hasToken: !!token,
          });
        }
      } catch (error: any) {
        console.error(`Error processing transaction ${userTxn.reference}:`, error);
        errors.push({
          reference: userTxn.reference,
          error: error.message || String(error),
        });
      }
    }

    return new Response(
      JSON.stringify({
        success: true,
        message: `Recovery completed: ${recovered.length} recovered, ${errors.length} errors`,
        recovered: recovered.length,
        errors: errors.length,
        skipped: userTransactions.length - missingTransactions.length,
        details: {
          recovered,
          errors: errors.slice(0, 10), // Limit error details
        },
      }),
      { status: 200, headers: { ...CORS_HEADERS, 'Content-Type': 'application/json' } }
    );
  } catch (error: any) {
    console.error('Error in recover-electricity-transactions:', error);
    return new Response(
      JSON.stringify({
        success: false,
        error: error.message || 'Failed to recover electricity transactions',
      }),
      { status: 500, headers: { ...CORS_HEADERS, 'Content-Type': 'application/json' } }
    );
  }
});

