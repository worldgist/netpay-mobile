import { Pressable, StyleSheet, View } from 'react-native';
import { MaterialIcons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import { ThemedText } from '@/components/themed-text';
import { SeoHead } from '@/components/seo-head';
import {
  LandingShell,
  goLandingLogin,
  useLandingLayout,
} from '@/components/landing/landing-shell';
import { LANDING_BRAND as BRAND, LANDING_FEATURES } from '@/constants/landing';

export default function FeaturesPage() {
  const router = useRouter();
  const { isWide, contentWidth, cardWidth } = useLandingLayout();

  return (
    <LandingShell activeHref="/features">
      <SeoHead page="features" />
      <View style={[styles.hero, { width: contentWidth }]}>
        <ThemedText style={styles.eyebrow}>FEATURES</ThemedText>
        <ThemedText style={styles.title}>Built for speed, security and everyday ease.</ThemedText>
        <ThemedText style={styles.subtitle}>
          NetPay makes bill payments and everyday money tasks simple — with the tools you need to
          move fast and stay protected.
        </ThemedText>
        <Pressable style={styles.cta} onPress={() => void goLandingLogin(router)}>
          <ThemedText style={styles.ctaText}>Get started</ThemedText>
          <MaterialIcons name="arrow-forward" size={18} color="#fff" />
        </Pressable>
      </View>

      <View style={[styles.gridWrap, { width: contentWidth }]}>
        <View style={styles.grid}>
          {LANDING_FEATURES.map((feature) => (
            <View key={feature.title} style={[styles.card, { width: cardWidth }]}>
              <View style={styles.iconWrap}>
                <MaterialIcons name={feature.icon} size={26} color={BRAND.orange} />
              </View>
              <ThemedText style={styles.cardTitle}>{feature.title}</ThemedText>
              <ThemedText style={styles.cardLead}>{feature.description}</ThemedText>
              <ThemedText style={styles.cardBody}>{feature.detail}</ThemedText>
            </View>
          ))}
        </View>
      </View>

      <View style={[styles.bottomCta, { width: contentWidth }, !isWide && styles.bottomCtaStack]}>
        <View style={{ flex: 1 }}>
          <ThemedText style={styles.bottomTitle}>Ready to try NetPay?</ThemedText>
          <ThemedText style={styles.bottomDesc}>
            Login or create an account and start paying bills in one place.
          </ThemedText>
        </View>
        <Pressable style={styles.cta} onPress={() => void goLandingLogin(router)}>
          <ThemedText style={styles.ctaText}>Login</ThemedText>
          <MaterialIcons name="arrow-forward" size={18} color="#fff" />
        </Pressable>
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
    maxWidth: 640,
  },
  cta: {
    alignSelf: 'flex-start',
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    backgroundColor: BRAND.orange,
    borderRadius: 999,
    paddingHorizontal: 18,
    paddingVertical: 12,
    marginTop: 4,
  },
  ctaText: {
    color: '#fff',
    fontWeight: '700',
    fontSize: 15,
  },
  gridWrap: {
    alignSelf: 'center',
    paddingHorizontal: 20,
    paddingBottom: 40,
  },
  grid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 16,
  },
  card: {
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
  cardLead: {
    color: BRAND.orange,
    fontSize: 14,
    fontWeight: '600',
  },
  cardBody: {
    color: BRAND.text,
    fontSize: 14,
    lineHeight: 21,
  },
  bottomCta: {
    alignSelf: 'center',
    width: '100%',
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
});
