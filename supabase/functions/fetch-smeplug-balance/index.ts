import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { parseSmeplugBalance } from "../_shared/smeplug-balance.ts";
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
    const { resolveSmeplugSecretKey } = await import("../_shared/vendor-secrets.ts");
    const smeplugSecretKey = await resolveSmeplugSecretKey();

    if (!smeplugSecretKey) {
      console.error("SMEPLUG_SECRET_KEY not configured");
      return jsonResponse({ success: false, error: "Service configuration error" }, 500);
    }

    const supabase = createServiceClient();
    await requireAdmin(req, supabase);

    console.log("Fetching SMEPLUG account balance...");

    const balanceResponse = await fetch("https://smeplug.ng/api/v1/account/balance", {
      method: "GET",
      headers: {
        Authorization: `Bearer ${smeplugSecretKey}`,
        "Content-Type": "application/json",
      },
    });

    const balanceData = await balanceResponse.json();
    console.log("SMEPLUG balance response:", balanceData);

    const balanceAmount = parseSmeplugBalance(balanceData) ?? 0;

    return jsonResponse({
      success: true,
      balance: {
        amount: balanceAmount,
        currency: "NGN",
      },
      account: {
        businessName: "SMEPLUG Account",
      },
    });
  } catch (error) {
    console.error("Error in fetch-smeplug-balance function:", error);
    return errorResponse(error, 500);
  }
});
