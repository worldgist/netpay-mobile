import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const CORS_HEADERS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

interface ValidateJambProfileRequest {
  confirmation_code: string;
  service_type: 'UTME' | 'DE';
}

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: CORS_HEADERS });
  }

  try {
    // Get authorization header
    const authHeader = req.headers.get('Authorization');
    if (!authHeader) {
      return new Response(
        JSON.stringify({ success: false, error: 'Missing authorization header' }),
        { status: 401, headers: { ...CORS_HEADERS, 'Content-Type': 'application/json' } }
      );
    }

    // Create Supabase client
    const supabaseClient = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_ANON_KEY') ?? '',
      {
        global: {
          headers: { Authorization: authHeader },
        },
      }
    );

    // Verify authentication
    const { data: { user }, error: authError } = await supabaseClient.auth.getUser();
    if (authError || !user) {
      return new Response(
        JSON.stringify({ success: false, error: 'Unauthorized' }),
        { status: 401, headers: { ...CORS_HEADERS, 'Content-Type': 'application/json' } }
      );
    }

    // Get user profile to check if demo user
    const { data: profile } = await supabaseClient
      .from('profiles')
      .select('email')
      .eq('id', user.id)
      .maybeSingle();
    
    const isDemoUser = profile?.email === 'demo@netppay.com';

    // Parse request body
    const body: ValidateJambProfileRequest = await req.json();
    const { confirmation_code, service_type } = body;

    // Validate inputs
    if (!confirmation_code || !service_type) {
      return new Response(
        JSON.stringify({
          success: false,
          error: 'confirmation_code and service_type are required',
        }),
        { status: 400, headers: { ...CORS_HEADERS, 'Content-Type': 'application/json' } }
      );
    }

    // Validate service_type
    if (service_type !== 'UTME' && service_type !== 'DE') {
      return new Response(
        JSON.stringify({
          success: false,
          error: 'service_type must be either "UTME" or "DE"',
        }),
        { status: 400, headers: { ...CORS_HEADERS, 'Content-Type': 'application/json' } }
      );
    }

    // Handle demo profile code for demo users
    if (isDemoUser && confirmation_code.trim().toUpperCase() === 'DEMO123456') {
      console.log('Demo JAMB profile validation:', {
        confirmation_code: 'DEMO123456',
        service_type,
      });

      return new Response(
        JSON.stringify({
          success: true,
          data: {
            firstName: 'DEMO',
            lastName: 'USER',
            middleName: 'TEST',
            gsmNo: '08012345678',
          },
        }),
        { status: 200, headers: { ...CORS_HEADERS, 'Content-Type': 'application/json' } }
      );
    }

    // Get MobileNig public key (required for profile validation)
    const mobilenigPublicKey = Deno.env.get('MOBILENIG_PUBLIC_KEY');
    if (!mobilenigPublicKey) {
      return new Response(
        JSON.stringify({
          success: false,
          error: 'MobileNig credentials not configured',
        }),
        { status: 500, headers: { ...CORS_HEADERS, 'Content-Type': 'application/json' } }
      );
    }

    console.log('Validating JAMB profile:', {
      confirmation_code: confirmation_code.substring(0, 4) + '****', // Partial log for privacy
      service_type,
    });

    // Call MobileNig API: POST /api/v2/services/proxy
    const requestBody = {
      service_id: 'AJB', // Hard-coded for JAMB
      confirmationCode: confirmation_code.trim(),
      requestType: 'GET_CANDIDATE_NAMES_FOR_VENDING',
      serviceType: service_type,
    };

    const response = await fetch('https://enterprise.mobilenig.com/api/v2/services/proxy', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${mobilenigPublicKey}`,
      },
      body: JSON.stringify(requestBody),
    });

    const responseText = await response.text();
    console.log('MobileNig API response status:', response.status);
    console.log('MobileNig API response (first 500 chars):', responseText.substring(0, 500));

    // Parse JSON response
    let data: any;
    try {
      data = JSON.parse(responseText);
    } catch (parseError) {
      console.error('Failed to parse MobileNig API response:', parseError);
      return new Response(
        JSON.stringify({
          success: false,
          error: 'Invalid response from service provider',
        }),
        { status: 200, headers: { ...CORS_HEADERS, 'Content-Type': 'application/json' } }
      );
    }

    // Check for success: statusCode "200" and message "success"
    if (response.ok && data.statusCode === '200' && data.message === 'success') {
      const details = data.details || {};
      
      // Check for error in details
      if (details.error) {
        return new Response(
          JSON.stringify({
            success: false,
            error: details.error || 'Profile validation failed',
          }),
          { status: 200, headers: { ...CORS_HEADERS, 'Content-Type': 'application/json' } }
        );
      }

      // Extract candidate details
      const candidateDetails = {
        firstName: details.firstName || '',
        lastName: details.lastName || '',
        middleName: details.middleName || '',
        gsmNo: details.gsmNo || '',
      };

      console.log('JAMB profile validation successful:', {
        firstName: candidateDetails.firstName,
        lastName: candidateDetails.lastName,
        hasMiddleName: !!candidateDetails.middleName,
        hasGsmNo: !!candidateDetails.gsmNo,
      });

      return new Response(
        JSON.stringify({
          success: true,
          data: candidateDetails,
        }),
        { status: 200, headers: { ...CORS_HEADERS, 'Content-Type': 'application/json' } }
      );
    } else {
      // Validation failed - extract error message
      let errorMessage = 'Profile validation failed';
      
      if (typeof data.details === 'string') {
        errorMessage = data.details;
      } else if (data.details?.error) {
        errorMessage = data.details.error;
      } else if (data.details?.details) {
        errorMessage = typeof data.details.details === 'string'
          ? data.details.details
          : (data.details.details?.message || errorMessage);
      } else if (data.details?.responseMessage) {
        errorMessage = data.details.responseMessage;
      } else if (data.message) {
        errorMessage = data.message;
      } else if (data.error) {
        errorMessage = data.error;
      }

      console.log('JAMB profile validation failed:', {
        statusCode: data.statusCode,
        errorMessage,
      });

      return new Response(
        JSON.stringify({
          success: false,
          error: errorMessage,
        }),
        { status: 200, headers: { ...CORS_HEADERS, 'Content-Type': 'application/json' } }
      );
    }
  } catch (error: any) {
    console.error('Error validating JAMB profile:', error);
    return new Response(
      JSON.stringify({
        success: false,
        error: error.message || 'Failed to validate JAMB profile',
      }),
      { status: 500, headers: { ...CORS_HEADERS, 'Content-Type': 'application/json' } }
    );
  }
});

