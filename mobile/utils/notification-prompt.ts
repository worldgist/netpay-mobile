import { Alert , Platform } from 'react-native';
import * as SecureStore from 'expo-secure-store';

import Constants from 'expo-constants';
import { registerForPushNotifications } from '@/utils/push-notifications';

const NOTIFICATION_PROMPT_SEEN_KEY = 'notification_prompt_seen_v1';
const NOTIFICATION_PROMPT_NEVER_KEY = 'notification_prompt_never_v1';
const isExpoGo = Constants.executionEnvironment === 'storeClient';
const isAndroidExpoGo = isExpoGo && Platform.OS === 'android';

const getNotificationsModule = () => {
  if (isAndroidExpoGo) {
    return null;
  }

  try {
    return require('expo-notifications') as typeof import('expo-notifications');
  } catch (error) {
    console.warn('expo-notifications module unavailable in notification prompt flow:', error);
    return null;
  }
};

type PromptChoice = 'enable' | 'later' | 'never';

const showEnablePrompt = (title: string, message: string): Promise<PromptChoice> =>
  new Promise((resolve) => {
    Alert.alert(title, message, [
      { text: "Don't ask again", style: 'destructive', onPress: () => resolve('never') },
      { text: 'Not now', style: 'cancel', onPress: () => resolve('later') },
      { text: 'Enable', onPress: () => resolve('enable') },
    ]);
  });

const markPromptSeen = async () => {
  try {
    await SecureStore.setItemAsync(NOTIFICATION_PROMPT_SEEN_KEY, 'true');
  } catch (error) {
    console.warn('Failed to persist notification prompt state:', error);
  }
};

export const hasSeenNotificationPrompt = async (): Promise<boolean> => {
  try {
    const value = await SecureStore.getItemAsync(NOTIFICATION_PROMPT_SEEN_KEY);
    return value === 'true';
  } catch (error) {
    console.warn('Failed to read notification prompt state:', error);
    return false;
  }
};

export const hasDisabledNotificationPrompt = async (): Promise<boolean> => {
  try {
    const value = await SecureStore.getItemAsync(NOTIFICATION_PROMPT_NEVER_KEY);
    return value === 'true';
  } catch (error) {
    console.warn('Failed to read notification prompt never state:', error);
    return false;
  }
};

type PromptOptions = {
  forcePrompt?: boolean;
  title?: string;
  message?: string;
};

/**
 * Shows a friendly notification opt-in prompt before requesting OS permission.
 * - forcePrompt: ignore "seen" state (useful during post-signup flow)
 */
export const promptEnableNotifications = async (options: PromptOptions = {}) => {
  const {
    forcePrompt = false,
    title = 'Enable Notifications',
    message = 'Would you like to enable notifications for transaction updates and important account alerts?',
  } = options;

  try {
    if (isAndroidExpoGo) {
      // Android remote push is not supported in Expo Go (SDK 53+).
      return;
    }

    const Notifications = getNotificationsModule();
    if (!Notifications) {
      return;
    }

    const seenPrompt = await hasSeenNotificationPrompt();
    const disabledPrompt = await hasDisabledNotificationPrompt();
    const { status } = await Notifications.getPermissionsAsync();

    // If already granted, just ensure token registration is up to date.
    if (status === 'granted') {
      await registerForPushNotifications();
      await markPromptSeen();
      return;
    }

    if (disabledPrompt) {
      return;
    }

    if (seenPrompt && !forcePrompt) {
      return;
    }

    const choice = await showEnablePrompt(title, message);
    await markPromptSeen();

    if (choice === 'never') {
      try {
        await SecureStore.setItemAsync(NOTIFICATION_PROMPT_NEVER_KEY, 'true');
      } catch (error) {
        console.warn('Failed to persist notification prompt never state:', error);
      }
      return;
    }

    if (choice !== 'enable') {
      return;
    }

    const result = await registerForPushNotifications();
    if (!result.registered) {
      Alert.alert(
        'Notifications',
        result.reason || 'Could not enable notifications right now. You can enable them later in app settings.'
      );
    }
  } catch (error) {
    console.warn('Notification prompt flow failed:', error);
  }
};
