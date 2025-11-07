import { DarkTheme, DefaultTheme, ThemeProvider } from '@react-navigation/native';
import { Stack } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import 'react-native-reanimated';

import { useColorScheme } from '@/hooks/use-color-scheme';

export const unstable_settings = {
  anchor: '(tabs)',
};

export default function RootLayout() {
  const colorScheme = useColorScheme();

  return (
    <ThemeProvider value={colorScheme === 'dark' ? DarkTheme : DefaultTheme}>
      <Stack>
        <Stack.Screen name="(tabs)" options={{ headerShown: false }} />
        <Stack.Screen name="modal" options={{ presentation: 'modal', title: 'Modal' }} />
        <Stack.Screen name="airtime-purchase" options={{ headerShown: false, presentation: 'card' }} />
        <Stack.Screen name="data-purchase" options={{ headerShown: false, presentation: 'card' }} />
        <Stack.Screen name="cable-tv" options={{ headerShown: false, presentation: 'card' }} />
        <Stack.Screen name="education" options={{ headerShown: false, presentation: 'card' }} />
        <Stack.Screen name="electricity" options={{ headerShown: false, presentation: 'card' }} />
        <Stack.Screen name="add-money" options={{ headerShown: false, presentation: 'card' }} />
        <Stack.Screen name="transfer" options={{ headerShown: false, presentation: 'card' }} />
        <Stack.Screen name="transfer-success" options={{ headerShown: false, presentation: 'card' }} />
        <Stack.Screen name="payment-success" options={{ headerShown: false, presentation: 'card' }} />
        <Stack.Screen name="transaction-details" options={{ headerShown: false, presentation: 'card' }} />
        <Stack.Screen name="splash" options={{ headerShown: false }} />
        <Stack.Screen name="onboarding" options={{ headerShown: false }} />
        <Stack.Screen name="auth/login" options={{ headerShown: false }} />
        <Stack.Screen name="auth/signup" options={{ headerShown: false }} />
        <Stack.Screen name="edit-profile" options={{ headerShown: false, presentation: 'card' }} />
        <Stack.Screen name="referral" options={{ headerShown: false, presentation: 'card' }} />
        <Stack.Screen name="contact-us" options={{ headerShown: false, presentation: 'card' }} />
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
  );
}
