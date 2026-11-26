import { Platform } from 'react-native';
import * as Linking from 'expo-linking';
import * as WebBrowser from 'expo-web-browser';
import { supabase, isSupabaseInitialized } from '@/lib/supabase';
import { siteUrl } from '@/constants/site';
import { parseAuthLinkParams } from '@/utils/parse-auth-link-params';
import { stripSensitiveAuthParamsFromUrl } from '@/utils/strip-auth-url-params';
import * as SecureStore from '@/utils/secure-store';

WebBrowser.maybeCompleteAuthSession();

const PENDING_REFERRAL_KEY = 'pending_oauth_referral_code';
const SESSION_KEY = 'supabase_session';
const EMAIL_KEY = 'supabase_email';

export function getGoogleOAuthRedirectTo(): string {
  if (Platform.OS === 'web' && typeof window !== 'undefined' && window.location?.origin) {
    return `${window.location.origin}/auth/callback`;
  }
  // Standalone: netpay://auth/callback — Expo Go: exp://…/--/auth/callback
  return Linking.createURL('auth/callback');
}

export async function stashPendingReferralCode(referralCode?: string | null): Promise<void> {
  const trimmed = referralCode?.trim();
  if (!trimmed) {
    await SecureStore.deleteItemAsync(PENDING_REFERRAL_KEY);
    return;
  }
  await SecureStore.setItemAsync(PENDING_REFERRAL_KEY, trimmed);
}

async function applyPendingReferralIfAny(userId: string, email?: string | null): Promise<void> {
  const referralCode = (await SecureStore.getItemAsync(PENDING_REFERRAL_KEY))?.trim();
  if (!referralCode) return;

  try {
    await supabase.functions.invoke('apply-referral-code', {
      body: {
        referral_code: referralCode,
        referred_user_id: userId,
        referred_email: email || null,
        referred_phone: null,
      },
    });
  } catch (error) {
    console.warn('Failed to apply referral code after Google auth:', error);
  } finally {
    await SecureStore.deleteItemAsync(PENDING_REFERRAL_KEY);
  }
}

export async function persistAuthSession(session: {
  access_token: string;
  refresh_token: string;
  user?: { id: string; email?: string | null } | null;
}): Promise<void> {
  try {
    await SecureStore.setItemAsync(
      SESSION_KEY,
      JSON.stringify({
        access_token: session.access_token,
        refresh_token: session.refresh_token,
      }),
    );
    if (session.user?.email) {
      await SecureStore.setItemAsync(EMAIL_KEY, session.user.email.toLowerCase());
    }
  } catch (error) {
    console.warn('Unable to persist OAuth session:', error);
  }

  if (session.user?.id) {
    await applyPendingReferralIfAny(session.user.id, session.user.email);
  }
}

/**
 * Complete Supabase session from an OAuth redirect URL (PKCE code or implicit tokens).
 */
export async function completeOAuthFromUrl(url: string): Promise<{ error?: string }> {
  const params = parseAuthLinkParams(url);

  if (params.error) {
    return {
      error: params.errorDescription || params.error || 'Google sign-in was cancelled or failed.',
    };
  }

  if (params.code) {
    const { data, error } = await supabase.auth.exchangeCodeForSession(params.code);
    stripSensitiveAuthParamsFromUrl();
    if (error || !data.session) {
      return { error: error?.message || 'Unable to complete Google sign-in.' };
    }
    await persistAuthSession(data.session);
    return {};
  }

  if (params.accessToken && params.refreshToken) {
    const { data, error } = await supabase.auth.setSession({
      access_token: params.accessToken,
      refresh_token: params.refreshToken,
    });
    stripSensitiveAuthParamsFromUrl();
    if (error || !data.session) {
      return { error: error?.message || 'Unable to restore Google session.' };
    }
    await persistAuthSession(data.session);
    return {};
  }

  // Web: supabase may already have parsed the URL if detectSessionInUrl is on.
  const { data } = await supabase.auth.getSession();
  stripSensitiveAuthParamsFromUrl();
  if (data.session) {
    await persistAuthSession(data.session);
    return {};
  }

  return { error: 'Google sign-in did not return a valid session. Please try again.' };
}

export async function signInWithGoogle(options?: {
  referralCode?: string | null;
}): Promise<{ error?: string; cancelled?: boolean }> {
  if (!isSupabaseInitialized()) {
    return {
      error:
        'Supabase is not configured. Please set EXPO_PUBLIC_SUPABASE_URL and EXPO_PUBLIC_SUPABASE_ANON_KEY.',
    };
  }

  await stashPendingReferralCode(options?.referralCode);

  const redirectTo = getGoogleOAuthRedirectTo();

  try {
    if (Platform.OS === 'web') {
      const { data, error } = await supabase.auth.signInWithOAuth({
        provider: 'google',
        options: {
          redirectTo,
          queryParams: {
            access_type: 'offline',
            prompt: 'select_account',
          },
        },
      });
      if (error) {
        return { error: error.message || 'Unable to start Google sign-in.' };
      }
      if (!data?.url) {
        return { error: 'Google sign-in URL was not returned.' };
      }
      // Browser navigates away; callback route finishes the session.
      if (typeof window !== 'undefined') {
        window.location.assign(data.url);
      }
      return {};
    }

    const { data, error } = await supabase.auth.signInWithOAuth({
      provider: 'google',
      options: {
        redirectTo,
        skipBrowserRedirect: true,
        queryParams: {
          access_type: 'offline',
          prompt: 'select_account',
        },
      },
    });

    if (error) {
      return { error: error.message || 'Unable to start Google sign-in.' };
    }
    if (!data?.url) {
      return { error: 'Google sign-in URL was not returned.' };
    }

    const result = await WebBrowser.openAuthSessionAsync(data.url, redirectTo);

    if (result.type === 'cancel' || result.type === 'dismiss') {
      return { cancelled: true };
    }

    if (result.type !== 'success' || !('url' in result) || !result.url) {
      return { error: 'Google sign-in did not complete. Please try again.' };
    }

    return completeOAuthFromUrl(result.url);
  } catch (error) {
    const message =
      error instanceof Error && error.message.trim()
        ? error.message
        : 'Unable to sign in with Google.';
    return { error: message };
  }
}

/** Prefer https site callback in docs / dashboard allow-list. */
export const GOOGLE_OAUTH_DASHBOARD_REDIRECTS = [
  siteUrl('/auth/callback'),
  'https://www.netppay.com/auth/callback',
  'http://localhost:8081/auth/callback',
  'netpay://auth/callback',
];
