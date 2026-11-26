import { createHash } from "node:crypto";
import { getServiceClient } from "./supabase.js";

const MAX_WRONG_PIN_ATTEMPTS = 5;

export type PinVerifyResult =
  | { ok: true }
  | {
      ok: false;
      code:
        | "INVALID_INPUT"
        | "PIN_NOT_ENABLED"
        | "ACCOUNT_SUSPENDED"
        | "INVALID_PIN";
      error: string;
      attemptsUsed?: number;
      attemptsRemaining?: number;
    };

function normalizePin(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  return /^[0-9]{4}$/.test(trimmed) ? trimmed : null;
}

function sha256Hex(value: string): string {
  return createHash("sha256").update(value, "utf8").digest("hex");
}

function looksLikeBcrypt(hash: string): boolean {
  return hash.startsWith("$2a$") || hash.startsWith("$2b$") || hash.startsWith("$2y$");
}

/**
 * Verify the user's NetPay transaction PIN before money movement.
 * Never log or persist the raw PIN.
 */
export async function verifyTransactionPin(
  userId: string,
  pinInput: unknown,
): Promise<PinVerifyResult> {
  const pin = normalizePin(pinInput);
  if (!pin) {
    return {
      ok: false,
      code: "INVALID_INPUT",
      error: "A valid 4-digit NetPay PIN is required to confirm this transaction.",
    };
  }

  const db = getServiceClient();

  let profile: {
    id: string;
    email: string | null;
    pin_hash: string | null;
    pin_enabled: boolean | null;
    status: string | null;
    pin_failed_attempts?: number | null;
  } | null = null;
  let tracksFailedAttempts = true;

  {
    const firstTry = await db
      .from("profiles")
      .select("id, email, pin_hash, pin_enabled, status, pin_failed_attempts")
      .eq("id", userId)
      .maybeSingle();

    if (firstTry.error && /pin_failed_attempts/i.test(firstTry.error.message || "")) {
      tracksFailedAttempts = false;
      const fallback = await db
        .from("profiles")
        .select("id, email, pin_hash, pin_enabled, status")
        .eq("id", userId)
        .maybeSingle();
      if (fallback.error) {
        return {
          ok: false,
          code: "INVALID_PIN",
          error: "Unable to verify PIN right now. Please try again.",
        };
      }
      profile = fallback.data;
    } else if (firstTry.error) {
      return {
        ok: false,
        code: "INVALID_PIN",
        error: "Unable to verify PIN right now. Please try again.",
      };
    } else {
      profile = firstTry.data;
    }
  }

  if (!profile || !profile.pin_enabled || !profile.pin_hash) {
    return {
      ok: false,
      code: "PIN_NOT_ENABLED",
      error:
        "PIN is not set up on this NetPay account. Open the NetPay app to create a 4-digit PIN, then try again.",
    };
  }

  if (String(profile.status || "").toLowerCase() === "suspended") {
    return {
      ok: false,
      code: "ACCOUNT_SUSPENDED",
      error:
        "Your account has been suspended after too many incorrect PIN attempts. Please contact support to reactivate it.",
      attemptsUsed: MAX_WRONG_PIN_ATTEMPTS,
      attemptsRemaining: 0,
    };
  }

  let matched = false;
  const storedHash = profile.pin_hash;

  if (looksLikeBcrypt(storedHash) && profile.email) {
    const { data: rpcData, error: rpcError } = await db.rpc("verify_user_pin", {
      user_email: profile.email,
      user_pin: pin,
    });
    matched = !rpcError && Boolean(rpcData);
  }

  if (!matched) {
    matched = sha256Hex(pin) === storedHash;
  }

  if (!matched) {
    // Constant-ish delay against timing / brute force
    await new Promise((resolve) => setTimeout(resolve, 350 + Math.floor(Math.random() * 350)));

    const previousAttempts = tracksFailedAttempts
      ? Math.max(0, Number(profile.pin_failed_attempts) || 0)
      : 0;
    const attemptsUsed = previousAttempts + 1;
    const attemptsRemaining = Math.max(0, MAX_WRONG_PIN_ATTEMPTS - attemptsUsed);

    if (tracksFailedAttempts && attemptsUsed >= MAX_WRONG_PIN_ATTEMPTS) {
      await db
        .from("profiles")
        .update({
          status: "suspended",
          pin_failed_attempts: attemptsUsed,
        })
        .eq("id", profile.id);

      return {
        ok: false,
        code: "ACCOUNT_SUSPENDED",
        error:
          "Your account has been suspended after 5 incorrect PIN attempts. Please contact support to reactivate it.",
        attemptsUsed,
        attemptsRemaining: 0,
      };
    }

    if (tracksFailedAttempts) {
      await db.from("profiles").update({ pin_failed_attempts: attemptsUsed }).eq("id", profile.id);
    }

    return {
      ok: false,
      code: "INVALID_PIN",
      error: tracksFailedAttempts
        ? `Incorrect PIN. You have ${attemptsRemaining} attempt${attemptsRemaining === 1 ? "" : "s"} remaining before your account is suspended.`
        : "Incorrect PIN. Please try again.",
      attemptsUsed,
      attemptsRemaining: tracksFailedAttempts ? attemptsRemaining : undefined,
    };
  }

  if (tracksFailedAttempts && (Number(profile.pin_failed_attempts) || 0) > 0) {
    await db.from("profiles").update({ pin_failed_attempts: 0 }).eq("id", profile.id);
  }

  return { ok: true };
}
