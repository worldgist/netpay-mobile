import { createClient, type SupabaseClient } from "https://esm.sh/@supabase/supabase-js@2";

export type EducationPinRecord = {
  Pin: string;
  Serial?: string;
};

export type SendEducationPinEmailInput = {
  email: string;
  fullName?: string | null;
  examType: string;
  pin?: string | null;
  serial?: string | null;
  pins?: EducationPinRecord[] | null;
  instructions?: string | null;
  phoneNumber?: string | null;
  amount?: number;
  purchaseAmount?: number;
  chargeFee?: number;
  reference?: string;
  purchasedAt?: string;
  balanceBefore?: number;
  balanceAfter?: number;
};

const INSTRUCTION_KEYS = new Set([
  "instruction",
  "instructions",
  "message",
  "description",
  "note",
  "info",
]);

const sanitizeText = (value: unknown): string | undefined => {
  if (typeof value !== "string") return undefined;
  const trimmed = value.trim();
  if (!trimmed || /^success(?:ful)?$/i.test(trimmed)) return undefined;
  return trimmed;
};

const findInstructionInObject = (
  source: unknown,
  visited: Set<object> = new Set(),
  depth = 0,
): string | undefined => {
  if (source == null || depth > 6) return undefined;

  if (Array.isArray(source)) {
    for (const item of source) {
      const found = findInstructionInObject(item, visited, depth + 1);
      if (found) return found;
    }
    return undefined;
  }

  if (typeof source !== "object") return undefined;

  if (visited.has(source)) return undefined;
  visited.add(source);

  for (const [key, value] of Object.entries(source as Record<string, unknown>)) {
    if (INSTRUCTION_KEYS.has(key.toLowerCase())) {
      const text = sanitizeText(value);
      if (text) return text;
    }
  }

  for (const value of Object.values(source as Record<string, unknown>)) {
    const found = findInstructionInObject(value, visited, depth + 1);
    if (found) return found;
  }

  return undefined;
};

export function normalizeEducationPins(input: {
  pin?: string | null;
  serial?: string | null;
  pins?: EducationPinRecord[] | null;
}): EducationPinRecord[] {
  if (Array.isArray(input.pins) && input.pins.length > 0) {
    return input.pins
      .map((entry) => ({
        Pin: (entry.Pin || "").trim(),
        Serial: entry.Serial?.trim() || undefined,
      }))
      .filter((entry) => entry.Pin.length > 0);
  }

  const pin = input.pin?.trim();
  if (!pin) return [];

  return [{
    Pin: pin,
    Serial: input.serial?.trim() || undefined,
  }];
}

export function extractEducationInstructions(apiResponse: unknown): string | undefined {
  if (!apiResponse) return undefined;

  let payload: unknown = apiResponse;
  if (typeof payload === "string") {
    try {
      payload = JSON.parse(payload);
    } catch {
      return sanitizeText(payload);
    }
  }

  return findInstructionInObject(payload);
}

function getServiceClient(existing?: SupabaseClient): SupabaseClient {
  if (existing) return existing;

  const url = Deno.env.get("SUPABASE_URL") ?? "";
  const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";
  return createClient(url, serviceRoleKey);
}

/** Sends education PIN details to the user's email via send-purchase-email (non-blocking friendly). */
export async function sendEducationPinEmail(
  input: SendEducationPinEmailInput,
  options?: { supabase?: SupabaseClient },
): Promise<{ success: boolean; error?: string }> {
  const email = input.email?.trim();
  if (!email) {
    return { success: false, error: "No email address" };
  }

  const pins = normalizeEducationPins(input);
  const primaryPin = pins[0]?.Pin || input.pin?.trim();
  if (!primaryPin) {
    return { success: false, error: "No PIN to send" };
  }

  const supabase = getServiceClient(options?.supabase);

  try {
    const { error } = await supabase.functions.invoke("send-purchase-email", {
      body: {
        type: "education",
        email,
        fullName: input.fullName ?? undefined,
        examType: input.examType.toUpperCase(),
        pin: primaryPin,
        serial: pins[0]?.Serial || input.serial || undefined,
        pins,
        instructions: input.instructions ?? undefined,
        phoneNumber: input.phoneNumber ?? undefined,
        amount: input.amount,
        purchaseAmount: input.purchaseAmount,
        chargeFee: input.chargeFee,
        reference: input.reference,
        purchasedAt: input.purchasedAt ?? new Date().toISOString(),
        balanceBefore: input.balanceBefore,
        balanceAfter: input.balanceAfter,
      },
    });

    if (error) {
      console.error("sendEducationPinEmail invoke error:", error);
      return { success: false, error: error.message };
    }

    return { success: true };
  } catch (err) {
    const message = err instanceof Error ? err.message : "Unknown error";
    console.error("sendEducationPinEmail failed:", message);
    return { success: false, error: message };
  }
}
