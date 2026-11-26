import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { getEBillsToken, getEBillsBalance } from "../_shared/ebills-api.ts";
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
    const supabase = createServiceClient();
    await requireAdmin(req, supabase);

    const token = await getEBillsToken();
    const balanceData = await getEBillsBalance(token);

    return jsonResponse({
      success: true,
      data: {
        balance: balanceData.data.balance,
        currency: balanceData.data.currency || "NGN",
      },
    });
  } catch (error) {
    console.error("fetch-ebills-balance error:", error);
    return errorResponse(error, 500);
  }
});
