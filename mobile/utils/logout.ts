import { Platform } from 'react-native';
import type { Href } from 'expo-router';
import { supabase } from '@/lib/supabase';
import * as SecureStore from '@/utils/secure-store';
import { clearAppCache } from '@/utils/clear-app-cache';

const EMAIL_KEY = 'supabase_email';
export const PIN_LOGIN_HREF = '/sign-in-pin' as const;

type LogoutRouter = {
  replace: (href: Href) => void;
};

/**
 * Sign out and always land on the Enter PIN screen.
 * On web, uses a hard navigation so tab/auth race conditions cannot bounce to password login.
 */
export async function logoutAndGoToPin(options: {
  email?: string | null;
  router: LogoutRouter;
}): Promise<void> {
  const email = (options.email || '').trim().toLowerCase();
  if (email.includes('@')) {
    try {
      await SecureStore.setItemAsync(EMAIL_KEY, email);
    } catch (error) {
      console.warn('Failed to persist email before logout:', error);
    }
  }

  // Clear session first, then navigate — avoids authenticated screens reacting mid-transition.
  try {
    await supabase.auth.signOut({ scope: 'local' });
  } catch (error) {
    console.warn('Local signOut failed, retrying global:', error);
    try {
      await supabase.auth.signOut();
    } catch (retryError) {
      console.warn('Global signOut failed:', retryError);
    }
  }

  try {
    await clearAppCache();
  } catch (error) {
    console.warn('clearAppCache after logout failed:', error);
  }

  if (Platform.OS === 'web' && typeof window !== 'undefined') {
    const target = `${window.location.origin}${PIN_LOGIN_HREF}`;
    window.location.replace(target);
    return;
  }

  options.router.replace(PIN_LOGIN_HREF);
}
