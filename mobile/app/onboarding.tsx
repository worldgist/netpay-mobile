import { Image } from 'expo-image';
import { StyleSheet, View, Dimensions, ScrollView, TouchableOpacity } from 'react-native';
import { ThemedView } from '@/components/themed-view';
import { ThemedText } from '@/components/themed-text';
import { useRouter } from 'expo-router';
import { useState } from 'react';

const { width, height } = Dimensions.get('window');

export default function OnboardingScreen() {
  const router = useRouter();
  const [currentPage, setCurrentPage] = useState(0);

  const handleNext = () => {
    if (currentPage < 2) {
      setCurrentPage(currentPage + 1);
    } else {
      // Navigate to login after onboarding
      router.replace('/auth/login');
    }
  };

  const handleSkip = () => {
    router.replace('/auth/login');
  };

  return (
    <ThemedView style={styles.container}>
      <ScrollView
        horizontal
        pagingEnabled
        showsHorizontalScrollIndicator={false}
        onMomentumScrollEnd={(event) => {
          const page = Math.round(event.nativeEvent.contentOffset.x / width);
          setCurrentPage(page);
        }}
        style={styles.scrollView}>
        {/* Page 1 */}
        <View style={[styles.page, { width }]}>
          <Image
            source={require('@/assets/images/splash1.png')}
            style={styles.onboardingImage}
            contentFit="contain"
          />
          <View style={styles.contentContainer}>
            <ThemedText type="title" style={styles.title}>
              Welcome to NetPay
            </ThemedText>
            <ThemedText style={styles.description}>
              Your all-in-one payment solution for seamless transactions
            </ThemedText>
          </View>
        </View>

        {/* Page 2 */}
        <View style={[styles.page, { width }]}>
          <Image
            source={require('@/assets/images/splash1.png')}
            style={styles.onboardingImage}
            contentFit="contain"
          />
          <View style={styles.contentContainer}>
            <ThemedText type="title" style={styles.title}>
              Secure & Fast
            </ThemedText>
            <ThemedText style={styles.description}>
              Experience lightning-fast payments with bank-level security
            </ThemedText>
          </View>
        </View>

        {/* Page 3 */}
        <View style={[styles.page, { width }]}>
          <Image
            source={require('@/assets/images/splash1.png')}
            style={styles.onboardingImage}
            contentFit="contain"
          />
          <View style={styles.contentContainer}>
            <ThemedText type="title" style={styles.title}>
              Get Started
            </ThemedText>
            <ThemedText style={styles.description}>
              Start making payments and managing your finances today
            </ThemedText>
          </View>
        </View>
      </ScrollView>

      {/* Pagination Dots */}
      <View style={styles.pagination}>
        {[0, 1, 2].map((index) => (
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
            {currentPage === 2 ? 'Get Started' : 'Next'}
          </ThemedText>
        </TouchableOpacity>
      </View>
    </ThemedView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  scrollView: {
    flex: 1,
  },
  page: {
    height,
    alignItems: 'center',
    justifyContent: 'flex-start',
    paddingTop: 100,
    paddingHorizontal: 32,
  },
  onboardingImage: {
    width: width * 0.75,
    height: height * 0.35,
    marginBottom: 48,
  },
  contentContainer: {
    alignItems: 'center',
    paddingHorizontal: 16,
    alignItems: 'center',
    width: '100%',
  },
  title: {
    textAlign: 'center',
    marginBottom: 20,
    color: '#fff',
  },
  description: {
    textAlign: 'center',
    fontSize: 16,
    lineHeight: 24,
    color: '#fff',
    opacity: 0.9,
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
    backgroundColor: 'rgba(255, 255, 255, 0.4)',
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
  },
  skipButtonText: {
    fontSize: 16,
    color: '#fff',
    opacity: 0.8,
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

