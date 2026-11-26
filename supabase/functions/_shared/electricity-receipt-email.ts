export type ElectricityReceiptEmail = {
  email?: string | null;
  fullName?: string | null;
  provider: string;
  token?: string | null;
  amount?: number;
  purchaseAmount?: number;
  chargeFee?: number;
  units?: number | null;
  meterNumber: string;
  meterType?: string | null;
  customerName?: string | null;
  customerAddress?: string | null;
  customerId?: string | null;
  reference?: string | null;
  purchasedAt?: string;
  balanceBefore?: number;
  balanceAfter?: number;
};

function clean(value: unknown): string {
  const text = String(value ?? "").trim();
  if (!text || text.toLowerCase() === "null" || text.toLowerCase() === "undefined") return "";
  return text;
}

/** Finds a prepaid token in a provider payload, including nested response objects. */
export function extractElectricityToken(value: unknown, depth = 0): string {
  if (!value || depth > 6) return "";
  if (Array.isArray(value)) {
    for (const item of value) {
      const found = extractElectricityToken(item, depth + 1);
      if (found) return found;
    }
    return "";
  }
  if (typeof value !== "object") return "";

  const record = value as Record<string, unknown>;
  for (const key of ["token", "meter_token", "token_code", "recharge_token", "purchased_code"]) {
    const text = clean(record[key]);
    if (text.replace(/\D/g, "").length >= 8) return text;
  }
  for (const nested of Object.values(record)) {
    if (nested && typeof nested === "object") {
      const found = extractElectricityToken(nested, depth + 1);
      if (found) return found;
    }
  }
  return "";
}

/**
 * Sends the electricity token email and waits for the mail function to finish.
 * Edge isolates stop pending work after the purchase response is returned, so this must be awaited.
 */
export async function sendElectricityReceiptEmail(input: ElectricityReceiptEmail): Promise<void> {
  const email = clean(input.email);
  const token = clean(input.token);
  if (!email) {
    console.error("Electricity receipt email skipped: no recipient", { reference: input.reference });
    return;
  }
  if (!token) {
    console.error("Electricity receipt email skipped: no token", { reference: input.reference });
    return;
  }

  const supabaseUrl = Deno.env.get("SUPABASE_URL") ?? "";
  const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";
  if (!supabaseUrl || !serviceKey) {
    console.error("Electricity receipt email skipped: missing Supabase function credentials");
    return;
  }

  try {
    const response = await fetch(`${supabaseUrl}/functions/v1/send-purchase-email`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${serviceKey}`,
        apikey: serviceKey,
      },
      body: JSON.stringify({
        type: "electricity",
        email,
        fullName: clean(input.fullName) || undefined,
        provider: input.provider,
        token,
        amount: input.amount,
        purchaseAmount: input.purchaseAmount,
        chargeFee: input.chargeFee,
        units: input.units ?? undefined,
        meterNumber: input.meterNumber,
        meterType: clean(input.meterType) || undefined,
        customerName: clean(input.customerName) || undefined,
        customerAddress: clean(input.customerAddress) || undefined,
        customerId: clean(input.customerId) || undefined,
        reference: clean(input.reference) || undefined,
        purchasedAt: input.purchasedAt || new Date().toISOString(),
        balanceBefore: input.balanceBefore,
        balanceAfter: input.balanceAfter,
      }),
    });

    const bodyText = await response.text();
    if (!response.ok) {
      console.error("Electricity receipt email failed:", {
        status: response.status,
        reference: input.reference,
        body: bodyText.slice(0, 500),
      });
      return;
    }

    console.log("Electricity receipt email accepted:", {
      reference: input.reference,
      body: bodyText.slice(0, 200),
    });
  } catch (error) {
    console.error("Electricity receipt email request failed:", error);
  }
}
