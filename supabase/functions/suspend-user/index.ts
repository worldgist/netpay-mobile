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

    const { userId, status } = await req.json();

    if (!userId || !status) {
      throw new Error('Invalid input parameters');
    }

    if (status !== 'active' && status !== 'suspended') {
      throw new Error('Invalid status. Must be "active" or "suspended"');
    }

    console.log(`Admin ${user.id} changing user ${userId} status to ${status}`);

    // Update user status
    const { error: updateError } = await supabase
      .from('profiles')
      .update({ status: status })
      .eq('id', userId);

    if (updateError) {
      console.error('Status update error:', updateError);
      throw new Error('Failed to update user status');
    }

    console.log(`Successfully updated user ${userId} status to ${status}`);

    return new Response(
      JSON.stringify({
        success: true,
        message: `User ${status === 'suspended' ? 'suspended' : 'activated'} successfully`,
        data: {
          userId,
          status,
        },
      }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  } catch (error) {
    console.error('Suspend user error:', error);
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
