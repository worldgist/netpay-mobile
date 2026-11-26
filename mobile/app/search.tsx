import { Pressable, StyleSheet, View } from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { ThemedText } from '@/components/themed-text';
import { SeoHead } from '@/components/seo-head';
import { FeatureSearch } from '@/components/landing/feature-search';
import { LandingShell, useLandingLayout } from '@/components/landing/landing-shell';
import { featurePath, searchSeoFeatures } from '@/constants/seo-features';
import { LANDING_BRAND as BRAND } from '@/constants/landing';

export default function SearchPage() {
  const router = useRouter();
  const params = useLocalSearchParams<{ q?: string }>();
  const query = (Array.isArray(params.q) ? params.q[0] : params.q || '').trim();
  const { contentWidth } = useLandingLayout();
  const results = searchSeoFeatures(query);
  const title = query ? `Search “${query}” | NetPay` : 'Search NetPay services';
  const description = query
    ? `Search results for ${query} on NetPay. Pay airtime, data, electricity, cable TV, education and betting in Nigeria.`
    : 'Search NetPay for airtime, data, electricity tokens, DStv, WAEC pins, betting wallets and transfers.';

  return (
    <LandingShell activeHref="/services">
      <SeoHead page="services" path={query ? `/search?q=${encodeURIComponent(query)}` : '/search'} title={title} description={description} />
      <View style={[styles.page, { width: contentWidth }]}>
        <ThemedText style={styles.eyebrow}>SEARCH NETPAY</ThemedText>
        <ThemedText style={styles.title}>{query ? `Results for “${query}”` : 'Find a NetPay service'}</ThemedText>
        <FeatureSearch initialQuery={query} />
        <View style={styles.list}>
          {results.length === 0 ? (
            <ThemedText style={styles.empty}>
              No NetPay service matched that search. Try airtime, data, electricity, DStv or WAEC.
            </ThemedText>
          ) : (
            results.map((feature) => (
              <Pressable
                key={feature.slug}
                style={styles.card}
                onPress={() => router.push(featurePath(feature.slug) as never)}>
                <ThemedText style={styles.cardTitle}>{feature.navTitle}</ThemedText>
                <ThemedText style={styles.cardBody}>{feature.description}</ThemedText>
              </Pressable>
            ))
          )}
        </View>
      </View>
    </LandingShell>
  );
}

const styles = StyleSheet.create({
  page: {
    alignSelf: 'center',
    paddingHorizontal: 20,
    paddingTop: 48,
    paddingBottom: 40,
    gap: 16,
  },
  eyebrow: {
    color: BRAND.orange,
    fontWeight: '800',
    letterSpacing: 1.2,
    fontSize: 12,
  },
  title: {
    color: BRAND.navy,
    fontSize: 32,
    fontWeight: '800',
  },
  list: {
    gap: 12,
  },
  card: {
    backgroundColor: '#fff',
    borderRadius: 16,
    borderWidth: 1,
    borderColor: BRAND.border,
    padding: 16,
    gap: 6,
  },
  cardTitle: {
    color: BRAND.navy,
    fontWeight: '800',
    fontSize: 18,
  },
  cardBody: {
    color: BRAND.text,
    lineHeight: 22,
  },
  empty: {
    color: BRAND.muted,
    lineHeight: 22,
  },
});
