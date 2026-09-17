import { DarkTheme, DefaultTheme, ThemeProvider } from 'expo-router/react-navigation';
import { Stack } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { useEffect, useRef } from 'react';
import * as Linking from 'expo-linking';
import 'react-native-reanimated';
import { AuthApiError } from '@supabase/supabase-js';

import { useColorScheme } from '@/hooks/use-color-scheme';
import { ErrorBoundary } from '@/components/error-boundary';
import { ProfileProvider } from '@/contexts/profile-context';
import { TransactionsProvider } from '@/contexts/transactions-context';
import { VendingSettingsProvider } from '@/contexts/vending-settings-context';
import { ServiceLogosProvider } from '@/contexts/service-logos-context';
import { supabase } from '@/lib/supabase';
import { handleAppLink } from '@/utils/handle-app-link';
import { clearAppCache } from '@/utils/clear-app-cache';
import { registerForPushNotifications, setupNotificationListeners, isPushNotificationsEnabled, preparePushNotificationEnvironment, getPushEnvironmentBlocker } from '@/utils/push-notifications';
import { Platform } from 'react-native';
import * as SplashScreen from 'expo-splash-screen';
import '@/utils/error-handler'; // Initialize error handler
import { Alert, LogBox } from 'react-native';
import { OnboardingGate } from '@/components/onboarding-gate';

// Suppress handled network errors in development
if (__DEV__) {
  LogBox.ignoreLogs([
    'Network request failed',
    'TypeError: Network request failed',
    'fetch.umd.js',
  ]);
}

export const unstable_settings = {
  anchor: 'index',
  initialRouteName: 'index',
};

const handleDeepLink = (url: string) => {
  try {
    if (!url) return;
    console.log('Handling deep link:', url);
    handleAppLink(url);
  } catch (error) {
    console.error('Error handling deep link:', error);
  }
};

