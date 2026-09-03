import { createClient, SupabaseClient, User } from "https://esm.sh/@supabase/supabase-js@2";

export const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

export function createServiceClient(): SupabaseClient {
  const supabaseUrl = Deno.env.get("SUPABASE_URL");
  const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");

  if (!supabaseUrl || !serviceRoleKey) {
    throw new Error("Server configuration error");
  }

  return createClient(supabaseUrl, serviceRoleKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
}

function createAuthClient(): SupabaseClient {
  const supabaseUrl = Deno.env.get("SUPABASE_URL");
  const anonKey = Deno.env.get("SUPABASE_ANON_KEY") || Deno.env.get("SUPABASE_PUBLISHABLE_KEY");

  if (!supabaseUrl || !anonKey) {
    throw new Error("Server configuration error");
  }

  return createClient(supabaseUrl, anonKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
}

export async function getRequestUser(req: Request): Promise<User> {
  const authHeader = req.headers.get("Authorization");
  if (!authHeader) {
    throw new Error("No authorization header");
  }

  const jwt = authHeader.replace(/^Bearer\s+/i, "").trim();
  if (!jwt) {
    throw new Error("Unauthorized");
  }

  // Verify the caller's JWT with the anon key. A service-role client can ignore
  // the user token and then getUser() fails with Unauthorized.
  const { data: { user }, error: authError } = await createAuthClient().auth.getUser(jwt);

  if (authError || !user) {
    throw new Error("Unauthorized");
  }

  return user;
}

export async function requireAdmin(req: Request, supabase: SupabaseClient): Promise<User> {
  const user = await getRequestUser(req);

  const { data: roles, error: roleError } = await supabase
    .from("user_roles")
    .select("role")
    .eq("user_id", user.id)
    .eq("role", "admin")
    .limit(1);

  if (roleError || !roles?.length) {
    throw new Error("Unauthorized: Admin access required");
  }

  return user;
}

export function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

export function errorResponse(error: unknown, status = 400): Response {
  const message = error instanceof Error ? error.message : "An unknown error occurred";
  const resolvedStatus =
    status === 400 && (message.includes("Unauthorized") || message.includes("authorization"))
      ? 401
      : status;

  return jsonResponse({ success: false, error: message }, resolvedStatus);
}
