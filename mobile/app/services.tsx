import { Pressable, StyleSheet, View } from 'react-native';
import { Image } from 'expo-image';
import { MaterialIcons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import { ThemedText } from '@/components/themed-text';
import { SeoHead } from '@/components/seo-head';
import {
  LandingShell,
  goLandingLogin,
  useLandingLayout,
} from '@/components/landing/landing-shell';
import {
  LANDING_BRAND as BRAND,
  LANDING_PROVIDERS,
  LANDING_SERVICES,
} from '@/constants/landing';

export default function ServicesPage() {
  const router = useRouter();
  const { isWide, contentWidth, cardWidth } = useLandingLayout();

  return (
    <LandingShell activeHref="/services">
      <SeoHead page="services" />
      <View style={[styles.hero, { width: contentWidth }]}>
        <ThemedText style={styles.eyebrow}>SERVICES</ThemedText>
        <ThemedText style={styles.title}>Everything you need, in one place.</ThemedText>
        <ThemedText style={styles.subtitle}>
          Pay airtime, data, electricity, cable TV, education, betting and more from a single secure
          wallet — anytime you need it.
        </ThemedText>
        <Pressable style={styles.cta} onPress={() => void goLandingLogin(router)}>
          <ThemedText style={styles.ctaText}>Start paying</ThemedText>
          <MaterialIcons name="arrow-forward" size={18} color="#fff" />
        </Pressable>
      </View>

      <View style={[styles.gridWrap, { width: contentWidth }]}>
        <View style={styles.grid}>
          {LANDING_SERVICES.map((service) => (
            <Pressable
              key={service.title}
              style={[styles.card, { width: cardWidth }]}
              onPress={() => void goLandingLogin(router)}>
              <View style={styles.iconWrap}>
                <MaterialIcons name={service.icon} size={26} color={BRAND.orange} />
              </View>
              <ThemedText style={styles.cardTitle}>{service.title}</ThemedText>
              {service.subtitle ? (
                <ThemedText style={styles.cardSubtitle}>{service.subtitle}</ThemedText>
              ) : null}
              <ThemedText style={styles.cardBody}>{service.description}</ThemedText>
            </Pressable>
          ))}
        </View>
      </View>

      <View style={[styles.providers, { width: contentWidth }]}>
        <ThemedText style={styles.providersEyebrow}>TRUSTED PROVIDERS</ThemedText>
        <ThemedText style={styles.providersTitle}>Works with the networks you already use.</ThemedText>
        <View style={styles.providersRow}>
          {LANDING_PROVIDERS.map((provider) => (
            <View key={provider.name} style={styles.providerChip}>
              <Image source={provider.source} style={styles.providerLogo} contentFit="contain" />
            </View>
          ))}
        </View>
      </View>

      <View style={[styles.bottomCta, { width: contentWidth }, !isWide && styles.bottomCtaStack]}>
        <View style={{ flex: 1 }}>
          <ThemedText style={styles.bottomTitle}>Need a service right now?</ThemedText>
          <ThemedText style={styles.bottomDesc}>
            Login to your NetPay wallet and complete payments in seconds.
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
    paddingBottom: 36,
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
    gap: 6,
  },
  iconWrap: {
    width: 48,
    height: 48,
    borderRadius: 14,
    backgroundColor: BRAND.orangeSoft,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 6,
  },
  cardTitle: {
    color: BRAND.navy,
    fontSize: 17,
    fontWeight: '800',
  },
  cardSubtitle: {
    color: BRAND.orange,
    fontSize: 13,
    fontWeight: '600',
  },
  cardBody: {
    color: BRAND.text,
    fontSize: 14,
    lineHeight: 21,
  },
  providers: {
    alignSelf: 'center',
    paddingHorizontal: 20,
    paddingBottom: 28,
    alignItems: 'center',
    gap: 12,
  },
  providersEyebrow: {
    color: BRAND.orange,
    fontWeight: '800',
    letterSpacing: 1.4,
    fontSize: 12,
  },
  providersTitle: {
    color: BRAND.navy,
    fontSize: 22,
    fontWeight: '800',
    textAlign: 'center',
    marginBottom: 8,
  },
  providersRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    justifyContent: 'center',
    gap: 12,
  },
  providerChip: {
    width: 72,
    height: 56,
    borderRadius: 12,
    backgroundColor: '#fff',
    borderWidth: 1,
    borderColor: BRAND.border,
    alignItems: 'center',
    justifyContent: 'center',
    padding: 8,
  },
  providerLogo: {
    width: '100%',
    height: '100%',
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
});
