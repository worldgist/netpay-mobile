import { supabase } from "@/integrations/supabase/client";
import { ADMIN_TASKS } from "@/config/admin-tasks";

/** First admin page a signed-in user is allowed to open. Super admins land on the dashboard. */
export async function resolveAdminHomePath(userId: string): Promise<string> {
  const { data, error } = await supabase
    .from("admin_task_assignments")
    .select("task_key")
    .eq("user_id", userId);

  if (error || !data?.length) {
    return "/dashboard";
  }

  const assigned = new Set(data.map((row) => row.task_key));
  return ADMIN_TASKS.find((task) => assigned.has(task.key))?.path ?? "/dashboard";
}
