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
    await requireAdmin(req, supabase);

    const { userId } = await req.json();
    if (!userId || typeof userId !== "string") {
      throw new Error("userId is required");
    }

    const [{ data: profile, error: profileError }, { data: authData, error: authError }] =
      await Promise.all([
        supabase.from("profiles").select("*").eq("id", userId).maybeSingle(),
        supabase.auth.admin.getUserById(userId),
      ]);

    if (profileError) {
      throw new Error(`Failed to load profile: ${profileError.message}`);
    }

    if (authError || !authData?.user) {
      throw new Error("User not found");
    }

    const authUser = authData.user;

    const [{ count: transactionCount }, { data: roles }] = await Promise.all([
      supabase
        .from("user_transactions")
        .select("*", { count: "exact", head: true })
        .eq("user_id", userId),
      supabase.from("user_roles").select("role").eq("user_id", userId),
    ]);

    return jsonResponse({
      success: true,
      data: {
        profile,
        auth: {
          id: authUser.id,
          email: authUser.email,
          phone: authUser.phone,
          created_at: authUser.created_at,
          last_sign_in_at: authUser.last_sign_in_at,
          email_confirmed_at: authUser.email_confirmed_at,
          confirmed_at: authUser.confirmed_at,
          banned_until: authUser.banned_until,
        },
        roles: roles?.map((entry) => entry.role) ?? [],
        transaction_count: transactionCount ?? 0,
        email_verified: Boolean(authUser.email_confirmed_at || authUser.confirmed_at),
      },
    });
  } catch (error) {
    console.error("admin-get-user-details error:", error);
    return errorResponse(error);
  }
});
