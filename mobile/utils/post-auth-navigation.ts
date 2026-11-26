import { Platform } from 'react-native';
import { supabase } from '@/lib/supabase';
import { promptEnableNotifications, hasSeenNotificationPrompt } from '@/utils/notification-prompt';
import { needsDeviceWelcomeSetup, markDeviceWelcomeSetupComplete } from '@/utils/device-welcome';
import { buildRouteHref } from '@/utils/router-href';
import { markOnboardingCompleted } from '@/utils/onboarding';
import type { Href } from 'expo-router';

/** Only allow same-origin relative return paths (ChatGPT consent, etc.). */
export function safeReturnToPath(value?: string | null): string | null {
  if (!value) return null;
  const trimmed = value.trim();
  if (!trimmed.startsWith('/') || trimmed.startsWith('//')) return null;
  if (trimmed.includes('://')) return null;
  return trimmed;
}

/**
 * After session is established: new device → setup-biometric (includes push prompt);
 * otherwise optional notification prompt then home.
 * On web: skip biometric/push setup (unsupported) and go straight home.
 */
export async function navigateAfterAuthenticatedSession(
  router: { replace: (href: Href) => void },
  options?: { returnTo?: string | null },
): Promise<void> {
  const {
    data: { session },
  } = await supabase.auth.getSession();

  if (!session?.user?.id) {
    router.replace('/auth/login');
    return;
  }

  // New Google (or other OAuth) users still need a transaction PIN.
  const { data: profile } = await supabase
    .from('profiles')
    .select('pin_hash')
    .eq('id', session.user.id)
    .maybeSingle();

  if (!profile?.pin_hash) {
    router.replace('/setup-pin');
    return;
  }

  const returnTo = safeReturnToPath(options?.returnTo);
  if (returnTo) {
    if (Platform.OS === 'web') {
      await markOnboardingCompleted();
      await markDeviceWelcomeSetupComplete(session.user.id);
    }
    router.replace(returnTo as Href);
    return;
  }

  if (Platform.OS === 'web') {
    await markOnboardingCompleted();
    await markDeviceWelcomeSetupComplete(session.user.id);
    router.replace('/(tabs)');
    return;
  }

  if (await needsDeviceWelcomeSetup(session.user.id)) {
    router.replace(buildRouteHref('/setup-biometric', { from: 'new_device' }));
    return;
  }

  const seenPromptOnThisDevice = await hasSeenNotificationPrompt();
  if (!seenPromptOnThisDevice) {
    await promptEnableNotifications();
  }

  router.replace('/(tabs)');
}
