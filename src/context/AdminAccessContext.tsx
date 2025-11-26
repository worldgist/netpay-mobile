import { createContext, useCallback, useContext, useEffect, useMemo, useState } from "react";
import type { ReactNode } from "react";
import type { Session } from "@supabase/supabase-js";
import { supabase } from "@/integrations/supabase/client";
import { ensureProfileExists } from "@/utils/profile";

export type StaffRole = "admin" | "support" | "hr" | "finance" | "risk" | "marketing" | "moderator";
export type AllowedRoles = "all" | StaffRole[];

interface AdminAccessContextValue {
  roles: StaffRole[];
  loading: boolean;
  isAuthenticated: boolean;
  session: Session | null;
  refresh: () => Promise<StaffRole[]>;
  hasRole: (role: StaffRole) => boolean;
  canAccess: (allowed?: AllowedRoles) => boolean;
}

const AdminAccessContext = createContext<AdminAccessContextValue | undefined>(undefined);

const ALLOWED_LOGIN_ROLES: StaffRole[] = ["admin", "support", "hr", "finance", "risk", "marketing", "moderator"];

const normalizeRole = (role: string | null | undefined): StaffRole | null => {
  const normalized = role?.toLowerCase();
  switch (normalized) {
    case "admin":
    case "support":
    case "hr":
    case "finance":
    case "risk":
    case "marketing":
    case "moderator":
      return normalized;
    default:
      return null;
  }
};

export const AdminAccessProvider = ({ children }: { children: ReactNode }) => {
  const [roles, setRoles] = useState<StaffRole[]>([]);
  const [loading, setLoading] = useState(true);
  const [session, setSession] = useState<Session | null>(null);
  const [isAuthenticated, setIsAuthenticated] = useState(false);

  const deriveRolesFromMetadata = (userSession: Session | null): StaffRole[] => {
    if (!userSession?.user) return [];
    const collected = new Set<StaffRole>();

    const pushRole = (value: unknown) => {
      if (typeof value === "string") {
        const normalized = normalizeRole(value);
        if (normalized) collected.add(normalized);
      }
    };

    const appMeta = userSession.user.app_metadata ?? {};
    const userMeta = userSession.user.user_metadata ?? {};

    [appMeta.role, userMeta.role].forEach(pushRole);

    const appRoles = Array.isArray(appMeta.roles) ? appMeta.roles : [];
    const userRoles = Array.isArray(userMeta.roles) ? userMeta.roles : [];
    const tags = Array.isArray(userMeta.tags) ? userMeta.tags : [];

    [...appRoles, ...userRoles, ...tags].forEach(pushRole);

    if (typeof userMeta.is_admin === "boolean" && userMeta.is_admin) collected.add("admin");
    if (typeof userMeta.is_staff === "boolean" && userMeta.is_staff) collected.add("support");
    if (typeof userMeta.is_support === "boolean" && userMeta.is_support) collected.add("support");
    if (typeof userMeta.hr === "boolean" && userMeta.hr) collected.add("hr");

    const email = userSession.user.email?.toLowerCase();
    if (email?.endsWith("@netpayy.ng")) {
      collected.add("admin");
    }

    return Array.from(collected);
  };

  const fetchRoles = useCallback(async (): Promise<StaffRole[]> => {
    setLoading(true);
    const {
      data: { session: currentSession },
    } = await supabase.auth.getSession();

    setSession(currentSession ?? null);

    if (!currentSession) {
      setRoles([]);
      setIsAuthenticated(false);
      setLoading(false);
      return [];
    }

    try {
      await ensureProfileExists(currentSession.user);

      // Query user_roles with proper error handling for 406 errors
      const { data, error } = await supabase
        .from("user_roles")
        .select("role")
        .eq("user_id", currentSession.user.id);

      if (error) {
        // Handle 406 Not Acceptable errors gracefully
        if (error.code === '406' || error.message?.includes('406')) {
          console.warn("AdminAccess: 406 error loading user_roles (likely Accept header issue), continuing with metadata roles only", error);
        } else {
          console.warn("AdminAccess: unable to load user_roles", error);
        }
      }

      const dbRoles = (data ?? [])
        .map((entry) => normalizeRole(entry.role))
        .filter((role): role is StaffRole => Boolean(role));

      const metadataRoles = deriveRolesFromMetadata(currentSession);

      const combined = Array.from(new Set<StaffRole>([...dbRoles, ...metadataRoles]));

      setRoles(combined);
      setIsAuthenticated(combined.some((role) => ALLOWED_LOGIN_ROLES.includes(role)));
      return combined;
    } catch (err) {
      console.error("AdminAccess: unexpected error loading roles", err);
      setRoles([]);
      setIsAuthenticated(false);
      return [];
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchRoles();
    const { data: authListener } = supabase.auth.onAuthStateChange(() => {
      fetchRoles();
    });

    return () => {
      authListener.subscription.unsubscribe();
    };
  }, [fetchRoles]);

  const hasRole = useCallback(
    (role: StaffRole) => {
      if (roles.includes("admin")) return true;
      return roles.includes(role);
    },
    [roles],
  );

  const canAccess = useCallback(
    (allowed: AllowedRoles = "all") => {
      if (!isAuthenticated) return false;
      if (roles.includes("admin")) return true;
      if (allowed === "all") {
        return roles.length > 0;
      }
      return allowed.some((role) => roles.includes(role));
    },
    [isAuthenticated, roles],
  );

  const contextValue = useMemo(
    () => ({
      roles,
      loading,
      isAuthenticated,
      session,
      refresh: fetchRoles,
      hasRole,
      canAccess,
    }),
    [roles, loading, isAuthenticated, session, fetchRoles, hasRole, canAccess],
  );

  return <AdminAccessContext.Provider value={contextValue}>{children}</AdminAccessContext.Provider>;
};

export const useAdminAccess = (): AdminAccessContextValue => {
  const ctx = useContext(AdminAccessContext);
  if (!ctx) {
    throw new Error("useAdminAccess must be used within an AdminAccessProvider");
  }
  return ctx;
};

