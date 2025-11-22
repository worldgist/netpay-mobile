import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const CORS_HEADERS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const normalizeEmail = (value?: unknown) => {
  if (typeof value !== "string") return null;
  const trimmed = value.trim().toLowerCase();
  return trimmed || null;
};

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
    const supabaseUrl = Deno.env.get("SUPABASE_URL");
    const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");

    if (!supabaseUrl || !serviceRoleKey) {
      throw new Error("Missing Supabase configuration");
    }

    const supabase = createClient(supabaseUrl, serviceRoleKey);
    const body = await req.json();
    const email = normalizeEmail(body?.email);

    if (!email) {
      return new Response(
        JSON.stringify({ success: false, error: "Valid email is required." }),
        { status: 400, headers: { ...CORS_HEADERS, "Content-Type": "application/json" } },
      );
    }

    const { data: profile, error: profileError } = await supabase
      .from("profiles")
      .select("id, biometric_enabled")
      .ilike("email", email)
      .maybeSingle();

    if (profileError) {
      throw profileError;
    }

    if (!profile || !profile.biometric_enabled) {
      return new Response(
        JSON.stringify({ success: false, error: "Biometric login is not enabled for this account." }),
        { status: 400, headers: { ...CORS_HEADERS, "Content-Type": "application/json" } },
      );
    }

    const { data: linkData, error: linkError } = await supabase.auth.admin.generateLink({
      type: "magiclink",
      email,
    });

    if (linkError) {
      throw linkError;
    }

    const actionLink =
      (linkData as any)?.properties?.action_link ||
      (linkData as any)?.action_link ||
      null;

    let token =
      (linkData as any)?.properties?.email_otp ||
      (linkData as any)?.properties?.hashed_token ||
      null;

    let otpType: "email" | "magiclink" = "email";

    if (!token && actionLink) {
      try {
        const url = new URL(actionLink);
        const linkToken = url.searchParams.get("token");
        const typeParam = url.searchParams.get("type");
        if (linkToken) {
          token = linkToken;
        }
        if (typeParam === "magiclink") {
          otpType = "magiclink";
        }
      } catch (_err) {
        // ignore parsing errors
      }
    } else if (token && typeof token === "string" && token.length > 6) {
      otpType = "magiclink";
    }

    if (!token) {
      console.error("generateLink response missing token", linkData);
      throw new Error("Unable to generate login token.");
    }

    return new Response(
      JSON.stringify({
        success: true,
        token,
        otpType,
        actionLink,
      }),
      { status: 200, headers: { ...CORS_HEADERS, "Content-Type": "application/json" } },
    );
  } catch (error) {
    console.error("sign-in-with-biometric error:", error);
    return new Response(
      JSON.stringify({
        success: false,
        error: error instanceof Error ? error.message : "Unexpected error",
      }),
      { status: 500, headers: { ...CORS_HEADERS, "Content-Type": "application/json" } },
    );
  }
});








