import { useCallback, useState } from 'react';
import { StyleSheet, View, ScrollView, TouchableOpacity, RefreshControl } from 'react-native';
import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { MaterialIcons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import { useFocusEffect } from '@react-navigation/native';
import { supabase } from '@/lib/supabase';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

export default function SecurityScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const [pinEnabled, setPinEnabled] = useState(false);
  const [refreshing, setRefreshing] = useState(false);

  const fetchSecurityState = useCallback(async () => {
    try {
      const { data: sessionData, error: sessionError } = await supabase.auth.getSession();
      if (sessionError) throw sessionError;

      const session = sessionData.session;
      if (!session) {
        router.replace('/auth/login');
        return;
      }

      const { data: profile, error: profileError } = await supabase
        .from('profiles')
        .select('pin_enabled')
        .eq('id', session.user.id)
        .maybeSingle();

      if (!profileError) {
        setPinEnabled(Boolean(profile?.pin_enabled));
      }
    } catch (error) {
      console.error('Failed to load security state:', error);
    }
  }, [router]);

  useFocusEffect(
    useCallback(() => {
      fetchSecurityState();
    }, [fetchSecurityState])
  );

  const handleRefresh = useCallback(async () => {
    setRefreshing(true);
    await fetchSecurityState();
    setRefreshing(false);
  }, [fetchSecurityState]);

  return (
    <ThemedView style={styles.container}>
      <ScrollView
        style={styles.scrollView}
        showsVerticalScrollIndicator={false}
        contentContainerStyle={[styles.scrollContent, { paddingTop: Math.max(insets.top + 16, 24), paddingBottom: insets.bottom + 32 }]}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={handleRefresh} tintColor="#FF7F00" />}
      >
        <View style={styles.header}>
          <TouchableOpacity style={styles.backButton} onPress={() => router.back()} activeOpacity={0.7}>
            <MaterialIcons name="arrow-back" size={24} color="#333" />
          </TouchableOpacity>
          <ThemedText style={styles.headerTitle}>Security</ThemedText>
          <View style={styles.headerSpacer} />
        </View>

        <View style={styles.section}>
          <TouchableOpacity
            style={styles.optionCard}
            onPress={() => router.push(pinEnabled ? '/change-pin' : '/setup-pin')}
            activeOpacity={0.7}>
            <View style={styles.optionLeft}>
              <MaterialIcons name="lock" size={24} color="#FF7F00" />
              <View style={styles.optionTextContainer}>
                <ThemedText style={styles.optionTitle}>{pinEnabled ? 'Change PIN' : 'Set Up PIN'}</ThemedText>
                <ThemedText style={styles.optionDescription}>
                  {pinEnabled ? 'Change your transaction PIN' : 'Set up your transaction PIN'}
                </ThemedText>
              </View>
            </View>
            <MaterialIcons name="chevron-right" size={24} color="#999" />
          </TouchableOpacity>

          <TouchableOpacity
            style={styles.optionCard}
            onPress={() => router.push('/change-password')}
            activeOpacity={0.7}>
            <View style={styles.optionLeft}>
              <MaterialIcons name="password" size={24} color="#FF7F00" />
              <View style={styles.optionTextContainer}>
                <ThemedText style={styles.optionTitle}>Reset Password</ThemedText>
                <ThemedText style={styles.optionDescription}>Create a new password for your account</ThemedText>
              </View>
            </View>
            <MaterialIcons name="chevron-right" size={24} color="#999" />
          </TouchableOpacity>
        </View>
      </ScrollView>
    </ThemedView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#fff',
  },
  scrollView: {
    flex: 1,
  },
  scrollContent: {
    paddingHorizontal: 20,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 20,
  },
  backButton: {
    width: 40,
    height: 40,
    justifyContent: 'center',
    alignItems: 'flex-start',
  },
  headerTitle: {
    fontSize: 20,
    fontWeight: '700',
    color: '#333',
  },
  headerSpacer: {
    width: 40,
  },
  section: {
    marginBottom: 24,
  },
  optionCard: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: '#F5F5F5',
    borderRadius: 12,
    padding: 16,
    marginBottom: 12,
  },
  optionLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    flex: 1,
  },
  optionTextContainer: {
    marginLeft: 12,
    flex: 1,
  },
  optionTitle: {
    fontSize: 14,
    fontWeight: '500',
    color: '#333',
  },
  optionDescription: {
    fontSize: 12,
    color: '#666',
    marginTop: 2,
  },
});
