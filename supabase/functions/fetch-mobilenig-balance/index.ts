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
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseKey = Deno.env.get('SUPABASE_ANON_KEY')!;
    const mobilenigPublicKey = Deno.env.get('MOBILENIG_PUBLIC_KEY');

    if (!mobilenigPublicKey) {
      console.error('MOBILENIG_PUBLIC_KEY not configured');
      return new Response(
        JSON.stringify({ success: false, error: 'Service configuration error: MOBILENIG_PUBLIC_KEY not set' }),
        { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Get the authorization header from the request
    const authHeader = req.headers.get('Authorization');
    if (!authHeader) {
      return new Response(
        JSON.stringify({ error: 'Missing authorization header' }),
        { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Initialize Supabase client
    const supabase = createClient(supabaseUrl, supabaseKey, {
      global: {
        headers: { Authorization: authHeader },
      },
    });

    // Verify the user is authenticated
    const { data: { user }, error: userError } = await supabase.auth.getUser();
    if (userError || !user) {
      console.error('Authentication error:', userError);
      return new Response(
        JSON.stringify({ error: 'Unauthorized' }),
        { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Check if user has admin role
    const { data: roleData, error: roleError } = await supabase
      .from('user_roles')
      .select('role')
      .eq('user_id', user.id)
      .eq('role', 'admin')
      .maybeSingle();

    if (roleError) {
      console.error('Error checking user role:', roleError);
      return new Response(
        JSON.stringify({ error: 'Error verifying permissions' }),
        { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    if (!roleData) {
      return new Response(
        JSON.stringify({ error: 'Unauthorized - Admin access required' }),
        { status: 403, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    console.log('Fetching MobileNig account balance and info...');
    console.log('API Key configured:', mobilenigPublicKey ? 'Yes (masked)' : 'No');
    console.log('API Key length:', mobilenigPublicKey?.length || 0);

    // Fetch balance from MobileNig API - Control endpoint
    let balanceResponse;
    let balanceData;
    try {
      const balanceUrl = 'https://enterprise.mobilenig.com/api/v2/control/balance';
      console.log('Calling MobileNig balance API:', balanceUrl);
      
      balanceResponse = await fetch(balanceUrl, {
        method: 'GET',
        headers: {
          'Authorization': `Bearer ${mobilenigPublicKey}`,
          'Content-Type': 'application/json',
          'Accept': 'application/json',
        },
      });

      console.log('Balance API response status:', balanceResponse.status, balanceResponse.statusText);
      console.log('Balance API response headers:', Object.fromEntries(balanceResponse.headers.entries()));

      if (!balanceResponse.ok) {
        const errorText = await balanceResponse.text();
        console.error('MobileNig balance API error:', balanceResponse.status, errorText);
        throw new Error(`MobileNig API returned ${balanceResponse.status}: ${errorText}`);
      }

      const balanceText = await balanceResponse.text();
      console.log('Balance API raw response length:', balanceText?.length || 0);
      
      if (!balanceText || !balanceText.trim()) {
        throw new Error('Empty response from MobileNig balance API');
      }
      
      balanceData = JSON.parse(balanceText);
      console.log('MobileNig balance response:', JSON.stringify(balanceData, null, 2));
    } catch (balanceError) {
      console.error('Error fetching balance:', balanceError);
      console.error('Balance error details:', {
        message: balanceError instanceof Error ? balanceError.message : 'Unknown',
        stack: balanceError instanceof Error ? balanceError.stack : undefined,
      });
      throw new Error(`Failed to fetch balance: ${balanceError instanceof Error ? balanceError.message : 'Unknown error'}`);
    }

    // Fetch unique account details from MobileNig API
    let accountResponse;
    let accountData;
    try {
      const accountUrl = 'https://enterprise.mobilenig.com/api/v2/control/unique_account_details';
      console.log('Calling MobileNig account API:', accountUrl);
      
      accountResponse = await fetch(accountUrl, {
        method: 'GET',
        headers: {
          'Authorization': `Bearer ${mobilenigPublicKey}`,
          'Content-Type': 'application/json',
          'Accept': 'application/json',
        },
      });

      console.log('Account API response status:', accountResponse.status, accountResponse.statusText);

      if (!accountResponse.ok) {
        const errorText = await accountResponse.text();
        console.error('MobileNig account API error:', accountResponse.status, errorText);
        // Don't fail completely if account details fail, just log it and use defaults
        console.warn('Account details fetch failed, using defaults');
        accountData = {};
      } else {
        const accountText = await accountResponse.text();
        console.log('Account API raw response length:', accountText?.length || 0);
        
        if (!accountText || !accountText.trim()) {
          console.warn('Empty response from MobileNig account API, using defaults');
          accountData = {};
        } else {
          accountData = JSON.parse(accountText);
          console.log('MobileNig account response:', JSON.stringify(accountData, null, 2));
        }
      }
    } catch (accountError) {
      console.error('Error fetching account details:', accountError);
      console.error('Account error details:', {
        message: accountError instanceof Error ? accountError.message : 'Unknown',
        stack: accountError instanceof Error ? accountError.stack : undefined,
      });
      // Don't fail completely if account details fail, just log it
      accountData = {};
    }

    // Prepare response data
    const responseData: any = {
      success: true,
      balance: {
        amount: parseFloat(balanceData.details?.balance || balanceData.data?.balance || balanceData.balance || '0'),
        currency: balanceData.details?.currency || balanceData.data?.currency || 'NGN',
      },
      account: {
        accountNumber:
          accountData.details?.account_number ||
          accountData.account_number ||
          accountData.data?.account_number ||
          accountData.details?.virtual_account_number ||
          accountData.data?.virtual_account_number ||
          'N/A',
        accountName:
          accountData.details?.account_name ||
          accountData.account_name ||
          accountData.data?.account_name ||
          'N/A',
        bankName:
          accountData.details?.bank_name ||
          accountData.bank_name ||
          accountData.data?.bank_name ||
          accountData.details?.bank ||
          accountData.data?.bank ||
          'Providus Bank',
        businessName:
          accountData.details?.business_name ||
          accountData.business_name ||
          accountData.data?.business_name ||
          'MobileNig Enterprise Account',
      },
    };

    return new Response(
      JSON.stringify(responseData),
      { 
        status: 200,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' } 
      }
    );

  } catch (error) {
    console.error('Error in fetch-mobilenig-balance function:', error);
    console.error('Error stack:', error instanceof Error ? error.stack : 'No stack trace');
    console.error('Error details:', JSON.stringify(error, Object.getOwnPropertyNames(error)));
    
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    const errorDetails = process.env.NODE_ENV === 'development' 
      ? { message: errorMessage, stack: error instanceof Error ? error.stack : undefined }
      : { message: 'Internal server error' };
    
    return new Response(
      JSON.stringify({ 
        success: false,
        error: errorMessage,
        ...errorDetails
      }),
      { 
        status: 500,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' } 
      }
    );
  }
});