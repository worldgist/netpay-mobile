import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { getPlustiveBalance } from "../_shared/plustive-api.ts";
import {
  corsHeaders,
  createServiceClient,
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

    const balanceData = await getPlustiveBalance();

    return jsonResponse({
      success: true,
      data: {
        balance: balanceData.balance,
        currency: balanceData.currency || "NGN",
      },
    });
  } catch (error) {
    console.error("fetch-plustive-balance error:", error);
    const message = error instanceof Error ? error.message : "Failed to fetch Plustive balance";
    return jsonResponse({ success: false, error: message });
  }
});
