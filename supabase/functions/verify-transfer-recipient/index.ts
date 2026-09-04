import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

type VerifyPayload = {
  email?: string;
};

const normalizeEmail = (value?: string | null) => value?.trim().toLowerCase() ?? "";

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { status: 200, headers: corsHeaders });
  }

  if (req.method !== "POST") {
    return json({ success: false, error: "Method not allowed" }, 405);
  }

  const authHeader = req.headers.get("Authorization");
  if (!authHeader || !authHeader.startsWith("Bearer ")) {
    return json({ success: false, error: "Unauthorized" }, 401);
  }

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL");
    const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
    const anonKey = Deno.env.get("SUPABASE_ANON_KEY") || Deno.env.get("SUPABASE_PUBLISHABLE_KEY");

    if (!supabaseUrl || !serviceRoleKey || !anonKey) {
      throw new Error("Supabase environment variables are not configured");
    }

    const jwt = authHeader.replace(/^Bearer\s+/i, "").trim();
    const authClient = createClient(supabaseUrl, anonKey, {
      auth: { persistSession: false, autoRefreshToken: false },
    });
    const supabase = createClient(supabaseUrl, serviceRoleKey, {
      auth: { persistSession: false, autoRefreshToken: false },
    });

    const { data: senderData, error: senderError } = await authClient.auth.getUser(jwt);
    if (senderError || !senderData?.user) {
      return json({ success: false, error: "Unauthorized" }, 401);
    }

    let payload: VerifyPayload = {};
    try {
      payload = (await req.json()) as VerifyPayload;
    } catch {
      payload = {};
    }

    const email = normalizeEmail(payload.email);
    if (!email || !email.includes("@")) {
      return json({ success: false, error: "Invalid email address" });
    }

    const { data: rows, error: recipientError } = await supabase
      .from("profiles")
      .select("id, full_name, email")
      .ilike("email", email)
      .limit(1);

    if (recipientError) {
      console.error("verify-transfer-recipient profile lookup error:", recipientError);
      return json({ success: false, error: "Unable to look up recipient" });
    }

    const recipient = rows?.[0];
    if (!recipient) {
      return json({ success: false, error: "User not found" });
    }

    if (recipient.id === senderData.user.id) {
      return json({ success: false, error: "You cannot transfer to yourself" });
    }

    return json({
      success: true,
      data: {
        id: recipient.id,
        email: recipient.email,
        full_name: recipient.full_name,
      },
    });
  } catch (error) {
    console.error("verify-transfer-recipient error:", error);
    return json({
      success: false,
      error: error instanceof Error ? error.message : "Unexpected error",
    });
  }
});
