import { Platform } from 'react-native';
import { supabase } from '@/lib/supabase';
import { promptEnableNotifications, hasSeenNotificationPrompt } from '@/utils/notification-prompt';
import { needsDeviceWelcomeSetup, markDeviceWelcomeSetupComplete } from '@/utils/device-welcome';
import { buildRouteHref } from '@/utils/router-href';
import type { Href } from 'expo-router';

/**
 * After session is established: new device → setup-biometric (includes push prompt);
 * otherwise optional notification prompt then home.
 * On web: skip biometric/push setup (unsupported) and go straight home.
 */
export async function navigateAfterAuthenticatedSession(router: { replace: (href: Href) => void }): Promise<void> {
  const {
    data: { session },
  } = await supabase.auth.getSession();

  if (!session?.user?.id) {
    router.replace('/auth/login');
    return;
  }

  if (Platform.OS === 'web') {
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
