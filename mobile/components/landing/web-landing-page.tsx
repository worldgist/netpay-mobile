import { useMemo, useRef } from 'react';
import {
  Linking,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  View,
  useWindowDimensions,
} from 'react-native';
import { Image } from 'expo-image';
import { MaterialIcons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import { ThemedText } from '@/components/themed-text';
import { LandingFooter } from '@/components/landing/landing-footer';
import { supabase } from '@/lib/supabase';
import { FeatureSearch } from '@/components/landing/feature-search';
import { featurePath } from '@/constants/seo-features';
import {
  LANDING_BRAND as BRAND,
  LANDING_FEATURES,
  LANDING_NAV_LINKS,
  LANDING_PROVIDERS,
  LANDING_SERVICES,
  LANDING_STORE_LINKS,
} from '@/constants/landing';

const SERVICES = LANDING_SERVICES;
const FEATURES = LANDING_FEATURES;
const PROVIDERS = LANDING_PROVIDERS;
const STORE_LINKS = LANDING_STORE_LINKS;
const NAV_LINKS = LANDING_NAV_LINKS;

function openUrl(url: string) {
  void Linking.openURL(url);
}

function PhoneMockup({ compact = false }: { compact?: boolean }) {
  const width = compact ? 180 : 280;
  const height = compact ? 368 : 572;
  const bezel = compact ? 10 : 12;
  const radius = compact ? 34 : 44;
  const screenRadius = compact ? 26 : 34;

  return (
    <View
      style={[
        styles.iphoneFrame,
        {
          width,
          height,
          borderRadius: radius,
          padding: bezel,
        },
      ]}>
      <View style={[styles.iphoneSideButton, styles.iphoneSilent, compact && styles.iphoneSideCompact]} />
      <View style={[styles.iphoneSideButton, styles.iphoneVolumeUp, compact && styles.iphoneSideCompact]} />
      <View style={[styles.iphoneSideButton, styles.iphoneVolumeDown, compact && styles.iphoneSideCompact]} />
      <View style={[styles.iphonePowerButton, compact && styles.iphonePowerCompact]} />

      <View style={[styles.iphoneScreen, { borderRadius: screenRadius }]}>
        <Image
          source={require('@/assets/images/landing/home-screen.jpg')}
          style={styles.iphoneScreenshot}
          contentFit="cover"
        />
      </View>
    </View>
  );
}

function SuccessPhoneMockup() {
  return (
    <View style={styles.successPhoneWrap}>
      <View style={styles.successPhone}>
        <View style={styles.successBadge}>
          <MaterialIcons name="check" size={36} color="#fff" />
        </View>
        <ThemedText style={styles.successTitle}>Payment Successful!</ThemedText>
        <ThemedText style={styles.successAmount}>₦5,000</ThemedText>
        <ThemedText style={styles.successMeta}>Airtime · MTN</ThemedText>
      </View>
      <View style={styles.floatingCard}>
        <MaterialIcons name="credit-card" size={28} color={BRAND.orange} />
      </View>
    </View>
  );
}

export function WebLandingPage() {
  const router = useRouter();
  const scrollRef = useRef<ScrollView>(null);
  const sectionY = useRef<Record<string, number>>({});
  const { width } = useWindowDimensions();
  const isWide = width >= 960;
  const contentWidth = Math.min(width, 1180);

  const goLogin = async () => {
    try {
      const {
        data: { session },
      } = await supabase.auth.getSession();
      if (session?.user) {
        router.replace('/(tabs)');
        return;
      }
    } catch {
      // Fall through to login screen.
    }
    router.push('/auth/login');
  };
  const goSignup = () => router.push('/auth/signup');

  const scrollTo = (id: string) => {
    const y = sectionY.current[id];
    if (typeof y === 'number') {
      scrollRef.current?.scrollTo({ y: Math.max(y - 72, 0), animated: true });
    }
  };

  const goNav = (href: string) => {
    if (href === '/landing') {
      scrollTo('home');
      return;
    }
    router.push(href as never);
  };

  const markSection = (id: string) => (event: { nativeEvent: { layout: { y: number } } }) => {
    sectionY.current[id] = event.nativeEvent.layout.y;
  };

  const serviceColumns = useMemo(() => (width >= 1100 ? 5 : width >= 720 ? 3 : 2), [width]);
  const serviceCardWidth =
    (Math.min(contentWidth - 48, width - 48) - (serviceColumns - 1) * 14) / serviceColumns;
  const featureColumns = useMemo(() => (width >= 1100 ? 4 : width >= 720 ? 3 : 2), [width]);
  const featureCardWidth =
    (Math.min(contentWidth - 48, width - 48) - (featureColumns - 1) * 14) / featureColumns;

  return (
    <View style={styles.root}>
      <View style={styles.header}>
        <View style={[styles.headerInner, { width: contentWidth }]}>
          <Pressable style={styles.brandRow} onPress={() => scrollTo('home')}>
            <Image
              source={require('@/assets/images/logo.png')}
              style={styles.brandLogo}
              contentFit="contain"
            />
            <ThemedText style={styles.brandText}>
              NET
              <ThemedText style={styles.brandTextAccent}>PAY</ThemedText>
            </ThemedText>
          </Pressable>

          {isWide ? (
            <View style={styles.navLinks}>
              {NAV_LINKS.map((link) => (
                <Pressable key={link.href} onPress={() => goNav(link.href)} style={styles.navLink}>
                  <ThemedText style={styles.navLinkText}>{link.label}</ThemedText>
                </Pressable>
              ))}
            </View>
          ) : null}

          <View style={styles.headerActions}>
            <Pressable style={styles.headerSignup} onPress={goSignup}>
              <ThemedText style={styles.headerSignupText}>Sign Up</ThemedText>
            </Pressable>
            <Pressable style={styles.headerLogin} onPress={goLogin}>
              <MaterialIcons name="person" size={18} color={BRAND.orange} />
              <ThemedText style={styles.headerLoginText}>Login</ThemedText>
            </Pressable>
          </View>
        </View>
      </View>

      <ScrollView
        ref={scrollRef}
        style={styles.scroll}
        contentContainerStyle={styles.scrollContent}
        showsVerticalScrollIndicator={Platform.OS === 'web'}>
        <View style={styles.page} onLayout={markSection('home')}>
          <View style={[styles.hero, { width: contentWidth }]}>
            <View style={[styles.heroCopy, !isWide && styles.heroCopyNarrow]}>
              <ThemedText style={styles.eyebrow}>PAY EVERY BILL IN ONE PLACE</ThemedText>
              <ThemedText style={styles.heroTitle}>
                Bills made simple{'\n'}for a smarter you.
              </ThemedText>
              <ThemedText style={styles.heroSubtitle}>
                Pay for airtime, data, electricity, cable TV, education, betting and more — all in
                one secure and reliable platform.
              </ThemedText>

              <FeatureSearch />

              <View style={styles.heroCtas}>
                <Pressable style={styles.primaryBtn} onPress={goLogin}>
                  <MaterialIcons name="person" size={18} color="#fff" />
                  <ThemedText style={styles.primaryBtnText}>Login</ThemedText>
                  <MaterialIcons name="arrow-forward" size={18} color="#fff" />
                </Pressable>
                <Pressable style={styles.videoBtn} onPress={goSignup}>
                  <View style={styles.playDot}>
                    <MaterialIcons name="play-arrow" size={16} color={BRAND.orange} />
                  </View>
                  <ThemedText style={styles.videoBtnText}>Create account</ThemedText>
                </Pressable>
              </View>

              <View style={styles.statsRow}>
                {[
                  { value: '1M+', label: 'Happy Users' },
                  { value: '100+', label: 'Services' },
                  { value: '99.9%', label: 'Uptime' },
                ].map((stat) => (
                  <View key={stat.label} style={styles.statItem}>
                    <ThemedText style={styles.statValue}>{stat.value}</ThemedText>
                    <ThemedText style={styles.statLabel}>{stat.label}</ThemedText>
                  </View>
                ))}
              </View>
            </View>

            <View style={styles.heroVisual}>
              <View style={styles.heroGlow} />
              <PhoneMockup />
            </View>
          </View>

          <View style={styles.section} onLayout={markSection('services')}>
            <View style={{ width: contentWidth, alignSelf: 'center' }}>
              <ThemedText style={styles.sectionEyebrow}>OUR SERVICES</ThemedText>
              <ThemedText style={styles.sectionTitle}>Everything you need, in one place.</ThemedText>
              <View style={styles.servicesGrid}>
                {SERVICES.map((service) => (
                  <Pressable
                    key={service.title}
                    style={[styles.serviceCard, { width: serviceCardWidth }]}
                    onPress={() => {
                      if (service.slug) {
                        router.push(featurePath(service.slug) as never);
                        return;
                      }
                      goLogin();
                    }}>
                    <View style={styles.serviceIconWrap}>
                      <MaterialIcons name={service.icon} size={26} color={BRAND.orange} />
                    </View>
                    <ThemedText style={styles.serviceTitle}>{service.title}</ThemedText>
                    {service.subtitle ? (
                      <ThemedText style={styles.serviceSubtitle}>{service.subtitle}</ThemedText>
                    ) : null}
                  </Pressable>
                ))}
              </View>
            </View>
          </View>

          <View style={[styles.section, styles.featuresSection]} onLayout={markSection('features')}>
            <View style={{ width: contentWidth, alignSelf: 'center' }}>
              <ThemedText style={styles.sectionEyebrow}>WHY NETPAY</ThemedText>
              <ThemedText style={styles.featuresHeading}>Fast. Secure. Built for everyday payments.</ThemedText>
              <ThemedText style={styles.featuresIntro}>
                Everything you need to fund your wallet, pay bills, transfer money and stay in control —
                without switching between apps.
              </ThemedText>

              <View style={styles.featuresGrid}>
                {FEATURES.map((feature) => (
                  <View
                    key={feature.title}
                    style={[styles.featureCard, { width: featureCardWidth }]}>
                    <View style={styles.featureIcon}>
                      <MaterialIcons name={feature.icon} size={22} color={BRAND.orange} />
                    </View>
                    <ThemedText style={styles.featureTitle}>{feature.title}</ThemedText>
                    <ThemedText style={styles.featureDesc}>{feature.description}</ThemedText>
                  </View>
                ))}
              </View>

              <Pressable style={styles.featuresMore} onPress={() => router.push('/features' as never)}>
                <ThemedText style={styles.featuresMoreText}>Explore all features</ThemedText>
                <MaterialIcons name="arrow-forward" size={18} color={BRAND.orange} />
              </Pressable>

              <View style={[styles.featuresBottom, !isWide && styles.featuresStack]}>
                <View style={[styles.downloadCard, !isWide && { width: '100%' }]}>
                  <ThemedText style={styles.downloadTitle}>Take NetPay Everywhere</ThemedText>
                  <ThemedText style={styles.downloadDesc}>
                    Get the app on your phone and manage your bills on the go.
                  </ThemedText>
                  <View style={styles.qrBlock}>
                    <MaterialIcons name="qr-code-2" size={120} color={BRAND.navy} />
                    <ThemedText style={styles.qrLabel}>Scan to download</ThemedText>
                  </View>
                  <View style={styles.storeRow}>
                    <Pressable
                      style={styles.storeBadgeBtn}
                      onPress={() => openUrl(STORE_LINKS.ios)}
                      accessibilityRole="link"
                      accessibilityLabel="Download on the App Store">
                      <Image
                        source={require('@/assets/images/stores/app-store-badge.png')}
                        style={styles.storeBadge}
                        contentFit="contain"
                      />
                    </Pressable>
                    <Pressable
                      style={styles.storeBadgeBtn}
                      onPress={() => openUrl(STORE_LINKS.android)}
                      accessibilityRole="link"
                      accessibilityLabel="Get it on Google Play">
                      <Image
                        source={require('@/assets/images/stores/google-play-badge.png')}
                        style={styles.storeBadge}
                        contentFit="contain"
                      />
                    </Pressable>
                  </View>
                </View>

                <View style={[styles.featuresHighlight, !isWide && { width: '100%', marginTop: 16 }]}>
                  <ThemedText style={styles.highlightEyebrow}>MADE FOR NIGERIA</ThemedText>
                  <ThemedText style={styles.highlightTitle}>
                    Pay airtime, data, power, TV and more from one wallet.
                  </ThemedText>
                  <ThemedText style={styles.highlightDesc}>
                    Virtual account funding, instant vends, transfers, statements and support — all
                    designed around how people actually pay every day.
                  </ThemedText>
                  <Pressable style={styles.highlightCta} onPress={goLogin}>
                    <ThemedText style={styles.highlightCtaText}>Login to get started</ThemedText>
                    <MaterialIcons name="arrow-forward" size={18} color="#fff" />
                  </Pressable>
                </View>
              </View>
            </View>
          </View>

          <View style={styles.section} onLayout={markSection('about')}>
            <View style={{ width: contentWidth, alignSelf: 'center', alignItems: 'center' }}>
              <ThemedText style={styles.sectionEyebrow}>TRUSTED BY LEADING PROVIDERS</ThemedText>
              <View style={styles.providersRow}>
                {PROVIDERS.map((provider) => (
                  <View key={provider.name} style={styles.providerChip}>
                    <Image source={provider.source} style={styles.providerLogo} contentFit="contain" />
                  </View>
                ))}
              </View>
            </View>
          </View>

          <View style={[styles.ctaBannerWrap, { width: contentWidth }]} onLayout={markSection('contact')}>
            <View style={[styles.ctaBanner, !isWide && styles.ctaBannerStack]}>
              <View style={styles.ctaCopy}>
                <ThemedText style={styles.ctaTitle}>Ready to make life easier?</ThemedText>
                <ThemedText style={styles.ctaDesc}>
                  Login today and experience a faster, simpler way to pay your bills.
                </ThemedText>
                <Pressable style={styles.ctaLogin} onPress={goLogin}>
                  <ThemedText style={styles.ctaLoginText}>Login</ThemedText>
                  <MaterialIcons name="arrow-forward" size={18} color={BRAND.orange} />
                </Pressable>
              </View>
              {isWide ? <SuccessPhoneMockup /> : null}
            </View>
          </View>

          <LandingFooter onHomePress={() => scrollTo('home')} />
        </View>
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
    backgroundColor: BRAND.white,
  },
  header: {
    backgroundColor: BRAND.orange,
    paddingHorizontal: 20,
    paddingVertical: 14,
    zIndex: 10,
    ...(Platform.OS === 'web' ? ({ position: 'sticky', top: 0 } as object) : null),
  },
  headerInner: {
    alignSelf: 'center',
    width: '100%',
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 16,
  },
  brandRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  brandLogo: {
    width: 34,
    height: 34,
    borderRadius: 8,
    backgroundColor: '#fff',
  },
  brandText: {
    color: '#fff',
    fontSize: 20,
    fontWeight: '800',
    letterSpacing: 0.4,
  },
  brandTextAccent: {
    color: '#FFE0C2',
    fontWeight: '800',
  },
  navLinks: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 22,
    flex: 1,
    justifyContent: 'center',
  },
  navLink: {
    paddingVertical: 4,
  },
  navLinkText: {
    color: '#fff',
    fontSize: 14,
    fontWeight: '600',
  },
  headerActions: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  headerSignup: {
    borderWidth: 1.5,
    borderColor: '#fff',
    borderRadius: 999,
    paddingHorizontal: 16,
    paddingVertical: 10,
  },
  headerSignupText: {
    color: '#fff',
    fontWeight: '700',
    fontSize: 14,
  },
  headerLogin: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    backgroundColor: '#fff',
    borderRadius: 999,
    paddingHorizontal: 16,
    paddingVertical: 10,
  },
  headerLoginText: {
    color: BRAND.orange,
    fontWeight: '700',
    fontSize: 14,
  },
  scroll: {
    flex: 1,
  },
  scrollContent: {
    paddingBottom: 0,
  },
  page: {
    backgroundColor: BRAND.orangeSoft,
  },
  hero: {
    alignSelf: 'center',
    width: '100%',
    paddingHorizontal: 24,
    paddingTop: 48,
    paddingBottom: 40,
    flexDirection: 'row',
    flexWrap: 'wrap',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 32,
  },
  heroCopy: {
    flex: 1,
    minWidth: 280,
    maxWidth: 560,
  },
  heroCopyNarrow: {
    maxWidth: '100%',
  },
  eyebrow: {
    color: BRAND.orange,
    fontWeight: '800',
    fontSize: 13,
    letterSpacing: 1,
    marginBottom: 14,
  },
  heroTitle: {
    color: BRAND.navy,
    fontSize: 44,
    lineHeight: 52,
    fontWeight: '800',
    marginBottom: 16,
  },
  heroSubtitle: {
    color: BRAND.muted,
    fontSize: 16,
    lineHeight: 26,
    marginBottom: 28,
    maxWidth: 480,
  },
  heroCtas: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    alignItems: 'center',
    gap: 16,
    marginBottom: 32,
  },
  primaryBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    backgroundColor: BRAND.orange,
    borderRadius: 999,
    paddingHorizontal: 22,
    paddingVertical: 14,
  },
  primaryBtnText: {
    color: '#fff',
    fontWeight: '700',
    fontSize: 16,
  },
  videoBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  playDot: {
    width: 34,
    height: 34,
    borderRadius: 17,
    backgroundColor: '#fff',
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: BRAND.orangeWash,
  },
  videoBtnText: {
    color: BRAND.navy,
    fontWeight: '700',
    fontSize: 15,
  },
  statsRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 28,
  },
  statItem: {
    minWidth: 90,
  },
  statValue: {
    color: BRAND.navy,
    fontSize: 28,
    fontWeight: '800',
  },
  statLabel: {
    color: BRAND.muted,
    fontSize: 13,
    marginTop: 2,
  },
  heroVisual: {
    alignItems: 'center',
    justifyContent: 'center',
    minWidth: 300,
    flex: 1,
  },
  heroGlow: {
    position: 'absolute',
    width: 360,
    height: 360,
    borderRadius: 180,
    backgroundColor: 'rgba(255,127,0,0.18)',
  },
  iphoneFrame: {
    backgroundColor: '#0B0B0F',
    borderWidth: 2,
    borderColor: '#2A2A33',
    shadowColor: '#000',
    shadowOpacity: 0.28,
    shadowRadius: 28,
    shadowOffset: { width: 0, height: 18 },
    elevation: 14,
    position: 'relative',
  },
  iphoneScreen: {
    flex: 1,
    overflow: 'hidden',
    backgroundColor: '#F5F5F7',
    position: 'relative',
  },
  iphoneScreenshot: {
    width: '100%',
    height: '100%',
  },
  iphoneSideButton: {
    position: 'absolute',
    left: -3,
    width: 3,
    backgroundColor: '#2A2A33',
    borderTopLeftRadius: 2,
    borderBottomLeftRadius: 2,
  },
  iphoneSilent: {
    top: 96,
    height: 28,
  },
  iphoneVolumeUp: {
    top: 148,
    height: 52,
  },
  iphoneVolumeDown: {
    top: 210,
    height: 52,
  },
  iphoneSideCompact: {
    transform: [{ scaleY: 0.85 }],
  },
  iphonePowerButton: {
    position: 'absolute',
    right: -3,
    top: 160,
    width: 3,
    height: 78,
    backgroundColor: '#2A2A33',
    borderTopRightRadius: 2,
    borderBottomRightRadius: 2,
  },
  iphonePowerCompact: {
    height: 60,
    top: 130,
  },
  phoneShell: {
    backgroundColor: '#111827',
    padding: 10,
    borderWidth: 3,
    borderColor: '#1F2937',
    shadowColor: '#000',
    shadowOpacity: 0.2,
    shadowRadius: 24,
    shadowOffset: { width: 0, height: 16 },
    elevation: 12,
  },
  phoneNotch: {
    alignSelf: 'center',
    width: 90,
    height: 8,
    borderRadius: 8,
    backgroundColor: '#000',
    marginBottom: 8,
  },
  phoneScreen: {
    flex: 1,
    backgroundColor: '#F8FAFC',
    borderRadius: 24,
    padding: 14,
  },
  phoneStatusRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginBottom: 14,
  },
  phoneTime: {
    fontSize: 12,
    fontWeight: '700',
    color: '#111',
  },
  phoneStatusIcons: {
    flexDirection: 'row',
    gap: 4,
  },
  walletCard: {
    backgroundColor: BRAND.orange,
    borderRadius: 18,
    padding: 16,
    marginBottom: 16,
  },
  walletLabel: {
    color: 'rgba(255,255,255,0.85)',
    fontSize: 12,
    marginBottom: 4,
  },
  walletAmount: {
    color: '#fff',
    fontSize: 24,
    fontWeight: '800',
    marginBottom: 12,
  },
  walletActions: {
    flexDirection: 'row',
    gap: 8,
  },
  walletActionChip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    backgroundColor: 'rgba(255,255,255,0.2)',
    borderRadius: 999,
    paddingHorizontal: 10,
    paddingVertical: 6,
  },
  walletActionChipLight: {
    backgroundColor: '#fff',
  },
  walletActionText: {
    color: '#fff',
    fontSize: 12,
    fontWeight: '700',
  },
  phoneServices: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 10,
  },
  phoneServiceItem: {
    width: '47%',
    backgroundColor: '#fff',
    borderRadius: 14,
    paddingVertical: 12,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: BRAND.border,
  },
  phoneServiceIcon: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: BRAND.orangeSoft,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 6,
  },
  phoneServiceLabel: {
    fontSize: 12,
    fontWeight: '600',
    color: BRAND.navy,
  },
  phoneBottomNav: {
    marginTop: 'auto',
    flexDirection: 'row',
    justifyContent: 'space-around',
    paddingTop: 14,
    borderTopWidth: 1,
    borderTopColor: BRAND.border,
  },
  section: {
    backgroundColor: BRAND.white,
    paddingVertical: 64,
    paddingHorizontal: 24,
  },
  sectionEyebrow: {
    color: BRAND.orange,
    fontWeight: '800',
    fontSize: 12,
    letterSpacing: 1.2,
    textAlign: 'center',
    marginBottom: 10,
  },
  sectionTitle: {
    color: BRAND.navy,
    fontSize: 34,
    lineHeight: 42,
    fontWeight: '800',
    textAlign: 'center',
    marginBottom: 36,
  },
  servicesGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 14,
    justifyContent: 'center',
  },
  serviceCard: {
    backgroundColor: '#fff',
    borderRadius: 18,
    borderWidth: 1,
    borderColor: BRAND.border,
    paddingVertical: 22,
    paddingHorizontal: 14,
    alignItems: 'center',
    shadowColor: '#1A2B4A',
    shadowOpacity: 0.06,
    shadowRadius: 12,
    shadowOffset: { width: 0, height: 6 },
    elevation: 3,
  },
  serviceIconWrap: {
    width: 52,
    height: 52,
    borderRadius: 16,
    backgroundColor: BRAND.orangeSoft,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 12,
  },
  serviceTitle: {
    color: BRAND.navy,
    fontWeight: '700',
    fontSize: 14,
    textAlign: 'center',
  },
  serviceSubtitle: {
    color: BRAND.muted,
    fontSize: 11,
    textAlign: 'center',
    marginTop: 4,
  },
  featuresSection: {
    backgroundColor: BRAND.footerBg,
  },
  featuresRow: {
    alignSelf: 'center',
    flexDirection: 'row',
    alignItems: 'flex-start',
    justifyContent: 'space-between',
    gap: 40,
  },
  featuresStack: {
    flexDirection: 'column',
  },
  featuresCopy: {
    flex: 1,
    maxWidth: 520,
  },
  featuresHeading: {
    color: BRAND.navy,
    fontSize: 36,
    lineHeight: 44,
    fontWeight: '800',
    marginBottom: 12,
  },
  featuresIntro: {
    color: BRAND.muted,
    fontSize: 16,
    lineHeight: 24,
    maxWidth: 720,
    marginBottom: 28,
  },
  featuresGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 14,
  },
  featureCard: {
    backgroundColor: '#fff',
    borderRadius: 16,
    borderWidth: 1,
    borderColor: BRAND.border,
    padding: 18,
    gap: 8,
  },
  featureItem: {
    flexDirection: 'row',
    gap: 14,
    marginBottom: 20,
  },
  featureIcon: {
    width: 44,
    height: 44,
    borderRadius: 14,
    backgroundColor: BRAND.orangeSoft,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 4,
  },
  featureTextWrap: {
    flex: 1,
  },
  featureTitle: {
    color: BRAND.navy,
    fontWeight: '800',
    fontSize: 16,
  },
  featureDesc: {
    color: BRAND.muted,
    fontSize: 13,
    lineHeight: 19,
  },
  featuresMore: {
    alignSelf: 'flex-start',
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    marginTop: 20,
    marginBottom: 28,
  },
  featuresMoreText: {
    color: BRAND.orange,
    fontWeight: '700',
    fontSize: 15,
  },
  featuresBottom: {
    flexDirection: 'row',
    alignItems: 'stretch',
    gap: 16,
  },
  featuresHighlight: {
    flex: 1,
    backgroundColor: BRAND.navy,
    borderRadius: 24,
    padding: 28,
    justifyContent: 'center',
    gap: 12,
  },
  highlightEyebrow: {
    color: BRAND.orange,
    fontWeight: '800',
    letterSpacing: 1.2,
    fontSize: 11,
  },
  highlightTitle: {
    color: '#fff',
    fontSize: 26,
    lineHeight: 34,
    fontWeight: '800',
  },
  highlightDesc: {
    color: 'rgba(255,255,255,0.78)',
    fontSize: 15,
    lineHeight: 23,
  },
  highlightCta: {
    alignSelf: 'flex-start',
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    backgroundColor: BRAND.orange,
    borderRadius: 999,
    paddingHorizontal: 16,
    paddingVertical: 12,
    marginTop: 8,
  },
  highlightCtaText: {
    color: '#fff',
    fontWeight: '700',
    fontSize: 14,
  },
  downloadCard: {
    width: 360,
    backgroundColor: '#fff',
    borderRadius: 24,
    padding: 28,
    borderWidth: 1,
    borderColor: BRAND.border,
    shadowColor: '#1A2B4A',
    shadowOpacity: 0.08,
    shadowRadius: 18,
    shadowOffset: { width: 0, height: 10 },
    elevation: 4,
  },
  downloadTitle: {
    color: BRAND.navy,
    fontSize: 24,
    fontWeight: '800',
    marginBottom: 8,
  },
  downloadDesc: {
    color: BRAND.muted,
    fontSize: 14,
    lineHeight: 22,
    marginBottom: 18,
  },
  qrBlock: {
    alignItems: 'center',
    marginBottom: 18,
    paddingVertical: 12,
    backgroundColor: BRAND.orangeSoft,
    borderRadius: 16,
  },
  qrLabel: {
    color: BRAND.muted,
    fontSize: 12,
    marginTop: 4,
  },
  storeRow: {
    gap: 10,
    flexDirection: 'row',
    flexWrap: 'wrap',
    alignItems: 'center',
  },
  storeBadgeBtn: {
    borderRadius: 8,
    overflow: 'hidden',
  },
  storeBadge: {
    width: 148,
    height: 44,
  },
  storeBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    backgroundColor: '#111827',
    borderRadius: 12,
    paddingHorizontal: 14,
    paddingVertical: 12,
  },
  storeTiny: {
    color: 'rgba(255,255,255,0.75)',
    fontSize: 10,
  },
  storeName: {
    color: '#fff',
    fontWeight: '700',
    fontSize: 15,
  },
  providersRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    justifyContent: 'center',
    gap: 12,
    marginTop: 8,
  },
  providerChip: {
    width: 88,
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
  ctaBannerWrap: {
    alignSelf: 'center',
    paddingHorizontal: 24,
    paddingBottom: 48,
    width: '100%',
  },
  ctaBanner: {
    backgroundColor: BRAND.orange,
    borderRadius: 28,
    paddingHorizontal: 36,
    paddingVertical: 36,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    overflow: 'hidden',
  },
  ctaBannerStack: {
    flexDirection: 'column',
  },
  ctaCopy: {
    flex: 1,
    maxWidth: 480,
  },
  ctaTitle: {
    color: '#fff',
    fontSize: 32,
    fontWeight: '800',
    marginBottom: 10,
  },
  ctaDesc: {
    color: 'rgba(255,255,255,0.92)',
    fontSize: 15,
    lineHeight: 24,
    marginBottom: 22,
  },
  ctaLogin: {
    alignSelf: 'flex-start',
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    backgroundColor: '#fff',
    borderRadius: 999,
    paddingHorizontal: 20,
    paddingVertical: 12,
  },
  ctaLoginText: {
    color: BRAND.orange,
    fontWeight: '800',
    fontSize: 15,
  },
  successPhoneWrap: {
    width: 220,
    height: 260,
    alignItems: 'center',
    justifyContent: 'center',
  },
  successPhone: {
    width: 180,
    height: 240,
    borderRadius: 28,
    backgroundColor: '#fff',
    alignItems: 'center',
    justifyContent: 'center',
    padding: 16,
  },
  successBadge: {
    width: 64,
    height: 64,
    borderRadius: 32,
    backgroundColor: '#22C55E',
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 14,
  },
  successTitle: {
    color: BRAND.navy,
    fontWeight: '800',
    fontSize: 14,
    marginBottom: 6,
  },
  successAmount: {
    color: BRAND.navy,
    fontWeight: '800',
    fontSize: 22,
  },
  successMeta: {
    color: BRAND.muted,
    fontSize: 12,
    marginTop: 4,
  },
  floatingCard: {
    position: 'absolute',
    right: 0,
    bottom: 24,
    width: 56,
    height: 40,
    borderRadius: 10,
    backgroundColor: '#fff',
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: '#000',
    shadowOpacity: 0.15,
    shadowRadius: 8,
    shadowOffset: { width: 0, height: 4 },
    elevation: 4,
  },
  footer: {
    backgroundColor: BRAND.white,
    borderTopWidth: 1,
    borderTopColor: BRAND.border,
    paddingTop: 28,
    paddingBottom: 24,
    paddingHorizontal: 24,
  },
  footerInner: {
    alignSelf: 'center',
    width: '100%',
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 16,
    marginBottom: 18,
  },
  footerStack: {
    flexDirection: 'column',
    alignItems: 'flex-start',
  },
  footerLogo: {
    width: 28,
    height: 28,
    borderRadius: 6,
  },
  footerBrand: {
    color: BRAND.navy,
    fontWeight: '800',
    fontSize: 16,
  },
  footerLinks: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 18,
  },
  footerLink: {
    color: BRAND.muted,
    fontWeight: '600',
    fontSize: 14,
  },
  socialRow: {
    flexDirection: 'row',
    gap: 8,
  },
  socialBtn: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: BRAND.orangeSoft,
    alignItems: 'center',
    justifyContent: 'center',
  },
  copyright: {
    textAlign: 'center',
    color: BRAND.muted,
    fontSize: 12,
  },
});
