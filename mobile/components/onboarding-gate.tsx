import { useEffect, useRef } from 'react';
import { Platform } from 'react-native';
import { useRouter, useSegments } from 'expo-router';
import { supabase } from '@/lib/supabase';
import { hasCompletedOnboarding } from '@/utils/onboarding';

/** Public marketing surfaces — logged-in users stay in the app until logout. */
const MARKETING_ROOTS = new Set([
  'landing',
  'features',
  'services',
  'buy',
  'search',
]);

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
      if (
        root === 'onboarding' ||
        root === 'splash' ||
        root === 'auth' ||
        root === 'open' ||
        root === 'chatgpt' ||
        root === 'sign-in-pin' ||
        root === 'forget-password' ||
        root === 'forgot-pin' ||
        root === 'reset-password'
      ) {
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

/**
 * Prevents authenticated users from browsing the marketing site.
 * In-app help pages (contact, privacy, terms, faq, support, about) stay reachable.
 * Does not touch auth / sign-in-pin.
 */
export function MarketingAuthGate() {
  const router = useRouter();
  const segments = useSegments();
  const redirectingRef = useRef(false);

  useEffect(() => {
    let active = true;

    const enforce = async () => {
      if (redirectingRef.current) return;

      const root = segments[0];
      if (!root || !MARKETING_ROOTS.has(root)) return;

      const {
        data: { session },
      } = await supabase.auth.getSession();
      if (!active || !session?.user) return;

      redirectingRef.current = true;
      router.replace('/(tabs)');
      redirectingRef.current = false;
    };

    void enforce();

    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((_event, session) => {
      if (!active || !session?.user) return;
      const root = segments[0];
      if (!root || !MARKETING_ROOTS.has(root)) return;
      if (redirectingRef.current) return;
      redirectingRef.current = true;
      router.replace('/(tabs)');
      redirectingRef.current = false;
    });

    return () => {
      active = false;
      subscription.unsubscribe();
    };
  }, [router, segments]);

  return null;
}
