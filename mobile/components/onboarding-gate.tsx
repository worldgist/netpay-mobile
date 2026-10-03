import { useEffect, useRef } from 'react';
import { Platform } from 'react-native';
import { useRouter, useSegments } from 'expo-router';
import { hasCompletedOnboarding } from '@/utils/onboarding';

/**
 * Ensures first-time native users see onboarding.
 * Web uses the marketing landing page instead — never bounce authed web users back there.
 */
export function OnboardingGate() {
  const router = useRouter();
  const segments = useSegments();
  const redirectingRef = useRef(false);

  useEffect(() => {
    if (Platform.OS === 'web') {
      return;
    }

    let active = true;

    const enforceOnboarding = async () => {
      if (redirectingRef.current) return;

      const completed = await hasCompletedOnboarding();
      if (!active || completed) return;

      const root = segments[0];
      if (root === 'onboarding' || root === 'splash' || root === 'auth' || root === 'open') {
        return;
      }

      redirectingRef.current = true;
      router.replace('/onboarding');
      redirectingRef.current = false;
    };

    void enforceOnboarding();

    return () => {
      active = false;
    };
  }, [router, segments]);

  return null;
}
