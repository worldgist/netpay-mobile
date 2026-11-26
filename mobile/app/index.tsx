import { useEffect, useState } from 'react';
import { Platform } from 'react-native';
import { Redirect, type Href } from 'expo-router';
import { hasCompletedOnboarding } from '@/utils/onboarding';
import { getPreferredLoginRoute } from '@/utils/preferred-login-route';
import { isStandalonePwa } from '@/utils/pwa';

/**
 * Browser web: marketing landing.
 * Installed PWA: login screen (password login; PIN available after email is remembered).
 * Returning native users: preferred login (PIN when available).
 * First-time native: splash / onboarding / password login.
 */
export default function RootIndex() {
  const [nextRoute, setNextRoute] = useState<Href | null>(null);

  useEffect(() => {
    let mounted = true;

    const resolveStartupRoute = async () => {
      if (Platform.OS === 'web') {
        if (!mounted) return;
        // Installed PWA must never open the marketing site — always start at login.
        setNextRoute(isStandalonePwa() ? '/auth/login' : '/landing');
        return;
      }

      const completed = await hasCompletedOnboarding();
      if (!mounted) return;
      if (!completed) {
        setNextRoute('/splash');
        return;
      }
      setNextRoute(await getPreferredLoginRoute());
    };

    void resolveStartupRoute();

    return () => {
      mounted = false;
    };
  }, []);

  if (!nextRoute) {
    return null;
  }

  return <Redirect href={nextRoute} />;
}
