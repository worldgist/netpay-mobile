import { createHash, timingSafeEqual } from "node:crypto";
import { getServiceClient } from "./supabase.js";

const MAX_WRONG_PIN_ATTEMPTS = 5;
const SHA256_HEX_RE = /^[a-f0-9]{64}$/i;

export type PinVerifyResult =
  | { ok: true }
  | {
      ok: false;
      code:
        | "INVALID_INPUT"
        | "PIN_NOT_ENABLED"
        | "ACCOUNT_SUSPENDED"
        | "INVALID_PIN"
        | "PIN_HASH_UNSUPPORTED";
      error: string;
      attemptsUsed?: number;
      attemptsRemaining?: number;
    };

function looksLikeBcrypt(hash: string): boolean {
  return hash.startsWith("$2a$") || hash.startsWith("$2b$") || hash.startsWith("$2y$");
}

function normalizePinHash(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const trimmed = value.trim().toLowerCase();
  return SHA256_HEX_RE.test(trimmed) ? trimmed : null;
}

function hashesMatch(storedHash: string, providedHash: string): boolean {
  try {
    const a = Buffer.from(storedHash.toLowerCase(), "utf8");
    const b = Buffer.from(providedHash.toLowerCase(), "utf8");
    if (a.length !== b.length) return false;
    return timingSafeEqual(a, b);
  } catch {
    return false;
  }
}

async function loadPinProfile(userId: string): Promise<{
  profile: {
    id: string;
    email: string | null;
    pin_hash: string | null;
    pin_enabled: boolean | null;
    status: string | null;
    pin_failed_attempts?: number | null;
  } | null;
  tracksFailedAttempts: boolean;
  loadError?: boolean;
}> {
  const db = getServiceClient();
  const firstTry = await db
    .from("profiles")
    .select("id, email, pin_hash, pin_enabled, status, pin_failed_attempts")
    .eq("id", userId)
    .maybeSingle();

  if (firstTry.error && /pin_failed_attempts/i.test(firstTry.error.message || "")) {
    const fallback = await db
      .from("profiles")
      .select("id, email, pin_hash, pin_enabled, status")
      .eq("id", userId)
      .maybeSingle();
    if (fallback.error) return { profile: null, tracksFailedAttempts: false, loadError: true };
    return { profile: fallback.data, tracksFailedAttempts: false };
  }
  if (firstTry.error) return { profile: null, tracksFailedAttempts: true, loadError: true };
  return { profile: firstTry.data, tracksFailedAttempts: true };
}

async function registerFailedAttempt(params: {
  profileId: string;
  previousAttempts: number;
  tracksFailedAttempts: boolean;
}): Promise<PinVerifyResult> {
  const db = getServiceClient();
  await new Promise((resolve) => setTimeout(resolve, 350 + Math.floor(Math.random() * 350)));

  const attemptsUsed = params.previousAttempts + 1;
  const attemptsRemaining = Math.max(0, MAX_WRONG_PIN_ATTEMPTS - attemptsUsed);

  if (params.tracksFailedAttempts && attemptsUsed >= MAX_WRONG_PIN_ATTEMPTS) {
    await db
      .from("profiles")
      .update({
        status: "suspended",
        pin_failed_attempts: attemptsUsed,
      })
      .eq("id", params.profileId);

    return {
      ok: false,
      code: "ACCOUNT_SUSPENDED",
      error:
        "Your account has been suspended after 5 incorrect PIN attempts. Please contact support to reactivate it.",
      attemptsUsed,
      attemptsRemaining: 0,
    };
  }

  if (params.tracksFailedAttempts) {
    await db
      .from("profiles")
      .update({ pin_failed_attempts: attemptsUsed })
      .eq("id", params.profileId);
  }

  return {
    ok: false,
    code: "INVALID_PIN",
    error: params.tracksFailedAttempts
      ? `Incorrect PIN. You have ${attemptsRemaining} attempt${attemptsRemaining === 1 ? "" : "s"} remaining before your account is suspended.`
      : "Incorrect PIN. Please try again.",
    attemptsUsed,
    attemptsRemaining: params.tracksFailedAttempts ? attemptsRemaining : undefined,
  };
}

/**
 * Verify a client-side SHA-256 PIN hash (never accept raw PIN over ChatGPT).
 * Widget hashes the 4-digit PIN with Web Crypto before callTool.
 */
export async function verifyTransactionPinHash(
  userId: string,
  pinHashInput: unknown,
): Promise<PinVerifyResult> {
  const pinHash = normalizePinHash(pinHashInput);
  if (!pinHash) {
    return {
      ok: false,
      code: "INVALID_INPUT",
      error:
        "PIN must be entered in the NetPay confirmation modal. Raw PINs are not accepted — use the hashed PIN from the widget.",
    };
  }

  const { profile, tracksFailedAttempts, loadError } = await loadPinProfile(userId);
  if (loadError) {
    return {
      ok: false,
      code: "INVALID_PIN",
      error: "Unable to verify PIN right now. Please try again.",
    };
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

  const storedHash = profile.pin_hash;
  if (looksLikeBcrypt(storedHash)) {
    return {
      ok: false,
      code: "PIN_HASH_UNSUPPORTED",
      error:
        "This account uses an older PIN format. Open the NetPay app → Change PIN, set a new 4-digit PIN, then confirm again in ChatGPT.",
    };
  }

  const matched = hashesMatch(storedHash, pinHash);
  if (!matched) {
    return registerFailedAttempt({
      profileId: profile.id,
      previousAttempts: tracksFailedAttempts
        ? Math.max(0, Number(profile.pin_failed_attempts) || 0)
        : 0,
      tracksFailedAttempts,
    });
  }

  if (tracksFailedAttempts && (Number(profile.pin_failed_attempts) || 0) > 0) {
    const db = getServiceClient();
    await db.from("profiles").update({ pin_failed_attempts: 0 }).eq("id", profile.id);
  }

  return { ok: true };
}

/** @deprecated Prefer verifyTransactionPinHash — raw PIN must not travel through ChatGPT. */
export async function verifyTransactionPin(
  userId: string,
  pinInput: unknown,
): Promise<PinVerifyResult> {
  if (typeof pinInput === "string" && SHA256_HEX_RE.test(pinInput.trim())) {
    return verifyTransactionPinHash(userId, pinInput);
  }
  // Never accept plaintext PIN from the ChatGPT tool path.
  return {
    ok: false,
    code: "INVALID_INPUT",
    error:
      "For your security, enter your PIN only in the NetPay confirmation modal. ChatGPT never receives your raw PIN.",
  };
}

export function sha256Hex(value: string): string {
  return createHash("sha256").update(value, "utf8").digest("hex");
}
