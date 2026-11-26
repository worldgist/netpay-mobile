import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { flutterwaveJson } from "../_shared/flutterwave-http.ts";
import {
  corsHeaders,
  createServiceClient,
  errorResponse,
  jsonResponse,
  requireAdmin,
} from "../_shared/admin-auth.ts";

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { status: 204, headers: corsHeaders });
  }

  try {
    const { resolveFlutterwaveSecretKey } = await import("../_shared/flutterwave-secrets.ts");
    const secretKey = await resolveFlutterwaveSecretKey();

    if (!secretKey) {
      return jsonResponse({
        success: false,
        error: "Flutterwave credentials not configured. Set FLUTTERWAVE_SECRET_KEY.",
      }, 500);
    }

    const supabase = createServiceClient();
    await requireAdmin(req, supabase);

    let balanceData: { data?: Record<string, unknown>; message?: string };
    try {
      balanceData = await flutterwaveJson(secretKey, "/balances/NGN", { method: "GET" });
    } catch (error) {
      const errorMsg = error instanceof Error ? error.message : "Failed to fetch Flutterwave balance";
      console.error("Flutterwave balance error:", error);
      return jsonResponse({ success: false, error: errorMsg }, 400);
    }

    if (!balanceData.data) {
      return jsonResponse({ success: false, error: "Failed to fetch Flutterwave balance" }, 400);
    }

    const available = Number(balanceData.data.available_balance ?? balanceData.data.ledger_balance ?? 0);
    const ledger = Number(balanceData.data.ledger_balance ?? available);

    return jsonResponse({
      success: true,
      balance: {
        amount: available,
        ledgerBalance: ledger,
        currency: balanceData.data.currency || "NGN",
      },
      account: {
        businessName: "Flutterwave",
      },
    });
  } catch (error) {
    console.error("fetch-flutterwave-balance error:", error);
    return errorResponse(error, 500);
  }
});
