import { View, StyleSheet, TouchableOpacity, Platform } from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { SeoHead } from '@/components/seo-head';

const BRAND = '#FF7F00';

export default function ChatgptOAuthSuccessScreen() {
  const router = useRouter();
  const { redirect } = useLocalSearchParams<{ redirect?: string }>();

  return (
    <ThemedView style={styles.container}>
      <SeoHead page="home" path="/chatgpt/oauth/success" title="NetPay connected" />
      <View style={styles.card}>
        <ThemedText style={styles.brand}>NetPay</ThemedText>
        <ThemedText style={styles.title}>Connected</ThemedText>
        <ThemedText style={styles.sub}>
          Your NetPay account is linked. You can return to ChatGPT and continue.
        </ThemedText>
        {typeof redirect === 'string' && redirect && Platform.OS === 'web' ? (
          <TouchableOpacity
            style={styles.btn}
            onPress={() => {
              window.location.href = redirect;
            }}
          >
            <ThemedText style={styles.btnText}>Continue</ThemedText>
          </TouchableOpacity>
        ) : (
          <TouchableOpacity style={styles.btn} onPress={() => router.replace('/(tabs)')}>
            <ThemedText style={styles.btnText}>Back to NetPay</ThemedText>
          </TouchableOpacity>
        )}
      </View>
    </ThemedView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#0f1115', justifyContent: 'center', padding: 24 },
  card: {
    backgroundColor: '#1a1d24',
    borderRadius: 16,
    padding: 24,
    borderWidth: 1,
    borderColor: 'rgba(255,127,0,0.25)',
    maxWidth: 480,
    width: '100%',
    alignSelf: 'center',
  },
  brand: { color: BRAND, fontSize: 22, fontWeight: '800' },
  title: { color: '#fff', fontSize: 24, fontWeight: '700', marginTop: 8 },
  sub: { color: '#9aa3b2', marginTop: 10, lineHeight: 22 },
  btn: {
    marginTop: 20,
    backgroundColor: BRAND,
    borderRadius: 12,
    paddingVertical: 14,
    alignItems: 'center',
  },
  btnText: { color: '#111', fontWeight: '700' },
});
