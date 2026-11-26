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

const MAX_WRONG_PIN_ATTEMPTS = 5;
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

const jsonResponse = (body: Record<string, unknown>, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { ...CORS_HEADERS, "Content-Type": "application/json" },
  });

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: CORS_HEADERS });
  }

  if (req.method !== "POST") {
    return jsonResponse({ success: false, error: "Method not allowed" }, 405);
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
      return jsonResponse({
        success: false,
        code: "INVALID_INPUT",
        error: "Valid email and 4-digit PIN are required.",
      }, 400);
    }

    const ipLimit = await enforceAuthAbuseRateLimit(supabase, {
      bucket: "pin_login_ip",
      rateKey: ip,
      windowSeconds: PIN_IP_WINDOW_SECONDS,
      maxRequests: PIN_IP_MAX_ATTEMPTS,
    });
    if (!ipLimit.allowed) {
      return jsonResponse({
        success: false,
        code: "RATE_LIMITED",
        error: "Too many PIN login attempts from this network. Please try again later.",
        retry_after_seconds: ipLimit.retryAfterSeconds,
      }, 429);
    }

    let profile: {
      id: string;
      pin_hash: string | null;
      pin_enabled: boolean | null;
      status?: string | null;
      pin_failed_attempts?: number | null;
    } | null = null;
    let tracksFailedAttempts = true;

    {
      const firstTry = await supabase
        .from("profiles")
        .select("id, pin_hash, pin_enabled, status, pin_failed_attempts")
        .ilike("email", email)
        .maybeSingle();

      if (
        firstTry.error &&
        /pin_failed_attempts/i.test(firstTry.error.message || "")
      ) {
        tracksFailedAttempts = false;
        const fallback = await supabase
          .from("profiles")
          .select("id, pin_hash, pin_enabled, status")
          .ilike("email", email)
          .maybeSingle();
        if (fallback.error) throw fallback.error;
        profile = fallback.data;
      } else if (firstTry.error) {
        throw firstTry.error;
      } else {
        profile = firstTry.data;
      }
    }

    if (!profile || !profile.pin_enabled || !profile.pin_hash) {
      return jsonResponse({
        success: false,
        code: "PIN_NOT_ENABLED",
        error: "PIN login is not enabled for this account.",
      });
    }

    if (String(profile.status || "").toLowerCase() === "suspended") {
      return jsonResponse({
        success: false,
        code: "ACCOUNT_SUSPENDED",
        error:
          "Your account has been suspended after too many incorrect PIN attempts. Please contact support to reactivate it.",
        attemptsUsed: MAX_WRONG_PIN_ATTEMPTS,
        attemptsRemaining: 0,
      });
    }

    const encoder = new TextEncoder();
    const data = encoder.encode(pin);
    const hashBuffer = await crypto.subtle.digest("SHA-256", data);
    const hashArray = Array.from(new Uint8Array(hashBuffer));
    const hashedPin = hashArray.map((b) => b.toString(16).padStart(2, "0")).join("");

    if (hashedPin !== profile.pin_hash) {
      await new Promise((resolve) => setTimeout(resolve, 400 + Math.floor(Math.random() * 400)));

      const previousAttempts = tracksFailedAttempts
        ? Math.max(0, Number(profile.pin_failed_attempts) || 0)
        : 0;
      const attemptsUsed = previousAttempts + 1;
      const attemptsRemaining = Math.max(0, MAX_WRONG_PIN_ATTEMPTS - attemptsUsed);

      if (tracksFailedAttempts && attemptsUsed >= MAX_WRONG_PIN_ATTEMPTS) {
        const { error: suspendError } = await supabase
          .from("profiles")
          .update({
            status: "suspended",
            pin_failed_attempts: attemptsUsed,
          })
          .eq("id", profile.id);

        if (suspendError) {
          console.error("Failed to suspend account after wrong PIN attempts:", suspendError);
        }

        return jsonResponse({
          success: false,
          code: "ACCOUNT_SUSPENDED",
          error:
            "Your account has been suspended after 5 incorrect PIN attempts. Please contact support to reactivate it.",
          attemptsUsed,
          attemptsRemaining: 0,
        });
      }

      if (tracksFailedAttempts) {
        const { error: attemptError } = await supabase
          .from("profiles")
          .update({ pin_failed_attempts: attemptsUsed })
          .eq("id", profile.id);

        if (attemptError) {
          console.error("Failed to update pin_failed_attempts:", attemptError);
        }

        return jsonResponse({
          success: false,
          code: "INVALID_PIN",
          error: `Incorrect PIN. You have ${attemptsRemaining} attempt${attemptsRemaining === 1 ? "" : "s"} remaining before your account is suspended.`,
          attemptsUsed,
          attemptsRemaining,
        });
      }

      return jsonResponse({
        success: false,
        code: "INVALID_PIN",
        error: "Incorrect PIN. Please try again.",
      });
    }

    // Successful PIN — clear failed attempts.
    if (tracksFailedAttempts && (Number(profile.pin_failed_attempts) || 0) > 0) {
      const { error: resetError } = await supabase
        .from("profiles")
        .update({ pin_failed_attempts: 0 })
        .eq("id", profile.id);

      if (resetError) {
        console.error("Failed to reset pin_failed_attempts:", resetError);
      }
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

    return jsonResponse({
      success: true,
      token,
      otpType,
      actionLink,
    });
  } catch (error) {
    console.error("sign-in-with-pin error:", error);
    return jsonResponse({
      success: false,
      code: "UNEXPECTED_ERROR",
      error: error instanceof Error ? error.message : "Unexpected error",
    }, 500);
  }
});
