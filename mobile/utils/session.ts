import { AuthApiError } from '@supabase/supabase-js';
import { router } from 'expo-router';

import { supabase } from '@/lib/supabase';

export async function getSessionOrRedirect() {
  const { data, error } = await supabase.auth.getSession();

  if (error) {
    if (error instanceof AuthApiError && error.message?.toLowerCase().includes('invalid refresh token')) {
      await supabase.auth.signOut();
      router.replace('/auth/login');
      return null;
    }
    throw error;
  }

  const session = data.session;
  if (!session) {
    router.replace('/auth/login');
    return null;
  }

  return session;
}
