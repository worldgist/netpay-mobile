import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const CORS_HEADERS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const normalizeEmail = (value?: unknown) => {
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  if (!trimmed) return null;
  return trimmed.toLowerCase();
};

const normalizePhone = (value?: unknown) => {
  if (typeof value !== "string") return null;
  const digits = value.replace(/[^0-9]/g, "");
  if (!digits) return null;
  return digits;
};

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: CORS_HEADERS });
  }

  try {
    if (req.method !== "POST") {
      return new Response(
        JSON.stringify({ success: false, error: "Method not allowed" }),
        { status: 405, headers: { ...CORS_HEADERS, "Content-Type": "application/json" } },
      );
    }

    const supabaseUrl = Deno.env.get("SUPABASE_URL");
    const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");

    if (!supabaseUrl || !serviceKey) {
      throw new Error("Missing Supabase configuration");
    }

    const supabase = createClient(supabaseUrl, serviceKey);
    const body = await req.json();

    const email = normalizeEmail(body?.email);
    const phone = normalizePhone(body?.phone);

    if (!email && !phone) {
      return new Response(
        JSON.stringify({
          success: false,
          error: "Provide at least an email or phone to check.",
        }),
        { status: 400, headers: { ...CORS_HEADERS, "Content-Type": "application/json" } },
      );
    }

    let emailExists = false;
    let phoneExists = false;

    if (email) {
      try {
        const { data: user } = await supabase.auth.admin.getUserByEmail(email);
        emailExists = Boolean(user);
      } catch (error) {
        console.error("Failed to lookup email:", error);
      }
    }

    if (phone) {
      const { data: phoneMatches, error: phoneError } = await supabase
        .from("profiles")
        .select("id")
        .eq("phone", phone)
        .limit(1);

      if (phoneError) {
        console.error("Phone lookup error:", phoneError);
        throw phoneError;
      }

      phoneExists = Boolean(phoneMatches && phoneMatches.length > 0);
    }

    return new Response(
      JSON.stringify({
        success: true,
        emailExists,
        phoneExists,
      }),
      { status: 200, headers: { ...CORS_HEADERS, "Content-Type": "application/json" } },
    );
  } catch (error) {
    console.error("check-signup-availability error:", error);
    return new Response(
      JSON.stringify({
        success: false,
        error: error instanceof Error ? error.message : "Unexpected error",
      }),
      { status: 500, headers: { ...CORS_HEADERS, "Content-Type": "application/json" } },
    );
  }
});








