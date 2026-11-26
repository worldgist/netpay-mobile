import type { Href } from 'expo-router';
import * as SecureStore from '@/utils/secure-store';

const EMAIL_KEY = 'supabase_email';

/**
 * Returning devices keep the last signed-in email after logout.
 * Prefer PIN unlock for those users; first-time / cleared storage uses password login.
 */
export async function getPreferredLoginRoute(): Promise<Href> {
  try {
    const storedEmail = (await SecureStore.getItemAsync(EMAIL_KEY))?.trim().toLowerCase() || '';
    if (storedEmail.includes('@')) {
      return '/sign-in-pin';
    }
  } catch (error) {
    console.warn('Failed to resolve preferred login route:', error);
  }
  return '/auth/login';
}

export async function getStoredLoginEmail(): Promise<string> {
  try {
    return (await SecureStore.getItemAsync(EMAIL_KEY))?.trim().toLowerCase() || '';
  } catch {
    return '';
  }
}
