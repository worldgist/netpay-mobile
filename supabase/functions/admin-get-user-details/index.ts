import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import {
  corsHeaders,
  createServiceClient,
  jsonResponse,
  requireAdmin,
} from "../_shared/admin-auth.ts";

function readString(value: unknown): string | null {
  return typeof value === "string" && value.trim() ? value : null;
}

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { status: 200, headers: corsHeaders });
  }

  try {
    const supabase = createServiceClient();
    await requireAdmin(req, supabase);

    let userId = "";
    try {
      const body = await req.json();
      userId = typeof body?.userId === "string" ? body.userId.trim() : "";
    } catch {
      userId = "";
    }

    if (!userId) {
      return jsonResponse({ success: false, error: "userId is required" });
    }

    const profileResult = await supabase
      .from("profiles")
      .select("id, email, full_name, phone, balance, status, created_at, updated_at")
      .eq("id", userId)
      .limit(1);

    if (profileResult.error) {
      console.error("admin-get-user-details profile error:", profileResult.error);
      return jsonResponse({
        success: false,
        error: `Failed to load profile: ${profileResult.error.message}`,
      });
    }

    const profile = profileResult.data?.[0] ?? null;

    let authUser: {
      id: string;
      email?: string | null;
      phone?: string | null;
      created_at?: string;
      last_sign_in_at?: string | null;
      email_confirmed_at?: string | null;
    } | null = null;

    try {
      const { data: authData, error: authError } = await supabase.auth.admin.getUserById(userId);
      if (!authError && authData?.user) {
        const user = authData.user as Record<string, unknown>;
        authUser = {
          id: String(user.id),
          email: readString(user.email),
          phone: readString(user.phone),
          created_at: readString(user.created_at) ?? undefined,
          last_sign_in_at: readString(user.last_sign_in_at),
          email_confirmed_at: readString(user.email_confirmed_at) ?? readString(user.confirmed_at),
        };
      } else if (authError) {
        console.warn("admin-get-user-details auth lookup warning:", authError.message);
      }
    } catch (authLookupError) {
      console.warn("admin-get-user-details auth lookup failed:", authLookupError);
    }

    if (!profile && !authUser) {
      return jsonResponse({ success: false, error: "User not found" });
    }

    const [transactionResult, rolesResult] = await Promise.all([
      supabase
        .from("user_transactions")
        .select("id", { count: "exact", head: true })
        .eq("user_id", userId),
      supabase.from("user_roles").select("role").eq("user_id", userId),
    ]);

    if (transactionResult.error) {
      console.warn("admin-get-user-details transaction count warning:", transactionResult.error);
    }
    if (rolesResult.error) {
      console.warn("admin-get-user-details roles warning:", rolesResult.error);
    }

    const emailConfirmedAt = authUser?.email_confirmed_at ?? null;

    return jsonResponse({
      success: true,
      data: {
        profile,
        auth: authUser
          ? {
              id: authUser.id,
              email: authUser.email,
              phone: authUser.phone,
              created_at: authUser.created_at,
              last_sign_in_at: authUser.last_sign_in_at,
              email_confirmed_at: emailConfirmedAt,
              confirmed_at: emailConfirmedAt,
              banned_until: null,
            }
          : null,
        roles: (rolesResult.data || []).map((entry) => entry.role),
        transaction_count: transactionResult.count ?? 0,
        email_verified: Boolean(emailConfirmedAt),
      },
    });
  } catch (error) {
    console.error("admin-get-user-details error:", error);
    const message = error instanceof Error ? error.message : "Failed to load user details";
    return jsonResponse({ success: false, error: message });
  }
});
