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
        // First, check profiles table (more efficient and consistent with phone check)
        const { data: emailMatches, error: profileError } = await supabase
          .from("profiles")
          .select("id")
          .eq("email", email.toLowerCase())
          .limit(1);

        if (profileError) {
          console.error("Profile email lookup error:", profileError);
          // Fallback to auth check if profile check fails
        } else {
          emailExists = Boolean(emailMatches && emailMatches.length > 0);
          console.log("Profile email check result:", { emailExists, matches: emailMatches?.length });
          
          // If found in profiles, we're done
          if (emailExists) {
            console.log("Email found in profiles - already exists");
          } else {
            // Also check auth.users as a fallback (in case user exists in auth but not in profiles)
            try {
              const { data: userData, error: userError } = await supabase.auth.admin.getUserByEmail(email);
              
              if (userError) {
                const errorMessage = userError.message?.toLowerCase() || '';
                const errorStatus = (userError as any)?.status;
                
                if (errorStatus === 404 || 
                    errorMessage.includes('not found') || 
                    errorMessage.includes('user not found') ||
                    errorMessage.includes('no user found')) {
                  emailExists = false;
                  console.log("User not found in auth - email is available");
                } else {
                  console.error("Auth lookup error (non-404):", userError);
                  emailExists = false;
                }
              } else if (userData?.user) {
                emailExists = true;
                console.log("User found in auth - email already exists");
              }
            } catch (authErr) {
              console.error("Exception during auth email lookup:", authErr);
              emailExists = false;
            }
          }
        }
      } catch (error) {
        console.error("Exception during email lookup:", error);
        emailExists = false;
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








