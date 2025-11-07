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

    const { email, name, phoneNumber, bankcode, account_type, nin } = await req.json();

    if (!email || !name || !phoneNumber || !bankcode) {
      throw new Error('Missing required parameters');
    }

    // Default to DYNAMIC if not specified (doesn't require NIN)
    const accountType = account_type || 'DYNAMIC';

    // Validate STATIC account requirements
    if (accountType === 'STATIC' && !nin) {
      throw new Error('NIN is required for STATIC accounts');
    }

    const payvesselApiKey = Deno.env.get('PAYVESSEL_API_KEY');
    const payvesselSecretKey = Deno.env.get('PAYVESSEL_SECRET_KEY');
    const payvesselBusinessId = Deno.env.get('PAYVESSEL_BUSINESS_ID');

    if (!payvesselApiKey || !payvesselSecretKey || !payvesselBusinessId) {
      throw new Error('PayVessel credentials not configured');
    }

    console.log('Creating virtual account for:', { 
      email, 
      name, 
      phoneNumber, 
      bankcode, 
      account_type: accountType,
      businessid: payvesselBusinessId
    });

    // Prepare request body
    const requestBody: any = {
      email,
      name,
      phoneNumber,
      businessid: payvesselBusinessId,
      bankcode,
      account_type: accountType,
    };

    // Add NIN for STATIC accounts
    if (accountType === 'STATIC') {
      requestBody.nin = nin;
    }

    // Create virtual account via PayVessel API
    console.log('Sending request to PayVessel with body:', JSON.stringify(requestBody, null, 2));
    console.log('Using headers - api-key:', payvesselApiKey?.substring(0, 10) + '...', 'api-secret: Bearer [hidden]');
    
    const payvesselResponse = await fetch('https://api.payvessel.com/pms/api/external/request/customerReservedAccount/', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'api-key': payvesselApiKey,
        'api-secret': `Bearer ${payvesselSecretKey}`,
      },
      body: JSON.stringify(requestBody),
    });

    console.log('PayVessel response status:', payvesselResponse.status);
    const payvesselData = await payvesselResponse.json();
    console.log('PayVessel response:', JSON.stringify(payvesselData, null, 2));

    // Check for PayVessel API errors
    if (!payvesselResponse.ok || payvesselData.success === false) {
      const errorMsg = payvesselData.message || payvesselData.details?.[0]?.detail || 'Failed to create virtual account';
      console.error('PayVessel API error:', errorMsg, payvesselData);
      throw new Error(errorMsg);
    }

    // PayVessel returns success: true with banks array
    if (!payvesselData.status || !payvesselData.banks || payvesselData.banks.length === 0) {
      console.error('Invalid PayVessel response structure:', payvesselData);
      throw new Error('No bank account returned from PayVessel');
    }

    // Transform PayVessel response to match frontend expectations
    const bankAccount = payvesselData.banks[0];
    const transformedData = {
      account_number: bankAccount.accountNumber,
      bank_name: bankAccount.bankName,
      account_name: bankAccount.accountName,
      account_type: bankAccount.account_type,
      expire_date: bankAccount.expire_date,
      trackingReference: bankAccount.trackingReference,
    };

    return new Response(
      JSON.stringify({
        success: true,
        data: transformedData,
      }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  } catch (error) {
    console.error('Get virtual account error:', error);
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
