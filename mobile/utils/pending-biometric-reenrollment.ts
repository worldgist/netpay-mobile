import AsyncStorage from '@react-native-async-storage/async-storage';

const KEY = 'netpay_pending_biometric_reenrollment';

/** After a password change, require password sign-in or explicit biometric re-enable before biometric login. */
export async function markPendingBiometricReenrollment(): Promise<void> {
  await AsyncStorage.setItem(KEY, '1');
}

export async function clearPendingBiometricReenrollment(): Promise<void> {
  await AsyncStorage.removeItem(KEY);
}

export async function isPendingBiometricReenrollment(): Promise<boolean> {
  return (await AsyncStorage.getItem(KEY)) === '1';
}
