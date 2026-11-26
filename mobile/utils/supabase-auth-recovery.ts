import { supabase } from '@/lib/supabase';

type SupabaseErrorLike = {
  code?: string;
  message?: string;
};

export function isJwtClockSkewError(error: unknown): boolean {
  if (!error || typeof error !== 'object') return false;
  const e = error as SupabaseErrorLike;
  return e.code === 'PGRST303' || (e.message?.includes('JWT issued at future') ?? false);
}

/** Refresh auth session after PostgREST rejects a future-dated JWT. Returns false if recovery failed. */
export async function recoverFromJwtClockSkew(): Promise<boolean> {
  const { data, error } = await supabase.auth.refreshSession();
  if (error || !data.session) {
    await supabase.auth.signOut();
    return false;
  }
  return true;
}
