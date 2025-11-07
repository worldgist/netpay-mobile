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

    // Get the authorization header
    const authHeader = req.headers.get('Authorization');
    if (!authHeader) {
      throw new Error('No authorization header');
    }

    // Verify the user is authenticated
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

    const { userId, amount, description } = await req.json();

    if (!userId || !amount || amount <= 0) {
      throw new Error('Invalid input parameters');
    }

    console.log(`Admin ${user.id} crediting user ${userId} with ₦${amount}`);

    // Get current user profile
    const { data: profile, error: profileError } = await supabase
      .from('profiles')
      .select('balance')
      .eq('id', userId)
      .single();

    if (profileError || !profile) {
      throw new Error('User not found');
    }

    const balanceBefore = profile.balance;
    const balanceAfter = balanceBefore + amount;

    // Insert transaction record
    const reference = `CREDIT-${Date.now()}`;
    const { error: txError } = await supabase
      .from('user_transactions')
      .insert({
        user_id: userId,
        transaction_type: 'credit',
        amount: amount,
        balance_before: balanceBefore,
        balance_after: balanceAfter,
        description: description || null,
        reference: reference,
        performed_by: user.id,
      });

    if (txError) {
      console.error('Transaction insert error:', txError);
      throw new Error('Failed to record transaction');
    }

    // Update user balance
    const { error: updateError } = await supabase
      .from('profiles')
      .update({ balance: balanceAfter })
      .eq('id', userId);

    if (updateError) {
      console.error('Balance update error:', updateError);
      throw new Error('Failed to update balance');
    }

    console.log(`Successfully credited user ${userId}: ₦${balanceBefore} -> ₦${balanceAfter}`);

    return new Response(
      JSON.stringify({
        success: true,
        message: 'User credited successfully',
        data: {
          reference,
          balanceBefore,
          balanceAfter,
          amount,
        },
      }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  } catch (error) {
    console.error('Credit user error:', error);
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
