import { useEffect, useState } from 'react';
import { StyleSheet, View, Platform } from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import * as Linking from 'expo-linking';
import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { NetpayLoadingAnimation } from '@/components/netpay-loading-animation';
import { completeOAuthFromUrl } from '@/utils/google-auth';
import { navigateAfterAuthenticatedSession } from '@/utils/post-auth-navigation';
import { showAlert } from '@/utils/show-alert';

function buildCallbackUrlFromParams(params: Record<string, string | string[] | undefined>): string {
  const query = new URLSearchParams();
  for (const [key, value] of Object.entries(params)) {
    if (typeof value === 'string' && value) query.set(key, value);
    else if (Array.isArray(value) && value[0]) query.set(key, value[0]);
  }

  if (Platform.OS === 'web' && typeof window !== 'undefined') {
    // Prefer the real browser URL (includes hash tokens when present).
    return window.location.href;
  }

  const qs = query.toString();
  return Linking.createURL('auth/callback') + (qs ? `?${qs}` : '');
}

export default function AuthCallbackScreen() {
  const router = useRouter();
  const params = useLocalSearchParams<Record<string, string | string[] | undefined>>();
  const [message, setMessage] = useState('Completing Google sign-in…');

  useEffect(() => {
    let active = true;

    (async () => {
      try {
        const url = buildCallbackUrlFromParams(params);
        const result = await completeOAuthFromUrl(url);
        if (!active) return;

        if (result.error) {
          setMessage(result.error);
          showAlert('Google Sign-In', result.error);
          router.replace('/auth/login');
          return;
        }

        setMessage('Signed in. Redirecting…');
        await navigateAfterAuthenticatedSession(router);
      } catch (error) {
        if (!active) return;
        const msg =
          error instanceof Error ? error.message : 'Unable to complete Google sign-in.';
        setMessage(msg);
        showAlert('Google Sign-In', msg);
        router.replace('/auth/login');
      }
    })();

    return () => {
      active = false;
    };
  }, [params, router]);

  return (
    <ThemedView style={styles.container}>
      <View style={styles.card}>
        <NetpayLoadingAnimation size={48} strokeWidth={2.5} />
        <ThemedText style={styles.message}>{message}</ThemedText>
      </View>
    </ThemedView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#F8F9FC',
    justifyContent: 'center',
    alignItems: 'center',
    padding: 24,
  },
  card: {
    width: '100%',
    maxWidth: 420,
    backgroundColor: '#fff',
    borderRadius: 16,
    paddingVertical: 36,
    paddingHorizontal: 24,
    alignItems: 'center',
    gap: 16,
  },
  message: {
    fontSize: 15,
    color: '#555',
    textAlign: 'center',
    lineHeight: 22,
  },
});
