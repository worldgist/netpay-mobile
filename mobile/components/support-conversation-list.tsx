import { StyleSheet, View, TouchableOpacity, FlatList, RefreshControl } from 'react-native';
import { MaterialIcons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { ThemedText } from '@/components/themed-text';
import type { SupportConversationRow } from '@/hooks/use-support-conversations';

type Props = {
  rows: SupportConversationRow[];
  refreshing: boolean;
  onRefresh: () => void;
  onSelectConversation: (id: string) => void;
  emptyTitle?: string;
  emptySubtitle?: string;
};

export function SupportConversationList({
  rows,
  refreshing,
  onRefresh,
  onSelectConversation,
  emptyTitle = 'No conversations',
  emptySubtitle = 'When customers use Chat support, their threads show up here.',
}: Props) {
  const insets = useSafeAreaInsets();

  const formatTime = (iso: string) => {
    try {
      const d = new Date(iso);
      return d.toLocaleString(undefined, { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' });
    } catch {
      return '';
    }
  };

  return (
    <FlatList
      data={rows}
      keyExtractor={(item) => item.id}
      contentContainerStyle={[styles.listContent, { paddingBottom: insets.bottom + 24 }]}
      refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor="#FF7F00" />}
      ListEmptyComponent={
        <View style={styles.empty}>
          <MaterialIcons name="forum" size={48} color="#ccc" />
          <ThemedText style={styles.emptyTitle}>{emptyTitle}</ThemedText>
          <ThemedText style={styles.emptySub}>{emptySubtitle}</ThemedText>
        </View>
      }
      renderItem={({ item }) => {
        const profile = Array.isArray(item.profiles) ? item.profiles[0] : item.profiles;
        const name = profile?.full_name?.trim() || profile?.email || 'Customer';
        const email = profile?.email || '';
        const isOpen = item.status === 'open';
        return (
          <TouchableOpacity
            style={styles.row}
            activeOpacity={0.75}
            onPress={() => onSelectConversation(item.id)}>
            <View style={[styles.rowIcon, !isOpen && styles.rowIconMuted]}>
              <MaterialIcons name="person" size={22} color={isOpen ? '#FF7F00' : '#999'} />
            </View>
            <View style={styles.rowBody}>
              <View style={styles.rowTitleRow}>
                <ThemedText style={styles.rowTitle} numberOfLines={1}>
                  {name}
                </ThemedText>
                <View style={[styles.pill, isOpen ? styles.pillOpen : styles.pillClosed]}>
                  <ThemedText style={[styles.pillText, isOpen ? styles.pillTextOpen : styles.pillTextClosed]}>
                    {isOpen ? 'Open' : 'Closed'}
                  </ThemedText>
                </View>
              </View>
              {email ? (
                <ThemedText style={styles.rowSub} numberOfLines={1}>
                  {email}
                </ThemedText>
              ) : null}
              <ThemedText style={styles.rowMeta}>{formatTime(item.last_message_at)}</ThemedText>
            </View>
            <MaterialIcons name="chat" size={22} color="#FF7F00" />
          </TouchableOpacity>
        );
      }}
    />
  );
}

const styles = StyleSheet.create({
  listContent: { paddingHorizontal: 16, paddingTop: 8 },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#fff',
    borderRadius: 12,
    padding: 14,
    marginBottom: 10,
    borderWidth: 1,
    borderColor: '#E8ECF0',
  },
  rowIcon: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: '#FFF3E6',
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 12,
  },
  rowIconMuted: { backgroundColor: '#F0F2F5' },
  rowBody: { flex: 1, minWidth: 0 },
  rowTitleRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  rowTitle: { flex: 1, fontSize: 16, fontWeight: '600', color: '#1E2533', minWidth: 0 },
  rowSub: { fontSize: 13, color: '#666', marginTop: 2 },
  rowMeta: { fontSize: 12, color: '#999', marginTop: 4 },
  pill: { paddingHorizontal: 8, paddingVertical: 3, borderRadius: 8 },
  pillOpen: { backgroundColor: '#E8F5E9' },
  pillClosed: { backgroundColor: '#F0F0F0' },
  pillText: { fontSize: 11, fontWeight: '700' },
  pillTextOpen: { color: '#2e7d32' },
  pillTextClosed: { color: '#666' },
  empty: { alignItems: 'center', paddingVertical: 48 },
  emptyTitle: { fontSize: 17, fontWeight: '600', color: '#333', marginTop: 12 },
  emptySub: { fontSize: 14, color: '#666', textAlign: 'center', marginTop: 8, paddingHorizontal: 20 },
});
