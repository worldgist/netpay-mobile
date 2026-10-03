import { useEffect, useState } from 'react';
import { Platform } from 'react-native';
import { Redirect, type Href } from 'expo-router';
import { hasCompletedOnboarding } from '@/utils/onboarding';
import { isStandalonePwa } from '@/utils/pwa';

/**
 * Browser web: marketing landing.
 * Installed PWA: PIN unlock → home.
 * Native: splash / onboarding / login as before.
 */
export default function RootIndex() {
  const [nextRoute, setNextRoute] = useState<Href | null>(null);

  useEffect(() => {
    let mounted = true;

    const resolveStartupRoute = async () => {
      if (Platform.OS === 'web') {
        if (!mounted) return;
        setNextRoute(isStandalonePwa() ? '/sign-in-pin' : '/landing');
        return;
      }

      const completed = await hasCompletedOnboarding();
      if (!mounted) return;
      setNextRoute(completed ? '/auth/login' : '/splash');
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
