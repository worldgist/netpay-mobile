import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.74.0';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

Deno.serve(async (req) => {
  // Handle CORS preflight requests
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseServiceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const supabase = createClient(supabaseUrl, supabaseServiceRoleKey);

    // Verify authentication
    const authHeader = req.headers.get('Authorization');
    if (!authHeader) {
      throw new Error('No authorization header');
    }

    const token = authHeader.replace('Bearer ', '');
    const { data: { user }, error: authError } = await supabase.auth.getUser(token);
    
    if (authError || !user) {
      throw new Error('Unauthorized');
    }

    // Verify admin role
    const { data: roleData, error: roleError } = await supabase
      .from('user_roles')
      .select('role')
      .eq('user_id', user.id)
      .eq('role', 'admin')
      .single();

    if (roleError || !roleData) {
      throw new Error('Unauthorized: Admin access required');
    }

    const { referralId, paymentType } = await req.json();

    if (!referralId || !paymentType) {
      throw new Error('Missing required fields: referralId and paymentType');
    }

    if (!['referrer', 'referred', 'both'].includes(paymentType)) {
      throw new Error('Invalid paymentType. Must be: referrer, referred, or both');
    }

    // Fetch referral details
    const { data: referral, error: referralError } = await supabase
      .from('referrals')
      .select(`
        *,
        referrer:profiles!referrals_referrer_id_fkey(id, email, full_name, balance),
        referred:profiles!referrals_referred_id_fkey(id, email, full_name, balance)
      `)
      .eq('id', referralId)
      .single();

    if (referralError || !referral) {
      throw new Error('Referral not found');
    }

    // Fetch referral settings
    const { data: settings, error: settingsError } = await supabase
      .from('referral_settings')
      .select('*')
      .single();

    if (settingsError || !settings) {
      throw new Error('Referral settings not found');
    }

    const results = {
      referrerPaid: false,
      referredPaid: false,
      referrerAmount: 0,
      referredAmount: 0,
    };

    // Process referrer payment
    if ((paymentType === 'referrer' || paymentType === 'both') && !referral.referrer_reward_paid) {
      const referrerAmount = Number(settings.referrer_reward);
      const currentBalance = Number(referral.referrer.balance);
      const newBalance = currentBalance + referrerAmount;

      // Update referrer balance
      const { error: balanceError } = await supabase
        .from('profiles')
        .update({ balance: newBalance })
        .eq('id', referral.referrer_id);

      if (balanceError) {
        console.error('Error updating referrer balance:', balanceError);
        throw new Error('Failed to update referrer balance');
      }

      // Create transaction record
      const { error: transactionError } = await supabase
        .from('user_transactions')
        .insert({
          user_id: referral.referrer_id,
          transaction_type: 'credit',
          amount: referrerAmount,
          balance_before: currentBalance,
          balance_after: newBalance,
          description: `Referral reward for code: ${referral.referral_code}`,
          reference: `REF_EARN_${referral.referral_code}`,
          performed_by: user.id,
        });

      if (transactionError) {
        console.error('Error creating referrer transaction:', transactionError);
        throw new Error('Failed to create referrer transaction');
      }

      // Mark referrer reward as paid
      const { error: updateError } = await supabase
        .from('referrals')
        .update({ referrer_reward_paid: true })
        .eq('id', referralId);

      if (updateError) {
        console.error('Error updating referral:', updateError);
      }

      results.referrerPaid = true;
      results.referrerAmount = referrerAmount;

      console.log(`Paid ₦${referrerAmount} to referrer ${referral.referrer.email}`);
    }

    // Process referred user payment (disabled when referred_reward is zero)
    if (
      (paymentType === 'referred' || paymentType === 'both') &&
      !referral.reward_paid &&
      referral.referred_id
    ) {
      const referredAmount = Number(settings.referred_reward);
      if (referredAmount > 0) {
      const currentBalance = Number(referral.referred.balance);
      const newBalance = currentBalance + referredAmount;

      // Update referred user balance
      const { error: balanceError } = await supabase
        .from('profiles')
        .update({ balance: newBalance })
        .eq('id', referral.referred_id);

      if (balanceError) {
        console.error('Error updating referred balance:', balanceError);
        throw new Error('Failed to update referred user balance');
      }

      // Create transaction record
      const { error: transactionError } = await supabase
        .from('user_transactions')
        .insert({
          user_id: referral.referred_id,
          transaction_type: 'credit',
          amount: referredAmount,
          balance_before: currentBalance,
          balance_after: newBalance,
          description: `Welcome referral bonus from code: ${referral.referral_code}`,
          reference: `REF_BONUS_${referral.referral_code}`,
          performed_by: user.id,
        });

      if (transactionError) {
        console.error('Error creating referred transaction:', transactionError);
        throw new Error('Failed to create referred user transaction');
      }

      // Mark referred reward as paid
      const { error: updateError } = await supabase
        .from('referrals')
        .update({ reward_paid: true })
        .eq('id', referralId);

      if (updateError) {
        console.error('Error updating referral:', updateError);
      }

      results.referredPaid = true;
      results.referredAmount = referredAmount;

      console.log(`Paid ₦${referredAmount} to referred user ${referral.referred.email}`);
      }
    }

    return new Response(
      JSON.stringify({
        success: true,
        message: 'Referral earnings processed successfully',
        results,
      }),
      {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        status: 200,
      }
    );
  } catch (error) {
    console.error('Error processing referral earning:', error);
    const errorMessage = error instanceof Error ? error.message : 'An unknown error occurred';
    return new Response(
      JSON.stringify({
        success: false,
        error: errorMessage,
      }),
      {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        status: 400,
      }
    );
  }
});
