import { Pressable, StyleSheet, View } from 'react-native';
import { MaterialIcons } from '@expo/vector-icons';
import { Redirect, useLocalSearchParams, useRouter } from 'expo-router';
import { ThemedText } from '@/components/themed-text';
import { SeoHead } from '@/components/seo-head';
import {
  LandingShell,
  goLandingLogin,
  useLandingLayout,
} from '@/components/landing/landing-shell';
import {
  LANDING_BRAND as BRAND,
  LANDING_FEATURES,
  findLandingFeature,
  landingFeaturePath,
} from '@/constants/landing';

export default function FeatureDetailPage() {
  const router = useRouter();
  const { slug } = useLocalSearchParams<{ slug?: string }>();
  const { contentWidth } = useLandingLayout();
  const feature = findLandingFeature(Array.isArray(slug) ? slug[0] : slug);

  if (!feature) {
    return <Redirect href="/features" />;
  }

  const related = LANDING_FEATURES.filter((entry) => entry.slug !== feature.slug).slice(0, 4);

  return (
    <LandingShell activeHref="/features">
      <SeoHead
        page="features"
        path={landingFeaturePath(feature.slug)}
        title={`${feature.title} | NetPay Features`}
        description={feature.detail}
      />

      <View style={[styles.page, { width: contentWidth }]}>
        <Pressable style={styles.backRow} onPress={() => router.push('/features')}>
          <MaterialIcons name="arrow-back" size={20} color={BRAND.orange} />
          <ThemedText style={styles.backText}>All features</ThemedText>
        </Pressable>

        <View style={styles.heroIcon}>
          <MaterialIcons name={feature.icon} size={32} color={BRAND.orange} />
        </View>
        <ThemedText style={styles.eyebrow}>HOW IT WORKS</ThemedText>
        <ThemedText style={styles.title}>{feature.title}</ThemedText>
        <ThemedText style={styles.lead}>{feature.description}</ThemedText>
        <ThemedText style={styles.summary}>{feature.detail}</ThemedText>

        <View style={styles.stepsCard}>
          <ThemedText style={styles.stepsHeading}>Step-by-step</ThemedText>
          {feature.howItWorks.map((step, index) => (
            <View key={step} style={styles.stepRow}>
              <View style={styles.stepBadge}>
                <ThemedText style={styles.stepNumber}>{index + 1}</ThemedText>
              </View>
              <ThemedText style={styles.stepText}>{step}</ThemedText>
            </View>
          ))}
        </View>

        {feature.tips?.length ? (
          <View style={styles.tipsCard}>
            <ThemedText style={styles.tipsHeading}>Good to know</ThemedText>
            {feature.tips.map((tip) => (
              <View key={tip} style={styles.tipRow}>
                <MaterialIcons name="lightbulb" size={18} color={BRAND.orange} />
                <ThemedText style={styles.tipText}>{tip}</ThemedText>
              </View>
            ))}
          </View>
        ) : null}

        <Pressable style={styles.cta} onPress={() => void goLandingLogin(router)}>
          <ThemedText style={styles.ctaText}>Try this in NetPay</ThemedText>
          <MaterialIcons name="arrow-forward" size={18} color="#fff" />
        </Pressable>

        <View style={styles.related}>
          <ThemedText style={styles.relatedTitle}>Explore more features</ThemedText>
          <View style={styles.relatedRow}>
            {related.map((entry) => (
              <Pressable
                key={entry.slug}
                style={styles.relatedChip}
                onPress={() => router.push(landingFeaturePath(entry.slug) as never)}>
                <MaterialIcons name={entry.icon} size={16} color={BRAND.orange} />
                <ThemedText style={styles.relatedText}>{entry.title}</ThemedText>
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
    paddingTop: 36,
    paddingBottom: 48,
    gap: 14,
  },
  backRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    alignSelf: 'flex-start',
    marginBottom: 8,
  },
  backText: {
    color: BRAND.orange,
    fontWeight: '700',
    fontSize: 14,
  },
  heroIcon: {
    width: 64,
    height: 64,
    borderRadius: 18,
    backgroundColor: BRAND.orangeSoft,
    alignItems: 'center',
    justifyContent: 'center',
  },
  eyebrow: {
    color: BRAND.orange,
    fontWeight: '800',
    letterSpacing: 1.2,
    fontSize: 12,
  },
  title: {
    color: BRAND.navy,
    fontSize: 34,
    fontWeight: '800',
    lineHeight: 40,
  },
  lead: {
    color: BRAND.orange,
    fontSize: 16,
    fontWeight: '700',
  },
  summary: {
    color: BRAND.text,
    fontSize: 16,
    lineHeight: 25,
    maxWidth: 720,
  },
  stepsCard: {
    marginTop: 8,
    backgroundColor: '#fff',
    borderRadius: 16,
    borderWidth: 1,
    borderColor: BRAND.border,
    padding: 20,
    gap: 16,
  },
  stepsHeading: {
    color: BRAND.navy,
    fontSize: 18,
    fontWeight: '800',
  },
  stepRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 12,
  },
  stepBadge: {
    width: 28,
    height: 28,
    borderRadius: 14,
    backgroundColor: BRAND.orange,
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: 1,
  },
  stepNumber: {
    color: '#fff',
    fontWeight: '800',
    fontSize: 13,
  },
  stepText: {
    flex: 1,
    color: BRAND.text,
    fontSize: 15,
    lineHeight: 23,
  },
  tipsCard: {
    backgroundColor: BRAND.orangeWash,
    borderRadius: 16,
    padding: 18,
    gap: 12,
  },
  tipsHeading: {
    color: BRAND.navy,
    fontSize: 16,
    fontWeight: '800',
  },
  tipRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 8,
  },
  tipText: {
    flex: 1,
    color: BRAND.text,
    fontSize: 14,
    lineHeight: 21,
  },
  cta: {
    alignSelf: 'flex-start',
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    backgroundColor: BRAND.orange,
    borderRadius: 12,
    paddingHorizontal: 18,
    paddingVertical: 13,
    marginTop: 4,
  },
  ctaText: {
    color: '#fff',
    fontWeight: '700',
    fontSize: 15,
  },
  related: {
    marginTop: 12,
    gap: 12,
  },
  relatedTitle: {
    color: BRAND.navy,
    fontSize: 18,
    fontWeight: '800',
  },
  relatedRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 10,
  },
  relatedChip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: BRAND.border,
    backgroundColor: '#fff',
  },
  relatedText: {
    color: BRAND.navy,
    fontSize: 13,
    fontWeight: '700',
  },
});
