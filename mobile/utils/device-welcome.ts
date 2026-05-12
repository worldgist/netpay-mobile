import AsyncStorage from '@react-native-async-storage/async-storage';

const STORAGE_KEY = '@netpay_device_welcome_completed_user_ids_v1';

async function readIds(): Promise<Set<string>> {
  try {
    const raw = await AsyncStorage.getItem(STORAGE_KEY);
    if (!raw) return new Set();
    const arr = JSON.parse(raw) as unknown;
    if (!Array.isArray(arr)) return new Set();
    return new Set(arr.filter((id): id is string => typeof id === 'string'));
  } catch {
    return new Set();
  }
}

async function writeIds(ids: Set<string>): Promise<void> {
  await AsyncStorage.setItem(STORAGE_KEY, JSON.stringify([...ids]));
}

/** First successful auth on this app install for this user — offer biometric + push setup. */
export async function needsDeviceWelcomeSetup(userId: string | null | undefined): Promise<boolean> {
  if (!userId) return false;
  const set = await readIds();
  return !set.has(userId);
}

export async function markDeviceWelcomeSetupComplete(userId: string | null | undefined): Promise<void> {
  if (!userId) return;
  const set = await readIds();
  set.add(userId);
  await writeIds(set);
}
