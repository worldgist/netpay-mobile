import { supabase } from '@/lib/supabase';
import { setBiometricLoginEnabled } from '@/utils/biometric-login-preference';

/** Turn off server-side biometric login until the user re-enables it in Profile. */
export async function disableBiometricLoginForCurrentUser(): Promise<{ ok: boolean; error?: string }> {
  const {
    data: { session },
    error: sessionError,
  } = await supabase.auth.getSession();

  if (sessionError || !session?.user?.id) {
    return { ok: false, error: sessionError?.message || 'No active session' };
  }

  const { error } = await supabase
    .from('profiles')
    .update({ biometric_enabled: false })
    .eq('id', session.user.id);

  if (error) {
    return { ok: false, error: error.message };
  }

  await setBiometricLoginEnabled(false);

  return { ok: true };
}
