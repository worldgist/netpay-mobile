import { useEffect } from 'react';
import { ActivityIndicator, StyleSheet, View } from 'react-native';
import { useRouter } from 'expo-router';
import { ThemedView } from '@/components/themed-view';

/**
 * Legacy route: staff inbox now lives at /support-admin.
 */
export default function SupportInboxScreen() {
  const router = useRouter();

  useEffect(() => {
    router.replace('/support-admin');
  }, [router]);

  return (
    <ThemedView style={styles.container}>
      <View style={styles.centered}>
        <ActivityIndicator size="large" color="#FF7F00" />
      </View>
    </ThemedView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#F8F9FC' },
  centered: { flex: 1, justifyContent: 'center', alignItems: 'center' },
});
