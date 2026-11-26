import { supabase } from "@/integrations/supabase/client";

type InvokeOptions = {
  body?: unknown;
  headers?: Record<string, string>;
  method?: "POST" | "GET" | "PUT" | "PATCH" | "DELETE";
};

/**
 * Thin wrapper around functions.invoke.
 * Relies on the Supabase client session — do not force refreshSession() here
 * (parallel Treasury/SMEPLUG calls were rate-limiting and clearing auth).
 */
export async function invokeAuthedFunction<T = unknown>(
  functionName: string,
  options: InvokeOptions = {},
) {
  return supabase.functions.invoke<T>(functionName, options);
}
