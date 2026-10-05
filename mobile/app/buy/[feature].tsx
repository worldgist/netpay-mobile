import { Pressable, StyleSheet, View } from 'react-native';
import { MaterialIcons } from '@expo/vector-icons';
import { Redirect, useLocalSearchParams, useRouter } from 'expo-router';
import { ThemedText } from '@/components/themed-text';
import { SeoHead } from '@/components/seo-head';
import { FeatureSearch } from '@/components/landing/feature-search';
import { LandingShell, goLandingLogin, useLandingLayout } from '@/components/landing/landing-shell';
import { findSeoFeature, featurePath, SEO_FEATURES } from '@/constants/seo-features';
import { LANDING_BRAND as BRAND } from '@/constants/landing';

export default function BuyFeaturePage() {
  const router = useRouter();
  const { feature } = useLocalSearchParams<{ feature?: string }>();
  const { contentWidth } = useLandingLayout();
  const item = findSeoFeature(Array.isArray(feature) ? feature[0] : feature);

  if (!item) {
    return <Redirect href="/services" />;
  }

  return (
    <LandingShell activeHref="/services">
      <SeoHead
        page="services"
        path={featurePath(item.slug)}
        title={item.title}
        description={item.description}
        keywords={item.keywords}
      />
      <View style={[styles.page, { width: contentWidth }]}>
        <ThemedText style={styles.eyebrow}>NETPAY {item.navTitle.toUpperCase()}</ThemedText>
        <ThemedText style={styles.title}>{item.navTitle}</ThemedText>
        <ThemedText style={styles.summary}>{item.description}</ThemedText>
        <FeatureSearch initialQuery={item.navTitle} />
        <View style={styles.card}>
          {item.points.map((point) => (
            <View key={point} style={styles.point}>
              <MaterialIcons name="check-circle" size={18} color={BRAND.orange} />
              <ThemedText style={styles.pointText}>{point}</ThemedText>
            </View>
          ))}
        </View>
        <Pressable style={styles.cta} onPress={() => void goLandingLogin(router)}>
          <ThemedText style={styles.ctaText}>Pay with NetPay</ThemedText>
          <MaterialIcons name="arrow-forward" size={18} color="#fff" />
        </Pressable>
        <View style={styles.more}>
          <ThemedText style={styles.moreTitle}>Other NetPay services</ThemedText>
          <View style={styles.moreRow}>
            {SEO_FEATURES.filter((entry) => entry.slug !== item.slug).map((entry) => (
              <Pressable key={entry.slug} onPress={() => router.push(featurePath(entry.slug) as never)}>
                <ThemedText style={styles.moreLink}>{entry.navTitle}</ThemedText>
              </Pressable>
            ))}
          </View>
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
    fontSize: 36,
    fontWeight: '800',
  },
  summary: {
    color: BRAND.text,
    fontSize: 16,
    lineHeight: 24,
  },
  card: {
    backgroundColor: '#fff',
    borderRadius: 16,
    borderWidth: 1,
    borderColor: BRAND.border,
    padding: 18,
    gap: 12,
  },
  point: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 8,
  },
  pointText: {
    flex: 1,
    color: BRAND.navy,
    fontSize: 15,
    lineHeight: 22,
  },
  cta: {
    alignSelf: 'flex-start',
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    backgroundColor: BRAND.orange,
    borderRadius: 12,
    paddingHorizontal: 18,
    paddingVertical: 12,
  },
  ctaText: {
    color: '#fff',
    fontWeight: '700',
  },
  more: {
    gap: 10,
    marginTop: 8,
  },
  moreTitle: {
    color: BRAND.navy,
    fontWeight: '800',
    fontSize: 18,
  },
  moreRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 10,
  },
  moreLink: {
    color: BRAND.orangeDeep,
    fontWeight: '700',
  },
});
