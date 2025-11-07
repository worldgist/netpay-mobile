import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabase = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
    );

    const authHeader = req.headers.get('Authorization');
    if (!authHeader) {
      throw new Error('No authorization header');
    }

    const { data: { user }, error: authError } = await supabase.auth.getUser(
      authHeader.replace('Bearer ', '')
    );

    if (authError || !user) {
      throw new Error('Unauthorized');
    }

    // Check if user is admin
    const { data: roleData, error: roleError } = await supabase
      .from('user_roles')
      .select('role')
      .eq('user_id', user.id)
      .eq('role', 'admin')
      .maybeSingle();

    if (roleError || !roleData) {
      throw new Error('Unauthorized: Admin access required');
    }

    const { startDate, endDate, status, type } = await req.json();

    console.log(`Admin ${user.id} fetching transactions from ${startDate} to ${endDate}`);

    // Fetch user transactions (credits/debits)
    let userTxQuery = supabase
      .from('user_transactions')
      .select(`
        id,
        user_id,
        amount,
        balance_before,
        balance_after,
        transaction_type,
        description,
        reference,
        created_at
      `)
      .order('created_at', { ascending: false });

    if (startDate) {
      userTxQuery = userTxQuery.gte('created_at', startDate);
    }
    if (endDate) {
      userTxQuery = userTxQuery.lte('created_at', endDate);
    }
    if (type && type !== 'all') {
      userTxQuery = userTxQuery.eq('transaction_type', type);
    }

    const { data: userTransactions, error: userTxError } = await userTxQuery;

    if (userTxError) {
      console.error('User transactions error:', userTxError);
      throw new Error('Failed to fetch user transactions');
    }

    // Fetch airtime transactions
    let airtimeTxQuery = supabase
      .from('airtime_transactions')
      .select(`
        id,
        user_id,
        amount,
        balance_before,
        balance_after,
        phone_number,
        network,
        status,
        reference,
        created_at
      `)
      .order('created_at', { ascending: false });

    if (startDate) {
      airtimeTxQuery = airtimeTxQuery.gte('created_at', startDate);
    }
    if (endDate) {
      airtimeTxQuery = airtimeTxQuery.lte('created_at', endDate);
    }
    if (status && status !== 'all') {
      airtimeTxQuery = airtimeTxQuery.eq('status', status);
    }

    const { data: airtimeTransactions, error: airtimeTxError } = await airtimeTxQuery;

    if (airtimeTxError) {
      console.error('Airtime transactions error:', airtimeTxError);
      throw new Error('Failed to fetch airtime transactions');
    }

    // Fetch data transactions
    let dataTxQuery = supabase
      .from('data_transactions')
      .select(`
        id,
        user_id,
        amount,
        balance_before,
        balance_after,
        phone_number,
        network,
        plan_name,
        status,
        reference,
        created_at
      `)
      .order('created_at', { ascending: false });

    if (startDate) {
      dataTxQuery = dataTxQuery.gte('created_at', startDate);
    }
    if (endDate) {
      dataTxQuery = dataTxQuery.lte('created_at', endDate);
    }
    if (status && status !== 'all') {
      dataTxQuery = dataTxQuery.eq('status', status);
    }

    const { data: dataTransactions, error: dataTxError } = await dataTxQuery;

    if (dataTxError) {
      console.error('Data transactions error:', dataTxError);
      throw new Error('Failed to fetch data transactions');
    }

    // Fetch transfer transactions
    let transferTxQuery = supabase
      .from('transfer_transactions')
      .select(`
        id,
        sender_id,
        recipient_id,
        amount,
        description,
        reference,
        status,
        sender_balance_before,
        sender_balance_after,
        recipient_balance_before,
        recipient_balance_after,
        created_at
      `)
      .order('created_at', { ascending: false });

    if (startDate) {
      transferTxQuery = transferTxQuery.gte('created_at', startDate);
    }
    if (endDate) {
      transferTxQuery = transferTxQuery.lte('created_at', endDate);
    }
    if (status && status !== 'all') {
      transferTxQuery = transferTxQuery.eq('status', status);
    }

    const { data: transferTransactions, error: transferTxError } = await transferTxQuery;

    if (transferTxError) {
      console.error('Transfer transactions error:', transferTxError);
      throw new Error('Failed to fetch transfer transactions');
    }

    // Fetch funding transactions
    let fundingTxQuery = supabase
      .from('funding_transactions')
      .select(`
        id,
        user_id,
        amount,
        account_name,
        account_number,
        bank_name,
        reference,
        status,
        created_at
      `)
      .order('created_at', { ascending: false });

    if (startDate) {
      fundingTxQuery = fundingTxQuery.gte('created_at', startDate);
    }
    if (endDate) {
      fundingTxQuery = fundingTxQuery.lte('created_at', endDate);
    }
    if (status && status !== 'all') {
      fundingTxQuery = fundingTxQuery.eq('status', status);
    }

    const { data: fundingTransactions, error: fundingTxError } = await fundingTxQuery;

    if (fundingTxError) {
      console.error('Funding transactions error:', fundingTxError);
      throw new Error('Failed to fetch funding transactions');
    }

    // Get unique user IDs to fetch profile data
    const allUserIds = [
      ...(userTransactions || []).map(tx => tx.user_id),
      ...(airtimeTransactions || []).map(tx => tx.user_id),
      ...(dataTransactions || []).map(tx => tx.user_id),
      ...(transferTransactions || []).flatMap(tx => [tx.sender_id, tx.recipient_id]),
      ...(fundingTransactions || []).map(tx => tx.user_id),
    ].filter((id, index, self) => self.indexOf(id) === index);

    // Fetch user profiles
    const { data: profiles } = await supabase
      .from('profiles')
      .select('id, full_name, email')
      .in('id', allUserIds);

    const profileMap = new Map(
      (profiles || []).map(p => [p.id, p])
    );

    // Combine and format all transactions
    const allTransactions = [
      ...(userTransactions || []).map(tx => {
        const profile = profileMap.get(tx.user_id);
        return {
          id: tx.id,
          reference: tx.reference,
          user: profile?.full_name || profile?.email || 'Unknown',
          email: profile?.email,
          type: tx.transaction_type,
          amount: tx.amount,
          balanceBefore: tx.balance_before,
          balanceAfter: tx.balance_after,
          description: tx.description,
          status: 'completed',
          date: tx.created_at,
          category: 'user_transaction'
        };
      }),
      ...(airtimeTransactions || []).map(tx => {
        const profile = profileMap.get(tx.user_id);
        return {
          id: tx.id,
          reference: tx.reference,
          user: profile?.full_name || profile?.email || 'Unknown',
          email: profile?.email,
          type: 'Airtime Purchase',
          amount: tx.amount,
          balanceBefore: tx.balance_before,
          balanceAfter: tx.balance_after,
          description: `${tx.network} - ${tx.phone_number}`,
          status: tx.status,
          date: tx.created_at,
          category: 'airtime'
        };
      }),
      ...(dataTransactions || []).map(tx => {
        const profile = profileMap.get(tx.user_id);
        return {
          id: tx.id,
          reference: tx.reference,
          user: profile?.full_name || profile?.email || 'Unknown',
          email: profile?.email,
          type: 'Data Purchase',
          amount: tx.amount,
          balanceBefore: tx.balance_before,
          balanceAfter: tx.balance_after,
          description: `${tx.network} - ${tx.plan_name}`,
          status: tx.status,
          date: tx.created_at,
          category: 'data'
        };
      }),
      ...(transferTransactions || []).map(tx => {
        const sender = profileMap.get(tx.sender_id);
        const recipient = profileMap.get(tx.recipient_id);
        return {
          id: tx.id,
          reference: tx.reference,
          user: sender?.full_name || sender?.email || 'Unknown',
          email: sender?.email,
          type: 'Transfer',
          amount: tx.amount,
          balanceBefore: tx.sender_balance_before,
          balanceAfter: tx.sender_balance_after,
          description: `Transfer to ${recipient?.full_name || recipient?.email || 'User'}${tx.description ? ` - ${tx.description}` : ''}`,
          status: tx.status,
          date: tx.created_at,
          category: 'transfer'
        };
      }),
      ...(fundingTransactions || []).map(tx => {
        const profile = profileMap.get(tx.user_id);
        return {
          id: tx.id,
          reference: tx.reference,
          user: profile?.full_name || profile?.email || 'Unknown',
          email: profile?.email,
          type: 'Wallet Funding',
          amount: tx.amount,
          balanceBefore: 0,
          balanceAfter: 0,
          description: `${tx.bank_name || 'Bank'} - ${tx.account_number || 'N/A'}`,
          status: tx.status,
          date: tx.created_at,
          category: 'funding'
        };
      }),
    ];

    // Sort by date
    allTransactions.sort((a, b) => 
      new Date(b.date).getTime() - new Date(a.date).getTime()
    );

    console.log(`Fetched ${allTransactions.length} total transactions`);

    return new Response(
      JSON.stringify({
        success: true,
        data: allTransactions,
      }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  } catch (error) {
    console.error('Fetch transactions error:', error);
    const errorMessage = error instanceof Error ? error.message : 'An unknown error occurred';
    return new Response(
      JSON.stringify({
        success: false,
        error: errorMessage,
      }),
      {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      }
    );
  }
});
