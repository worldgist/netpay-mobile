import { useEffect, useRef } from 'react';
import { StyleSheet, View } from 'react-native';
import { useRouter } from 'expo-router';
import { Image } from 'expo-image';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { ThemedText } from '@/components/themed-text';
import { NetpayLoadingAnimation } from '@/components/netpay-loading-animation';
import { hasCompletedOnboarding } from '@/utils/onboarding';

const LOGO = require('@/assets/images/logo.png');
const SPLASH_MIN_MS = 2200;

export default function SplashScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const hasNavigatedRef = useRef(false);

  useEffect(() => {
    let active = true;

    const showSplash = async () => {
      const [completed] = await Promise.all([
        hasCompletedOnboarding(),
        new Promise<void>((resolve) => {
          setTimeout(resolve, SPLASH_MIN_MS);
        }),
      ]);

      if (!active || hasNavigatedRef.current) {
        return;
      }

      hasNavigatedRef.current = true;
      router.replace(completed ? '/auth/login' : '/onboarding');
    };

    void showSplash();

    return () => {
      active = false;
    };
  }, [router]);

  return (
    <View style={[styles.container, { paddingTop: insets.top, paddingBottom: insets.bottom }]}>
      <View style={styles.content}>
        <View style={styles.logoWrap}>
          <Image source={LOGO} style={styles.logo} contentFit="contain" />
        </View>
        <ThemedText style={styles.title}>NetPay</ThemedText>
        <ThemedText style={styles.subtitle}>Pay bills, fund your wallet, and manage everyday payments in one place.</ThemedText>
      </View>

      <View style={styles.footer}>
        <NetpayLoadingAnimation message="Loading…" size={56} />
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#FFFFFF',
    paddingHorizontal: 32,
  },
  content: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  logoWrap: {
    width: 120,
    height: 120,
    borderRadius: 28,
    backgroundColor: '#FFF3E8',
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 24,
  },
  logo: {
    width: 84,
    height: 84,
  },
  title: {
    fontSize: 34,
    fontWeight: '800',
    color: '#1A2B4A',
    marginBottom: 12,
    letterSpacing: 0.3,
  },
  subtitle: {
    fontSize: 15,
    lineHeight: 22,
    color: '#667085',
    textAlign: 'center',
    maxWidth: 320,
  },
  footer: {
    alignItems: 'center',
    paddingBottom: 32,
  },
});
