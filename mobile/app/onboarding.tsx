import { useRef, useState } from 'react';
import {
  Dimensions,
  ScrollView,
  StyleSheet,
  TouchableOpacity,
  View,
} from 'react-native';
import { useRouter } from 'expo-router';
import { MaterialIcons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { ThemedText } from '@/components/themed-text';
import { Onboarding3DIcon, type OnboardingIconVariant } from '@/components/onboarding/onboarding-3d-icon';
import { markOnboardingCompleted } from '@/utils/onboarding';

const { width } = Dimensions.get('window');

const BRAND = {
  orange: '#FF7F00',
  orangeLight: '#FFF3E8',
  orangeBorder: '#FFD9B3',
  navy: '#1A2B4A',
  textMuted: '#667085',
  white: '#FFFFFF',
};

type Slide = {
  variant: OnboardingIconVariant;
  eyebrow: string;
  title: string;
  description: string;
};

const slides: Slide[] = [
  {
    variant: 'mobile-bills',
    eyebrow: 'Mobile services',
    title: 'Airtime & Data',
    description: 'Top up airtime and buy data bundles for MTN, Airtel, Glo, and 9mobile in seconds.',
  },
  {
    variant: 'utility-bills',
    eyebrow: 'Home utilities',
    title: 'Electricity & Cable TV',
    description: 'Pay electricity bills and renew DStv, GOtv, StarTimes, and other cable subscriptions easily.',
  },
  {
    variant: 'lifestyle-bills',
    eyebrow: 'Everyday services',
    title: 'Education & Betting',
    description: 'Purchase exam pins, education services, and fund betting accounts from one wallet.',
  },
];

export default function OnboardingScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const scrollRef = useRef<ScrollView | null>(null);
  const [currentPage, setCurrentPage] = useState(0);

  const completeOnboarding = async () => {
    await markOnboardingCompleted();
    router.replace('/auth/login');
  };

  const handleNext = async () => {
    if (currentPage < slides.length - 1) {
      const nextPage = currentPage + 1;
      setCurrentPage(nextPage);
      scrollRef.current?.scrollTo({ x: nextPage * width, animated: true });
      return;
    }

    await completeOnboarding();
  };

  const handleSkip = async () => {
    await completeOnboarding();
  };

  const isLastSlide = currentPage === slides.length - 1;

  return (
    <View style={styles.container}>
      <View style={styles.backgroundTop} />
      <View style={styles.backgroundOrbPrimary} />
      <View style={styles.backgroundOrbSecondary} />

      <View style={[styles.topBar, { paddingTop: insets.top + 8 }]}>
        <View style={styles.logoRow}>
          <ThemedText style={styles.logoText}>NetPay</ThemedText>
        </View>
        <TouchableOpacity onPress={handleSkip} style={styles.skipChip} activeOpacity={0.85}>
          <ThemedText style={styles.skipChipText}>Skip</ThemedText>
        </TouchableOpacity>
      </View>

      <ScrollView
        ref={scrollRef}
        horizontal
        pagingEnabled
        showsHorizontalScrollIndicator={false}
        onMomentumScrollEnd={(event) => {
          const page = Math.round(event.nativeEvent.contentOffset.x / width);
          setCurrentPage(page);
        }}
        style={styles.scrollView}
        contentContainerStyle={styles.scrollContent}>
        {slides.map((slide) => (
          <View key={slide.title} style={[styles.page, { width }]}>
            <View style={styles.iconStage}>
              <Onboarding3DIcon variant={slide.variant} size={240} />
            </View>

            <View style={styles.copyCard}>
              <View style={styles.eyebrowPill}>
                <ThemedText style={styles.eyebrowText}>{slide.eyebrow}</ThemedText>
              </View>
              <ThemedText style={styles.title}>{slide.title}</ThemedText>
              <ThemedText style={styles.description}>{slide.description}</ThemedText>
            </View>
          </View>
        ))}
      </ScrollView>

      <View style={[styles.footer, { paddingBottom: Math.max(insets.bottom, 20) }]}>
        <View style={styles.pagination}>
          {slides.map((slide, index) => (
            <View
              key={slide.title}
              style={[styles.dot, currentPage === index && styles.activeDot]}
            />
          ))}
        </View>

        <TouchableOpacity onPress={handleNext} style={styles.primaryButton} activeOpacity={0.9}>
          <ThemedText style={styles.primaryButtonText}>
            {isLastSlide ? 'Get Started' : 'Continue'}
          </ThemedText>
          <MaterialIcons
            name={isLastSlide ? 'arrow-forward' : 'chevron-right'}
            size={22}
            color={BRAND.white}
          />
        </TouchableOpacity>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: BRAND.white,
  },
  backgroundTop: {
    ...StyleSheet.absoluteFill,
    backgroundColor: BRAND.orangeLight,
    height: '48%',
  },
  backgroundOrbPrimary: {
    position: 'absolute',
    width: 220,
    height: 220,
    borderRadius: 110,
    backgroundColor: 'rgba(255, 127, 0, 0.14)',
    top: -40,
    right: -50,
  },
  backgroundOrbSecondary: {
    position: 'absolute',
    width: 160,
    height: 160,
    borderRadius: 80,
    backgroundColor: 'rgba(26, 43, 74, 0.08)',
    top: 120,
    left: -40,
  },
  topBar: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 20,
    paddingBottom: 8,
    zIndex: 2,
  },
  logoRow: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  logoText: {
    fontSize: 20,
    fontWeight: '800',
    color: BRAND.navy,
    letterSpacing: 0.2,
  },
  skipChip: {
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: 999,
    backgroundColor: 'rgba(255,255,255,0.85)',
    borderWidth: 1,
    borderColor: BRAND.orangeBorder,
  },
  skipChipText: {
    fontSize: 14,
    fontWeight: '600',
    color: BRAND.orange,
  },
  scrollView: {
    flex: 1,
  },
  scrollContent: {
    flexGrow: 1,
  },
  page: {
    flex: 1,
    paddingHorizontal: 24,
    justifyContent: 'space-between',
    paddingBottom: 12,
  },
  iconStage: {
    flex: 1,
    minHeight: 260,
    alignItems: 'center',
    justifyContent: 'center',
    paddingTop: 12,
    overflow: 'visible',
  },
  copyCard: {
    backgroundColor: BRAND.white,
    borderRadius: 24,
    paddingHorizontal: 22,
    paddingVertical: 24,
    borderWidth: 1,
    borderColor: '#EEF2F6',
    shadowColor: '#1A2B4A',
    shadowOffset: { width: 0, height: 10 },
    shadowOpacity: 0.08,
    shadowRadius: 20,
    elevation: 4,
    marginBottom: 8,
  },
  eyebrowPill: {
    alignSelf: 'flex-start',
    backgroundColor: BRAND.orangeLight,
    borderRadius: 999,
    paddingHorizontal: 12,
    paddingVertical: 6,
    marginBottom: 14,
    borderWidth: 1,
    borderColor: BRAND.orangeBorder,
  },
  eyebrowText: {
    fontSize: 12,
    fontWeight: '700',
    color: BRAND.orange,
    letterSpacing: 0.3,
    textTransform: 'uppercase',
  },
  title: {
    fontSize: 30,
    lineHeight: 36,
    fontWeight: '800',
    color: BRAND.navy,
    marginBottom: 12,
  },
  description: {
    fontSize: 16,
    lineHeight: 24,
    color: BRAND.textMuted,
  },
  footer: {
    paddingHorizontal: 24,
    paddingTop: 8,
    gap: 16,
  },
  pagination: {
    flexDirection: 'row',
    justifyContent: 'center',
    alignItems: 'center',
    gap: 8,
  },
  dot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: '#D0D5DD',
  },
  activeDot: {
    width: 28,
    backgroundColor: BRAND.orange,
  },
  primaryButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    backgroundColor: BRAND.orange,
    borderRadius: 16,
    minHeight: 56,
    shadowColor: BRAND.orange,
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.28,
    shadowRadius: 14,
    elevation: 5,
  },
  primaryButtonText: {
    fontSize: 17,
    fontWeight: '700',
    color: BRAND.white,
  },
});
