import { StyleSheet } from 'react-native';
import { ThemedView } from '@/components/themed-view';
import { NetpayLoadingAnimation } from '@/components/netpay-loading-animation';
import { useEffect } from 'react';
import { useRouter } from 'expo-router';
import * as SecureStore from 'expo-secure-store';
import * as LocalAuthentication from 'expo-local-authentication';
import { supabase, isSupabaseInitialized } from '@/lib/supabase';
import { isPendingBiometricReenrollment } from '@/utils/pending-biometric-reenrollment';
import { needsDeviceWelcomeSetup } from '@/utils/device-welcome';
import { buildRouteHref } from '@/utils/router-href';

const ONBOARDING_COMPLETED_KEY = 'onboarding_completed';
const EMAIL_KEY = 'supabase_email';

export default function SplashScreen() {
  const router = useRouter();

  useEffect(() => {
    let isMounted = true;

    const autoSignInWithBiometric = async (email: string): Promise<boolean> => {
      if (!isSupabaseInitialized()) {
        return false;
      }

      const hasHardware = await LocalAuthentication.hasHardwareAsync();
      const enrolled = await LocalAuthentication.isEnrolledAsync();
      if (!hasHardware || !enrolled) {
        return false;
      }

      const authResult = await LocalAuthentication.authenticateAsync({
        promptMessage: 'Sign in with Biometrics',
        cancelLabel: 'Cancel',
      });

      if (!authResult.success) {
        return false;
      }

      const { data, error } = await supabase.functions.invoke('sign-in-with-biometric', {
        body: { email },
      });

      if (error || !data?.success || !data?.token) {
        return false;
      }

      const otpType: 'email' | 'magiclink' = data.otpType === 'magiclink' ? 'magiclink' : 'email';
      const verifyResult = await supabase.auth.verifyOtp({
        email,
        token: data.token,
        type: otpType,
      });

      return !!verifyResult.data.session && !verifyResult.error;
    };

    const bootstrap = async () => {
      try {
        // Keep splash visible briefly for smoother startup transition.
        await new Promise((resolve) => setTimeout(resolve, 1200));

        const storedEmailRaw = await SecureStore.getItemAsync(EMAIL_KEY);
        const storedEmail = storedEmailRaw?.trim().toLowerCase() || '';
        const onboardingCompleted = await SecureStore.getItemAsync(ONBOARDING_COMPLETED_KEY);
        const hasReturningUser = storedEmail.length > 0;

        if (!onboardingCompleted && hasReturningUser) {
          await SecureStore.setItemAsync(ONBOARDING_COMPLETED_KEY, 'true');
        }

        if (hasReturningUser) {
          const skipBiometric = await isPendingBiometricReenrollment();
          if (skipBiometric) {
            if (!isMounted) return;
            router.replace('/auth/login');
            return;
          }

          const biometricSignedIn = await autoSignInWithBiometric(storedEmail);
          if (!isMounted) return;

          if (biometricSignedIn) {
            if (!isMounted) return;
            const {
              data: { session },
            } = await supabase.auth.getSession();
            if (session?.user?.id && (await needsDeviceWelcomeSetup(session.user.id))) {
              router.replace(buildRouteHref('/setup-biometric', { from: 'new_device' }));
              return;
            }
            router.replace('/(tabs)');
            return;
          }

          router.replace('/auth/login');
          return;
        }

        if (onboardingCompleted === 'true') {
          router.replace('/auth/login');
          return;
        }

        router.replace('/onboarding');
      } catch (error) {
        console.error('Splash bootstrap error:', error);
        if (!isMounted) return;
        router.replace('/auth/login');
      }
    };

    bootstrap();

    return () => {
      isMounted = false;
    };
  }, [router]);

  return (
    <ThemedView style={styles.container}>
      <NetpayLoadingAnimation />
    </ThemedView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: '#fff',
  },
});

