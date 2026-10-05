import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import {
  corsHeaders,
  createServiceClient,
  errorResponse,
  jsonResponse,
  requireAdmin,
} from "../_shared/admin-auth.ts";

const ADMIN_TASK_KEYS = new Set([
  "dashboard",
  "analytics",
  "treasury",
  "wallets",
  "virtual_accounts",
  "ledger",
  "transactions",
  "platform_revenue",
  "airtime",
  "data_plans",
  "electricity",
  "cable_tv",
  "education",
  "betting",
  "smeplug",
  "ebills",
  "payvessel",
  "flutterwave",
  "users",
  "deleted_accounts",
  "referrals",
  "staff",
  "hr",
  "support",
  "notifications",
  "email_notifications",
  "compliance",
  "content",
  "settings",
]);

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabase = createServiceClient();
    const admin = await requireAdmin(req, supabase);

    const { data: callerTasks, error: callerTaskError } = await supabase
      .from("admin_task_assignments")
      .select("task_key")
      .eq("user_id", admin.id)
      .limit(1);

    if (callerTaskError) {
      throw new Error("Unable to verify super admin access");
    }
    if (callerTasks && callerTasks.length > 0) {
      throw new Error("Only a super admin can assign admin tasks");
    }

    const body = await req.json();
    const userId = typeof body?.userId === "string" ? body.userId.trim() : "";
    if (!userId) {
      throw new Error("userId is required");
    }
    if (userId === admin.id) {
      throw new Error("You cannot change your own admin access");
    }

    const requested = Array.isArray(body?.tasks) ? body.tasks : [];
    const tasks = Array.from(
      new Set(
        requested
          .filter((task: unknown): task is string => typeof task === "string")
          .map((task: string) => task.trim())
          .filter((task: string) => ADMIN_TASK_KEYS.has(task)),
      ),
    );

    const { data: existingUser, error: existingError } = await supabase.auth.admin.getUserById(userId);
    if (existingError || !existingUser?.user) {
      throw new Error("User not found");
    }

    if (tasks.length === 0) {
      const { error: deleteTasksError } = await supabase
        .from("admin_task_assignments")
        .delete()
        .eq("user_id", userId);
      if (deleteTasksError) {
        throw new Error(deleteTasksError.message);
      }

      const { error: deleteRoleError } = await supabase
        .from("user_roles")
        .delete()
        .eq("user_id", userId)
        .eq("role", "admin");
      if (deleteRoleError) {
        throw new Error(deleteRoleError.message);
      }

      return jsonResponse({
        success: true,
        message: "Admin access removed",
        data: { userId, tasks: [], isAdmin: false },
      });
    }

    const { error: roleError } = await supabase
      .from("user_roles")
      .upsert({ user_id: userId, role: "admin" }, { onConflict: "user_id,role" });
    if (roleError) {
      throw new Error(roleError.message);
    }

    const { error: clearError } = await supabase
      .from("admin_task_assignments")
      .delete()
      .eq("user_id", userId);
    if (clearError) {
      throw new Error(clearError.message);
    }

    const { error: insertError } = await supabase.from("admin_task_assignments").insert(
      tasks.map((taskKey) => ({
        user_id: userId,
        task_key: taskKey,
        granted_by: admin.id,
      })),
    );
    if (insertError) {
      throw new Error(insertError.message);
    }

    return jsonResponse({
      success: true,
      message: "Admin tasks assigned",
      data: { userId, tasks, isAdmin: true },
    });
  } catch (error) {
    console.error("admin-assign-admin-tasks error:", error);
    return errorResponse(error);
  }
});
