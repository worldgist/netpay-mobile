import { useEffect } from 'react';
import { Platform, View, StyleSheet, ActivityIndicator } from 'react-native';
import { Redirect } from 'expo-router';
import { WebLandingPage } from '@/components/landing/web-landing-page';
import { AddToHomeScreenBanner } from '@/components/landing/add-to-home-screen';
import { SeoHead } from '@/components/seo-head';
import { useAuthSession } from '@/hooks/use-auth-session';
import { markOnboardingCompleted } from '@/utils/onboarding';
import { isStandalonePwa } from '@/utils/pwa';
import { LANDING_BRAND as BRAND } from '@/constants/landing';

export default function LandingScreen() {
  const { ready, isAuthenticated } = useAuthSession();

  useEffect(() => {
    void markOnboardingCompleted();
  }, []);

  // Installed PWA must never show marketing — go straight to login.
  if (Platform.OS === 'web' && typeof window !== 'undefined' && isStandalonePwa()) {
    return <Redirect href="/auth/login" />;
  }

  // Logged-in users stay in the app until logout.
  if (ready && isAuthenticated) {
    return <Redirect href="/(tabs)" />;
  }

  if (!ready) {
    return (
      <View style={styles.boot}>
        <ActivityIndicator size="large" color={BRAND.orange} />
      </View>
    );
  }

  return (
    <>
      <SeoHead page="home" />
      <View style={styles.root}>
        <WebLandingPage />
        {Platform.OS === 'web' ? <AddToHomeScreenBanner /> : null}
      </View>
    </>
  );
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
  },
  boot: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#fff',
  },
});
