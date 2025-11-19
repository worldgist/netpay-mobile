import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const anonKey = Deno.env.get("SUPABASE_ANON_KEY")!;
    const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");

    if (!serviceRoleKey) {
      console.error("Missing SUPABASE_SERVICE_ROLE_KEY");
      return new Response(
        JSON.stringify({ success: false, error: "Service configuration error" }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    const authHeader = req.headers.get("Authorization");
    if (!authHeader) {
      return new Response(
        JSON.stringify({ success: false, error: "Missing authorization header" }),
        { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    const authClient = createClient(supabaseUrl, anonKey, {
      global: {
        headers: {
          Authorization: authHeader,
        },
      },
    });

    const {
      data: { user },
      error: userError,
    } = await authClient.auth.getUser();

    if (userError || !user) {
      console.error("Authentication error:", userError);
      return new Response(
        JSON.stringify({ success: false, error: "Unauthorized" }),
        { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    const { data: hasAdminRole, error: hasRoleError } = await authClient.rpc("has_role", {
      _user_id: user.id,
      _role: "admin",
    });

    if (hasRoleError) {
      console.error("has_role error:", hasRoleError);
      return new Response(
        JSON.stringify({ success: false, error: "Failed to verify permissions" }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    if (!hasAdminRole) {
      return new Response(
        JSON.stringify({ success: false, error: "Unauthorized - Admin access required" }),
        { status: 403, headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    const serviceClient = createClient(supabaseUrl, serviceRoleKey);

    const [
      staffMembersRes,
      rolesRes,
      dutiesRes,
      activityLogsRes,
      usersRes,
    ] = await Promise.all([
      serviceClient
        .from("staff_members")
        .select(`
          *,
          profiles(full_name, email, phone),
          staff_roles(role_name)
        `)
        .order("created_at", { ascending: false }),
      serviceClient
        .from("staff_roles")
        .select("*")
        .order("role_name"),
      serviceClient
        .from("staff_duties")
        .select("*")
        .order("priority", { ascending: false }),
      serviceClient
        .from("staff_activity_logs")
        .select(`
          *,
          staff_members(profiles(full_name))
        `)
        .order("created_at", { ascending: false })
        .limit(50),
      serviceClient
        .from("profiles")
        .select("id, full_name, email")
        .order("full_name"),
    ]);

    const queryErrors = [
      staffMembersRes.error,
      rolesRes.error,
      dutiesRes.error,
      activityLogsRes.error,
      usersRes.error,
    ].filter(Boolean);

    if (queryErrors.length > 0) {
      queryErrors.forEach((err) => console.error("fetch-staff-overview query error:", err));
      return new Response(
        JSON.stringify({ success: false, error: "Failed to load staff management data" }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    const staffMembers = staffMembersRes.data ?? [];
    const stats = {
      total: staffMembers.length,
      active: staffMembers.filter((s) => s.employment_status === "active").length,
      onLeave: staffMembers.filter((s) => s.employment_status === "on_leave").length,
      suspended: staffMembers.filter((s) => s.employment_status === "suspended").length,
    };

    return new Response(
      JSON.stringify({
        success: true,
        staffMembers,
        roles: rolesRes.data ?? [],
        duties: dutiesRes.data ?? [],
        activityLogs: activityLogsRes.data ?? [],
        users: usersRes.data ?? [],
        stats,
      }),
      {
        status: 200,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      },
    );
  } catch (error) {
    console.error("Error in fetch-staff-overview function:", error);
    return new Response(
      JSON.stringify({
        success: false,
        error: "Internal server error",
        details: error instanceof Error ? error.message : "Unknown error",
      }),
      {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      },
    );
  }
});



