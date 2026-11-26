import * as SecureStore from '@/utils/secure-store';

/** Bumped when onboarding UI changes so existing installs see the new flow once. */
export const ONBOARDING_COMPLETED_KEY = 'onboarding_v4_completed';

export async function hasCompletedOnboarding(): Promise<boolean> {
  try {
    const value = await SecureStore.getItemAsync(ONBOARDING_COMPLETED_KEY);
    return value === 'true';
  } catch {
    return false;
  }
}

export async function markOnboardingCompleted(): Promise<void> {
  await SecureStore.setItemAsync(ONBOARDING_COMPLETED_KEY, 'true');
}
