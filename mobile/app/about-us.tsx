import { ActivityIndicator, Pressable, StyleSheet, View } from 'react-native';
import { MaterialIcons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import { ThemedText } from '@/components/themed-text';
import { MarkdownContent } from '@/components/markdown-content';
import { SeoHead } from '@/components/seo-head';
import { ContentPageScreen } from '@/components/content-page-screen';
import {
  LandingShell,
  goLandingLogin,
  useLandingLayout,
} from '@/components/landing/landing-shell';
import { useAuthSession } from '@/hooks/use-auth-session';
import { useContentPage } from '@/hooks/use-content-page';
import {
  LANDING_ABOUT_FACTS,
  LANDING_ABOUT_VALUES,
  LANDING_BRAND as BRAND,
} from '@/constants/landing';

export default function AboutUsPage() {
  const router = useRouter();
  const { ready, isAuthenticated } = useAuthSession();
  const { isWide, contentWidth, cardWidth } = useLandingLayout();
  const { content, loading, error } = useContentPage('about_us');

  // Logged-in users get the in-app content chrome (same as privacy/terms).
  if (ready && isAuthenticated) {
    return <ContentPageScreen pageType="about_us" fallbackTitle="About Us" />;
  }

  const updatedAt = content?.updated_at
    ? new Date(content.updated_at).toLocaleDateString('en-US', {
        year: 'numeric',
        month: 'long',
        day: 'numeric',
      })
    : null;

  if (!ready) {
    return (
      <View style={styles.boot}>
        <ActivityIndicator size="large" color={BRAND.orange} />
      </View>
    );
  }

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

      <View style={[styles.factsWrap, { width: contentWidth }]}>
        <View style={[styles.factsRow, !isWide && styles.factsStack]}>
          {LANDING_ABOUT_FACTS.map((fact) => (
            <View key={fact.label} style={[styles.factItem, isWide && { flex: 1 }]}>
              <ThemedText style={styles.factValue}>{fact.value}</ThemedText>
              <ThemedText style={styles.factLabel}>{fact.label}</ThemedText>
            </View>
          ))}
        </View>
      </View>

      <View style={[styles.section, { width: contentWidth }]}>
        <ThemedText style={styles.sectionEyebrow}>OUR STORY</ThemedText>
        <ThemedText style={styles.sectionTitle}>Bill payments, made simple.</ThemedText>
        {loading ? (
          <View style={styles.centered}>
            <ActivityIndicator size="large" color={BRAND.orange} />
            <ThemedText style={styles.loadingText}>Loading About Us...</ThemedText>
          </View>
        ) : error || !content ? (
          <View style={styles.storyCard}>
            <ThemedText style={styles.fallbackTitle}>Who we are</ThemedText>
            <ThemedText style={styles.fallbackBody}>
              NetPay is a digital payments platform focused on making bill payments simple, fast and
              reliable. From airtime and data to electricity, cable TV and education services, we
              bring everyday payments into one secure place.
            </ThemedText>
            <ThemedText style={styles.fallbackBody}>
              We started with a clear idea: people should not need five apps, long queues or guesswork
              to keep the lights on, buy data or renew cable. NetPay puts those payments behind one
              wallet, with confirmations and receipts you can trust.
            </ThemedText>
            <ThemedText style={styles.fallbackBody}>
              {error
                ? 'Live About content is temporarily unavailable. Please check back soon.'
                : 'Whether you are topping up a phone, funding a wallet or settling a bill, NetPay is built to feel fast, clear and dependable.'}
            </ThemedText>
          </View>
        ) : (
          <View style={styles.storyCard}>
            <MarkdownContent content={content.content} />
          </View>
        )}
      </View>

      <View style={[styles.section, { width: contentWidth }]}>
        <ThemedText style={styles.sectionEyebrow}>WHAT WE BELIEVE</ThemedText>
        <ThemedText style={styles.sectionTitle}>Principles that shape every product decision.</ThemedText>
        <View style={styles.grid}>
          {LANDING_ABOUT_VALUES.map((value) => (
            <View key={value.title} style={[styles.valueCard, { width: cardWidth }]}>
              <View style={styles.iconWrap}>
                <MaterialIcons name={value.icon} size={26} color={BRAND.orange} />
              </View>
              <ThemedText style={styles.cardTitle}>{value.title}</ThemedText>
              <ThemedText style={styles.cardBody}>{value.description}</ThemedText>
            </View>
          ))}
        </View>
      </View>

      <View style={[styles.missionBand, { width: contentWidth }]}>
        <ThemedText style={styles.sectionEyebrow}>MISSION</ThemedText>
        <ThemedText style={styles.missionTitle}>
          Make everyday Nigerian payments feel instant, transparent and safe.
        </ThemedText>
        <ThemedText style={styles.missionBody}>
          That means fewer abandoned checkouts, clearer customer confirmation, stronger account
          security, and support channels people can actually reach when something needs attention.
        </ThemedText>
        <View style={styles.ctaRow}>
          <Pressable style={styles.cta} onPress={() => router.push('/services')}>
            <ThemedText style={styles.ctaText}>Explore services</ThemedText>
            <MaterialIcons name="arrow-forward" size={18} color="#fff" />
          </Pressable>
          <Pressable style={styles.secondaryCta} onPress={() => router.push('/contact-us')}>
            <ThemedText style={styles.secondaryCtaText}>Contact us</ThemedText>
          </Pressable>
        </View>
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
  boot: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#fff',
  },
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
  factsWrap: {
    alignSelf: 'center',
    paddingHorizontal: 20,
    paddingBottom: 28,
  },
  factsRow: {
    flexDirection: 'row',
    gap: 12,
    backgroundColor: BRAND.orangeWash,
    borderRadius: 16,
    padding: 16,
  },
  factsStack: {
    flexDirection: 'column',
  },
  factItem: {
    padding: 8,
    gap: 4,
  },
  factValue: {
    color: BRAND.navy,
    fontSize: 16,
    fontWeight: '800',
  },
  factLabel: {
    color: BRAND.muted,
    fontSize: 13,
  },
  section: {
    alignSelf: 'center',
    paddingHorizontal: 20,
    paddingBottom: 36,
    gap: 12,
  },
  sectionEyebrow: {
    color: BRAND.orange,
    fontWeight: '800',
    letterSpacing: 1.4,
    fontSize: 12,
  },
  sectionTitle: {
    color: BRAND.navy,
    fontSize: 26,
    fontWeight: '800',
    lineHeight: 32,
    maxWidth: 640,
    marginBottom: 8,
  },
  storyCard: {
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
  grid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 16,
  },
  valueCard: {
    backgroundColor: BRAND.white,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: BRAND.border,
    padding: 20,
    gap: 8,
  },
  iconWrap: {
    width: 48,
    height: 48,
    borderRadius: 14,
    backgroundColor: BRAND.orangeSoft,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 4,
  },
  cardTitle: {
    color: BRAND.navy,
    fontSize: 18,
    fontWeight: '800',
  },
  cardBody: {
    color: BRAND.text,
    fontSize: 14,
    lineHeight: 21,
  },
  missionBand: {
    alignSelf: 'center',
    marginHorizontal: 20,
    marginBottom: 28,
    backgroundColor: '#fff',
    borderRadius: 16,
    borderWidth: 1,
    borderColor: BRAND.border,
    padding: 24,
    gap: 12,
  },
  missionTitle: {
    color: BRAND.navy,
    fontSize: 24,
    fontWeight: '800',
    lineHeight: 32,
    maxWidth: 720,
  },
  missionBody: {
    color: BRAND.muted,
    fontSize: 15,
    lineHeight: 23,
    maxWidth: 720,
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
