import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import {
  corsHeaders,
  createServiceClient,
  errorResponse,
  jsonResponse,
  requireAdmin,
} from "../_shared/admin-auth.ts";

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabase = createServiceClient();
    const admin = await requireAdmin(req, supabase);

    const { userId } = await req.json();
    if (!userId || typeof userId !== "string") {
      throw new Error("userId is required");
    }

    if (userId === admin.id) {
      throw new Error("You cannot verify your own account through this action");
    }

    const { data: existing, error: existingError } = await supabase.auth.admin.getUserById(userId);
    if (existingError || !existing?.user) {
      throw new Error("User not found");
    }

    if (existing.user.email_confirmed_at || existing.user.confirmed_at) {
      return jsonResponse({
        success: true,
        message: "User email is already verified",
        data: {
          userId,
          email_verified: true,
          email_confirmed_at: existing.user.email_confirmed_at ?? existing.user.confirmed_at,
        },
      });
    }

    const { data: updated, error: updateError } = await supabase.auth.admin.updateUserById(userId, {
      email_confirm: true,
    });

    if (updateError) {
      throw new Error(`Failed to verify user email: ${updateError.message}`);
    }

    console.log(`Admin ${admin.id} verified email for user ${userId}`);

    return jsonResponse({
      success: true,
      message: "User email verified successfully",
      data: {
        userId,
        email_verified: true,
        email_confirmed_at: updated.user?.email_confirmed_at ?? updated.user?.confirmed_at ?? new Date().toISOString(),
      },
    });
  } catch (error) {
    console.error("admin-verify-user error:", error);
    return errorResponse(error);
  }
});
