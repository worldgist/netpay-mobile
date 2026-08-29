import { useEffect, useRef } from 'react';
import { ActivityIndicator, StyleSheet, View } from 'react-native';
import * as Linking from 'expo-linking';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { ThemedText } from '@/components/themed-text';
import { completeEmailVerificationFromLink } from '@/utils/email-verification';
import { parseAuthLinkParams } from '@/utils/parse-auth-link-params';
import { buildRouteHref } from '@/utils/router-href';

/**
 * Universal-link entry for https://netppay.com/open/verify-email
 * Completes email verification from the signup email link, then continues signup.
 */
export default function VerifyEmailDeepLinkScreen() {
  const router = useRouter();
  const params = useLocalSearchParams<Record<string, string | string[]>>();
  const handledRef = useRef(false);

  useEffect(() => {
    if (handledRef.current) {
      return;
    }
    handledRef.current = true;

    void (async () => {
      const initialUrl = (await Linking.getInitialURL()) || '';
      const authParams = parseAuthLinkParams(initialUrl, params);

      if (authParams.error) {
        router.replace(
          buildRouteHref('/email-verification', {
            ...(authParams.email ? { email: authParams.email } : {}),
          }),
        );
        return;
      }

      if (
        authParams.accessToken ||
        authParams.refreshToken ||
        authParams.tokenHash ||
        authParams.code
      ) {
        const { data, error } = await completeEmailVerificationFromLink({
          accessToken: authParams.accessToken,
          refreshToken: authParams.refreshToken,
          tokenHash: authParams.tokenHash,
          type: authParams.type,
          code: authParams.code,
        });

        if (!error && data.session) {
          router.replace('/setup-pin');
          return;
        }
      }

      router.replace(
        buildRouteHref('/email-verification', {
          ...(authParams.email ? { email: authParams.email } : {}),
          ...(authParams.accessToken ? { access_token: authParams.accessToken } : {}),
          ...(authParams.refreshToken ? { refresh_token: authParams.refreshToken } : {}),
          ...(authParams.tokenHash ? { token_hash: authParams.tokenHash } : {}),
          ...(authParams.type ? { type: authParams.type } : {}),
          ...(authParams.code ? { code: authParams.code } : {}),
        }),
      );
    })();
  }, [params, router]);

  return (
    <View style={styles.container}>
      <ActivityIndicator size="large" color="#FF7F00" />
      <ThemedText style={styles.message}>Verifying your email...</ThemedText>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#F8F9FC',
    paddingHorizontal: 24,
    gap: 16,
  },
  message: {
    fontSize: 16,
    color: '#666',
    textAlign: 'center',
  },
});
