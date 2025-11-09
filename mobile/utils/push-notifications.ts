import * as Notifications from 'expo-notifications';
import { Platform } from 'react-native';
import { supabase } from '@/lib/supabase';

Notifications.setNotificationHandler({
  handleNotification: async () => ({
    shouldShowAlert: true,
    shouldPlaySound: false,
    shouldSetBadge: false,
  }),
});

const isPhysicalDevice = () => Platform.OS !== 'web';

const getDeviceIdentifier = async () => {
  if (Platform.OS === 'android') {
    const { data } = await Notifications.getDevicePushTokenAsync();
    return data;
  }
  if (Platform.OS === 'ios') {
    const { data } = await Notifications.getDevicePushTokenAsync();
    return data;
  }
  return undefined;
};

export type PushRegistrationResult = {
  token?: string;
  registered: boolean;
  reason?: string;
};

export const registerForPushNotifications = async (): Promise<PushRegistrationResult> => {
  if (!isPhysicalDevice()) {
    return { registered: false, reason: 'Push notifications require a physical device.' };
  }

  const { status: existingStatus } = await Notifications.getPermissionsAsync();
  let finalStatus = existingStatus;

  if (existingStatus !== 'granted') {
    const { status } = await Notifications.requestPermissionsAsync();
    finalStatus = status;
  }

  if (finalStatus !== 'granted') {
    return { registered: false, reason: 'Notification permission was not granted.' };
  }

  const { data: expoToken } = await Notifications.getExpoPushTokenAsync();
  const deviceId = await getDeviceIdentifier();
  const platform = Platform.OS;

  const { error } = await supabase.functions.invoke('register-push-token', {
    body: {
      expo_push_token: expoToken,
      device_id: deviceId,
      platform,
    },
  });

  if (error) {
    return { registered: false, reason: error.message };
  }

  return { registered: true, token: expoToken };
};

export const scheduleLocalNotification = async (
  title: string,
  body: string,
  data?: Record<string, unknown>,
  seconds = 2,
) => {
  return Notifications.scheduleNotificationAsync({
    content: {
      title,
      body,
      data,
    },
    trigger: { seconds },
  });
};

export type PushMessage = {
  user_id?: string;
  expo_push_token?: string;
  title: string;
  body: string;
  data?: Record<string, unknown>;
  sound?: string;
  priority?: 'default' | 'normal' | 'high';
};

export const sendPushNotification = async (message: PushMessage | PushMessage[]) => {
  const { data, error } = await supabase.functions.invoke('send-push-notification', {
    body: message,
  });

  if (error) {
    throw error;
  }

  return data;
};
