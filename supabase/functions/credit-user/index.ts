import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { creditUserWallet } from "../_shared/wallet.ts";
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

    console.log(`Admin ${admin.id} crediting user ${userId} with ₦${amount}`);

    const result = await creditUserWallet({
      supabase,
      userId,
      amount,
      transactionType: "credit",
      description: description || null,
      performedBy: admin.id,
    });

    console.log(
      `Successfully credited user ${userId}: ₦${result.balanceBefore} -> ₦${result.balanceAfter}`,
    );

    return jsonResponse({
      success: true,
      message: "User credited successfully",
      data: {
        reference: result.reference,
        balanceBefore: result.balanceBefore,
        balanceAfter: result.balanceAfter,
        amount,
      },
    });
  } catch (error) {
    console.error("Credit user error:", error);
    return errorResponse(error, 400);
  }
});
