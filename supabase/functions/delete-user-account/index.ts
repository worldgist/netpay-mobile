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
    console.log('Delete account function called');
    console.log('Request method:', req.method);
    console.log('Request headers:', Object.fromEntries(req.headers.entries()));

    // Check environment variables
    const supabaseUrl = Deno.env.get('SUPABASE_URL');
    const serviceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
    
    if (!supabaseUrl || !serviceRoleKey) {
      console.error('Missing environment variables:', { 
        hasUrl: !!supabaseUrl, 
        hasKey: !!serviceRoleKey 
      });
      throw new Error('Server configuration error');
    }

    const supabase = createClient(supabaseUrl, serviceRoleKey);

    // Get the authorization header
    const authHeader = req.headers.get('Authorization');
    console.log('Authorization header present:', !!authHeader);
    
    if (!authHeader) {
      throw new Error('No authorization header');
    }

    // Verify the user is authenticated
    const token = authHeader.replace('Bearer ', '');
    console.log('Verifying user token...');
    const { data: { user }, error: authError } = await supabase.auth.getUser(token);

    if (authError) {
      console.error('Auth error:', authError);
      throw new Error(`Unauthorized: ${authError.message}`);
    }

    if (!user) {
      console.error('No user found');
      throw new Error('Unauthorized: User not found');
    }

    console.log('User authenticated:', user.id);

    let password, deletion_reason, metadata;
    try {
      // Parse request body - Supabase functions.invoke() sends JSON
      const contentType = req.headers.get('content-type') || '';
      console.log('Content-Type:', contentType);
      
      if (contentType.includes('application/json')) {
        const body = await req.json();
        console.log('Request body parsed:', { 
          hasPassword: !!body?.password,
          hasDeletionReason: !!body?.deletion_reason,
          hasMetadata: !!body?.metadata
        });
        password = body?.password;
        deletion_reason = body?.deletion_reason;
        metadata = body?.metadata;
      } else {
        console.log('No JSON content type, skipping body parsing');
      }
    } catch (err) {
      // If body is empty or not JSON, that's okay - all fields are optional
      console.log('No request body or non-JSON body, using defaults:', err);
      password = undefined;
      deletion_reason = undefined;
      metadata = undefined;
    }

    // Optional password verification (note: password verification is handled client-side)
    // The password parameter is accepted but verification happens before calling this function
    // This allows for additional security if needed in the future

    console.log(`User ${user.id} requesting account deletion`);

    // Get user profile details before deletion
    let profile = null;
    try {
      const { data: profileData, error: profileError } = await supabase
        .from('profiles')
        .select('email, full_name, phone, balance')
        .eq('id', user.id)
        .single();
      
      if (profileError) {
        console.warn('Profile not found or error fetching profile:', profileError);
        // Continue with deletion even if profile fetch fails
      } else {
        profile = profileData;
      }
    } catch (err) {
      console.warn('Error fetching profile:', err);
      // Continue with deletion even if profile fetch fails
    }

    // Create deletion record
    let deletionRecord = null;
    try {
      // Build insert payload with only fields that exist in the table
      const insertPayload: any = {
        user_id: user.id,
        email: profile?.email || user.email || null,
        full_name: profile?.full_name || null,
        phone: profile?.phone || null,
        deletion_reason: deletion_reason || null,
        status: 'processing',
        metadata: metadata || {},
      };

      // Only include deleted_by if the column exists (it might not in all schemas)
      // We'll try to add it, but if it fails, we'll continue without it
      try {
        insertPayload.deleted_by = user.id;
      } catch (e) {
        // deleted_by column might not exist, skip it
        console.log('deleted_by column not available, skipping');
      }

      const { data: recordData, error: recordError } = await supabase
        .from('deleted_accounts')
        .insert(insertPayload)
        .select()
        .single();

      if (recordError) {
        console.error('Error creating deletion record:', recordError);
        console.error('Record error details:', JSON.stringify(recordError, null, 2));
        
        // If the error is due to missing columns, try without optional fields
        if (recordError.message?.includes('column') || recordError.code === 'PGRST204') {
          console.log('Retrying without optional fields...');
          const minimalPayload = {
            user_id: user.id,
            email: profile?.email || user.email || null,
            full_name: profile?.full_name || null,
            phone: profile?.phone || null,
            deletion_reason: deletion_reason || null,
            status: 'processing',
            metadata: metadata || {},
          };
          
          const { data: retryData, error: retryError } = await supabase
            .from('deleted_accounts')
            .insert(minimalPayload)
            .select()
            .single();
            
          if (retryError) {
            console.error('Retry also failed:', retryError);
            // Continue with deletion even if record creation fails
          } else {
            deletionRecord = retryData;
          }
        } else {
          // Continue with deletion even if record creation fails
        }
      } else {
        deletionRecord = recordData;
      }
    } catch (err) {
      console.error('Error creating deletion record:', err);
      // Continue with deletion even if record creation fails
    }

    // Sign out user from all sessions first (this helps avoid database constraint issues)
    console.log(`Signing out user ${user.id} from all sessions`);
    try {
      const { error: signOutError } = await supabase.auth.admin.signOut(user.id);
      if (signOutError) {
        console.warn('Error signing out user (continuing anyway):', signOutError);
      } else {
        console.log(`User ${user.id} signed out from all sessions`);
      }
    } catch (signOutErr) {
      console.warn('Exception during sign out (continuing anyway):', signOutErr);
    }

    // Fix notifications.sent_by foreign key constraint by setting it to NULL
    // This prevents the foreign key constraint error when deleting the user
    console.log(`Updating notifications.sent_by for user ${user.id}`);
    try {
      const { error: updateSentByError } = await supabase
        .from('notifications')
        .update({ sent_by: null })
        .eq('sent_by', user.id);
      
      if (updateSentByError) {
        // If update fails, try deleting as fallback (for older schemas)
        console.warn('Error updating sent_by, trying delete as fallback:', updateSentByError);
        const { error: deleteNotificationsError } = await supabase
          .from('notifications')
          .delete()
          .eq('sent_by', user.id);
        
        if (deleteNotificationsError) {
          console.warn('Error deleting notifications (continuing anyway):', deleteNotificationsError);
        } else {
          console.log(`Deleted notifications sent by user ${user.id}`);
        }
      } else {
        console.log(`Updated sent_by to NULL for notifications where user ${user.id} was the sender`);
      }
    } catch (notificationsErr) {
      console.warn('Exception handling notifications (continuing anyway):', notificationsErr);
    }

    // Fix deleted_accounts.deleted_by foreign key constraint by setting it to NULL
    // This prevents the foreign key constraint error when deleting the user
    // Only do this if the deleted_by column exists
    console.log(`Updating deleted_accounts.deleted_by for user ${user.id}`);
    try {
      const { error: updateDeletedByError } = await supabase
        .from('deleted_accounts')
        .update({ deleted_by: null })
        .eq('deleted_by', user.id);
      
      if (updateDeletedByError) {
        // If error is due to column not existing, that's okay
        if (updateDeletedByError.message?.includes('column') || updateDeletedByError.code === 'PGRST204') {
          console.log('deleted_by column does not exist, skipping update');
        } else {
          console.warn('Error updating deleted_by (continuing anyway):', updateDeletedByError);
        }
      } else {
        console.log(`Updated deleted_by to NULL for records where user ${user.id} was the deleter`);
      }
    } catch (deletedByErr) {
      console.warn('Exception handling deleted_by (continuing anyway):', deletedByErr);
    }

    // Fix user_transactions.performed_by foreign key constraint by setting it to NULL
    // This prevents the foreign key constraint error when deleting the user
    console.log(`Updating user_transactions.performed_by for user ${user.id}`);
    try {
      const { error: updatePerformedByError } = await supabase
        .from('user_transactions')
        .update({ performed_by: null })
        .eq('performed_by', user.id);
      
      if (updatePerformedByError) {
        console.warn('Error updating performed_by (continuing anyway):', updatePerformedByError);
      } else {
        console.log(`Updated performed_by to NULL for transactions where user ${user.id} was the performer`);
      }
    } catch (performedByErr) {
      console.warn('Exception handling performed_by (continuing anyway):', performedByErr);
    }

    // Delete user from auth.users using REST API directly
    // This sometimes works better than the admin client
    console.log(`Attempting to delete user ${user.id} from auth.users via REST API`);
    
    try {
      // Try using the admin client first
      const { data: deleteData, error: deleteError } = await supabase.auth.admin.deleteUser(user.id);

      if (deleteError) {
        console.error('Error deleting user via admin client:', deleteError);
        console.error('Delete error details:', JSON.stringify(deleteError, null, 2));
        console.error('Delete error code:', deleteError.status);
        console.error('Delete error message:', deleteError.message);
        console.error('Delete error name:', deleteError.name);
        
        // If admin client fails, try REST API directly
        console.log('Trying REST API approach...');
        const authUrl = `${supabaseUrl}/auth/v1/admin/users/${user.id}`;
        const restResponse = await fetch(authUrl, {
          method: 'DELETE',
          headers: {
            'Authorization': `Bearer ${serviceRoleKey}`,
            'apikey': serviceRoleKey,
            'Content-Type': 'application/json',
          },
        });

        if (!restResponse.ok) {
          const restErrorText = await restResponse.text();
          console.error('REST API delete error:', restResponse.status, restErrorText);
          
          let restErrorData;
          try {
            restErrorData = JSON.parse(restErrorText);
          } catch {
            restErrorData = { message: restErrorText };
          }
          
          // Update deletion record to cancelled if deletion failed
          if (deletionRecord) {
            try {
              await supabase
                .from('deleted_accounts')
                .update({ status: 'cancelled' })
                .eq('id', deletionRecord.id);
            } catch (updateErr) {
              console.error('Error updating deletion record status:', updateErr);
            }
          }
          
          const errorMsg = restErrorData?.error_description || restErrorData?.message || restErrorData?.error || `HTTP ${restResponse.status}: ${restResponse.statusText}`;
          throw new Error(`Failed to delete account: ${errorMsg}`);
        }
        
        console.log(`User ${user.id} successfully deleted via REST API`);
      } else {
        console.log(`User ${user.id} successfully deleted from auth.users`);
        console.log('Delete response data:', deleteData);
      }
    } catch (deleteErr) {
      console.error('Exception during user deletion:', deleteErr);
      console.error('Exception type:', deleteErr?.constructor?.name);
      console.error('Exception message:', deleteErr?.message);
      
      // Update deletion record to cancelled if deletion failed
      if (deletionRecord) {
        try {
          await supabase
            .from('deleted_accounts')
            .update({ status: 'cancelled' })
            .eq('id', deletionRecord.id);
        } catch (updateErr) {
          console.error('Error updating deletion record status:', updateErr);
        }
      }
      
      throw deleteErr;
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
    console.error('=== Delete account error ===');
    console.error('Error type:', error?.constructor?.name);
    console.error('Error message:', error instanceof Error ? error.message : String(error));
    console.error('Error stack:', error instanceof Error ? error.stack : 'No stack trace');
    
    try {
      console.error('Error details (JSON):', JSON.stringify(error, Object.getOwnPropertyNames(error), 2));
    } catch (jsonErr) {
      console.error('Could not stringify error:', jsonErr);
    }
    
    const errorMessage = error instanceof Error ? error.message : 'An unknown error occurred';
    
    // Determine appropriate status code
    let statusCode = 500; // Default to 500 for server errors
    if (errorMessage.includes('Unauthorized') || errorMessage.includes('authorization')) {
      statusCode = 401;
    } else if (errorMessage.includes('No authorization header')) {
      statusCode = 401;
    } else if (errorMessage.includes('Server configuration error')) {
      statusCode = 500;
    }
    
    console.error('Returning error response:', { statusCode, errorMessage });
    
    return new Response(
      JSON.stringify({
        success: false,
        error: errorMessage,
        message: errorMessage,
      }),
      {
        status: statusCode,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      }
    );
  }
});

