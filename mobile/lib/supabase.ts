import { createClient, SupabaseClient } from '@supabase/supabase-js';
import { Platform } from 'react-native';
import * as SecureStore from 'expo-secure-store';
import { isBrowser, supabaseAuthStorage } from '@/lib/auth-storage';

const SUPABASE_URL = process.env.EXPO_PUBLIC_SUPABASE_URL;
const SUPABASE_ANON_KEY = process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY;

const authOptions = {
  storage: supabaseAuthStorage,
  autoRefreshToken: true,
  persistSession: true,
  detectSessionInUrl: false,
};

// Create a dummy client that will fail gracefully if env vars are missing
// This prevents immediate crash while still allowing the app to load
let supabaseInstance: SupabaseClient;

if (!SUPABASE_URL || !SUPABASE_ANON_KEY) {
  console.error('Missing Supabase environment variables. Please set EXPO_PUBLIC_SUPABASE_URL and EXPO_PUBLIC_SUPABASE_ANON_KEY');
  // Create a dummy client with placeholder values to prevent TypeScript errors
  // All operations will fail gracefully with clear error messages
  supabaseInstance = createClient('https://placeholder.supabase.co', 'placeholder-key', {
    auth: authOptions,
  });
} else {
  supabaseInstance = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
    auth: authOptions,
  });
}

export const supabase = supabaseInstance;

const SESSION_KEY = 'supabase_session';
const EMAIL_KEY = 'supabase_email';

// SecureStore is native-only; skip during SSR and on web.
if (isBrowser() && Platform.OS !== 'web') {
  supabase.auth.onAuthStateChange(async (event, session) => {
    try {
      // Skip if using placeholder client
      if (!SUPABASE_URL || !SUPABASE_ANON_KEY) {
        return;
      }

      if (!session || event === 'SIGNED_OUT') {
        await SecureStore.deleteItemAsync(SESSION_KEY);

        if (event === 'USER_DELETED') {
          await SecureStore.deleteItemAsync(EMAIL_KEY);
        }
        return;
      }

      await SecureStore.setItemAsync(
        SESSION_KEY,
        JSON.stringify({
          access_token: session.access_token,
          refresh_token: session.refresh_token,
        })
      );

      if (session.user?.email) {
        await SecureStore.setItemAsync(EMAIL_KEY, session.user.email.toLowerCase());
      }
    } catch (error) {
      console.warn('Failed to synchronize secure session store:', error);
    }
  });
}

// Helper function to check if Supabase is properly initialized
export const isSupabaseInitialized = (): boolean => {
  return !!SUPABASE_URL && !!SUPABASE_ANON_KEY &&
         SUPABASE_URL !== 'https://placeholder.supabase.co' && 
         SUPABASE_ANON_KEY !== 'placeholder-key';
};

// Get configuration status for error messages
export const getSupabaseConfigStatus = () => {
  const hasUrl = !!SUPABASE_URL && SUPABASE_URL !== 'https://placeholder.supabase.co';
  const hasKey = !!SUPABASE_ANON_KEY && SUPABASE_ANON_KEY !== 'placeholder-key';
  
  if (!hasUrl || !hasKey) {
    return {
      configured: false,
      message: 'Supabase is not configured. Please set EXPO_PUBLIC_SUPABASE_URL and EXPO_PUBLIC_SUPABASE_ANON_KEY environment variables.',
    };
  }
  
  return {
    configured: true,
    message: 'Supabase is properly configured.',
  };
};
