import { Image } from 'expo-image';
import { StyleSheet, View } from 'react-native';
import { ThemedView } from '@/components/themed-view';
import { useEffect } from 'react';
import { useRouter } from 'expo-router';

export default function SplashScreen() {
  const router = useRouter();

  useEffect(() => {
    // Auto-navigate to onboarding after 3 seconds
    const timer = setTimeout(() => {
      router.replace('/onboarding');
    }, 3000);

    return () => clearTimeout(timer);
  }, [router]);

  return (
    <ThemedView style={styles.container}>
      <View style={styles.logoWrapper}>
        <Image
          source={require('@/assets/images/logo.png')}
          style={styles.logo}
          contentFit="contain"
        />
      </View>
    </ThemedView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: '#fff',
  },
  logoWrapper: {
    width: 180,
    height: 180,
    borderRadius: 90,
    justifyContent: 'center',
    alignItems: 'center',
    borderBottomWidth: 0,
  },
  logo: {
    width: '100%',
    height: '100%',
  },
});

