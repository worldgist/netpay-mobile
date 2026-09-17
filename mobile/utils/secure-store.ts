import { Platform } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import * as ExpoSecureStore from 'expo-secure-store';
import { isBrowser } from '@/lib/auth-storage';

const WEB_PREFIX = 'netpay_secure:';

function webKey(key: string): string {
  return `${WEB_PREFIX}${key}`;
}

/**
 * SecureStore works on iOS/Android only. On web (and SSR), use AsyncStorage / no-op
 * so Expo web does not crash on setItemAsync / getItemAsync.
 */
export async function getItemAsync(key: string): Promise<string | null> {
  if (Platform.OS === 'web') {
    if (!isBrowser()) return null;
    return AsyncStorage.getItem(webKey(key));
  }
  return ExpoSecureStore.getItemAsync(key);
}

export async function setItemAsync(key: string, value: string): Promise<void> {
  if (Platform.OS === 'web') {
    if (!isBrowser()) return;
    await AsyncStorage.setItem(webKey(key), value);
    return;
  }
  await ExpoSecureStore.setItemAsync(key, value);
}

export async function deleteItemAsync(key: string): Promise<void> {
  if (Platform.OS === 'web') {
    if (!isBrowser()) return;
    await AsyncStorage.removeItem(webKey(key));
    return;
  }
  await ExpoSecureStore.deleteItemAsync(key);
}
