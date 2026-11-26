import {
  ActivityIndicator,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  TouchableOpacity,
  View,
} from 'react-native';
import { MaterialIcons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { MarkdownContent } from '@/components/markdown-content';
import { SeoHead } from '@/components/seo-head';
import { LandingShell, useLandingLayout } from '@/components/landing/landing-shell';
import { useAuthSession } from '@/hooks/use-auth-session';
import { useContentPage } from '@/hooks/use-content-page';
import { SEO_PAGES, type SeoPageKey } from '@/constants/seo';
import { LANDING_BRAND as BRAND } from '@/constants/landing';

type ContentPageScreenProps = {
  pageType: string;
  fallbackTitle: string;
  seoPage?: SeoPageKey;
  activeHref?: string;
  eyebrow?: string;
};

const PAGE_TYPE_TO_SEO: Record<string, SeoPageKey> = {
  privacy_policy: 'privacy',
  terms_conditions: 'terms',
  faq: 'faq',
  support: 'support',
  about_us: 'about',
};

const PAGE_TYPE_TO_HREF: Record<string, string> = {
  privacy_policy: '/privacy-policy',
  terms_conditions: '/terms-and-conditions',
  faq: '/faq',
  support: '/support',
  about_us: '/about-us',
};

export function ContentPageScreen({
  pageType,
  fallbackTitle,
  seoPage,
  activeHref,
  eyebrow,
}: ContentPageScreenProps) {
  const router = useRouter();
  const { ready, isAuthenticated } = useAuthSession();
  const { isWide, contentWidth } = useLandingLayout();
  const { content, loading, error } = useContentPage(pageType);
  const seoKey = seoPage || PAGE_TYPE_TO_SEO[pageType];
  const href = activeHref || PAGE_TYPE_TO_HREF[pageType] || '/landing';

  const title = content?.title || fallbackTitle;
  const updatedAt = content?.updated_at
    ? new Date(content.updated_at).toLocaleDateString('en-US', {
        year: 'numeric',
        month: 'long',
        day: 'numeric',
      })
    : null;

  const handleBack = () => {
    if ((router as { canGoBack?: () => boolean }).canGoBack?.()) {
      router.back();
      return;
    }
    router.replace('/(tabs)');
  };

  const seo = seoKey ? (
    <SeoHead
      page={seoKey}
      title={content?.title ? `${content.title} | NetPay` : SEO_PAGES[seoKey].title}
      description={content?.meta_description || undefined}
    />
  ) : null;

  if (!ready) {
    return (
      <ThemedView style={styles.appContainer}>
        {seo}
        <View style={styles.centered}>
          <ActivityIndicator size="large" color={BRAND.orange} />
        </View>
      </ThemedView>
    );
  }

  // Logged-in: stay in the app chrome (profile → privacy/terms/etc.).
  if (isAuthenticated) {
    return (
      <ThemedView style={styles.appContainer}>
        {seo}
        <View style={styles.orangeHeader}>
          <TouchableOpacity onPress={handleBack} style={styles.backButton}>
            <MaterialIcons name="arrow-back" size={24} color="#fff" />
          </TouchableOpacity>
          <ThemedText style={styles.headerTitle} numberOfLines={1}>
            {title}
          </ThemedText>
          <View style={styles.placeholder} />
        </View>

        <ScrollView
          style={styles.scrollView}
          contentContainerStyle={styles.scrollContent}
          showsVerticalScrollIndicator={false}>
          <View style={styles.content}>
            {loading ? (
              <View style={styles.centered}>
                <ActivityIndicator size="large" color="#FF7F00" />
                <ThemedText style={styles.loadingText}>Loading {fallbackTitle}...</ThemedText>
              </View>
            ) : error || !content ? (
              <View style={styles.centered}>
                <ThemedText style={styles.errorTitle}>{fallbackTitle}</ThemedText>
                <ThemedText style={styles.errorText}>
                  {error || 'Content not available. Please try again later.'}
                </ThemedText>
              </View>
            ) : (
              <>
                {updatedAt ? (
                  <ThemedText style={styles.lastUpdated}>Last Updated: {updatedAt}</ThemedText>
                ) : null}
                {content.meta_description ? (
                  <ThemedText style={styles.meta}>{content.meta_description}</ThemedText>
                ) : null}
                <View style={styles.sectionCard}>
                  <MarkdownContent content={content.content} />
                </View>
              </>
            )}
          </View>
        </ScrollView>
      </ThemedView>
    );
  }

  // Logged-out: public marketing page.
  return (
    <LandingShell activeHref={href}>
      {seo}

      <View style={[styles.hero, { width: contentWidth }]}>
        <ThemedText style={styles.eyebrow}>
          {(eyebrow || fallbackTitle).toUpperCase()}
        </ThemedText>
        <ThemedText style={styles.title}>{title}</ThemedText>
        {content?.meta_description ? (
          <ThemedText style={styles.subtitle}>{content.meta_description}</ThemedText>
        ) : (
          <ThemedText style={styles.subtitle}>
            Learn more about NetPay — kept public so you can read it without signing in.
          </ThemedText>
        )}
        {updatedAt ? (
          <ThemedText style={styles.updated}>Last updated: {updatedAt}</ThemedText>
        ) : null}
      </View>

      <View style={[styles.contentWrap, { width: contentWidth }]}>
        {loading ? (
          <View style={styles.centered}>
            <ActivityIndicator size="large" color={BRAND.orange} />
            <ThemedText style={styles.loadingText}>Loading {fallbackTitle}...</ThemedText>
          </View>
        ) : error || !content ? (
          <View style={styles.card}>
            <ThemedText style={styles.errorTitle}>{fallbackTitle}</ThemedText>
            <ThemedText style={styles.errorText}>
              {error || 'Content not available. Please try again later.'}
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
          <ThemedText style={styles.bottomTitle}>Need an account?</ThemedText>
          <ThemedText style={styles.bottomDesc}>
            Login or sign up when you are ready to pay bills with NetPay.
          </ThemedText>
        </View>
        <View style={[styles.ctaRow, !isWide && { width: '100%' }]}>
          <Pressable style={styles.cta} onPress={() => router.push('/auth/login')}>
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
  appContainer: {
    flex: 1,
    backgroundColor: '#FFF8F0',
  },
  orangeHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 20,
    paddingTop: Platform.OS === 'ios' ? 60 : 40,
    paddingBottom: 20,
    backgroundColor: '#FF7F00',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 4,
    elevation: 3,
  },
  backButton: {
    padding: 8,
    marginLeft: -8,
  },
  headerTitle: {
    flex: 1,
    fontSize: 20,
    fontWeight: 'bold',
    color: '#fff',
    textAlign: 'center',
    marginHorizontal: 8,
  },
  placeholder: {
    width: 40,
  },
  scrollView: {
    flex: 1,
  },
  scrollContent: {
    paddingBottom: 40,
  },
  content: {
    paddingHorizontal: 20,
    paddingTop: 24,
  },
  lastUpdated: {
    fontSize: 14,
    color: '#FF7F00',
    marginBottom: 12,
    fontStyle: 'italic',
    fontWeight: '500',
  },
  meta: {
    fontSize: 15,
    color: '#667085',
    lineHeight: 22,
    marginBottom: 16,
  },
  sectionCard: {
    backgroundColor: '#fff',
    borderRadius: 12,
    padding: 16,
    marginBottom: 16,
    borderLeftWidth: 4,
    borderLeftColor: '#FF7F00',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.1,
    shadowRadius: 2,
    elevation: 2,
  },
  centered: {
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 48,
    gap: 12,
  },
  loadingText: {
    fontSize: 15,
    color: '#667085',
  },
  errorTitle: {
    fontSize: 20,
    fontWeight: '700',
    color: '#1A2B4A',
  },
  errorText: {
    fontSize: 15,
    color: '#667085',
    textAlign: 'center',
    lineHeight: 22,
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