export default function RootLayout() {
  const colorScheme = useColorScheme();
  const hasShownPushSetupAlertRef = useRef(false);

  const maybeShowPushSetupAlert = (reason?: string) => {
    if (!reason || hasShownPushSetupAlertRef.current) {
      return;
    }

    const normalizedReason = reason.toLowerCase();
    const isExpoGoAndroidLimitation =
      normalizedReason.includes('android push notifications are not available in expo go') ||
      normalizedReason.includes('development build');

    if (!isExpoGoAndroidLimitation) {
      return;
    }

    hasShownPushSetupAlertRef.current = true;
    Alert.alert(
      'Android Notifications Setup',
      'Push notifications do not work in Expo Go on Android. Install a NetPay development or production build on your phone, then run:\n\nnpm run start:dev\n\nOpen the installed NetPay app (not Expo Go) to connect to Metro.',
    );
  };

  useEffect(() => {
    void SplashScreen.hideAsync();

    if (Platform.OS !== 'web') {
      void preparePushNotificationEnvironment();

      const environmentBlocker = getPushEnvironmentBlocker();
      if (Platform.OS === 'android' && environmentBlocker) {
        maybeShowPushSetupAlert(environmentBlocker);
      }
    }

    const subscription = Linking.addEventListener('url', ({ url }) => handleDeepLink(url));

    (async () => {
      const initialUrl = await Linking.getInitialURL();
      if (initialUrl) {
        handleDeepLink(initialUrl);
      }
    })();

    return () => subscription.remove();
  }, []);

  // Register for push notifications when user is authenticated (native only)
  useEffect(() => {
    if (Platform.OS === 'web') {
      return;
    }

    let notificationListeners: ReturnType<typeof setupNotificationListeners> | null = null;

    const checkAndRegisterPush = async () => {
      try {
        const { data: { session }, error } = await supabase.auth.getSession();
        
        // Handle invalid refresh token error gracefully
        if (error) {
          if (error instanceof AuthApiError && 
              (error.message?.toLowerCase().includes('invalid refresh token') || 
               error.message?.toLowerCase().includes('refresh token not found'))) {
            console.log('Invalid refresh token detected, signing out user');
            await supabase.auth.signOut();
            return;
          }
          console.error('Error getting session:', error);
          return;
        }
        
        if (session?.user) {
          const pushEnabled = await isPushNotificationsEnabled();
          if (!pushEnabled) {
            console.log('Push notifications disabled in profile settings');
            return;
          }

          const result = await registerForPushNotifications();
          if (result.registered) {
            console.log('Push notifications registered successfully');
            // Set up notification listeners after successful registration
            notificationListeners = setupNotificationListeners();
            if (notificationListeners) {
              console.log('Notification listeners set up successfully');
            }
          } else {
            console.log('Push notification registration:', result.reason);
            maybeShowPushSetupAlert(result.reason);
          }
        }
      } catch (error) {
        console.error('Error registering push notifications:', error);
        // If it's a refresh token error, sign out the user
        if (error instanceof AuthApiError && 
            (error.message?.toLowerCase().includes('invalid refresh token') || 
             error.message?.toLowerCase().includes('refresh token not found'))) {
          try {
            await supabase.auth.signOut();
          } catch (signOutError) {
            console.error('Error signing out:', signOutError);
          }
        }
      }
    };

    // Register immediately if user is already logged in
    checkAndRegisterPush();

    // Also listen for auth state changes
    const { data: { subscription: authSubscription } } = supabase.auth.onAuthStateChange(
      async (event, session) => {
        if (event === 'SIGNED_IN' && session?.user) {
          const pushEnabled = await isPushNotificationsEnabled();
          if (!pushEnabled) {
            console.log('Push notifications disabled in profile settings');
            return;
          }

          const result = await registerForPushNotifications();
          if (result.registered) {
            console.log('Push notifications registered after sign in');
            // Set up notification listeners after successful registration
            notificationListeners = setupNotificationListeners();
            if (notificationListeners) {
              console.log('Notification listeners set up successfully');
            }
          } else {
            console.log('Push notification registration after sign in:', result.reason);
            maybeShowPushSetupAlert(result.reason);
          }
        } else if (event === 'SIGNED_OUT') {
          void clearAppCache();
          // Remove listeners when user signs out
          if (notificationListeners) {
            notificationListeners.remove();
            notificationListeners = null;
          }
        }
      }
    );

    return () => {
      authSubscription?.unsubscribe();
      if (notificationListeners) {
        notificationListeners.remove();
      }
    };
  }, []);

  return (
    <ErrorBoundary>
      <ProfileProvider>
        <VendingSettingsProvider>
        <ServiceLogosProvider>
        <TransactionsProvider>
        <ThemeProvider value={colorScheme === 'dark' ? DarkTheme : DefaultTheme}>
        <OnboardingGate />
        <Stack initialRouteName="index">
          <Stack.Screen name="index" options={{ headerShown: false }} />
          <Stack.Screen name="(tabs)" options={{ headerShown: false }} />
          <Stack.Screen name="modal" options={{ presentation: 'modal', title: 'Modal' }} />
          <Stack.Screen name="airtime-purchase" options={{ headerShown: false, presentation: 'card' }} />
          <Stack.Screen name="data-purchase" options={{ headerShown: false, presentation: 'card' }} />
          <Stack.Screen name="cable-tv" options={{ headerShown: false, presentation: 'card' }} />
          <Stack.Screen name="education" options={{ headerShown: false, presentation: 'card' }} />
          <Stack.Screen name="electricity" options={{ headerShown: false, presentation: 'card' }} />
          <Stack.Screen name="betting" options={{ headerShown: false, presentation: 'card' }} />
          <Stack.Screen name="flight-results" options={{ headerShown: false, presentation: 'card' }} />
          <Stack.Screen name="flight-details" options={{ headerShown: false, presentation: 'card' }} />
          <Stack.Screen name="flight-fare-rules" options={{ headerShown: false, presentation: 'card' }} />
          <Stack.Screen name="flight-traveller-info" options={{ headerShown: false, presentation: 'card' }} />
          <Stack.Screen name="flight-booking-success" options={{ headerShown: false, presentation: 'card' }} />
          <Stack.Screen name="add-money" options={{ headerShown: false, presentation: 'card' }} />
          <Stack.Screen name="add-money-callback" options={{ headerShown: false, presentation: 'card' }} />
          <Stack.Screen name="transfer" options={{ headerShown: false, presentation: 'card' }} />
          <Stack.Screen name="transfer-success" options={{ headerShown: false, presentation: 'card' }} />
          <Stack.Screen name="payment-success" options={{ headerShown: false, presentation: 'card' }} />
          <Stack.Screen name="transaction-details" options={{ headerShown: false, presentation: 'card' }} />
          <Stack.Screen name="splash" options={{ headerShown: false }} />
          <Stack.Screen name="onboarding" options={{ headerShown: false }} />
          <Stack.Screen name="auth/login" options={{ headerShown: false }} />
          <Stack.Screen name="auth/signup" options={{ headerShown: false }} />
          <Stack.Screen name="delete-account" options={{ headerShown: false, presentation: 'card' }} />
          <Stack.Screen name="edit-profile" options={{ headerShown: false, presentation: 'card' }} />
          <Stack.Screen name="statement-of-account" options={{ headerShown: false, presentation: 'card' }} />
          <Stack.Screen name="referral" options={{ headerShown: false, presentation: 'card' }} />
          <Stack.Screen name="contact-us" options={{ headerShown: false, presentation: 'card' }} />
          <Stack.Screen name="notifications" options={{ headerShown: false, presentation: 'card' }} />
          <Stack.Screen name="security" options={{ headerShown: false, presentation: 'card' }} />
          <Stack.Screen name="change-password" options={{ headerShown: false, presentation: 'card' }} />
          <Stack.Screen name="change-pin" options={{ headerShown: false, presentation: 'card' }} />
          <Stack.Screen name="forgot-pin" options={{ headerShown: false, presentation: 'card' }} />
          <Stack.Screen name="terms-and-conditions" options={{ headerShown: false, presentation: 'card' }} />
          <Stack.Screen name="privacy-policy" options={{ headerShown: false, presentation: 'card' }} />
          <Stack.Screen name="email-verification" options={{ headerShown: false, presentation: 'card' }} />
          <Stack.Screen name="open/verify-email" options={{ headerShown: false, presentation: 'card' }} />
          <Stack.Screen name="setup-pin" options={{ headerShown: false, presentation: 'card' }} />
          <Stack.Screen name="setup-biometric" options={{ headerShown: false, presentation: 'card' }} />
          <Stack.Screen name="forget-password" options={{ headerShown: false, presentation: 'card' }} />
          <Stack.Screen name="reset-password" options={{ headerShown: false, presentation: 'card' }} />
          <Stack.Screen name="sign-in-pin" options={{ headerShown: false, presentation: 'card' }} />
        </Stack>
        <StatusBar style="auto" />
        </ThemeProvider>
        </TransactionsProvider>
        </ServiceLogosProvider>
        </VendingSettingsProvider>
      </ProfileProvider>
    </ErrorBoundary>
  );
}
