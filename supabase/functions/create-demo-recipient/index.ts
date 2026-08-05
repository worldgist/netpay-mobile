import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const CORS_HEADERS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const DEMO_RECIPIENT_EMAIL = "demo-recipient@netppay.com";
const DEMO_RECIPIENT_PASSWORD = "Demo@1234";
const DEMO_RECIPIENT_PHONE = "08098765432";
const DEMO_RECIPIENT_BALANCE = 10000.00; // ₦10,000 initial balance

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: CORS_HEADERS });
  }

  if (req.method !== "POST") {
    return new Response(
      JSON.stringify({ success: false, error: "Method not allowed" }),
      { status: 405, headers: { ...CORS_HEADERS, "Content-Type": "application/json" } },
    );
  }

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    // Check if demo recipient already exists
    let recipientUserId: string | null = null;
    
    try {
      const { data: usersList, error: listError } = await supabase.auth.admin.listUsers();
      if (!listError && usersList && usersList.users) {
        const existingUser = usersList.users.find(u => u.email === DEMO_RECIPIENT_EMAIL);
        if (existingUser) {
          console.log("Demo recipient already exists, using existing user ID");
          recipientUserId = existingUser.id;
        }
      }
    } catch (listErr) {
      console.warn("Could not list users:", listErr);
    }

    // Create demo recipient user if it doesn't exist
    if (!recipientUserId) {
      console.log("Creating new demo recipient user in auth...");
      const { data: newUser, error: createError } = await supabase.auth.admin.createUser({
        email: DEMO_RECIPIENT_EMAIL,
        password: DEMO_RECIPIENT_PASSWORD,
        email_confirm: true, // Auto-confirm email for demo user
        user_metadata: {
          full_name: "Demo Recipient",
          phone: DEMO_RECIPIENT_PHONE,
        },
      });

      if (createError || !newUser.user) {
        throw new Error(`Failed to create demo recipient: ${createError?.message || "Unknown error"}`);
      }

      recipientUserId = newUser.user.id;
      console.log("Demo recipient created in auth with ID:", recipientUserId);
    }

    // Create/Update profile
    const { error: profileError } = await supabase
      .from("profiles")
      .upsert({
        id: recipientUserId,
        email: DEMO_RECIPIENT_EMAIL,
        phone: DEMO_RECIPIENT_PHONE,
        full_name: "Demo Recipient",
        balance: DEMO_RECIPIENT_BALANCE,
        status: "active",
      }, {
        onConflict: "id",
      });

    if (profileError) {
      throw profileError;
    }

    return new Response(
      JSON.stringify({
        success: true,
        message: "Demo recipient user created successfully",
        recipient_user_id: recipientUserId,
        recipient_email: DEMO_RECIPIENT_EMAIL,
        recipient_password: DEMO_RECIPIENT_PASSWORD,
        initial_balance: DEMO_RECIPIENT_BALANCE,
      }),
      { status: 200, headers: { ...CORS_HEADERS, "Content-Type": "application/json" } },
    );
  } catch (error) {
    console.error("Error creating demo recipient:", error);
    return new Response(
      JSON.stringify({
        success: false,
        error: error instanceof Error ? error.message : "Unknown error occurred",
      }),
      { status: 500, headers: { ...CORS_HEADERS, "Content-Type": "application/json" } },
    );
  }
});





















