import { useState } from 'react';
import { StyleSheet, View, TouchableOpacity, ActivityIndicator } from 'react-native';
import { useRouter } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { MaterialIcons } from '@expo/vector-icons';
import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { SupportConversationList } from '@/components/support-conversation-list';
import { useSupportConversations } from '@/hooks/use-support-conversations';

/**
 * Staff-only hub: list customer support threads and open the shared chat screen to reply.
 */
export default function SupportAdminScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const [filter, setFilter] = useState<'open' | 'all'>('open');
  const { rows, loading, refreshing, denied, refresh, openTotalExact, closedTotalExact } = useSupportConversations(filter);

  const onSelect = (id: string) => {
    router.push({
      pathname: '/support-chat',
      params: { conversationId: id, from: 'admin' },
    });
  };

  if (denied && !loading) {
    return (
      <ThemedView style={styles.container}>
        <View style={[styles.header, { paddingTop: Math.max(insets.top + 8, 16) }]}>
          <TouchableOpacity onPress={() => router.back()} style={styles.backBtn} hitSlop={12}>
            <MaterialIcons name="arrow-back" size={24} color="#333" />
          </TouchableOpacity>
          <ThemedText style={styles.headerTitle}>Support center</ThemedText>
          <View style={{ width: 40 }} />
        </View>
        <View style={styles.centered}>
          <MaterialIcons name="lock-outline" size={48} color="#ccc" />
          <ThemedText style={styles.deniedTitle}>Staff only</ThemedText>
          <ThemedText style={styles.deniedText}>Sign in with an account that has the admin role to use support chat.</ThemedText>
        </View>
      </ThemedView>
    );
  }

  return (
    <ThemedView style={styles.container}>
      <View style={[styles.header, { paddingTop: Math.max(insets.top + 8, 16) }]}>
        <TouchableOpacity onPress={() => router.back()} style={styles.backBtn} hitSlop={12}>
          <MaterialIcons name="arrow-back" size={24} color="#333" />
        </TouchableOpacity>
        <View style={styles.headerCenter}>
          <ThemedText style={styles.headerTitle}>Support center</ThemedText>
          <ThemedText style={styles.headerSub}>Customer chat · staff</ThemedText>
        </View>
        <View style={styles.staffBadge}>
          <MaterialIcons name="headset-mic" size={16} color="#FF7F00" />
          <ThemedText style={styles.staffBadgeText}>Staff</ThemedText>
        </View>
      </View>

      <View style={styles.statsRow}>
        <View style={styles.statCard}>
          <ThemedText style={styles.statValue}>{openTotalExact}</ThemedText>
          <ThemedText style={styles.statLabel}>Open (total)</ThemedText>
        </View>
        <View style={styles.statCard}>
          <ThemedText style={styles.statValue}>{closedTotalExact}</ThemedText>
          <ThemedText style={styles.statLabel}>Closed (total)</ThemedText>
        </View>
      </View>

      <View style={styles.filterRow}>
        <TouchableOpacity
          style={[styles.filterChip, filter === 'open' && styles.filterChipActive]}
          onPress={() => setFilter('open')}
          activeOpacity={0.8}>
          <ThemedText style={[styles.filterChipText, filter === 'open' && styles.filterChipTextActive]}>Open threads</ThemedText>
        </TouchableOpacity>
        <TouchableOpacity
          style={[styles.filterChip, filter === 'all' && styles.filterChipActive]}
          onPress={() => setFilter('all')}
          activeOpacity={0.8}>
          <ThemedText style={[styles.filterChipText, filter === 'all' && styles.filterChipTextActive]}>All</ThemedText>
        </TouchableOpacity>
      </View>

      {loading ? (
        <View style={styles.centered}>
          <ActivityIndicator size="large" color="#FF7F00" />
        </View>
      ) : (
        <SupportConversationList
          rows={rows}
          refreshing={refreshing}
          onRefresh={refresh}
          onSelectConversation={onSelect}
          emptyTitle={filter === 'open' ? 'No open threads' : 'No conversations yet'}
          emptySubtitle={
            filter === 'open'
              ? 'Open threads appear when customers start Chat support from Profile.'
              : 'Pull to refresh. Switch to Open threads to focus on active chats.'
          }
        />
      )}
    </ThemedView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#F8F9FC' },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 8,
    paddingBottom: 12,
    backgroundColor: '#fff',
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: '#E5E7EB',
  },
  backBtn: { padding: 8 },
  headerCenter: { flex: 1, minWidth: 0 },
  headerTitle: { fontSize: 18, fontWeight: '800', color: '#1E2533' },
  headerSub: { fontSize: 12, color: '#888', marginTop: 2 },
  staffBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    backgroundColor: '#FFF3E6',
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 20,
    marginRight: 4,
  },
  staffBadgeText: { fontSize: 12, fontWeight: '700', color: '#FF7F00' },
  statsRow: {
    flexDirection: 'row',
    paddingHorizontal: 16,
    paddingTop: 14,
    gap: 12,
  },
  statCard: {
    flex: 1,
    backgroundColor: '#fff',
    borderRadius: 12,
    padding: 14,
    borderWidth: 1,
    borderColor: '#E8ECF0',
  },
  statValue: { fontSize: 22, fontWeight: '800', color: '#1E2533' },
  statLabel: { fontSize: 12, color: '#888', marginTop: 4 },
  filterRow: {
    flexDirection: 'row',
    paddingHorizontal: 16,
    paddingTop: 14,
    gap: 10,
  },
  filterChip: {
    paddingVertical: 10,
    paddingHorizontal: 16,
    borderRadius: 20,
    backgroundColor: '#fff',
    borderWidth: 1,
    borderColor: '#E0E0E0',
  },
  filterChipActive: {
    backgroundColor: '#FF7F00',
    borderColor: '#FF7F00',
  },
  filterChipText: { fontSize: 14, fontWeight: '600', color: '#555' },
  filterChipTextActive: { color: '#fff' },
  centered: { flex: 1, justifyContent: 'center', alignItems: 'center', padding: 24 },
  deniedTitle: { fontSize: 18, fontWeight: '700', color: '#333', marginTop: 16 },
  deniedText: { fontSize: 14, color: '#666', textAlign: 'center', marginTop: 8 },
});
