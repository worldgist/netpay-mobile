import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import {
  corsHeaders,
  createServiceClient,
  errorResponse,
  jsonResponse,
  requireAdmin,
} from "../_shared/admin-auth.ts";
import { deleteUserAccount } from "../_shared/delete-user-core.ts";

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabase = createServiceClient();
    const admin = await requireAdmin(req, supabase);

    const { userId, deletion_reason: deletionReason } = await req.json();
    if (!userId || typeof userId !== "string") {
      throw new Error("userId is required");
    }

    if (userId === admin.id) {
      throw new Error("You cannot delete your own admin account");
    }

    const { data: targetRoles } = await supabase
      .from("user_roles")
      .select("role")
      .eq("user_id", userId)
      .eq("role", "admin")
      .maybeSingle();

    if (targetRoles) {
      throw new Error("Admin accounts cannot be deleted from user management");
    }

    const { data: authUserData, error: authError } = await supabase.auth.admin.getUserById(userId);
    if (authError || !authUserData?.user) {
      throw new Error("User not found");
    }

    const { deletionRecordId } = await deleteUserAccount(supabase, {
      userId,
      deletedBy: admin.id,
      deletionReason: typeof deletionReason === "string" ? deletionReason.trim() : "Deleted by admin",
      source: "admin",
      metadata: {
        deleted_by_email: admin.email ?? null,
        deleted_by_admin_id: admin.id,
      },
    });

    console.log(`Admin ${admin.id} deleted user ${userId}`);

    return jsonResponse({
      success: true,
      message: "User deleted and archived successfully",
      data: {
        userId,
        deletionRecordId,
      },
    });
  } catch (error) {
    console.error("admin-delete-user error:", error);
    return errorResponse(error);
  }
});
