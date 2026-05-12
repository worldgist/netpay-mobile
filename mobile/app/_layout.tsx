import { DarkTheme, DefaultTheme, ThemeProvider } from '@react-navigation/native';
import { Stack, router } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { useEffect, useRef } from 'react';
import * as Linking from 'expo-linking';
import 'react-native-reanimated';
import { AuthApiError } from '@supabase/supabase-js';

import { useColorScheme } from '@/hooks/use-color-scheme';
import { ErrorBoundary } from '@/components/error-boundary';
import { supabase } from '@/lib/supabase';
import { registerForPushNotifications, setupNotificationListeners } from '@/utils/push-notifications';
import '@/utils/error-handler'; // Initialize error handler
import { Alert, LogBox } from 'react-native';

// Suppress handled network errors in development
if (__DEV__) {
  LogBox.ignoreLogs([
    'Network request failed',
    'TypeError: Network request failed',
    'fetch.umd.js',
  ]);
}

export const unstable_settings = {
  anchor: '(tabs)',
};

const handleDeepLink = (url: string) => {
  try {
    if (!url) return;
    console.log('Handling deep link:', url);
    
    const parsed = Linking.parse(url);
    const path = parsed.path || parsed.hostname;

    if (!path) {
      console.log('No path found in URL');
      return;
    }

    const query = parsed.queryParams ?? {};
    let accessToken: string | undefined;
    let refreshToken: string | undefined;
    let type: string | undefined;

    // Extract from query params
    if (typeof query.access_token === 'string') {
      accessToken = query.access_token;
    }
    if (typeof query.refresh_token === 'string') {
      refreshToken = query.refresh_token;
    }
    if (typeof query.type === 'string') {
      type = query.type;
    }

    // Also check hash fragment (Supabase often sends tokens here)
    if (url.includes('#')) {
      try {
        const hashPart = url.split('#')[1];
        if (hashPart) {
          // Try URLSearchParams first
          try {
            const hashParams = new URLSearchParams(hashPart);
            accessToken = accessToken || hashParams.get('access_token') || undefined;
            refreshToken = refreshToken || hashParams.get('refresh_token') || undefined;
            type = type || hashParams.get('type') || undefined;
          } catch (e) {
            // If URLSearchParams fails, try manual parsing
            const hashPairs = hashPart.split('&');
            for (const pair of hashPairs) {
              const [key, value] = pair.split('=');
              if (key === 'access_token' && value) {
                accessToken = decodeURIComponent(value);
              }
              if (key === 'refresh_token' && value) {
                refreshToken = decodeURIComponent(value);
              }
              if (key === 'type' && value) {
                type = decodeURIComponent(value);
              }
            }
          }
        }
      } catch (err) {
        console.error('Error parsing hash fragment:', err);
      }
    }

    console.log('Extracted tokens:', { hasAccessToken: !!accessToken, hasRefreshToken: !!refreshToken, type });

    // NetPay AI app: netpay://pay?screen=data_purchase
    const normalizedPath = String(path).replace(/\/+$/, '');
    if (normalizedPath === 'pay') {
      const screen = typeof query.screen === 'string' ? query.screen.trim() : '';
      const payRoutes: Record<string, string> = {
        data_purchase: '/data-purchase',
        airtime: '/airtime-purchase',
        electricity: '/electricity',
        cable_tv: '/cable-tv',
        education: '/education',
        betting: '/betting',
        flight_booking: '/flight-booking',
        pay_bills: '/(tabs)/pay-bills',
        support_chat: '/support-chat',
        support_admin: '/support-admin',
        add_money: '/add-money',
        transfer: '/transfer',
      };
      const target = payRoutes[screen];
      if (target) {
        router.push(target as import('expo-router').Href);
        return;
      }
    }

    if (path === 'reset-password' || path === 'reset-password/' || path.includes('reset-password')) {
      const params: Record<string, string> = {};
      if (accessToken) params.access_token = accessToken;
      if (refreshToken) params.refresh_token = refreshToken;
      if (type) params.type = type;

      console.log('Navigating to reset-password with params:', Object.keys(params));
      router.push({
        pathname: '/reset-password',
        params,
      });
    }
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
      'Push notifications do not work in Expo Go on Android. Build and install a development build (or production APK/AAB), then test again.',
    );
  };

  useEffect(() => {
    const subscription = Linking.addEventListener('url', ({ url }) => handleDeepLink(url));

    (async () => {
      const initialUrl = await Linking.getInitialURL();
      if (initialUrl) {
        handleDeepLink(initialUrl);
      }
    })();

    return () => subscription.remove();
  }, []);

  // Register for push notifications when user is authenticated
  useEffect(() => {
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
      <ThemeProvider value={colorScheme === 'dark' ? DarkTheme : DefaultTheme}>
        <Stack>
          <Stack.Screen name="(tabs)" options={{ headerShown: false }} />
          <Stack.Screen name="modal" options={{ presentation: 'modal', title: 'Modal' }} />
          <Stack.Screen name="airtime-purchase" options={{ headerShown: false, presentation: 'card' }} />
          <Stack.Screen name="data-purchase" options={{ headerShown: false, presentation: 'card' }} />
          <Stack.Screen name="cable-tv" options={{ headerShown: false, presentation: 'card' }} />
          <Stack.Screen name="education" options={{ headerShown: false, presentation: 'card' }} />
          <Stack.Screen name="electricity" options={{ headerShown: false, presentation: 'card' }} />
          <Stack.Screen name="betting" options={{ headerShown: false, presentation: 'card' }} />
          <Stack.Screen name="add-money" options={{ headerShown: false, presentation: 'card' }} />
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
          <Stack.Screen name="support-chat" options={{ headerShown: false, presentation: 'card' }} />
          <Stack.Screen name="support-inbox" options={{ headerShown: false, presentation: 'card' }} />
          <Stack.Screen name="support-admin" options={{ headerShown: false, presentation: 'card' }} />
          <Stack.Screen name="notifications" options={{ headerShown: false, presentation: 'card' }} />
          <Stack.Screen name="security" options={{ headerShown: false, presentation: 'card' }} />
          <Stack.Screen name="change-password" options={{ headerShown: false, presentation: 'card' }} />
          <Stack.Screen name="change-pin" options={{ headerShown: false, presentation: 'card' }} />
          <Stack.Screen name="terms-and-conditions" options={{ headerShown: false, presentation: 'card' }} />
          <Stack.Screen name="privacy-policy" options={{ headerShown: false, presentation: 'card' }} />
          <Stack.Screen name="email-verification" options={{ headerShown: false, presentation: 'card' }} />
          <Stack.Screen name="setup-pin" options={{ headerShown: false, presentation: 'card' }} />
          <Stack.Screen name="setup-biometric" options={{ headerShown: false, presentation: 'card' }} />
          <Stack.Screen name="forget-password" options={{ headerShown: false, presentation: 'card' }} />
          <Stack.Screen name="reset-password" options={{ headerShown: false, presentation: 'card' }} />
          <Stack.Screen name="sign-in-pin" options={{ headerShown: false, presentation: 'card' }} />
        </Stack>
        <StatusBar style="auto" />
      </ThemeProvider>
    </ErrorBoundary>
  );
}
