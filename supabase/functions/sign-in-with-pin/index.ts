import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import {
  clientIpFromRequest,
  enforceAuthAbuseRateLimit,
} from "../_shared/auth-rate-limit.ts";

const CORS_HEADERS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const PIN_EMAIL_WINDOW_SECONDS = 15 * 60;
const PIN_EMAIL_MAX_ATTEMPTS = 5;
const PIN_EMAIL_LOCKOUT_SECONDS = 30 * 60;
const PIN_IP_WINDOW_SECONDS = 60 * 60;
const PIN_IP_MAX_ATTEMPTS = 30;

const normalizeEmail = (value?: unknown) => {
  if (typeof value !== "string") return null;
  const trimmed = value.trim().toLowerCase();
  return trimmed || null;
};

const normalizePin = (value?: unknown) => {
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  return /^[0-9]{4}$/.test(trimmed) ? trimmed : null;
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
    const pin = normalizePin(body?.pin);
    const ip = clientIpFromRequest(req);

    if (!email || !pin) {
      return new Response(
        JSON.stringify({ success: false, error: "Valid email and 4-digit PIN are required." }),
        { status: 400, headers: { ...CORS_HEADERS, "Content-Type": "application/json" } },
      );
    }

    const ipLimit = await enforceAuthAbuseRateLimit(supabase, {
      bucket: "pin_login_ip",
      rateKey: ip,
      windowSeconds: PIN_IP_WINDOW_SECONDS,
      maxRequests: PIN_IP_MAX_ATTEMPTS,
    });
    if (!ipLimit.allowed) {
      return new Response(
        JSON.stringify({
          success: false,
          error: "Too many PIN login attempts from this network. Please try again later.",
          retry_after_seconds: ipLimit.retryAfterSeconds,
        }),
        {
          status: 429,
          headers: {
            ...CORS_HEADERS,
            "Content-Type": "application/json",
            "Retry-After": String(ipLimit.retryAfterSeconds || 60),
          },
        },
      );
    }

    const emailLimit = await enforceAuthAbuseRateLimit(supabase, {
      bucket: "pin_login_email",
      rateKey: email,
      windowSeconds: PIN_EMAIL_WINDOW_SECONDS,
      maxRequests: PIN_EMAIL_MAX_ATTEMPTS,
      lockoutSeconds: PIN_EMAIL_LOCKOUT_SECONDS,
    });
    if (!emailLimit.allowed) {
      return new Response(
        JSON.stringify({
          success: false,
          error: emailLimit.lockedOut
            ? "Too many incorrect PIN attempts. This account is temporarily locked."
            : "Too many PIN login attempts. Please try again later.",
          retry_after_seconds: emailLimit.retryAfterSeconds,
        }),
        {
          status: 429,
          headers: {
            ...CORS_HEADERS,
            "Content-Type": "application/json",
            "Retry-After": String(emailLimit.retryAfterSeconds || 60),
          },
        },
      );
    }

    const { data: profile, error: profileError } = await supabase
      .from("profiles")
      .select("id, pin_hash, pin_enabled")
      .ilike("email", email)
      .maybeSingle();

    if (profileError) {
      throw profileError;
    }

    if (!profile || !profile.pin_enabled || !profile.pin_hash) {
      return new Response(
        JSON.stringify({ success: false, error: "PIN login is not enabled for this account." }),
        { status: 400, headers: { ...CORS_HEADERS, "Content-Type": "application/json" } },
      );
    }

    const encoder = new TextEncoder();
    const data = encoder.encode(pin);
    const hashBuffer = await crypto.subtle.digest("SHA-256", data);
    const hashArray = Array.from(new Uint8Array(hashBuffer));
    const hashedPin = hashArray.map((b) => b.toString(16).padStart(2, "0")).join("");

    if (hashedPin !== profile.pin_hash) {
      // Constant-ish delay to slow offline guessing a bit.
      await new Promise((resolve) => setTimeout(resolve, 400 + Math.floor(Math.random() * 400)));
      return new Response(
        JSON.stringify({ success: false, error: "Invalid PIN. Please try again." }),
        { status: 401, headers: { ...CORS_HEADERS, "Content-Type": "application/json" } },
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
        // ignore parsing issues
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
    console.error("sign-in-with-pin error:", error);
    return new Response(
      JSON.stringify({
        success: false,
        error: error instanceof Error ? error.message : "Unexpected error",
      }),
      { status: 500, headers: { ...CORS_HEADERS, "Content-Type": "application/json" } },
    );
  }
});
