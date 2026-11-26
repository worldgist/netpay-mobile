import { ActivityIndicator, Pressable, StyleSheet, View } from 'react-native';
import { MaterialIcons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import { ThemedText } from '@/components/themed-text';
import { MarkdownContent } from '@/components/markdown-content';
import { SeoHead } from '@/components/seo-head';
import {
  LandingShell,
  goLandingLogin,
  useLandingLayout,
} from '@/components/landing/landing-shell';
import { useContentPage } from '@/hooks/use-content-page';
import { LANDING_BRAND as BRAND } from '@/constants/landing';

export default function AboutUsPage() {
  const router = useRouter();
  const { isWide, contentWidth } = useLandingLayout();
  const { content, loading, error } = useContentPage('about_us');

  const updatedAt = content?.updated_at
    ? new Date(content.updated_at).toLocaleDateString('en-US', {
        year: 'numeric',
        month: 'long',
        day: 'numeric',
      })
    : null;

  return (
    <LandingShell activeHref="/about-us">
      <SeoHead
        page="about"
        title={content?.title ? `${content.title} | NetPay` : undefined}
        description={content?.meta_description || undefined}
      />
      <View style={[styles.hero, { width: contentWidth }]}>
        <ThemedText style={styles.eyebrow}>ABOUT US</ThemedText>
        <ThemedText style={styles.title}>{content?.title || 'About NetPay'}</ThemedText>
        <ThemedText style={styles.subtitle}>
          {content?.meta_description ||
            'We help people pay everyday bills faster — airtime, data, electricity, cable, education and more — with a secure wallet built for Nigeria.'}
        </ThemedText>
        {updatedAt ? (
          <ThemedText style={styles.updated}>Last updated: {updatedAt}</ThemedText>
        ) : null}
      </View>

      <View style={[styles.contentWrap, { width: contentWidth }]}>
        {loading ? (
          <View style={styles.centered}>
            <ActivityIndicator size="large" color={BRAND.orange} />
            <ThemedText style={styles.loadingText}>Loading About Us...</ThemedText>
          </View>
        ) : error || !content ? (
          <View style={styles.card}>
            <ThemedText style={styles.fallbackTitle}>Who we are</ThemedText>
            <ThemedText style={styles.fallbackBody}>
              NetPay is a digital payments platform focused on making bill payments simple, fast and
              reliable. From airtime and data to electricity, cable TV and education services, we
              bring everyday payments into one secure place.
            </ThemedText>
            <ThemedText style={styles.fallbackBody}>
              {error
                ? 'Live About content is temporarily unavailable. Please check back soon.'
                : null}
            </ThemedText>
          </View>
        ) : (
          <View style={styles.card}>
            <MarkdownContent content={content.content} />
          </View>
        )}
      </View>

      <View style={[styles.bottomCta, { width: contentWidth }, !isWide && styles.bottomCtaStack]}>
        <View style={{ flex: 1 }}>
          <ThemedText style={styles.bottomTitle}>Join NetPay today</ThemedText>
          <ThemedText style={styles.bottomDesc}>
            Create an account or login to start paying bills the smarter way.
          </ThemedText>
        </View>
        <View style={[styles.ctaRow, !isWide && { width: '100%' }]}>
          <Pressable style={styles.cta} onPress={() => void goLandingLogin(router)}>
            <ThemedText style={styles.ctaText}>Login</ThemedText>
            <MaterialIcons name="arrow-forward" size={18} color="#fff" />
          </Pressable>
          <Pressable style={styles.secondaryCta} onPress={() => router.push('/auth/signup')}>
            <ThemedText style={styles.secondaryCtaText}>Sign up</ThemedText>
          </Pressable>
        </View>
      </View>
    </LandingShell>
  );
}

const styles = StyleSheet.create({
  hero: {
    alignSelf: 'center',
    paddingHorizontal: 20,
    paddingTop: 48,
    paddingBottom: 28,
    gap: 14,
  },
  eyebrow: {
    color: BRAND.orange,
    fontWeight: '800',
    letterSpacing: 1.4,
    fontSize: 12,
  },
  title: {
    color: BRAND.navy,
    fontSize: 36,
    fontWeight: '800',
    lineHeight: 42,
    maxWidth: 720,
  },
  subtitle: {
    color: BRAND.muted,
    fontSize: 17,
    lineHeight: 26,
    maxWidth: 680,
  },
  updated: {
    color: BRAND.orange,
    fontSize: 13,
    fontStyle: 'italic',
    fontWeight: '500',
  },
  contentWrap: {
    alignSelf: 'center',
    paddingHorizontal: 20,
    paddingBottom: 28,
  },
  card: {
    backgroundColor: '#fff',
    borderRadius: 16,
    borderWidth: 1,
    borderColor: BRAND.border,
    padding: 22,
    borderLeftWidth: 4,
    borderLeftColor: BRAND.orange,
  },
  centered: {
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 48,
    gap: 12,
  },
  loadingText: {
    color: BRAND.muted,
    fontSize: 15,
  },
  fallbackTitle: {
    color: BRAND.navy,
    fontSize: 22,
    fontWeight: '800',
    marginBottom: 10,
  },
  fallbackBody: {
    color: BRAND.text,
    fontSize: 15,
    lineHeight: 23,
    marginBottom: 10,
  },
  bottomCta: {
    alignSelf: 'center',
    marginHorizontal: 20,
    marginBottom: 48,
    backgroundColor: BRAND.orangeWash,
    borderRadius: 20,
    padding: 24,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 20,
  },
  bottomCtaStack: {
    flexDirection: 'column',
    alignItems: 'flex-start',
  },
  bottomTitle: {
    color: BRAND.navy,
    fontSize: 22,
    fontWeight: '800',
    marginBottom: 6,
  },
  bottomDesc: {
    color: BRAND.muted,
    fontSize: 15,
    lineHeight: 22,
  },
  ctaRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 10,
  },
  cta: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    backgroundColor: BRAND.orange,
    borderRadius: 999,
    paddingHorizontal: 18,
    paddingVertical: 12,
  },
  ctaText: {
    color: '#fff',
    fontWeight: '700',
    fontSize: 15,
  },
  secondaryCta: {
    borderRadius: 999,
    paddingHorizontal: 18,
    paddingVertical: 12,
    borderWidth: 1.5,
    borderColor: BRAND.orange,
    backgroundColor: '#fff',
  },
  secondaryCtaText: {
    color: BRAND.orange,
    fontWeight: '700',
    fontSize: 15,
  },
});
