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

    const { password, deletion_reason, metadata } = await req.json();

    // Optional password verification (note: password verification is handled client-side)
    // The password parameter is accepted but verification happens before calling this function
    // This allows for additional security if needed in the future

    console.log(`User ${user.id} requesting account deletion`);

    // Get user profile details before deletion
    const { data: profile } = await supabase
      .from('profiles')
      .select('email, full_name, phone, balance')
      .eq('id', user.id)
      .single();

    // Create deletion record
    const { data: deletionRecord, error: recordError } = await supabase
      .from('deleted_accounts')
      .insert({
        user_id: user.id,
        email: profile?.email || user.email,
        full_name: profile?.full_name,
        phone: profile?.phone,
        balance: profile?.balance || 0,
        deletion_reason: deletion_reason || null,
        reason: deletion_reason || null, // Also populate 'reason' column if it exists
        status: 'processing',
        deleted_by: user.id, // User deleting their own account
        metadata: metadata || {},
      })
      .select()
      .single();

    if (recordError) {
      console.error('Error creating deletion record:', recordError);
      // Continue with deletion even if record creation fails
    }

    // Delete user from auth.users (this will cascade delete related records due to ON DELETE CASCADE)
    const { error: deleteError } = await supabase.auth.admin.deleteUser(user.id);

    if (deleteError) {
      console.error('Error deleting user:', deleteError);
      
      // Update deletion record to cancelled if deletion failed
      if (deletionRecord) {
        await supabase
          .from('deleted_accounts')
          .update({ status: 'cancelled' })
          .eq('id', deletionRecord.id);
      }
      
      throw new Error('Failed to delete account');
    }

    // Update deletion record to completed
    if (deletionRecord) {
      await supabase
        .from('deleted_accounts')
        .update({
          status: 'completed',
          deleted_at: new Date().toISOString(),
        })
        .eq('id', deletionRecord.id);
    }

    console.log(`Successfully deleted account for user ${user.id}`);

    return new Response(
      JSON.stringify({
        success: true,
        message: 'Account deleted successfully',
      }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  } catch (error) {
    console.error('Delete account error:', error);
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

