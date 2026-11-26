import AsyncStorage from '@react-native-async-storage/async-storage';

const BALANCE_CACHE_KEY = '@netpay_wallet_balance_v1';

type CachedWalletBalance = {
  userId: string;
  balance: number;
  updatedAt: number;
};

export async function readCachedWalletBalance(userId: string): Promise<number | null> {
  try {
    const raw = await AsyncStorage.getItem(BALANCE_CACHE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as CachedWalletBalance;
    if (parsed.userId !== userId) return null;
    if (!Number.isFinite(parsed.balance)) return null;
    return parsed.balance;
  } catch {
    return null;
  }
}

export async function writeCachedWalletBalance(userId: string, balance: number): Promise<void> {
  try {
    const payload: CachedWalletBalance = {
      userId,
      balance,
      updatedAt: Date.now(),
    };
    await AsyncStorage.setItem(BALANCE_CACHE_KEY, JSON.stringify(payload));
  } catch (error) {
    console.warn('Failed to persist wallet balance cache:', error);
  }
}

export async function clearCachedWalletBalance(): Promise<void> {
  try {
    await AsyncStorage.removeItem(BALANCE_CACHE_KEY);
  } catch {
    // ignore
  }
}
