import AsyncStorage from '@react-native-async-storage/async-storage';

const CACHE_KEY = '@netpay_cable_packages_v1';

export type CachedCablePlan = {
  id: string;
  packageName: string;
  price: number;
};

type CachedCablePackages = {
  vendingProvider: string;
  plansByProvider: Record<string, CachedCablePlan[]>;
  updatedAt: number;
};

export async function readCachedCablePackages(
  vendingProvider: string,
): Promise<Record<string, CachedCablePlan[]> | null> {
  try {
    const raw = await AsyncStorage.getItem(CACHE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as CachedCablePackages;
    if (parsed.vendingProvider !== vendingProvider) return null;
    if (!parsed.plansByProvider || typeof parsed.plansByProvider !== 'object') return null;
    return parsed.plansByProvider;
  } catch {
    return null;
  }
}

export async function writeCachedCablePackages(
  vendingProvider: string,
  plansByProvider: Record<string, CachedCablePlan[]>,
): Promise<void> {
  try {
    const payload: CachedCablePackages = {
      vendingProvider,
      plansByProvider,
      updatedAt: Date.now(),
    };
    await AsyncStorage.setItem(CACHE_KEY, JSON.stringify(payload));
  } catch (error) {
    console.warn('Failed to persist cable packages cache:', error);
  }
}
