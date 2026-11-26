import { useEffect, useState } from 'react';
import { Platform } from 'react-native';
import { Redirect, type Href } from 'expo-router';
import { supabase } from '@/lib/supabase';
import { hasCompletedOnboarding } from '@/utils/onboarding';
import { getPreferredLoginRoute } from '@/utils/preferred-login-route';
import { isStandalonePwa } from '@/utils/pwa';

/**
 * Browser web: marketing landing (guests) or app tabs (logged in).
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
        if (isStandalonePwa()) {
          setNextRoute('/auth/login');
          return;
        }

        try {
          const {
            data: { session },
          } = await supabase.auth.getSession();
          if (!mounted) return;
          setNextRoute(session?.user ? '/(tabs)' : '/landing');
        } catch {
          if (!mounted) return;
          setNextRoute('/landing');
        }
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
