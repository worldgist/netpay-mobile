import {
  ActivityIndicator,
  StyleSheet,
  View,
  ScrollView,
  RefreshControl,
  TouchableOpacity,
  Alert,
} from 'react-native';
import { ThemedView } from '@/components/themed-view';
import { ThemedText } from '@/components/themed-text';
import { MaterialIcons } from '@expo/vector-icons';
import { useFocusEffect } from '@react-navigation/native';
import { useCallback, useMemo, useRef, useState } from 'react';
import { supabase } from '@/lib/supabase';
import { useRouter } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

interface NotificationEntry {
  recipientId: string;
  notificationId: string;
  title: string;
  message: string;
  createdAt: string;
  isRead: boolean;
  readAt: string | null;
}

export default function NotificationsScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const [notifications, setNotifications] = useState<NotificationEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [processing, setProcessing] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const isMounted = useRef(true);
  const userIdRef = useRef<string | null>(null);

  const fetchNotifications = useCallback(
    async (refresh = false) => {
      try {
        if (refresh) {
          setRefreshing(true);
        } else {
          setLoading(true);
        }
        setErrorMessage(null);

        const { data: sessionData, error: sessionError } = await supabase.auth.getSession();
        if (sessionError) throw sessionError;

        const session = sessionData.session;
        if (!session) {
          router.replace('/auth/login');
          return;
        }

        userIdRef.current = session.user.id;

        const { data, error } = await supabase
          .from('notification_recipients')
          .select(
            `id, is_read, read_at, notifications:notifications ( id, title, message, created_at )`
          )
          .eq('user_id', session.user.id)
          .order('created_at', { ascending: false, referencedTable: 'notifications' });

        if (error) throw error;

        const mapped = (data || [])
          .filter((item: any) => item.notifications)
          .map((item: any) => ({
            recipientId: item.id,
            notificationId: item.notifications.id,
            title: item.notifications.title,
            message: item.notifications.message,
            createdAt: item.notifications.created_at,
            isRead: Boolean(item.is_read),
            readAt: item.read_at,
          })) as NotificationEntry[];

        // Sort: unread first, then by creation date (newest first)
        const sorted = mapped.sort((a, b) => {
          // First, sort by read status (unread first)
          if (a.isRead !== b.isRead) {
            return a.isRead ? 1 : -1;
          }
          // Then sort by creation date (newest first)
          return new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime();
        });

        if (isMounted.current) {
          setNotifications(sorted);
        }
      } catch (error) {
        console.error('Failed to load notifications:', error);
        if (isMounted.current) {
          setErrorMessage(error instanceof Error ? error.message : 'Unable to load notifications. Please try again.');
          setNotifications([]);
        }
      } finally {
        if (isMounted.current) {
          setLoading(false);
          setRefreshing(false);
        }
      }
    },
    [router]
  );

  useFocusEffect(
    useCallback(() => {
      isMounted.current = true;
      fetchNotifications();

      return () => {
        isMounted.current = false;
      };
    }, [fetchNotifications])
  );

  const unreadCount = useMemo(
    () => notifications.filter((entry) => !entry.isRead).length,
    [notifications]
  );

  const markAsRead = useCallback(
    async (entry: NotificationEntry) => {
      if (entry.isRead || processing || !userIdRef.current) return;

      try {
        setProcessing(true);
        const { error } = await supabase
          .from('notification_recipients')
          .update({ is_read: true, read_at: new Date().toISOString() })
          .eq('id', entry.recipientId)
          .eq('user_id', userIdRef.current);

        if (error) throw error;

        if (isMounted.current) {
          setNotifications((prev) =>
            prev.map((item) =>
              item.recipientId === entry.recipientId
                ? { ...item, isRead: true, readAt: new Date().toISOString() }
                : item
            )
          );
        }
      } catch (error) {
        console.error('Failed to mark notification as read:', error);
        Alert.alert('Notifications', error instanceof Error ? error.message : 'Unable to update notification.');
      } finally {
        if (isMounted.current) setProcessing(false);
      }
    },
    [processing]
  );

  const markAllAsRead = useCallback(async () => {
    if (processing || !userIdRef.current || unreadCount === 0) return;

    try {
      setProcessing(true);
      const { error } = await supabase
        .from('notification_recipients')
        .update({ is_read: true, read_at: new Date().toISOString() })
        .eq('user_id', userIdRef.current)
        .eq('is_read', false);

      if (error) throw error;

      if (isMounted.current) {
        setNotifications((prev) =>
          prev.map((item) => ({ ...item, isRead: true, readAt: item.readAt || new Date().toISOString() }))
        );
      }
    } catch (error) {
      console.error('Failed to mark all notifications as read:', error);
      Alert.alert('Notifications', error instanceof Error ? error.message : 'Unable to update notifications.');
    } finally {
      if (isMounted.current) setProcessing(false);
    }
  }, [processing, unreadCount]);

  const onRefresh = useCallback(() => {
    fetchNotifications(true);
  }, [fetchNotifications]);

  return (
    <ThemedView style={styles.container}>
      <View style={[styles.header, { paddingTop: insets.top + 8 }] }>
        <TouchableOpacity onPress={() => router.back()} style={styles.backButton}>
          <MaterialIcons name="arrow-back" size={22} color="#FF7F00" />
        </TouchableOpacity>
        <ThemedText style={styles.headerTitle}>Notifications</ThemedText>
        <TouchableOpacity
          onPress={markAllAsRead}
          disabled={unreadCount === 0 || processing}
          style={[
            styles.markAllButton,
            (unreadCount === 0 || processing) && styles.markAllTextDisabled,
          ]}
        >
          <ThemedText
            style={[
              styles.markAllText,
              (unreadCount === 0 || processing) && styles.markAllTextDisabled,
            ]}
          >
            Mark all
          </ThemedText>
        </TouchableOpacity>
      </View>

      {loading && !refreshing ? (
        <View style={styles.loadingOverlay}>
          <ActivityIndicator size="large" color="#FF7F00" />
        </View>
      ) : null}

      <ScrollView
        style={styles.scrollView}
        contentContainerStyle={[styles.scrollContent, { paddingBottom: insets.bottom + 24 }]}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor="#FF7F00" />}
        showsVerticalScrollIndicator={false}
      >
        {errorMessage ? (
          <View style={styles.errorBanner}>
            <MaterialIcons name="error-outline" size={20} color="#CC6600" />
            <ThemedText style={styles.errorText}>{errorMessage}</ThemedText>
          </View>
        ) : null}

        {notifications.length === 0 && !loading ? (
          <View style={styles.emptyState}>
            <MaterialIcons name="notifications-off" size={48} color="#FFB366" />
            <ThemedText style={styles.emptyTitle}>No notifications yet</ThemedText>
            <ThemedText style={styles.emptySubtitle}>
              When there's something new, it will show up here.
            </ThemedText>
          </View>
        ) : (
          notifications.map((entry) => {
            const created = new Date(entry.createdAt).toLocaleString();
            return (
              <TouchableOpacity
                key={entry.recipientId}
                style={[styles.notificationCard, !entry.isRead && styles.notificationCardUnread]}
                activeOpacity={entry.isRead ? 0.9 : 0.7}
                onPress={() => markAsRead(entry)}
              >
                <View style={styles.notificationHeader}>
                  <ThemedText style={styles.notificationTitle}>{entry.title}</ThemedText>
                  {!entry.isRead ? (
                    <View style={styles.unreadDot} />
                  ) : null}
                </View>
                <ThemedText style={styles.notificationMessage}>{entry.message}</ThemedText>
                <ThemedText style={styles.notificationTimestamp}>{created}</ThemedText>
              </TouchableOpacity>
            );
          })
        )}
      </ScrollView>
    </ThemedView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#FFF8F0',
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 20,
    paddingBottom: 12,
    borderBottomWidth: 2,
    borderBottomColor: '#FF7F00',
    backgroundColor: '#FFFFFF',
    shadowColor: '#FF7F00',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 4,
    elevation: 3,
  },
  backButton: {
    padding: 6,
    borderRadius: 8,
    backgroundColor: '#FFF4E6',
  },
  headerTitle: {
    fontSize: 22,
    fontWeight: '700',
    color: '#FF7F00',
  },
  markAllButton: {
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 8,
    backgroundColor: '#FF7F00',
  },
  markAllText: {
    fontSize: 14,
    fontWeight: '600',
    color: '#FFFFFF',
  },
  markAllTextDisabled: {
    color: '#CFCFCF',
    backgroundColor: '#F5F5F5',
  },
  loadingOverlay: {
    position: 'absolute',
    top: 0,
    bottom: 0,
    left: 0,
    right: 0,
    justifyContent: 'center',
    alignItems: 'center',
    zIndex: 10,
    backgroundColor: 'rgba(255, 255, 255, 0.9)',
  },
  scrollView: {
    flex: 1,
  },
  scrollContent: {
    paddingHorizontal: 20,
    paddingTop: 20,
  },
  errorBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    padding: 12,
    borderRadius: 12,
    backgroundColor: '#FFF4E6',
    borderWidth: 1,
    borderColor: '#FFB366',
    marginTop: 20,
    marginBottom: 12,
  },
  errorText: {
    fontSize: 14,
    color: '#CC6600',
    flex: 1,
  },
  emptyState: {
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 80,
    gap: 12,
  },
  emptyTitle: {
    fontSize: 18,
    fontWeight: '600',
    color: '#FF7F00',
  },
  emptySubtitle: {
    fontSize: 14,
    color: '#CC6600',
    textAlign: 'center',
    paddingHorizontal: 24,
  },
  notificationCard: {
    backgroundColor: '#FFFFFF',
    borderRadius: 16,
    borderWidth: 2,
    borderColor: '#FFE5CC',
    padding: 18,
    marginTop: 16,
    shadowColor: '#FF7F00',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.08,
    shadowRadius: 8,
    elevation: 2,
    gap: 10,
  },
  notificationCardUnread: {
    borderColor: '#FF7F00',
    backgroundColor: '#FFF8F0',
    borderLeftWidth: 4,
    borderLeftColor: '#FF7F00',
  },
  notificationHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 12,
  },
  notificationTitle: {
    fontSize: 16,
    fontWeight: '700',
    color: '#FF7F00',
    flex: 1,
  },
  unreadDot: {
    width: 12,
    height: 12,
    borderRadius: 6,
    backgroundColor: '#FF7F00',
    shadowColor: '#FF7F00',
    shadowOffset: { width: 0, height: 0 },
    shadowOpacity: 0.5,
    shadowRadius: 4,
    elevation: 2,
  },
  notificationMessage: {
    fontSize: 14,
    color: '#333',
    lineHeight: 20,
  },
  notificationTimestamp: {
    fontSize: 12,
    color: '#CC6600',
    fontWeight: '500',
  },
});


