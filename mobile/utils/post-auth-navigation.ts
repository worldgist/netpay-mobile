import { supabase } from '@/lib/supabase';
import { promptEnableNotifications, hasSeenNotificationPrompt } from '@/utils/notification-prompt';
import { needsDeviceWelcomeSetup } from '@/utils/device-welcome';
import type { Href } from 'expo-router';

/**
 * After session is established: new device → setup-biometric (includes push prompt);
 * otherwise optional notification prompt then home.
 */
export async function navigateAfterAuthenticatedSession(router: { replace: (href: Href) => void }): Promise<void> {
  const {
    data: { session },
  } = await supabase.auth.getSession();

  if (!session?.user?.id) {
    router.replace('/auth/login');
    return;
  }

  if (await needsDeviceWelcomeSetup(session.user.id)) {
    router.replace({ pathname: '/setup-biometric', params: { from: 'new_device' } } as Href);
    return;
  }

  const seenPromptOnThisDevice = await hasSeenNotificationPrompt();
  if (!seenPromptOnThisDevice) {
    await promptEnableNotifications();
  }

  router.replace('/(tabs)');
}
