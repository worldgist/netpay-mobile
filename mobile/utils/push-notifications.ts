import { Platform } from 'react-native';
import Constants from 'expo-constants';
import * as Device from 'expo-device';
import { supabase } from '@/lib/supabase';

// Check if running in Expo Go (where push notifications are limited)
const isExpoGo = Constants.executionEnvironment === 'storeClient';
const isAndroidExpoGo = isExpoGo && Platform.OS === 'android';

// Lazy load expo-notifications to avoid errors in Expo Go
let Notifications: typeof import('expo-notifications') | null = null;
let notificationsInitialized = false;
let androidChannelsSetup = false;

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
      // Configure notification handler for both iOS and Android
      Notifications.setNotificationHandler({
        handleNotification: async (notification) => {
          // Log notification for debugging
          console.log('Notification handler called:', {
            title: notification.request.content.title,
            body: notification.request.content.body,
            data: notification.request.content.data,
          });

          return {
            shouldShowAlert: true,
            shouldShowBanner: true,
            shouldShowList: true,
            shouldPlaySound: true,
            shouldSetBadge: true,
          };
        },
      });
    }
  } catch (error) {
    console.warn('expo-notifications not available:', error);
    Notifications = null;
  }
  
  return Notifications;
};

/**
 * Set up Android notification channels
 * Must be called before requesting permissions on Android
 */
const setupAndroidChannels = async (notifications: typeof import('expo-notifications')) => {
  if (Platform.OS !== 'android' || androidChannelsSetup) {
    return;
  }
  
  try {
    console.log('Setting up Android notification channels...');
    
    await notifications.setNotificationChannelAsync('default', {
      name: 'Default',
      importance: notifications.AndroidImportance.MAX,
      vibrationPattern: [0, 250, 250, 250],
      lightColor: '#FF231F7C',
      enableVibrate: true,
      showBadge: true,
    });
    console.log('Default notification channel created');

    // Optional channel for in-app / local use; remote pushes use "default" so they never miss this id.
    await notifications.setNotificationChannelAsync('transactions', {
      name: 'Transactions',
      importance: notifications.AndroidImportance.MAX,
      vibrationPattern: [0, 250, 250, 250],
      lightColor: '#FF231F7C',
      enableVibrate: true,
      showBadge: true,
    });
    console.log('Transactions notification channel created');
    
    androidChannelsSetup = true;
    console.log('Android notification channels set up successfully');
  } catch (error) {
    console.error('Failed to set Android notification channels:', error);
    // Don't throw - we'll still try to get the token, but notifications might not work properly
    // Log detailed error for debugging
    if (error instanceof Error) {
      console.error('Channel setup error details:', {
        message: error.message,
        stack: error.stack,
      });
    }
  }
};

/** Expo push does not work on emulators/simulators — must be a real device. */
const isPhysicalDevice = () => Device.isDevice;

const sleep = (ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms));

