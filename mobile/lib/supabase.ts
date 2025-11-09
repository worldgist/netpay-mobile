import { createClient } from '@supabase/supabase-js';
import AsyncStorage from '@react-native-async-storage/async-storage';
import * as SecureStore from 'expo-secure-store';

const SUPABASE_URL = process.env.EXPO_PUBLIC_SUPABASE_URL;
const SUPABASE_ANON_KEY = process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY;

if (!SUPABASE_URL || !SUPABASE_ANON_KEY) {
  throw new Error('Missing Supabase environment variables. Please set EXPO_PUBLIC_SUPABASE_URL and EXPO_PUBLIC_SUPABASE_ANON_KEY in mobile/.env');
}

export const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
  auth: {
    storage: AsyncStorage,
    autoRefreshToken: true,
    persistSession: true,
    detectSessionInUrl: false,
  },
});

const SESSION_KEY = 'supabase_session';
const EMAIL_KEY = 'supabase_email';

supabase.auth.onAuthStateChange(async (event, session) => {
  try {
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
