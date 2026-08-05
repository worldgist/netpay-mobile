import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

// Demo user credentials (safe to expose as this is for testing only)
const DEMO_USER = {
  email: 'demo@netppay.com',
  password: 'Demo@1234',
  pin: '1234',
  fullName: 'Demo User',
  phone: '+2347000000000',
  balance: 50000.00, // ₦50,000 for testing
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

    console.log('Creating demo user for Apple App Review...');

    // Check if demo user already exists by querying profiles table
    let userId: string | null = null;
    let isNewUser = false;

    const { data: existingProfile, error: profileCheckError } = await supabase
      .from('profiles')
      .select('id')
      .eq('email', DEMO_USER.email)
      .maybeSingle();

    if (existingProfile && existingProfile.id) {
      console.log('Demo user already exists, updating profile...');
      userId = existingProfile.id;
    }

    // If not found in profiles, try to find in auth.users using listUsers
    if (!userId) {
      try {
        const { data: usersList, error: listError } = await supabase.auth.admin.listUsers();
        if (!listError && usersList && usersList.users) {
          const existingUser = usersList.users.find(u => u.email === DEMO_USER.email);
          if (existingUser) {
            console.log('Demo user found in auth, updating profile...');
            userId = existingUser.id;
          }
        }
      } catch (listErr) {
        console.warn('Could not list users, will try to create new user:', listErr);
      }
    }

    if (!userId) {
      // Create new user in auth
      console.log('Creating new demo user in auth...');
      const { data: newUser, error: createError } = await supabase.auth.admin.createUser({
        email: DEMO_USER.email,
        password: DEMO_USER.password,
        email_confirm: true, // Auto-confirm email for demo user
        user_metadata: {
          full_name: DEMO_USER.fullName,
          phone: DEMO_USER.phone,
        },
      });

      if (createError || !newUser.user) {
        throw new Error(`Failed to create demo user: ${createError?.message || 'Unknown error'}`);
      }

      userId = newUser.user.id;
      isNewUser = true;
      console.log('Demo user created in auth with ID:', userId);
    }

    // Set up the profile with demo data
    console.log('Setting up demo user profile...');
    
    // First, create/update the profile
    const { error: profileError } = await supabase
      .from('profiles')
      .upsert({
        id: userId,
        email: DEMO_USER.email,
        full_name: DEMO_USER.fullName,
        phone: DEMO_USER.phone,
        balance: DEMO_USER.balance,
        status: 'active',
        pin_enabled: true,
        biometric_enabled: false,
      }, {
        onConflict: 'id',
      });

    if (profileError) {
      console.error('Error creating profile:', profileError);
      throw new Error(`Failed to create profile: ${profileError.message}`);
    }

    // Update PIN hash using SQL function
    console.log('Setting up PIN for demo user...');
    const { error: pinUpdateError } = await supabase.rpc('setup_demo_user_pin', {
      user_id_param: userId,
      pin_value: DEMO_USER.pin,
    });

    if (pinUpdateError) {
      console.warn('Could not update PIN hash via RPC:', pinUpdateError);
      // If RPC fails, the profile is still created but PIN won't work
      // This is acceptable for demo - user can set PIN in app
    } else {
      console.log('PIN set up successfully for demo user');
    }

    // Create demo referral code
    console.log('Creating demo referral code...');
    const referralCode = `DEMO-${userId.substring(0, 8).toUpperCase()}`;
    const { error: referralError } = await supabase
      .from('referrals')
      .upsert({
        referrer_id: userId,
        referral_code: referralCode,
        status: 'pending',
      }, {
        onConflict: 'referral_code',
      });

    if (referralError) {
      console.warn('Could not create referral code:', referralError);
    } else {
      console.log('Demo referral code created:', referralCode);
    }

    // Verify the profile was created
    const { data: profile, error: verifyProfileError } = await supabase
      .from('profiles')
      .select('*')
      .eq('id', userId)
      .single();

    if (verifyProfileError || !profile) {
      throw new Error(`Failed to verify profile: ${verifyProfileError?.message || 'Profile not found'}`);
    }

    // Open support chat thread + starter message for QA / App Review (idempotent RPC).
    const { data: supportSeed, error: supportSeedError } = await supabase.rpc('seed_demo_support_chat');
    if (supportSeedError) {
      console.warn('seed_demo_support_chat RPC failed (support chat may still work from the app):', supportSeedError);
    } else {
      console.log('Support chat seed:', supportSeed);
    }

    console.log('Demo user setup complete!');

    // Get referral code
    const { data: referralData } = await supabase
      .from('referrals')
      .select('referral_code')
      .eq('referrer_id', userId)
      .eq('status', 'pending')
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle();

    return new Response(
      JSON.stringify({
        success: true,
        message: isNewUser ? 'Demo user created successfully' : 'Demo user updated successfully',
        credentials: {
          email: DEMO_USER.email,
          password: DEMO_USER.password,
          pin: DEMO_USER.pin,
          referral_code: referralData?.referral_code || 'DEMO-REF',
        },
        user: {
          id: userId,
          email: profile.email,
          full_name: profile.full_name,
          balance: profile.balance,
          pin_enabled: profile.pin_enabled,
          biometric_enabled: profile.biometric_enabled,
        },
        support_chat_seed: supportSeed ?? null,
        features_available: [
          'Airtime Purchase',
          'Data Purchase',
          'Cable TV Subscription',
          'Electricity Bill Payment',
          'Education Services (WAEC, JAMB)',
          'Fund Transfer',
          'Add Money',
          'Referral Code Testing',
          'Biometric Authentication',
          'Delete Account',
          'Chat support (demo thread seeded when RPC is available)',
        ],
      }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  } catch (error) {
    console.error('Create demo user error:', error);
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

