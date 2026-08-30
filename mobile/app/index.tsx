import { useEffect, useState } from 'react';
import { Redirect, type Href } from 'expo-router';
import { hasCompletedOnboarding } from '@/utils/onboarding';

export default function RootIndex() {
  const [nextRoute, setNextRoute] = useState<Href | null>(null);

  useEffect(() => {
    let mounted = true;

    const resolveStartupRoute = async () => {
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
