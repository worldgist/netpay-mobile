import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  View,
  StyleSheet,
  TouchableOpacity,
  ActivityIndicator,
  ScrollView,
  Platform,
} from 'react-native';
import { Image } from 'expo-image';
import { useLocalSearchParams, usePathname, useRouter } from 'expo-router';
import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { supabase } from '@/lib/supabase';
import { SeoHead } from '@/components/seo-head';
import { NETPAY_MCP_URL } from '@/constants/site';
import { isChatgptOAuthRedirectAllowed } from '@/utils/chatgpt-oauth-redirect';

const BRAND = {
  orange: '#FF7F00',
  orangeDeep: '#E86F00',
  orangeSoft: '#FFF3E8',
  orangeBorder: '#FFE0C2',
  navy: '#1A2B4A',
  bg: '#F8F9FC',
  text: '#333333',
  muted: '#666666',
  border: '#E0E0E0',
  white: '#FFFFFF',
  error: '#D32F2F',
} as const;
/** Never take this from the query string — prevents refresh-token exfiltration. */
const MCP_CONSENT_COMPLETE_URL = `${NETPAY_MCP_URL}/oauth/consent/complete`;

type ConsentParams = {
  client_id?: string;
  redirect_uri?: string;
  response_type?: string;
  state?: string;
  scope?: string;
  code_challenge?: string;
  code_challenge_method?: string;
  resource?: string;
};

function firstParam(value: string | string[] | undefined): string {
  if (Array.isArray(value)) return value[0] || '';
  return value || '';
}

