import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { debitUserWallet } from "../_shared/wallet.ts";
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
    const admin = await requireAdmin(req, supabase);

    const { userId, amount, description } = await req.json();

    if (!userId || !amount || amount <= 0) {
      return jsonResponse({ success: false, error: "Invalid input parameters" }, 400);
    }

    console.log(`Admin ${admin.id} debiting user ${userId} with ₦${amount}`);

    const result = await debitUserWallet({
      supabase,
      userId,
      amount,
      transactionType: "debit",
      description: description || null,
      performedBy: admin.id,
    });

    return jsonResponse({
      success: true,
      message: "User debited successfully",
      data: {
        reference: result.reference,
        balanceBefore: result.balanceBefore,
        balanceAfter: result.balanceAfter,
        amount,
      },
    });
  } catch (error) {
    console.error("Debit user error:", error);
    return errorResponse(error, 400);
  }
});