/** Transient device → Expo push API failures (LAN builds, VPN, captive Wi‑Fi, DNS). */
const isExpoPushTokenNetworkFailure = (err: unknown): boolean => {
  const msg = err instanceof Error ? err.message : String(err);
  return (
    msg.includes('Network request failed') ||
    msg.includes('The Internet connection appears to be offline') ||
    msg.includes('Could not connect to the server')
  );
};

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
      return {
        registered: false,
        reason:
          'Push notifications require a physical phone. Android emulators and iOS simulators cannot receive remote push.',
      };
    }

    // Set up Android notification channels BEFORE requesting permissions
    // This is critical for Android - channels must exist before permission request
    if (Platform.OS === 'android') {
      console.log('Setting up Android notification channels before permission request...');
      await setupAndroidChannels(notifications);
    }

    // Request permissions - Android 13+ requires explicit permission
    console.log('Checking notification permissions...');
    const { status: existingStatus } = await notifications.getPermissionsAsync();
    console.log('Current permission status:', existingStatus);
    
    let finalStatus = existingStatus;

    if (existingStatus !== 'granted') {
      console.log('Requesting notification permissions...');
      // For Android, request permissions with proper options
      const permissionRequest = Platform.OS === 'android'
        ? await notifications.requestPermissionsAsync({
            android: {
              allowAlert: true,
              allowBadge: true,
              allowSound: true,
              allowAnnouncements: true,
            },
          })
        : await notifications.requestPermissionsAsync();
      
      finalStatus = permissionRequest.status;
      console.log('Permission request result:', {
        status: finalStatus,
        granted: finalStatus === 'granted',
        canAskAgain: permissionRequest.canAskAgain,
        platform: Platform.OS,
      });
    } else {
      console.log('Notification permissions already granted');
    }

    if (finalStatus !== 'granted') {
      return { 
        registered: false, 
        reason: Platform.OS === 'android' 
          ? 'Notification permission was not granted. Please enable notifications in your device settings.'
          : 'Notification permission was not granted.' 
      };
    }

    // EAS / Expo push: only projectId is supported here (see Expo push setup docs).
    const projectId =
      Constants.expoConfig?.extra?.eas?.projectId ?? Constants.easConfig?.projectId ?? undefined;
    if (!projectId) {
      return {
        registered: false,
        reason:
          'Missing EAS projectId for push tokens. Ensure app.config.js has extra.eas.projectId and rebuild the app.',
      };
    }

    const tokenOptions = { projectId };

    // Minting the token calls Expo's push API from the device (HTTPS). "Network request failed" means
    // the phone could not complete that request — unrelated to Metro LAN or notification permission.
    let expoToken: string;
    try {
      console.log('Requesting Expo push token with options:', {
        platform: Platform.OS,
        projectId,
      });

      const tokenResult = await notifications.getExpoPushTokenAsync(tokenOptions);
      if (!tokenResult?.data) {
        throw new Error('Failed to get Expo push token: token data is empty');
      }
      expoToken = tokenResult.data;

      console.log('Expo push token obtained successfully:', {
        platform: Platform.OS,
        tokenLength: expoToken.length,
        tokenPrefix: expoToken.substring(0, 30),
        tokenStartsWith: expoToken.startsWith('ExponentPushToken'),
      });
    } catch (tokenError) {
      const isNetwork = isExpoPushTokenNetworkFailure(tokenError);
      const log = isNetwork ? console.warn : console.error;
      log('Failed to get Expo push token:', {
        error: tokenError,
        message: tokenError instanceof Error ? tokenError.message : 'Unknown error',
        platform: Platform.OS,
        projectId,
        hint: isNetwork
          ? 'Device could not reach Expo push servers. Try cellular data, disable VPN, or another Wi‑Fi; Expo push does not use your Metro bundler URL.'
          : undefined,
      });

      if (isNetwork) {
        try {
          await sleep(2000);
          const retryResult = await notifications.getExpoPushTokenAsync(tokenOptions);
          if (!retryResult?.data) {
            throw new Error('empty token on retry');
          }
          expoToken = retryResult.data;
          console.log('Expo push token obtained after one retry following a network error.');
        } catch {
          return {
            registered: false,
            reason:
              'Could not reach Expo to create a push token (network). Check internet, VPN, or try again on cellular data.',
          };
        }
      } else {
        return {
          registered: false,
          reason: `Failed to obtain push token: ${tokenError instanceof Error ? tokenError.message : 'Unknown error'}`,
        };
      }
    }

    // Get device identifier (optional, but helpful for tracking)
    let deviceId: string | undefined;
    try {
      deviceId = await getDeviceIdentifier();
    } catch (deviceError) {
      console.warn('Failed to get device identifier (non-critical):', deviceError);
      // Continue without device ID - it's optional
    }

    const platform = Platform.OS; // Should be 'ios' or 'android'

    // Log registration attempt for debugging
    console.log('Attempting to register push token:', {
      platform: platform,
      hasToken: !!expoToken,
      hasDeviceId: !!deviceId,
      tokenPrefix: expoToken?.substring(0, 20),
      tokenLength: expoToken?.length,
    });

    // Register token with backend
    const { data: registrationData, error } = await supabase.functions.invoke('register-push-token', {
      body: {
        expo_push_token: expoToken,
        device_id: deviceId,
        platform, // Explicitly send platform ('ios' or 'android')
      },
    });

    if (error) {
      console.error('Push token registration error:', {
        error,
        message: error.message,
        details: error.details,
        platform,
        tokenPrefix: expoToken?.substring(0, 20),
      });
      return { 
        registered: false, 
        reason: `Backend registration failed: ${error.message || 'Unknown error'}` 
      };
    }

    console.log('Push token registered successfully:', {
      platform,
      tokenPrefix: expoToken?.substring(0, 20),
      backendResponse: registrationData,
    });
    return { registered: true, token: expoToken };
  } catch (error) {
    console.error('Error registering for push notifications:', error);
    return { registered: false, reason: error instanceof Error ? error.message : 'Unknown error' };
  }
};

/**
 * Set up notification listeners for handling incoming notifications
 * Should be called after registering for push notifications
 */
export const setupNotificationListeners = () => {
  const notifications = initializeNotifications();
  if (!notifications) {
    return null;
  }

  // Listener for notifications received while app is in foreground
  const receivedSubscription = notifications.addNotificationReceivedListener((notification) => {
    console.log('Notification received (foreground):', {
      title: notification.request.content.title,
      body: notification.request.content.body,
      data: notification.request.content.data,
    });
    // The notification handler already handles displaying foreground notifications
    // This listener is mainly for logging and custom handling if needed
  });

  // Listener for when user taps on a notification
  const responseSubscription = notifications.addNotificationResponseReceivedListener((response) => {
    console.log('Notification tapped:', {
      title: response.notification.request.content.title,
      body: response.notification.request.content.body,
      data: response.notification.request.content.data,
    });

    // Handle navigation based on notification data if needed
    const data = response.notification.request.content.data;
    if (data) {
      // Example: Navigate to notifications screen or transaction details
      // You can customize this based on your app's navigation needs
      if (data.transactionType || data.reference) {
        // Could navigate to transaction details or notifications screen
        console.log('Notification contains transaction data, could navigate to details');
      }
    }
  });

  return {
    remove: () => {
      receivedSubscription.remove();
      responseSubscription.remove();
    },
  };
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
      trigger: {
        type: 'timeInterval',
        seconds,
      },
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
