import { Platform } from 'react-native';
import Constants from 'expo-constants';
import { supabase } from '@/lib/supabase';

// Check if running in Expo Go (where push notifications are limited)
const isExpoGo = Constants.executionEnvironment === 'storeClient';
const isAndroidExpoGo = isExpoGo && Platform.OS === 'android';

// Lazy load expo-notifications to avoid errors in Expo Go
let Notifications: typeof import('expo-notifications') | null = null;
let notificationsInitialized = false;

const initializeNotifications = () => {
  if (notificationsInitialized) {
    return Notifications;
  }
  
  notificationsInitialized = true;
  
  // Skip initialization if Android in Expo Go
  if (isAndroidExpoGo) {
    console.warn('Android push notifications are not available in Expo Go. Use a development build for full functionality.');
    return null;
  }
  
  try {
    // Use require to avoid import-time errors
    Notifications = require('expo-notifications');
    
    if (Notifications) {
      Notifications.setNotificationHandler({
        handleNotification: async () => ({
          shouldShowAlert: true,
          shouldPlaySound: false,
          shouldSetBadge: false,
        }),
      });
    }
  } catch (error) {
    console.warn('expo-notifications not available:', error);
    Notifications = null;
  }
  
  return Notifications;
};

const isPhysicalDevice = () => Platform.OS !== 'web';

const getDeviceIdentifier = async () => {
  const notifications = initializeNotifications();
  if (!notifications) {
    return undefined;
  }
  
  try {
    if (Platform.OS === 'android') {
      const { data } = await notifications.getDevicePushTokenAsync();
      return data;
    }
    if (Platform.OS === 'ios') {
      const { data } = await notifications.getDevicePushTokenAsync();
      return data;
    }
  } catch (error) {
    console.warn('Failed to get device identifier:', error);
  }
  return undefined;
};

export type PushRegistrationResult = {
  token?: string;
  registered: boolean;
  reason?: string;
};

export const registerForPushNotifications = async (): Promise<PushRegistrationResult> => {
  try {
    const notifications = initializeNotifications();
    
    if (!notifications) {
      if (isAndroidExpoGo) {
        return { 
          registered: false, 
          reason: 'Android push notifications are not available in Expo Go. Please use a development build.' 
        };
      }
      return { 
        registered: false, 
        reason: 'Push notifications are not available in this environment.' 
      };
    }

    if (!isPhysicalDevice()) {
      return { registered: false, reason: 'Push notifications require a physical device.' };
    }

    const { status: existingStatus } = await notifications.getPermissionsAsync();
    let finalStatus = existingStatus;

    if (existingStatus !== 'granted') {
      const { status } = await notifications.requestPermissionsAsync();
      finalStatus = status;
    }

    if (finalStatus !== 'granted') {
      return { registered: false, reason: 'Notification permission was not granted.' };
    }

    // Get Expo project ID from Constants (required for EAS builds)
    const projectId = Constants.expoConfig?.extra?.eas?.projectId || 'a962982c-3160-42f2-9e64-3ab04ced7bf5';
    
    const { data: expoToken } = await notifications.getExpoPushTokenAsync({
      projectId,
    });
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
  } catch (error) {
    console.error('Error registering for push notifications:', error);
    return { registered: false, reason: error instanceof Error ? error.message : 'Unknown error' };
  }
};

export const scheduleLocalNotification = async (
  title: string,
  body: string,
  data?: Record<string, unknown>,
  seconds = 2,
) => {
  const notifications = initializeNotifications();
  if (!notifications) {
    console.warn('Notifications not available, skipping local notification');
    return;
  }
  
  try {
    return await notifications.scheduleNotificationAsync({
      content: {
        title,
        body,
        data,
      },
      trigger: { seconds },
    });
  } catch (error) {
    console.warn('Failed to schedule local notification:', error);
  }
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

export type TransactionNotificationParams = {
  amount: number | string;
  serviceType?: string;
  network?: string;
  recipient?: string;
  reference?: string;
  transactionType?: 'purchase' | 'transfer' | 'credit' | 'debit';
  metadata?: Record<string, unknown>;
};

/**
 * Helper function to send push notifications for transactions
 * Automatically formats the notification based on transaction type
 */
export const sendTransactionNotification = async (params: TransactionNotificationParams): Promise<void> => {
  try {
    const { data: sessionData } = await supabase.auth.getSession();
    const userId = sessionData?.session?.user.id;
    
    if (!userId) {
      console.warn('No user session found; skipping transaction notification');
      return;
    }

    const amountValue = typeof params.amount === 'string' ? parseFloat(params.amount) : params.amount;
    const formattedAmount = Number.isFinite(amountValue) ? amountValue.toFixed(2) : String(params.amount);
    
    // Determine notification title and body based on transaction type
    let title = 'Transaction Successful';
    let body = `₦${formattedAmount}`;
    
    const transactionType = params.transactionType || 'purchase';
    
    switch (transactionType) {
      case 'transfer':
        title = 'Transfer Successful';
        body = `₦${formattedAmount} transferred`;
        if (params.recipient) {
          body += ` to ${params.recipient}`;
        }
        break;
      
      case 'credit':
        title = 'Payment Received';
        body = `₦${formattedAmount} credited to your wallet`;
        break;
      
      case 'debit':
        title = 'Payment Processed';
        body = `₦${formattedAmount} debited`;
        if (params.serviceType) {
          body += ` for ${params.serviceType}`;
        }
        break;
      
      case 'purchase':
      default:
        title = 'Purchase Successful';
        body = `₦${formattedAmount}`;
        if (params.serviceType) {
          body += ` • ${params.serviceType}`;
        }
        if (params.network) {
          body += ` • ${params.network}`;
        }
        body += ' completed';
        break;
    }

    await sendPushNotification({
      user_id: userId,
      title,
      body,
      data: {
        amount: formattedAmount,
        serviceType: params.serviceType,
        network: params.network,
        recipient: params.recipient,
        reference: params.reference,
        transactionType,
        ...params.metadata,
      },
      priority: 'high',
    });
  } catch (error) {
    console.error('Failed to send transaction notification:', error);
    // Don't throw - notifications are non-critical
  }
};
