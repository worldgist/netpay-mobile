import AsyncStorage from '@react-native-async-storage/async-storage';

const CACHE_KEY = '@netpay_data_plans_v1';

export type CachedDataPlan = {
  id: string;
  network: string;
  planName: string;
  price: number;
  validity: string;
  apiCode: string;
  custom_price?: number | null;
  original_price?: number | null;
};

type CachedDataPlans = {
  provider: string;
  plansByNetwork: Record<string, CachedDataPlan[]>;
  networkIdMap: Record<string, string>;
  updatedAt: number;
};

export async function readCachedDataPlans(
  provider: string,
): Promise<{
  plansByNetwork: Record<string, CachedDataPlan[]>;
  networkIdMap: Record<string, string>;
} | null> {
  try {
    const raw = await AsyncStorage.getItem(CACHE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as CachedDataPlans;
    if (parsed.provider !== provider) return null;
    if (!parsed.plansByNetwork || typeof parsed.plansByNetwork !== 'object') return null;
    return {
      plansByNetwork: parsed.plansByNetwork,
      networkIdMap: parsed.networkIdMap || {},
    };
  } catch {
    return null;
  }
}

export async function writeCachedDataPlans(
  provider: string,
  plansByNetwork: Record<string, CachedDataPlan[]>,
  networkIdMap: Record<string, string> = {},
): Promise<void> {
  try {
    const payload: CachedDataPlans = {
      provider,
      plansByNetwork,
      networkIdMap,
      updatedAt: Date.now(),
    };
    await AsyncStorage.setItem(CACHE_KEY, JSON.stringify(payload));
  } catch (error) {
    console.warn('Failed to persist data plans cache:', error);
  }
}
