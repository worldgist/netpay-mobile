import { StyleSheet, View, Dimensions, ScrollView, TouchableOpacity } from 'react-native';
import { ThemedText } from '@/components/themed-text';
import { useRouter } from 'expo-router';
import { useRef, useState } from 'react';
import * as SecureStore from 'expo-secure-store';
import { Image } from 'expo-image';

const ONBOARDING_COMPLETED_KEY = 'onboarding_completed';

const { width, height } = Dimensions.get('window');

const slides = [
  {
    image: require('@/assets/images/splash1.png'),
    title: 'Pay Bills Faster',
    description: 'Airtime, data, electricity, cable TV, education, and betting in one app.',
  },
  {
    image: require('@/assets/images/splash2.png'),
    title: 'Fund & Transfer Easily',
    description: 'Top up with your virtual account and send money securely in seconds.',
  },
  {
    image: require('@/assets/images/splash.png'),
    title: 'Track Every Payment',
    description: 'Get transaction records, receipts, and statement history whenever you need them.',
  },
];

export default function OnboardingScreen() {
  const router = useRouter();
  const [currentPage, setCurrentPage] = useState(0);
  const scrollRef = useRef<ScrollView | null>(null);

  const completeOnboarding = async () => {
    await SecureStore.setItemAsync(ONBOARDING_COMPLETED_KEY, 'true');
    router.replace('/auth/login');
  };

  const handleNext = async () => {
    if (currentPage < slides.length - 1) {
      const nextPage = currentPage + 1;
      setCurrentPage(nextPage);
      if (scrollRef.current) {
        scrollRef.current.scrollTo({ x: nextPage * width, animated: true });
      }
    } else {
      // Persist onboarding completion and continue to login.
      await completeOnboarding();
    }
  };

  const handleSkip = async () => {
    await completeOnboarding();
  };

  return (
    <View style={styles.container}>
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
        {slides.map((slide, index) => (
          <View key={slide.title} style={[styles.page, { width }]}> 
            <Image
              source={slide.image}
              style={styles.backgroundImage}
              contentFit="cover"
            />
            <View style={styles.slideBackground}>
              <View style={styles.contentContainer}>
                <ThemedText type="title" style={styles.title}>
                  {slide.title}
                </ThemedText>
                <ThemedText style={styles.description}>{slide.description}</ThemedText>
              </View>
            </View>
          </View>
        ))}
      </ScrollView>

      {/* Pagination Dots */}
      <View style={styles.pagination}>
        {slides.map((_, index) => (
          <View
            key={index}
            style={[
              styles.dot,
              currentPage === index && styles.activeDot,
            ]}
          />
        ))}
      </View>

      {/* Action Buttons */}
      <View style={styles.buttonContainer}>
        <TouchableOpacity onPress={handleSkip} style={styles.skipButton}>
          <ThemedText style={styles.skipButtonText}>Skip</ThemedText>
        </TouchableOpacity>
        <TouchableOpacity onPress={handleNext} style={styles.nextButton}>
          <ThemedText style={styles.nextButtonText}>
            {currentPage === slides.length - 1 ? 'Get Started' : 'Next'}
          </ThemedText>
        </TouchableOpacity>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#000',
  },
  scrollView: {
    flex: 1,
  },
  scrollContent: {
    flexGrow: 1,
  },
  page: {
    height,
    width,
    justifyContent: 'center',
    position: 'relative',
    overflow: 'hidden',
  },
  backgroundImage: {
    width,
    height,
    position: 'absolute',
    top: 0,
    left: 0,
  },
  slideBackground: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: 24,
    backgroundColor: 'rgba(0, 0, 0, 0.35)',
  },
  contentContainer: {
    alignItems: 'center',
    paddingHorizontal: 16,
    width: '100%',
    marginTop: 'auto',
    marginBottom: 200,
  },
  title: {
    textAlign: 'center',
    marginBottom: 20,
    color: '#fff',
    fontSize: 34,
  },
  description: {
    textAlign: 'center',
    fontSize: 16,
    lineHeight: 24,
    color: '#fff',
    opacity: 0.95,
    maxWidth: 320,
  },
  pagination: {
    flexDirection: 'row',
    justifyContent: 'center',
    alignItems: 'center',
    position: 'absolute',
    bottom: 120,
    left: 0,
    right: 0,
    gap: 8,
  },
  dot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: 'rgba(255, 255, 255, 0.45)',
  },
  activeDot: {
    width: 24,
    backgroundColor: '#fff',
  },
  buttonContainer: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 30,
    paddingBottom: 50,
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
  },
  skipButton: {
    paddingVertical: 12,
    paddingHorizontal: 20,
    borderRadius: 25,
    borderWidth: 2,
    borderColor: '#FF7F00',
    alignItems: 'center',
  },
  skipButtonText: {
    fontSize: 16,
    color: '#FF7F00',
    fontWeight: '600',
  },
  nextButton: {
    backgroundColor: '#FF7F00',
    paddingVertical: 12,
    paddingHorizontal: 30,
    borderRadius: 25,
    minWidth: 120,
    alignItems: 'center',
  },
  nextButtonText: {
    fontSize: 16,
    fontWeight: '600',
    color: '#fff',
  },
});

