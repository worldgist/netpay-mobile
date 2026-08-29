import AsyncStorage from '@react-native-async-storage/async-storage';

const HANDLED_FUNDING_CALLBACKS_KEY = '@netpay_handled_funding_callbacks_v1';
const handledFundingCallbacks = new Set<string>();
let handledCallbacksLoaded = false;

async function ensureHandledCallbacksLoaded(): Promise<void> {
  if (handledCallbacksLoaded) {
    return;
  }

  try {
    const raw = await AsyncStorage.getItem(HANDLED_FUNDING_CALLBACKS_KEY);
    if (raw) {
      const parsed = JSON.parse(raw) as unknown;
      if (Array.isArray(parsed)) {
        for (const item of parsed) {
          if (typeof item === 'string' && item.trim()) {
            handledFundingCallbacks.add(item.trim());
          }
        }
      }
    }
  } catch (error) {
    console.warn('Failed to load handled funding callbacks:', error);
  } finally {
    handledCallbacksLoaded = true;
  }
}

async function persistHandledCallback(txRef: string): Promise<void> {
  const normalized = txRef.trim();
  if (!normalized) {
    return;
  }

  handledFundingCallbacks.add(normalized);

  try {
    await AsyncStorage.setItem(
      HANDLED_FUNDING_CALLBACKS_KEY,
      JSON.stringify([...handledFundingCallbacks]),
    );
  } catch (error) {
    console.warn('Failed to persist handled funding callback:', error);
  }
}

export function markFundingCallbackHandled(txRef: string): void {
  void persistHandledCallback(txRef);
}

/** Returns true only the first time a callback for this tx_ref should run. */
export async function shouldHandleFundingCallback(txRef: string): Promise<boolean> {
  const normalized = txRef.trim();
  if (!normalized) {
    return false;
  }

  await ensureHandledCallbacksLoaded();

  if (handledFundingCallbacks.has(normalized)) {
    return false;
  }

  await persistHandledCallback(normalized);
  return true;
}

export function buildFundingCallbackParams(url: string): { tx_ref: string; status: string } | null {
  try {
    const parsed = new URL(url);
    const txRef = parsed.searchParams.get('tx_ref') || '';
    const status = parsed.searchParams.get('status') || 'successful';
    if (!txRef.trim()) return null;
    return { tx_ref: txRef.trim(), status };
  } catch {
    return null;
  }
}