export default function ChatgptOauthConsentScreen() {
  const router = useRouter();
  const pathname = usePathname();
  const raw = useLocalSearchParams<ConsentParams>();
  const params = useMemo(
    () => ({
      client_id: firstParam(raw.client_id),
      redirect_uri: firstParam(raw.redirect_uri),
      response_type: firstParam(raw.response_type) || 'code',
      state: firstParam(raw.state),
      scope: firstParam(raw.scope) || 'netpay',
      code_challenge: firstParam(raw.code_challenge),
      code_challenge_method: firstParam(raw.code_challenge_method) || 'S256',
      resource: firstParam(raw.resource) || 'https://mcp.netppay.com/mcp',
    }),
    [raw],
  );

  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [email, setEmail] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const paramError = useMemo(() => {
    if (!params.client_id) return 'Missing client_id. Restart connect from ChatGPT.';
    if (!params.redirect_uri) return 'Missing redirect_uri. Restart connect from ChatGPT.';
    if (!isChatgptOAuthRedirectAllowed(params.redirect_uri)) {
      return 'This redirect_uri is not allowed for NetPay ChatGPT linking.';
    }
    if (params.response_type && params.response_type !== 'code') {
      return 'Unsupported response_type. NetPay only supports authorization code.';
    }
    if (!params.code_challenge) return 'Missing PKCE code_challenge. Restart connect from ChatGPT.';
    if (params.code_challenge_method !== 'S256') {
      return 'PKCE code_challenge_method must be S256.';
    }
    return null;
  }, [params]);

  const consentReturnPath = useMemo(() => {
    const q = new URLSearchParams();
    for (const [key, value] of Object.entries(params)) {
      if (value) q.set(key, value);
    }
    const base =
      pathname?.includes('/chatgpt/oauth/consent')
        ? '/chatgpt/oauth/consent'
        : '/open/chatgpt-consent';
    return `${base}?${q.toString()}`;
  }, [params, pathname]);

  const ensureSession = useCallback(async () => {
    if (paramError) {
      setLoading(false);
      setError(paramError);
      return;
    }

    setLoading(true);
    setError(null);
    const {
      data: { session },
    } = await supabase.auth.getSession();
    if (!session?.user) {
      router.replace(`/auth/login?returnTo=${encodeURIComponent(consentReturnPath)}`);
      return;
    }
    setEmail(session.user.email || session.user.id);
    setLoading(false);
  }, [consentReturnPath, paramError, router]);

  useEffect(() => {
    void ensureSession();
  }, [ensureSession]);

  const complete = async (approved: boolean) => {
    try {
      setSubmitting(true);
      setError(null);

      if (paramError) {
        throw new Error(paramError);
      }

      const {
        data: { session },
      } = await supabase.auth.getSession();
      if (!session?.access_token || !session.refresh_token) {
        router.replace(`/auth/login?returnTo=${encodeURIComponent(consentReturnPath)}`);
        return;
      }

      const response = await fetch(MCP_CONSENT_COMPLETE_URL, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          approved,
          client_id: params.client_id,
          redirect_uri: params.redirect_uri,
          state: params.state,
          code_challenge: params.code_challenge,
          code_challenge_method: params.code_challenge_method,
          scope: params.scope,
          resource: params.resource,
          supabase_access_token: session.access_token,
          supabase_refresh_token: session.refresh_token,
        }),
      });

      const payload = (await response.json()) as {
        redirect_to?: string;
        error?: string;
        error_description?: string;
      };
      if (!response.ok || !payload.redirect_to) {
        throw new Error(payload.error_description || payload.error || 'Consent failed');
      }

      let redirectHostOk = false;
      try {
        const target = new URL(payload.redirect_to);
        redirectHostOk =
          target.protocol === 'https:' &&
          (target.hostname === 'chatgpt.com' ||
            target.hostname.endsWith('.chatgpt.com') ||
            target.hostname === 'chat.openai.com' ||
            target.hostname.endsWith('.openai.com'));
      } catch {
        redirectHostOk = false;
      }
      if (!redirectHostOk) {
        throw new Error('OAuth redirect target rejected for safety.');
      }

      if (Platform.OS === 'web' && typeof window !== 'undefined') {
        window.location.href = payload.redirect_to;
        return;
      }

      router.replace(
        approved
          ? `/chatgpt/oauth/success?redirect=${encodeURIComponent(payload.redirect_to)}`
          : `/chatgpt/oauth/error?message=${encodeURIComponent('Access denied')}`,
      );
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unable to complete consent');
      setSubmitting(false);
    }
  };

  if (loading) {
    return (
      <ThemedView style={styles.center}>
        <ActivityIndicator color={BRAND.orange} size="large" />
        <ThemedText style={styles.loadingText}>Preparing secure ChatGPT connect…</ThemedText>
      </ThemedView>
    );
  }

  return (
    <ThemedView style={styles.container}>
      <SeoHead
        page="home"
        path="/open/chatgpt-consent"
        title="Connect NetPay to ChatGPT"
        description="Authorize ChatGPT to use your NetPay wallet with confirmation before every payment."
      />
      <ScrollView contentContainerStyle={styles.scrollContent}>
        <View style={styles.panel}>
          <View style={styles.hero}>
            <Image source={require('@/assets/images/logo.png')} style={styles.logo} contentFit="contain" />
            <ThemedText style={styles.headline}>Authorize ChatGPT</ThemedText>
            <ThemedText style={styles.sub}>
              {email
                ? `Signed in as ${email}. Review what ChatGPT can do with your NetPay account.`
                : 'Sign in to NetPay, then authorize ChatGPT.'}
            </ThemedText>
          </View>

          <View style={styles.card}>
            <ThemedText style={styles.cardTitle}>ChatGPT is requesting</ThemedText>
            <ThemedText style={styles.bullet}>• View your profile, wallet balance, and funding details</ThemedText>
            <ThemedText style={styles.bullet}>• View recent transactions</ThemedText>
            <ThemedText style={styles.bullet}>• Prepare airtime, data, bills, education, and transfers</ThemedText>
            <ThemedText style={styles.bullet}>• Complete payments only after you confirm in ChatGPT</ThemedText>
            <ThemedText style={styles.note}>
              Scope: {params.scope || 'netpay'} · Money never moves on this screen alone.
            </ThemedText>
          </View>

          {error ? <ThemedText style={styles.error}>{error}</ThemedText> : null}

          <TouchableOpacity
            style={[styles.primaryBtn, (submitting || !!paramError) && styles.disabled]}
            disabled={submitting || !!paramError}
            onPress={() => void complete(true)}
            accessibilityRole="button"
            accessibilityLabel="Authorize ChatGPT"
          >
            {submitting ? (
              <ActivityIndicator color={BRAND.white} />
            ) : (
              <ThemedText style={styles.primaryText}>Authorize</ThemedText>
            )}
          </TouchableOpacity>

          <TouchableOpacity
            style={[styles.secondaryBtn, submitting && styles.disabled]}
            disabled={submitting || !!paramError}
            onPress={() => void complete(false)}
            accessibilityRole="button"
            accessibilityLabel="Cancel authorization"
          >
            <ThemedText style={styles.secondaryText}>Cancel</ThemedText>
          </TouchableOpacity>

          <ThemedText style={styles.footer}>Secured by NetPay</ThemedText>
        </View>
      </ScrollView>
    </ThemedView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: BRAND.bg },
  center: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: BRAND.bg,
    padding: 24,
  },
  loadingText: { color: BRAND.muted, marginTop: 12 },
  scrollContent: {
    flexGrow: 1,
    padding: 24,
    paddingBottom: 48,
    justifyContent: 'center',
  },
  panel: {
    width: '100%',
    maxWidth: 440,
    alignSelf: 'center',
    backgroundColor: BRAND.white,
    borderRadius: 20,
    paddingHorizontal: 28,
    paddingTop: 36,
    paddingBottom: 28,
    shadowColor: '#1A2B4A',
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.08,
    shadowRadius: 16,
    elevation: 4,
  },
  hero: { alignItems: 'center', marginBottom: 8 },
  logo: { width: 112, height: 112, marginBottom: 4 },
  headline: {
    color: BRAND.navy,
    fontSize: 24,
    fontWeight: '700',
    marginTop: 12,
    textAlign: 'center',
  },
  sub: {
    color: BRAND.muted,
    fontSize: 15,
    lineHeight: 22,
    textAlign: 'center',
    marginTop: 8,
  },
  card: {
    backgroundColor: BRAND.orangeSoft,
    borderRadius: 14,
    padding: 16,
    borderWidth: 1,
    borderColor: BRAND.orangeBorder,
    marginTop: 20,
    marginBottom: 16,
  },
  cardTitle: { color: BRAND.navy, fontWeight: '700', fontSize: 15, marginBottom: 10 },
  bullet: { color: BRAND.text, fontSize: 14, lineHeight: 22, marginBottom: 4 },
  note: { color: BRAND.muted, fontSize: 12, marginTop: 10, lineHeight: 18 },
  error: { color: BRAND.error, marginBottom: 12, textAlign: 'center' },
  primaryBtn: {
    backgroundColor: BRAND.orange,
    borderRadius: 12,
    paddingVertical: 15,
    alignItems: 'center',
    marginBottom: 10,
  },
  primaryText: { color: BRAND.white, fontWeight: '700', fontSize: 16 },
  secondaryBtn: {
    borderRadius: 12,
    paddingVertical: 14,
    alignItems: 'center',
    borderWidth: 1.5,
    borderColor: BRAND.border,
    backgroundColor: BRAND.white,
  },
  secondaryText: { color: BRAND.navy, fontWeight: '600', fontSize: 15 },
  footer: {
    color: BRAND.muted,
    fontSize: 12,
    textAlign: 'center',
    marginTop: 18,
  },
  disabled: { opacity: 0.6 },
});
