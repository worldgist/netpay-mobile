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
        JSON.stringify({ error: 'Service configuration error' }),
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

    // Parse request body - provider is optional, if not provided, fetch all
    const { provider } = await req.json().catch(() => ({}));

    const canonicalMap: Record<string, { prepaid: string; postpaid: string }> = {
      IKEJA: { prepaid: 'AMA', postpaid: 'AMB' },
      EKO: { prepaid: 'ANA', postpaid: 'ANB' },
      ABUJA: { prepaid: 'AHB', postpaid: 'AHA' },
      KADUNA: { prepaid: 'AGB', postpaid: 'AGA' },
      IBADAN: { prepaid: 'AEA', postpaid: 'AEB' },
      KANO: { prepaid: 'AFA', postpaid: 'AFB' },
      PORTHARCOURT: { prepaid: 'ADB', postpaid: 'ADA' },
      JOS: { prepaid: 'ACB', postpaid: 'ACA' },
      BENIN: { prepaid: 'AAB', postpaid: 'AAA' },
      YOLA: { prepaid: 'ALA', postpaid: 'ALB' },
    };

    const aliasMap: Record<string, string> = {
      IKEDC: 'IKEJA',
      IKEJAELECTRICITY: 'IKEJA',
      IKEJAELECTRICITYTOKENPURCHASE: 'IKEJA',
      IKEJAELECTRICITYBILLS: 'IKEJA',
      EKEDC: 'EKO',
      EKOELECTRICITY: 'EKO',
      AEDC: 'ABUJA',
      ABUJAELECTRICITY: 'ABUJA',
      KAEDCO: 'KADUNA',
      KADUNAELECTRICITY: 'KADUNA',
      IBEDC: 'IBADAN',
      IBADANELECTRICITY: 'IBADAN',
      KEDCO: 'KANO',
      KANOELECTRICITY: 'KANO',
      PHEDC: 'PORTHARCOURT',
      PORTHARCOURTELECTRICITY: 'PORTHARCOURT',
      JED: 'JOS',
      JOSELECTRICITY: 'JOS',
      BEDC: 'BENIN',
      BENINELECTRICITY: 'BENIN',
      YEDC: 'YOLA',
      YOLAELECTRICITY: 'YOLA',
    };

    const normalizeProvider = (value: string) =>
      value.toUpperCase().replace(/[^A-Z]/g, '');

    const providersToFetch = provider
      ? [aliasMap[normalizeProvider(provider)] || normalizeProvider(provider)]
      : Object.keys(canonicalMap);

    console.log(`Fetching packages for ${providersToFetch.length} provider(s):`, providersToFetch);

    // Fetch packages for all providers in parallel
    const allPackages: any[] = [];
    const fetchResults: { [key: string]: { success: boolean; count: number; error?: string } } = {};

    // Create fetch promises for all providers
    const fetchPromises = providersToFetch.map(async (prov) => {
      const serviceIds = canonicalMap[prov];
      
      if (!serviceIds) {
        fetchResults[prov] = { success: false, count: 0, error: 'Invalid provider' };
        return;
      }

      const providerPackages: any[] = [];

      // Fetch Prepaid
      try {
        const prepaidResponse = await fetch('https://enterprise.mobilenig.com/api/v2/services/packages', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${mobilenigPublicKey}`,
          },
          body: JSON.stringify({
            service_id: serviceIds.prepaid,
          }),
        });

        const prepaidData = await prepaidResponse.json();
        console.log(`${prov} Prepaid response:`, prepaidData);

        if (prepaidResponse.ok && prepaidData.statusCode === '200' && prepaidData.message === 'success') {
          const prepaidPackages = prepaidData.data?.map((pkg: any) => ({
            provider: prov,
            package_name: `Prepaid - ${pkg.name || 'Token Purchase'}`,
            price: parseFloat(pkg.price || pkg.amount || '0'),
            api_code: serviceIds.prepaid,
          })) || [];
          providerPackages.push(...prepaidPackages);
        }
      } catch (error) {
        console.error(`Error fetching ${prov} prepaid packages:`, error);
      }

      // Fetch Postpaid
      try {
        const postpaidResponse = await fetch('https://enterprise.mobilenig.com/api/v2/services/packages', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${mobilenigPublicKey}`,
          },
          body: JSON.stringify({
            service_id: serviceIds.postpaid,
          }),
        });

        const postpaidData = await postpaidResponse.json();
        console.log(`${prov} Postpaid response:`, postpaidData);

        if (postpaidResponse.ok && postpaidData.statusCode === '200' && postpaidData.message === 'success') {
          const postpaidPackages = postpaidData.data?.map((pkg: any) => ({
            provider: prov,
            package_name: `Postpaid - ${pkg.name || 'Bill Payment'}`,
            price: parseFloat(pkg.price || pkg.amount || '0'),
            api_code: serviceIds.postpaid,
          })) || [];
          providerPackages.push(...postpaidPackages);
        }
      } catch (error) {
        console.error(`Error fetching ${prov} postpaid packages:`, error);
      }

      allPackages.push(...providerPackages);
      fetchResults[prov] = { 
        success: providerPackages.length > 0, 
        count: providerPackages.length 
      };
    });

    // Wait for all fetches to complete
    await Promise.all(fetchPromises);

    console.log(`Fetched ${allPackages.length} total packages from ${providersToFetch.length} provider(s)`);

    // Return results even if some providers failed
    return new Response(
      JSON.stringify({ 
        success: true,
        packages: allPackages,
        providers: providersToFetch,
        results: fetchResults,
        totalPackages: allPackages.length
      }),
      { 
        status: 200,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' } 
      }
    );

  } catch (error) {
    console.error('Error in fetch-electricity-packages function:', error);
    return new Response(
      JSON.stringify({ 
        error: 'Internal server error',
        details: error instanceof Error ? error.message : 'Unknown error'
      }),
      { 
        status: 500,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' } 
      }
    );
  }
});