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
      return new Response(
        JSON.stringify({ success: false, error: 'No authorization header' }),
        { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const { data: { user }, error: authError } = await supabase.auth.getUser(
      authHeader.replace('Bearer ', '')
    );

    if (authError || !user) {
      return new Response(
        JSON.stringify({ success: false, error: 'Unauthorized' }),
        { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Check if user is admin
    const { data: roleData, error: roleError } = await supabase
      .from('user_roles')
      .select('role')
      .eq('user_id', user.id)
      .eq('role', 'admin')
      .maybeSingle();

    if (roleError || !roleData) {
      return new Response(
        JSON.stringify({ success: false, error: 'Unauthorized: Admin access required' }),
        { status: 403, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    let requestBody: any = {};
    try {
      // Try to parse JSON body (only for POST/PUT requests)
      if (req.method === 'POST' || req.method === 'PUT' || req.method === 'PATCH') {
        const bodyText = await req.text();
        if (bodyText && bodyText.trim()) {
          requestBody = JSON.parse(bodyText);
        }
      } else {
        // For GET requests, parse query parameters
        const url = new URL(req.url);
        requestBody = {
          startDate: url.searchParams.get('startDate') || undefined,
          endDate: url.searchParams.get('endDate') || undefined,
          status: url.searchParams.get('status') || undefined,
          type: url.searchParams.get('type') || undefined,
        };
      }
    } catch (parseError) {
      // If body is empty or invalid JSON, use empty object with defaults
      console.warn('Failed to parse request body, using defaults:', parseError);
      requestBody = {};
    }

    const { startDate, endDate, status, type } = requestBody || {};

    console.log(`Admin ${user.id} fetching transactions`, {
      startDate,
      endDate,
      status,
      type,
      hasBody: !!requestBody,
    });

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

    // Fetch electricity transactions
    let electricityTxQuery = supabase
      .from('electricity_transactions')
      .select(`
        id,
        user_id,
        amount,
        balance_before,
        balance_after,
        meter_number,
        provider,
        meter_type,
        status,
        reference,
        token,
        customer_name,
        created_at
      `)
      .order('created_at', { ascending: false });

    if (startDate) {
      electricityTxQuery = electricityTxQuery.gte('created_at', startDate);
    }
    if (endDate) {
      electricityTxQuery = electricityTxQuery.lte('created_at', endDate);
    }
    if (status && status !== 'all') {
      electricityTxQuery = electricityTxQuery.eq('status', status);
    }

    const { data: electricityTransactions, error: electricityTxError } = await electricityTxQuery;

    if (electricityTxError) {
      console.error('Electricity transactions error:', electricityTxError);
      // Don't throw - continue with other transaction types
    }

    // Fetch cable TV transactions
    let cableTvTxQuery = supabase
      .from('cable_tv_transactions')
      .select(`
        id,
        user_id,
        amount,
        balance_before,
        balance_after,
        smartcard_number,
        provider,
        plan_name,
        status,
        reference,
        created_at
      `)
      .order('created_at', { ascending: false });

    if (startDate) {
      cableTvTxQuery = cableTvTxQuery.gte('created_at', startDate);
    }
    if (endDate) {
      cableTvTxQuery = cableTvTxQuery.lte('created_at', endDate);
    }
    if (status && status !== 'all') {
      cableTvTxQuery = cableTvTxQuery.eq('status', status);
    }

    const { data: cableTvTransactions, error: cableTvTxError } = await cableTvTxQuery;

    if (cableTvTxError) {
      console.error('Cable TV transactions error:', cableTvTxError);
      // Don't throw - continue with other transaction types
    }

    // Fetch education transactions
    let educationTxQuery = supabase
      .from('education_transactions')
      .select(`
        id,
        user_id,
        amount,
        balance_before,
        balance_after,
        phone_number,
        exam_type,
        status,
        reference,
        created_at
      `)
      .order('created_at', { ascending: false });

    if (startDate) {
      educationTxQuery = educationTxQuery.gte('created_at', startDate);
    }
    if (endDate) {
      educationTxQuery = educationTxQuery.lte('created_at', endDate);
    }
    if (status && status !== 'all') {
      educationTxQuery = educationTxQuery.eq('status', status);
    }

    const { data: educationTransactions, error: educationTxError } = await educationTxQuery;

    if (educationTxError) {
      console.error('Education transactions error:', educationTxError);
      // Don't throw - continue with other transaction types
    }

    // Get unique user IDs to fetch profile data
    const allUserIds = [
      ...(userTransactions || []).map(tx => tx.user_id),
      ...(airtimeTransactions || []).map(tx => tx.user_id),
      ...(dataTransactions || []).map(tx => tx.user_id),
      ...(transferTransactions || []).flatMap(tx => [tx.sender_id, tx.recipient_id]),
      ...(fundingTransactions || []).map(tx => tx.user_id),
      ...(electricityTransactions || []).map(tx => tx.user_id),
      ...(cableTvTransactions || []).map(tx => tx.user_id),
      ...(educationTransactions || []).map(tx => tx.user_id),
    ].filter((id, index, self) => id && self.indexOf(id) === index);

    // Fetch user profiles (only if there are user IDs)
    let profileMap = new Map();
    if (allUserIds.length > 0) {
      const { data: profiles } = await supabase
        .from('profiles')
        .select('id, full_name, email')
        .in('id', allUserIds);

      profileMap = new Map(
        (profiles || []).map(p => [p.id, p])
      );
    }

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
      ...(electricityTransactions || []).map(tx => {
        const profile = profileMap.get(tx.user_id);
        return {
          id: tx.id,
          reference: tx.reference,
          user: profile?.full_name || profile?.email || 'Unknown',
          email: profile?.email,
          type: 'Electricity Purchase',
          amount: tx.amount,
          balanceBefore: tx.balance_before,
          balanceAfter: tx.balance_after,
          description: `${tx.provider} - ${tx.meter_type?.toUpperCase() || ''} - ${tx.meter_number || 'N/A'}${tx.customer_name ? ` (${tx.customer_name})` : ''}${tx.token ? ` - Token: ${tx.token}` : ''}`,
          status: tx.status,
          date: tx.created_at,
          category: 'electricity',
          token: tx.token
        };
      }),
      ...(cableTvTransactions || []).map(tx => {
        const profile = profileMap.get(tx.user_id);
        return {
          id: tx.id,
          reference: tx.reference,
          user: profile?.full_name || profile?.email || 'Unknown',
          email: profile?.email,
          type: 'Cable TV Purchase',
          amount: tx.amount,
          balanceBefore: tx.balance_before,
          balanceAfter: tx.balance_after,
          description: `${tx.provider} - ${tx.plan_name || 'N/A'} - ${tx.smartcard_number || 'N/A'}`,
          status: tx.status,
          date: tx.created_at,
          category: 'cable_tv'
        };
      }),
      ...(educationTransactions || []).map(tx => {
        const profile = profileMap.get(tx.user_id);
        return {
          id: tx.id,
          reference: tx.reference,
          user: profile?.full_name || profile?.email || 'Unknown',
          email: profile?.email,
          type: 'Education Payment',
          amount: tx.amount,
          balanceBefore: tx.balance_before,
          balanceAfter: tx.balance_after,
          description: `${tx.exam_type || 'Education'} - ${tx.phone_number || 'N/A'}`,
          status: tx.status,
          date: tx.created_at,
          category: 'education'
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
      { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  } catch (error) {
    console.error('Fetch transactions error:', error);
    const errorMessage = error instanceof Error ? error.message : 'An unknown error occurred';
    const errorStack = error instanceof Error ? error.stack : undefined;
    const errorDetails = error instanceof Error ? {
      name: error.name,
      message: error.message,
      stack: error.stack,
    } : String(error);
    
    console.error('Error details:', JSON.stringify(errorDetails, null, 2));
    
    // Return 200 with error in response body instead of 400/500
    // This allows the frontend to handle the error gracefully
    return new Response(
      JSON.stringify({
        success: false,
        error: errorMessage,
        details: errorDetails,
      }),
      {
        status: 200,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      }
    );
  }
});
