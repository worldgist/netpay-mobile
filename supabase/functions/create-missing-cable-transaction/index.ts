import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const CORS_HEADERS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
};

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: CORS_HEADERS });
  }

  try {
    const SUPABASE_URL = Deno.env.get("SUPABASE_URL") ?? "";
    const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";

    // Initialize Supabase client
    const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

    // Get authentication token
    const authHeader = req.headers.get("Authorization");
    if (!authHeader) {
      return new Response(
        JSON.stringify({ error: "Missing authorization header" }),
        { status: 401, headers: { ...CORS_HEADERS, "Content-Type": "application/json" } }
      );
    }

    const token = authHeader.replace("Bearer ", "");
    const { data: userData, error: userError } = await supabase.auth.getUser(token);
    if (userError || !userData?.user) {
      return new Response(
        JSON.stringify({ error: "Unauthorized" }),
        { status: 401, headers: { ...CORS_HEADERS, "Content-Type": "application/json" } }
      );
    }

    const user = userData.user;

    // Check if user is admin
    const { data: roleData, error: roleError } = await supabase
      .from("user_roles")
      .select("role")
      .eq("user_id", user.id)
      .eq("role", "admin")
      .limit(1);

    if (roleError || !roleData || roleData.length === 0) {
      return new Response(
        JSON.stringify({ error: "Admin access required" }),
        { status: 403, headers: { ...CORS_HEADERS, "Content-Type": "application/json" } }
      );
    }

    // Parse request body
    const body = await req.json();
    const { user_id, amount, description, reference, created_at, provider, package_name, smart_card } = body;

    if (!user_id || !amount) {
      return new Response(
        JSON.stringify({ error: "user_id and amount are required" }),
        { status: 400, headers: { ...CORS_HEADERS, "Content-Type": "application/json" } }
      );
    }

    // Get user's current balance
    const { data: userProfile, error: profileError } = await supabase
      .from("profiles")
      .select("balance")
      .eq("id", user_id)
      .single();

    if (profileError || !userProfile) {
      return new Response(
        JSON.stringify({ error: "User not found" }),
        { status: 404, headers: { ...CORS_HEADERS, "Content-Type": "application/json" } }
      );
    }

    // Calculate balance before (add amount to current balance)
    const currentBalance = parseFloat(userProfile.balance.toString()) || 0;
    const balanceBefore = currentBalance + parseFloat(amount);
    const balanceAfter = currentBalance;

    // Generate reference if not provided
    const txReference = reference || `CABLE-${Date.now()}-${user_id.substring(0, 8)}`;

    // Create transaction description
    const txDescription = description || 
      (provider && package_name && smart_card 
        ? `${provider} - ${package_name} - ${smart_card}`
        : `Cable TV purchase - ${txReference}`);

    // Check if transaction already exists
    if (reference) {
      const { data: existing } = await supabase
        .from("user_transactions")
        .select("id")
        .eq("reference", reference)
        .limit(1);

      if (existing && existing.length > 0) {
        return new Response(
          JSON.stringify({ 
            error: "Transaction already exists",
            transaction_id: existing[0].id 
          }),
          { status: 409, headers: { ...CORS_HEADERS, "Content-Type": "application/json" } }
        );
      }
    }

    // Create transaction record
    const { data: transaction, error: insertError } = await supabase
      .from("user_transactions")
      .insert({
        user_id: user_id,
        transaction_type: "purchase",
        amount: parseFloat(amount),
        balance_before: balanceBefore,
        balance_after: balanceAfter,
        description: txDescription,
        reference: txReference,
        performed_by: user_id,
        created_at: created_at || new Date().toISOString(),
      })
      .select()
      .single();

    if (insertError) {
      return new Response(
        JSON.stringify({ 
          error: "Failed to create transaction",
          details: insertError.message 
        }),
        { status: 500, headers: { ...CORS_HEADERS, "Content-Type": "application/json" } }
      );
    }

    return new Response(
      JSON.stringify({
        success: true,
        transaction: transaction,
      }),
      { status: 200, headers: { ...CORS_HEADERS, "Content-Type": "application/json" } }
    );
  } catch (error) {
    console.error("Error creating transaction:", error);
    return new Response(
      JSON.stringify({
        error: "Internal server error",
        details: error instanceof Error ? error.message : String(error),
      }),
      { status: 500, headers: { ...CORS_HEADERS, "Content-Type": "application/json" } }
    );
  }
});









