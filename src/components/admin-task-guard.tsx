import type { ReactNode } from "react";
import { Navigate, useLocation } from "react-router-dom";
import { ADMIN_TASKS, taskForPath } from "@/config/admin-tasks";
import { useAdminAccess } from "@/context/AdminAccessContext";

export function AdminTaskGuard({ children }: { children: ReactNode }) {
  const location = useLocation();
  const { loading, hasDbAdminRole, isSuperAdmin, taskKeys } = useAdminAccess();
  const task = taskForPath(location.pathname);

  if (!task) {
    return <>{children}</>;
  }

  if (loading) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-background">
        <p className="text-sm text-muted-foreground">Loading your admin access…</p>
      </div>
    );
  }

  if (!hasDbAdminRole || isSuperAdmin || taskKeys.includes(task.key)) {
    return <>{children}</>;
  }

  const fallback = ADMIN_TASKS.find((entry) => taskKeys.includes(entry.key))?.path ?? "/auth";
  if (fallback === location.pathname) {
    return <>{children}</>;
  }
  return <Navigate to={fallback} replace />;
}
