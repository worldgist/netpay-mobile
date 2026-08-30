import { useEffect, useRef } from 'react';
import { useRouter, useSegments } from 'expo-router';
import { hasCompletedOnboarding } from '@/utils/onboarding';

/**
 * Ensures first-time users see onboarding even when Expo Router restores (tabs) or login.
 */
export function OnboardingGate() {
  const router = useRouter();
  const segments = useSegments();
  const redirectingRef = useRef(false);

  useEffect(() => {
    let active = true;

    const enforceOnboarding = async () => {
      if (redirectingRef.current) return;

      const completed = await hasCompletedOnboarding();
      if (!active || completed) return;

      const root = segments[0];
      if (root === 'onboarding' || root === 'splash') return;

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
