import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.7.1";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabaseClient = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '',
      {
        auth: {
          autoRefreshToken: false,
          persistSession: false
        }
      }
    );

    const authHeader = req.headers.get('Authorization')!;
    const token = authHeader.replace('Bearer ', '');
    const { data: { user }, error: authError } = await supabaseClient.auth.getUser(token);

    if (authError || !user) {
      console.error('Authentication error:', authError);
      return new Response(
        JSON.stringify({ error: 'Unauthorized' }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 401 }
      );
    }

    console.log(`Withdraw request from user: ${user.id}`);

    // Get user's unpaid referral earnings
    const { data: referrals, error: referralError } = await supabaseClient
      .from('referrals')
      .select('*')
      .eq('referrer_id', user.id)
      .eq('status', 'completed')
      .eq('referrer_reward_paid', false);

    if (referralError) {
      console.error('Error fetching referrals:', referralError);
      throw referralError;
    }

    if (!referrals || referrals.length === 0) {
      return new Response(
        JSON.stringify({ error: 'No pending earnings to withdraw' }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 400 }
      );
    }

    // Calculate total unpaid earnings
    const totalEarnings = referrals.reduce((sum, r) => sum + Number(r.reward_amount || 0), 0);

    if (totalEarnings <= 0) {
      return new Response(
        JSON.stringify({ error: 'No earnings to withdraw' }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 400 }
      );
    }

    // Get user's current balance
    const { data: profile, error: profileError } = await supabaseClient
      .from('profiles')
      .select('balance')
      .eq('id', user.id)
      .single();

    if (profileError) {
      console.error('Error fetching profile:', profileError);
      throw profileError;
    }

    const currentBalance = Number(profile.balance || 0);
    const newBalance = currentBalance + totalEarnings;

    // Update user balance
    const { error: balanceError } = await supabaseClient
      .from('profiles')
      .update({ balance: newBalance })
      .eq('id', user.id);

    if (balanceError) {
      console.error('Error updating balance:', balanceError);
      throw balanceError;
    }

    // Create transaction record
    const { error: transactionError } = await supabaseClient
      .from('user_transactions')
      .insert({
        user_id: user.id,
        amount: totalEarnings,
        balance_before: currentBalance,
        balance_after: newBalance,
        transaction_type: 'referral_withdrawal',
        description: 'Referral earnings withdrawal',
        reference: `REF-WITHDRAW-${Date.now()}`,
      });

    if (transactionError) {
      console.error('Error creating transaction:', transactionError);
      throw transactionError;
    }

    // Mark all referrals as paid
    const { error: updateError } = await supabaseClient
      .from('referrals')
      .update({ referrer_reward_paid: true })
      .in('id', referrals.map(r => r.id));

    if (updateError) {
      console.error('Error updating referrals:', updateError);
      throw updateError;
    }

    console.log(`Successfully withdrew ${totalEarnings} for user ${user.id}`);

    return new Response(
      JSON.stringify({
        success: true,
        amount: totalEarnings,
        newBalance,
        message: `Successfully withdrew ${totalEarnings.toFixed(2)} to your wallet`,
      }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 200 }
    );

  } catch (error) {
    console.error('Error in withdraw-referral-earnings:', error);
    const errorMessage = error instanceof Error ? error.message : 'An unknown error occurred';
    return new Response(
      JSON.stringify({ error: errorMessage }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 500 }
    );
  }
});
