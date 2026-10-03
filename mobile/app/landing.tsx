import { useEffect } from 'react';
import { Platform, View, StyleSheet } from 'react-native';
import { Redirect } from 'expo-router';
import { WebLandingPage } from '@/components/landing/web-landing-page';
import { AddToHomeScreenBanner } from '@/components/landing/add-to-home-screen';
import { SeoHead } from '@/components/seo-head';
import { markOnboardingCompleted } from '@/utils/onboarding';
import { isStandalonePwa } from '@/utils/pwa';

export default function LandingScreen() {
  useEffect(() => {
    void markOnboardingCompleted();
  }, []);

  // Installed PWA must never show marketing — go straight to PIN.
  if (Platform.OS === 'web' && typeof window !== 'undefined' && isStandalonePwa()) {
    return <Redirect href="/sign-in-pin" />;
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
});
