import {
  ActivityIndicator,
  Platform,
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
import { useContentPage } from '@/hooks/use-content-page';
import { SEO_PAGES, type SeoPageKey } from '@/constants/seo';

type ContentPageScreenProps = {
  pageType: string;
  fallbackTitle: string;
  seoPage?: SeoPageKey;
};

const PAGE_TYPE_TO_SEO: Record<string, SeoPageKey> = {
  privacy_policy: 'privacy',
  terms_conditions: 'terms',
  faq: 'faq',
  support: 'support',
  about_us: 'about',
};

export function ContentPageScreen({ pageType, fallbackTitle, seoPage }: ContentPageScreenProps) {
  const router = useRouter();
  const { content, loading, error } = useContentPage(pageType);
  const seoKey = seoPage || PAGE_TYPE_TO_SEO[pageType];

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
    router.replace('/landing' as never);
  };

  return (
    <ThemedView style={styles.container}>
      {seoKey ? (
        <SeoHead
          page={seoKey}
          title={content?.title ? `${content.title} | NetPay` : SEO_PAGES[seoKey].title}
          description={content?.meta_description || undefined}
        />
      ) : null}
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

const styles = StyleSheet.create({
  container: {
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
});
