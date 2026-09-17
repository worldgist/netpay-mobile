import * as SecureStore from '@/utils/secure-store';

const KEY = 'biometric_login_enabled';

export async function setBiometricLoginEnabled(enabled: boolean): Promise<void> {
  if (enabled) {
    await SecureStore.setItemAsync(KEY, 'true');
  } else {
    await SecureStore.deleteItemAsync(KEY);
  }
}

export async function isBiometricLoginEnabledLocally(): Promise<boolean> {
  return (await SecureStore.getItemAsync(KEY)) === 'true';
}
