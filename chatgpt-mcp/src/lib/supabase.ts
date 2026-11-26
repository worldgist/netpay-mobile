import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { env } from "../env.js";

let serviceClient: SupabaseClient | null = null;

export function getServiceClient(): SupabaseClient {
  if (!serviceClient) {
    serviceClient = createClient(env.supabaseUrl(), env.supabaseServiceRoleKey(), {
      auth: { persistSession: false, autoRefreshToken: false },
    });
  }
  return serviceClient;
}

export function getUserClient(accessToken: string): SupabaseClient {
  return createClient(env.supabaseUrl(), env.supabaseAnonKey(), {
    global: {
      headers: { Authorization: `Bearer ${accessToken}` },
    },
    auth: { persistSession: false, autoRefreshToken: false },
  });
}

export async function refreshSupabaseSession(refreshToken: string): Promise<{
  access_token: string;
  refresh_token: string;
  user_id: string;
}> {
  const client = createClient(env.supabaseUrl(), env.supabaseAnonKey(), {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  const { data, error } = await client.auth.refreshSession({ refresh_token: refreshToken });
  if (error || !data.session?.access_token || !data.session.refresh_token || !data.session.user?.id) {
    throw new Error(error?.message || "Failed to refresh Supabase session");
  }
  return {
    access_token: data.session.access_token,
    refresh_token: data.session.refresh_token,
    user_id: data.session.user.id,
  };
}
