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

const escapeIlikeExact = (value: string) =>
  value.replace(/\\/g, "\\\\").replace(/%/g, "\\%").replace(/_/g, "\\_");

type ProfileRow = {
  id: string;
  biometric_enabled: boolean | null;
  email: string | null;
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

    console.log("Biometric sign-in request received:", {
      email: email || body?.email,
      bodyKeys: Object.keys(body || {}),
    });

    if (!email) {
      console.error("Invalid email provided:", body?.email);
      return new Response(
        JSON.stringify({ success: false, error: "Valid email is required." }),
        { status: 200, headers: { ...CORS_HEADERS, "Content-Type": "application/json" } },
      );
    }

    console.log("Looking up profile for email:", email);
    let profile: ProfileRow | null = null;

    const { data: profileByEmail, error: profileError } = await supabase
      .from("profiles")
      .select("id, biometric_enabled, email")
      .ilike("email", escapeIlikeExact(email))
      .limit(1)
      .maybeSingle();

    if (profileError) {
      console.error("Error fetching profile by email:", profileError);
      throw profileError;
    }

    profile = (profileByEmail as ProfileRow | null) ?? null;

    let authEmail = email;

    if (!profile) {
      console.log("Profile email lookup missed; falling back to auth.users:", email);
      try {
        const { data: authData, error: authError } = await supabase.auth.admin.getUserByEmail(email);

        if (authError) {
          const message = authError.message?.toLowerCase() || "";
          const status = (authError as { status?: number })?.status;
          const notFound =
            status === 404 ||
            message.includes("not found") ||
            message.includes("user not found") ||
            message.includes("no user found");

          if (!notFound) {
            console.error("Auth email lookup error:", authError);
          }
        } else if (authData?.user?.id) {
          authEmail = normalizeEmail(authData.user.email) || email;
          const { data: profileById, error: profileByIdError } = await supabase
            .from("profiles")
            .select("id, biometric_enabled, email")
            .eq("id", authData.user.id)
            .maybeSingle();

          if (profileByIdError) {
            console.error("Error fetching profile by auth id:", profileByIdError);
            throw profileByIdError;
          }

          profile = (profileById as ProfileRow | null) ?? null;
          console.log("Auth fallback result:", {
            authUserId: authData.user.id,
            authEmail,
            profileFound: !!profile,
          });
        }
      } catch (authLookupError) {
        console.error("Exception during auth email fallback:", authLookupError);
      }
    } else if (profile.email) {
      authEmail = normalizeEmail(profile.email) || email;
    }

    console.log("Profile lookup result:", {
      found: !!profile,
      id: profile?.id,
      biometric_enabled: profile?.biometric_enabled,
      email: profile?.email,
      authEmail,
    });

    if (!profile) {
      console.error("Account not found for email:", email);
      return new Response(
        JSON.stringify({
          success: false,
          error: "No account found for the saved email. Please sign in with your email and password.",
          code: "account_not_found",
        }),
        { status: 200, headers: { ...CORS_HEADERS, "Content-Type": "application/json" } },
      );
    }

    if (!profile.biometric_enabled) {
      console.error("Biometric login not enabled for user:", profile.id);
      return new Response(
        JSON.stringify({
          success: false,
          error:
            "Biometric login is not enabled for this account. Please enable it in your profile settings.",
          code: "biometric_not_enabled",
        }),
        { status: 200, headers: { ...CORS_HEADERS, "Content-Type": "application/json" } },
      );
    }

    console.log("Generating magic link for email:", authEmail);
    const { data: linkData, error: linkError } = await supabase.auth.admin.generateLink({
      type: "magiclink",
      email: authEmail,
    });

    if (linkError) {
      console.error("Error generating magic link:", linkError);
      throw linkError;
    }

    console.log("Magic link generated successfully");

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
    const errorMessage = error instanceof Error
      ? error.message
      : typeof error === "string"
      ? error
      : "Unexpected error occurred during biometric authentication";

    console.error("Error details:", {
      message: errorMessage,
      type: error?.constructor?.name,
      stack: error instanceof Error ? error.stack : undefined,
    });

    // Always return 200 status so client can read the error message
    return new Response(
      JSON.stringify({
        success: false,
        error: errorMessage,
      }),
      { status: 200, headers: { ...CORS_HEADERS, "Content-Type": "application/json" } },
    );
  }
});
