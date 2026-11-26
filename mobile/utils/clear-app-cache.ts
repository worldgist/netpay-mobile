import AsyncStorage from '@react-native-async-storage/async-storage';
import { clearCachedWalletBalance } from '@/utils/wallet-balance-cache';
import { clearPendingFundingNotice } from '@/utils/verify-flutterwave-funding';

const PROFILE_CACHE_KEY = '@netpay_profile_cache_v1';
const TRANSACTIONS_CACHE_KEY = '@netpay_transactions_cache_v1';
const CABLE_PACKAGES_CACHE_KEY = '@netpay_cable_packages_v2';
const CABLE_PACKAGES_CACHE_KEY_LEGACY = '@netpay_cable_packages_v1';

/** Clears persisted app caches so wallet, profile, and transactions reload from the server. */
export async function clearAppCache(): Promise<void> {
  clearPendingFundingNotice();

  try {
    const keys = await AsyncStorage.getAllKeys();
    const keysToRemove = keys.filter(
      (key) =>
        key === PROFILE_CACHE_KEY ||
        key === TRANSACTIONS_CACHE_KEY ||
        key === CABLE_PACKAGES_CACHE_KEY ||
        key === CABLE_PACKAGES_CACHE_KEY_LEGACY,
    );

    await Promise.all([
      clearCachedWalletBalance(),
      keysToRemove.length > 0 ? AsyncStorage.multiRemove(keysToRemove) : Promise.resolve(),
    ]);
  } catch (error) {
    console.warn('Failed to clear app cache:', error);
  }
}
