import AsyncStorage from '@react-native-async-storage/async-storage';

/** True during Expo static web SSR (Node has no `window`). */
export function isBrowser(): boolean {
  return typeof window !== 'undefined';
}

/**
 * Supabase auth storage that no-ops during SSR so createClient() does not crash
 * when Expo pre-renders routes on the server.
 */
export const supabaseAuthStorage = {
  getItem: async (key: string): Promise<string | null> => {
    if (!isBrowser()) {
      return null;
    }
    return AsyncStorage.getItem(key);
  },
  setItem: async (key: string, value: string): Promise<void> => {
    if (!isBrowser()) {
      return;
    }
    await AsyncStorage.setItem(key, value);
  },
  removeItem: async (key: string): Promise<void> => {
    if (!isBrowser()) {
      return;
    }
    await AsyncStorage.removeItem(key);
  },
};
