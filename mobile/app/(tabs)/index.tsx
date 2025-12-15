import {
  StyleSheet,
  View,
  ScrollView,
  TouchableOpacity,
  RefreshControl,
  ActivityIndicator,
  Image,
  Pressable,
  Alert,
} from 'react-native';
import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { MaterialIcons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import { useCallback, useRef, useState, useEffect } from 'react';
import { useFocusEffect } from '@react-navigation/native';
import { supabase } from '@/lib/supabase';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import type { RealtimeChannel } from '@supabase/supabase-js';
import { registerForPushNotifications } from '@/utils/push-notifications';

const NETWORK_LOGOS: Record<string, any> = {
  MTN: require('@/assets/images/mtn.png'),
  GLO: require('@/assets/images/glo.png'),
  AIRTEL: require('@/assets/images/airtel.png'),
  '9MOBILE': require('@/assets/images/9mobile.png'),
  '9 MOBILE': require('@/assets/images/9mobile.png'),
};

const formatCurrency = (value?: number | null) => {
  if (value === null || value === undefined || Number.isNaN(value)) {
    return '₦--';
  }
  return `₦${Number(value).toLocaleString()}`;
};

interface CombinedTransaction {
  id: string | number;
  type: string;
  amount: number;
  created_at: string;
  description?: string | null;
  transaction_type?: string | null;
  network?: string | null;
  recipient?: { full_name?: string | null } | null;
  sender?: { full_name?: string | null } | null;
}

type NotificationPreviewItem = {
  recipientId: string;
  notificationId: string;
  title: string;
  message: string;
  createdAt: string;
  isRead: boolean;
  readAt: string | null;
};

const formatNotificationTimestamp = (value: string) => {
  try {
    return new Date(value).toLocaleString('en-NG', {
      month: 'short',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    });
  } catch {
    return value;
  }
};

const SHOW_NOTIFICATION_PANEL = false;

export default function HomeScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const [balanceVisible, setBalanceVisible] = useState(true);
  const [balance, setBalance] = useState<number | null>(null);
  const [userName, setUserName] = useState('User');
  const [transactions, setTransactions] = useState<CombinedTransaction[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [unreadCount, setUnreadCount] = useState(0);
  const [notificationPreview, setNotificationPreview] = useState<NotificationPreviewItem[]>([]);
  const [notificationPanelVisible, setNotificationPanelVisible] = useState(false);
  const [notificationLoading, setNotificationLoading] = useState(false);
  const [notificationProcessing, setNotificationProcessing] = useState(false);
  const [userId, setUserId] = useState<string | null>(null);
  const isMounted = useRef(true);
  const notificationChannelRef = useRef<RealtimeChannel | null>(null);

  const fetchNotificationPreview = useCallback(
    async (targetUserId: string, options: { showSpinner?: boolean } = {}) => {
      if (!targetUserId) return;
      if (options.showSpinner) {
        setNotificationLoading(true);
      }

      try {
        const { data, error } = await supabase
          .from('notification_recipients')
          .select(
            `id, is_read, read_at, notifications:notifications ( id, title, message, created_at )`
          )
          .eq('user_id', targetUserId)
          .order('created_at', { ascending: false, referencedTable: 'notifications' })
          .limit(5);

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
          })) as NotificationPreviewItem[];

        if (isMounted.current) {
          setNotificationPreview(mapped);
        }
      } catch (err) {
        console.error('Failed to load notification preview:', err);
        if (isMounted.current) {
          if (options.showSpinner) {
            Alert.alert('Notifications', err instanceof Error ? err.message : 'Unable to load notifications.');
          }
          setNotificationPreview([]);
        }
      } finally {
        if (isMounted.current && options.showSpinner) {
          setNotificationLoading(false);
        }
      }
    },
    []
  );

  useEffect(() => {
    isMounted.current = true;
    
    // Register for push notifications when home screen loads
    const registerPush = async () => {
      try {
        const { data: { session } } = await supabase.auth.getSession();
        if (session?.user) {
          const result = await registerForPushNotifications();
          if (result.registered) {
            console.log('Push notifications registered from home screen');
          } else {
            console.log('Push notification registration from home:', result.reason);
          }
        }
      } catch (error) {
        console.error('Error registering push notifications from home:', error);
      }
    };
    
    registerPush();
    
    return () => {
      isMounted.current = false;
    };
  }, []);

  const fetchDashboardData = useCallback(
    async ({ refresh = false }: { refresh?: boolean } = {}) => {
      if (!refresh) {
        if (isMounted.current) setLoading(true);
      } else {
        if (isMounted.current) setRefreshing(true);
      }
      if (isMounted.current) setError(null);

      try {
        const { data: sessionData, error: sessionError } = await supabase.auth.getSession();
        if (sessionError) throw sessionError;

        const session = sessionData.session;
        if (!session) {
          router.replace('/auth/login');
          return;
        }

        if (isMounted.current) {
          setUserId((prev) => (prev === session.user.id ? prev : session.user.id));
        }

        const userId = session.user.id;
        setUserId(userId);

        const { data: profile, error: profileError } = await supabase
          .from('profiles')
          .select('balance, full_name')
          .eq('id', userId)
          .single();

        if (profileError) throw profileError;

        if (isMounted.current) {
          setBalance(Number(profile?.balance) || 0);
          const firstName = profile?.full_name?.split(' ')[0] || session.user.email?.split('@')[0] || 'User';
          setUserName(firstName);
        }

        console.log('Fetching transactions for user:', userId);
        
        const [userTxns, airtimeTxns, dataTxns, transfersSent, transfersReceived] = await Promise.all([
          supabase
            .from('user_transactions')
            .select('*')
            .eq('user_id', userId)
            .order('created_at', { ascending: false })
            .limit(3),
          supabase
            .from('airtime_transactions')
            .select('*')
            .eq('user_id', userId)
            .order('created_at', { ascending: false })
            .limit(2),
          supabase
            .from('data_transactions')
            .select('*')
            .eq('user_id', userId)
            .order('created_at', { ascending: false })
            .limit(2),
          supabase
            .from('transfer_transactions')
            .select('*, recipient:profiles!transfer_transactions_recipient_id_fkey(full_name)')
            .eq('sender_id', userId)
            .order('created_at', { ascending: false })
            .limit(2),
          supabase
            .from('transfer_transactions')
            .select('*, sender:profiles!transfer_transactions_sender_id_fkey(full_name)')
            .eq('recipient_id', userId)
            .order('created_at', { ascending: false })
            .limit(2),
        ]);

        // Log transaction counts and errors for debugging
        console.log('Transaction fetch results:', {
          userId,
          user: userTxns.data?.length || 0,
          airtime: airtimeTxns.data?.length || 0,
          data: dataTxns.data?.length || 0,
          transfersSent: transfersSent.data?.length || 0,
          transfersReceived: transfersReceived.data?.length || 0,
          errors: {
            user: userTxns.error?.message || userTxns.error?.code,
            airtime: airtimeTxns.error?.message || airtimeTxns.error?.code,
            data: dataTxns.error?.message || dataTxns.error?.code,
            transfersSent: transfersSent.error?.message || transfersSent.error?.code,
            transfersReceived: transfersReceived.error?.message || transfersReceived.error?.code,
          },
          errorDetails: {
            user: userTxns.error,
            airtime: airtimeTxns.error,
            data: dataTxns.error,
            transfersSent: transfersSent.error,
            transfersReceived: transfersReceived.error,
          }
        });

        // Check for RLS errors
        const hasRLSErrors = [
          userTxns.error,
          airtimeTxns.error,
          dataTxns.error,
          transfersSent.error,
          transfersReceived.error,
        ].some(err => err && (err.code === '42501' || err.message?.includes('permission') || err.message?.includes('policy')));

        if (hasRLSErrors) {
          console.error('RLS Policy errors detected. User may not have permission to view transactions.');
          console.error('User ID:', userId);
          console.error('Errors:', {
            user: userTxns.error,
            airtime: airtimeTxns.error,
            data: dataTxns.error,
            transfersSent: transfersSent.error,
            transfersReceived: transfersReceived.error,
          });
        }

        const combined: CombinedTransaction[] = [
          ...((userTxns.data || []).map((txn) => ({ ...txn, type: 'user' })) as CombinedTransaction[]),
          ...((airtimeTxns.data || []).map((txn) => ({ ...txn, type: 'airtime' })) as CombinedTransaction[]),
          ...((dataTxns.data || []).map((txn) => ({ ...txn, type: 'data' })) as CombinedTransaction[]),
          ...((transfersSent.data || []).map((txn) => ({ ...txn, type: 'transfer_sent' })) as CombinedTransaction[]),
          ...((transfersReceived.data || []).map((txn) => ({ ...txn, type: 'transfer_received' })) as CombinedTransaction[]),
        ]
          .sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime())
          .slice(0, 5);

        console.log('Combined transactions count:', combined.length);
        console.log('User email from session:', session.user.email);
        console.log('Is demo user:', session.user.email === 'demo@netpayy.ng');
        console.log('Sample transaction IDs:', combined.slice(0, 3).map(t => ({ id: t.id, type: t.type, created_at: t.created_at })));
        
        // If no transactions found, check if user has any transactions at all (for debugging)
        if (combined.length === 0) {
          console.log('No transactions found. Checking if user has any transactions in database...');
          const { data: checkTxns, error: checkError } = await supabase
            .from('user_transactions')
            .select('id, created_at')
            .eq('user_id', userId)
            .limit(1);
          console.log('Direct transaction check:', { count: checkTxns?.length || 0, error: checkError });
        }

        if (isMounted.current) {
          setTransactions(combined);
          console.log('Transactions state updated. Count:', combined.length);
        }

        const { count: unreadCountResult, error: unreadError } = await supabase
          .from('notification_recipients')
          .select('*', { count: 'exact', head: true })
          .eq('user_id', userId)
          .eq('is_read', false);

        if (isMounted.current) {
          setUnreadCount(unreadCountResult || 0);
        }

        await fetchNotificationPreview(userId);

        const errors = [userTxns.error, airtimeTxns.error, dataTxns.error, transfersSent.error, transfersReceived.error, unreadError].filter(Boolean);
        if (errors.length && isMounted.current) {
          setError('Some transactions could not be loaded.');
        }
      } catch (err) {
        if (isMounted.current) {
          setError(err instanceof Error ? err.message : 'Unable to load dashboard data.');
          setTransactions([]);
        }
      } finally {
        if (isMounted.current) {
          if (refresh) {
            setRefreshing(false);
          } else {
            setLoading(false);
          }
        }
      }
    },
    [router, fetchNotificationPreview]
  );

  useFocusEffect(
    useCallback(() => {
      fetchDashboardData();
    }, [fetchDashboardData])
  );

  const onRefresh = useCallback(() => {
    fetchDashboardData({ refresh: true });
  }, [fetchDashboardData]);

  const closeNotificationPanel = useCallback(() => {
    setNotificationPanelVisible(false);
  }, []);

  const handleNotificationBellPress = useCallback(() => {
    setNotificationPanelVisible(false);
    router.push('/notifications');
  }, [router]);

  const updateNotificationReadState = useCallback(
    async (entry: NotificationPreviewItem, shouldRead: boolean) => {
      if (!userId || notificationProcessing || entry.isRead === shouldRead) return;

      try {
        setNotificationProcessing(true);
        const timestamp = shouldRead ? new Date().toISOString() : null;

        const { error } = await supabase
          .from('notification_recipients')
          .update({ is_read: shouldRead, read_at: timestamp })
          .eq('id', entry.recipientId)
          .eq('user_id', userId);

        if (error) throw error;

        if (isMounted.current) {
          setNotificationPreview((prev) =>
            prev.map((item) =>
              item.recipientId === entry.recipientId
                ? { ...item, isRead: shouldRead, readAt: timestamp }
                : item
            )
          );

          if (shouldRead && !entry.isRead) {
            setUnreadCount((prev) => (prev > 0 ? prev - 1 : 0));
          } else if (!shouldRead && entry.isRead) {
            setUnreadCount((prev) => prev + 1);
          }
        }
      } catch (err) {
        console.error('Failed to update notification state:', err);
        Alert.alert('Notifications', err instanceof Error ? err.message : 'Unable to update notification.');
      } finally {
        if (isMounted.current) {
          setNotificationProcessing(false);
        }
      }
    },
    [notificationProcessing, userId]
  );

  const handleNotificationToggle = useCallback(
    (entry: NotificationPreviewItem) => {
      updateNotificationReadState(entry, !entry.isRead);
    },
    [updateNotificationReadState]
  );

  const handleNotificationEntryOpen = useCallback(
    async (entry: NotificationPreviewItem) => {
      if (!entry.isRead) {
        await updateNotificationReadState(entry, true);
      }
      closeNotificationPanel();
      router.push('/notifications');
    },
    [closeNotificationPanel, router, updateNotificationReadState]
  );

  const handleMarkAllNotifications = useCallback(async () => {
    if (!userId || notificationProcessing || unreadCount === 0) return;

    try {
      setNotificationProcessing(true);
      const timestamp = new Date().toISOString();
      const { error } = await supabase
        .from('notification_recipients')
        .update({ is_read: true, read_at: timestamp })
        .eq('user_id', userId)
        .eq('is_read', false);

      if (error) throw error;

      if (isMounted.current) {
        setNotificationPreview((prev) =>
          prev.map((item) => (item.isRead ? item : { ...item, isRead: true, readAt: timestamp }))
        );
        setUnreadCount(0);
      }
    } catch (err) {
      console.error('Failed to mark all notifications as read:', err);
      Alert.alert('Notifications', err instanceof Error ? err.message : 'Unable to update notifications.');
    } finally {
      if (isMounted.current) {
        setNotificationProcessing(false);
      }
    }
  }, [notificationProcessing, unreadCount, userId]);

  const handleViewAllNotifications = useCallback(() => {
    closeNotificationPanel();
    router.push('/notifications');
  }, [closeNotificationPanel, router]);

  const renderTransactionIcon = (txn: CombinedTransaction) => {
    const networkLogo = txn.network ? NETWORK_LOGOS[(txn.network || '').toUpperCase()] : null;

    if (networkLogo) {
      return <Image source={networkLogo} style={styles.transactionLogo} />;
    }

    if (txn.type === 'transfer_sent') {
      return (
        <View style={[styles.transactionIconCircle, { backgroundColor: '#fdecea' }]}> 
          <MaterialIcons name="north-east" size={20} color="#d32f2f" />
        </View>
      );
    }

    if (txn.type === 'transfer_received') {
      return (
        <View style={[styles.transactionIconCircle, { backgroundColor: '#e8f5e9' }]}> 
          <MaterialIcons name="south-west" size={20} color="#2e7d32" />
        </View>
      );
    }

    return (
      <View style={styles.transactionIconCircle}> 
        <MaterialIcons name="receipt" size={20} color="#555" />
      </View>
    );
  };

  const renderTransactionTitle = (txn: CombinedTransaction) => {
    switch (txn.type) {
      case 'transfer_sent':
        return `Transfer to ${txn.recipient?.full_name || 'User'}`;
      case 'transfer_received':
        return `Transfer from ${txn.sender?.full_name || 'User'}`;
      case 'airtime':
        return `${txn.network || 'Airtime'} Purchase`;
      case 'data':
        return `${txn.network || 'Data'} Bundle`;
      default:
        return txn.description || txn.transaction_type || 'Transaction';
    }
  };

  const renderTransactionAmount = (txn: CombinedTransaction, isCredit: boolean) => {
    const prefix = isCredit ? '+' : '-';
    const color = isCredit ? '#2e7d32' : '#000';
    return (
      <ThemedText style={[styles.transactionAmount, { color }]}>
        {`${prefix}${formatCurrency(Math.abs(Number(txn.amount)))}`}
      </ThemedText>
    );
  };

  const handleTransactionPress = (txn: CombinedTransaction) => {
    const baseCategory =
      txn.type === 'user'
        ? 'wallet'
        : txn.type === 'transfer_sent' || txn.type === 'transfer_received'
        ? txn.type
        : txn.type;

    const isCredit =
      txn.type === 'transfer_received' ||
      (typeof txn.transaction_type === 'string' && txn.transaction_type.toLowerCase().includes('credit'));

    const status = (txn as any)?.status || (isCredit ? 'Completed' : 'Completed');
    const createdAt = txn.created_at;
    const description = renderTransactionTitle(txn);
    const params: Record<string, string> = {
      id: String(txn.id),
      category: baseCategory,
      type: isCredit ? 'credit' : 'debit',
      amount: String(txn.amount ?? 0),
      status: status || 'Completed',
      reference: String((txn as any)?.reference || ''),
      description: description || '',
      serviceType:
        baseCategory === 'airtime'
          ? 'Airtime VTU'
          : baseCategory === 'data'
          ? 'Data Bundle'
          : baseCategory === 'transfer_sent' || baseCategory === 'transfer_received'
          ? 'Transfer'
          : 'Wallet Transaction',
      network: String((txn as any)?.network || ''),
      date: createdAt,
      time: createdAt,
      meterType: String((txn as any)?.meter_type || ''),
      token: String((txn as any)?.token || ''),
      meterNumber: String((txn as any)?.meter_number || ''),
      customerName: String((txn as any)?.customer_name || ''),
      planName: String((txn as any)?.plan_name || ''),
      planValidity: String((txn as any)?.plan_validity || ''),
      phoneNumber: String((txn as any)?.phone_number || ''),
      recipient:
        baseCategory === 'transfer_sent'
          ? String(txn.recipient?.full_name || (txn as any)?.recipient || '')
          : baseCategory === 'airtime' || baseCategory === 'data'
          ? String((txn as any)?.phone_number || '')
          : '',
      sender:
        baseCategory === 'transfer_received'
          ? String(txn.sender?.full_name || (txn as any)?.sender || '')
          : '',
    };

    router.push({
      pathname: '/transaction-details',
      params,
    });
  };

  const displayedTransactions = transactions.slice(0, 3);
  
  // Debug log for rendering
  if (displayedTransactions.length > 0) {
    console.log('Rendering transactions. Count:', displayedTransactions.length, 'IDs:', displayedTransactions.map(t => t.id));
  }

  return (
    <ThemedView style={styles.container}>
      {SHOW_NOTIFICATION_PANEL && notificationPanelVisible && (
        <>
          <Pressable style={styles.notificationOverlay} onPress={closeNotificationPanel} />
          <View style={[styles.notificationPanel, { top: insets.top + 56 }]}>
            <View style={styles.notificationPanelHeader}>
              <ThemedText style={styles.notificationPanelTitle}>Notifications</ThemedText>
              <TouchableOpacity
                onPress={handleMarkAllNotifications}
                disabled={notificationProcessing || unreadCount === 0}
                hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
              >
                <ThemedText
                  style={[
                    styles.notificationPanelActionText,
                    (notificationProcessing || unreadCount === 0) && styles.notificationPanelActionTextDisabled,
                  ]}
                >
                  Mark all read
                </ThemedText>
              </TouchableOpacity>
            </View>
            <View style={styles.notificationPanelBody}>
              {notificationLoading ? (
                <View style={styles.notificationPanelLoading}>
                  <ActivityIndicator size="small" color="#FF7F00" />
                </View>
              ) : notificationPreview.length === 0 ? (
                <View style={styles.notificationPanelEmpty}>
                  <MaterialIcons name="notifications-none" size={28} color="#999" />
                  <ThemedText style={styles.notificationPanelEmptyText}>You're all caught up</ThemedText>
                </View>
              ) : (
                notificationPreview.map((entry) => (
                  <View
                    key={entry.recipientId}
                    style={[styles.notificationPanelItem, !entry.isRead && styles.notificationPanelItemUnread]}
                  >
                    <Pressable
                      style={styles.notificationPanelItemContent}
                      onPress={() => handleNotificationEntryOpen(entry)}
                    >
                      <View style={styles.notificationPanelItemHeader}>
                        <ThemedText style={styles.notificationPanelItemTitle} numberOfLines={1}>
                          {entry.title}
                        </ThemedText>
                        {!entry.isRead && <View style={styles.notificationPreviewUnreadDot} />}
                      </View>
                      <ThemedText style={styles.notificationPanelItemMessage} numberOfLines={2}>
                        {entry.message}
                      </ThemedText>
                      <ThemedText style={styles.notificationPanelItemTimestamp}>
                        {formatNotificationTimestamp(entry.createdAt)}
                      </ThemedText>
                    </Pressable>
                    <TouchableOpacity
                      style={styles.notificationPanelToggleButton}
                      onPress={() => handleNotificationToggle(entry)}
                      disabled={notificationProcessing}
                      activeOpacity={0.7}
                    >
                      <ThemedText
                        style={[
                          styles.notificationPanelToggleText,
                          entry.isRead
                            ? styles.notificationPanelToggleTextSecondary
                            : styles.notificationPanelToggleTextPrimary,
                          notificationProcessing && styles.notificationPanelToggleTextDisabled,
                        ]}
                      >
                        {entry.isRead ? 'Mark unread' : 'Mark read'}
                      </ThemedText>
                    </TouchableOpacity>
                  </View>
                ))
              )}
            </View>
            <TouchableOpacity
              style={styles.notificationPanelFooter}
              onPress={handleViewAllNotifications}
              activeOpacity={0.8}
            >
              <ThemedText style={styles.notificationPanelFooterText}>View all notifications</ThemedText>
              <MaterialIcons name="chevron-right" size={20} color="#FF7F00" />
            </TouchableOpacity>
          </View>
        </>
      )}

      {loading && !refreshing ? (
        <View style={styles.loadingContainer}>
          <ActivityIndicator size="large" color="#FF7F00" />
        </View>
      ) : null}

      <ScrollView
        style={styles.scrollView}
        showsVerticalScrollIndicator={false}
        contentContainerStyle={[styles.scrollContent, { paddingBottom: insets.bottom + 32 }]}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor="#FF7F00" />}>
        <View style={[styles.header, { paddingTop: insets.top + 8 }] }>
          <ThemedText style={styles.headerTitle}>Home</ThemedText>
          <TouchableOpacity
            style={styles.notificationButton}
            onPress={handleNotificationBellPress}
            activeOpacity={0.8}
            hitSlop={{ top: 8, right: 8, bottom: 8, left: 8 }}
          >
            <MaterialIcons name="notifications" size={28} color="#333" />
            {unreadCount > 0 && (
              <View style={styles.notificationBadge}>
                <ThemedText style={styles.notificationBadgeText}>
                  {unreadCount > 9 ? '9+' : unreadCount}
                </ThemedText>
              </View>
            )}
          </TouchableOpacity>
        </View>

        <View style={styles.welcomeSection}>
          <View style={styles.welcomeTextGroup}>
            <ThemedText style={styles.welcomeGreeting}>Hello,</ThemedText>
            <ThemedText style={styles.welcomeName}>{userName}</ThemedText>
          </View>
          <ThemedText style={styles.welcomeBack}>Welcome back!</ThemedText>
        </View>

        <View style={styles.balanceCard}>
          <View style={styles.balanceHeader}>
            <ThemedText style={styles.balanceLabel}>Available Balance</ThemedText>
            <TouchableOpacity onPress={() => setBalanceVisible(!balanceVisible)} style={styles.eyeButton}>
              <MaterialIcons name={balanceVisible ? 'visibility' : 'visibility-off'} size={22} color="#fff" />
            </TouchableOpacity>
          </View>
          <View style={styles.balanceAmountContainer}>
            {loading && !refreshing && balance === null ? (
              <ActivityIndicator color="#fff" />
            ) : (
              <ThemedText style={styles.balanceAmount}>
                {balanceVisible ? formatCurrency(balance) : '₦••••'}
              </ThemedText>
            )}
          </View>
          <View style={styles.balanceButtons}>
            <TouchableOpacity style={styles.addMoneyButton} onPress={() => router.push('/add-money')} activeOpacity={0.8}>
              <ThemedText style={styles.addMoneyText}>Add Money</ThemedText>
            </TouchableOpacity>
            <TouchableOpacity style={styles.transferButton} onPress={() => router.push('/transfer')} activeOpacity={0.8}>
              <ThemedText style={styles.transferText}>Transfer</ThemedText>
            </TouchableOpacity>
          </View>
        </View>

        <View style={styles.transactionsSection}>
          <View style={styles.sectionHeader}>
            <ThemedText style={styles.sectionTitle}>Recent Transactions</ThemedText>
            <TouchableOpacity
              style={styles.viewAllButton}
              onPress={() => router.push('/(tabs)/transactions')}
              activeOpacity={0.8}>
              <ThemedText style={styles.viewAllButtonText}>View All</ThemedText>
            </TouchableOpacity>
          </View>

          {error ? (
            <View style={styles.errorContainer}>
              <ThemedText style={styles.errorText}>{error}</ThemedText>
            </View>
          ) : null}

          {!loading && transactions.length === 0 ? (
            <View style={styles.emptyState}>
              <MaterialIcons name="receipt-long" size={40} color="#bbb" />
              <ThemedText style={styles.emptyStateText}>No transactions yet</ThemedText>
            </View>
          ) : (
            displayedTransactions.map((txn) => {
              const isCredit =
                txn.type === 'transfer_received' ||
                (typeof txn.transaction_type === 'string' && txn.transaction_type.toLowerCase().includes('credit'));

              return (
                <TouchableOpacity
                  key={`${txn.type}-${txn.id}`}
                  style={styles.transactionItem}
                  activeOpacity={0.85}
                  onPress={() => handleTransactionPress(txn)}>
                  {renderTransactionIcon(txn)}
                  <View style={styles.transactionDetails}>
                    <ThemedText style={styles.transactionType}>{renderTransactionTitle(txn)}</ThemedText>
                    <ThemedText style={styles.transactionDate}>
                      {new Date(txn.created_at).toLocaleString()}
                    </ThemedText>
                  </View>
                  <View style={styles.transactionAmountContainer}>
                    {renderTransactionAmount(txn, isCredit)}
                    <ThemedText style={styles.transactionStatus}>
                      {isCredit ? 'Credit' : 'Debit'}
                    </ThemedText>
                  </View>
                </TouchableOpacity>
              );
            })
          )}
        </View>
      </ScrollView>
    </ThemedView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#f7f7f7',
  },
  scrollView: {
    flex: 1,
  },
  scrollContent: {
    paddingBottom: 32,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 20,
    paddingBottom: 12,
  },
  headerTitle: {
    fontSize: 24,
    fontWeight: 'bold',
    color: '#333',
  },
  welcomeSection: {
    backgroundColor: '#fff',
    marginHorizontal: 20,
    marginTop: 16,
    marginBottom: 12,
    borderRadius: 16,
    paddingVertical: 16,
    paddingHorizontal: 20,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.08,
    shadowRadius: 6,
    elevation: 2,
  },
  welcomeTextGroup: {
    flexDirection: 'row',
    alignItems: 'center',
    flexWrap: 'wrap',
    gap: 6,
  },
  welcomeGreeting: {
    fontSize: 16,
    color: '#666',
  },
  welcomeName: {
    fontSize: 24,
    fontWeight: '700',
    color: '#111',
  },
  welcomeBack: {
    marginTop: 6,
    fontSize: 14,
    color: '#888',
  },
  balanceCard: {
    backgroundColor: '#FF7F00',
    borderRadius: 20,
    padding: 24,
    marginHorizontal: 20,
    marginBottom: 32,
  },
  balanceHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 20,
  },
  balanceLabel: {
    fontSize: 14,
    color: '#fff',
    opacity: 0.95,
    fontWeight: '500',
  },
  eyeButton: {
    padding: 4,
  },
  balanceAmountContainer: {
    marginBottom: 24,
    minHeight: 60,
    justifyContent: 'center',
    paddingVertical: 8,
  },
  balanceAmount: {
    fontSize: 32,
    fontWeight: 'bold',
    color: '#fff',
    lineHeight: 40,
  },
  balanceButtons: {
    flexDirection: 'row',
    gap: 12,
  },
  addMoneyButton: {
    flex: 1,
    backgroundColor: '#FF9500',
    borderRadius: 12,
    paddingVertical: 12,
    alignItems: 'center',
  },
  addMoneyText: {
    color: '#fff',
    fontSize: 16,
    fontWeight: '600',
  },
  transferButton: {
    flex: 1,
    backgroundColor: '#fff',
    borderRadius: 12,
    paddingVertical: 12,
    alignItems: 'center',
  },
  transferText: {
    color: '#FF7F00',
    fontSize: 16,
    fontWeight: '600',
  },
  transactionsSection: {
    paddingHorizontal: 20,
    marginBottom: 40,
  },
  sectionHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 16,
  },
  sectionTitle: {
    fontSize: 20,
    fontWeight: 'bold',
    color: '#333',
  },
  seeAllText: {
    fontSize: 16,
    color: '#FF7F00',
    fontWeight: '600',
  },
  viewAllButton: {
    paddingHorizontal: 14,
    paddingVertical: 8,
    backgroundColor: '#FF7F00',
    borderRadius: 20,
  },
  viewAllButtonText: {
    color: '#fff',
    fontSize: 14,
    fontWeight: '600',
  },
  transactionItem: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#F5F5F5',
    borderRadius: 12,
    padding: 16,
    marginBottom: 12,
  },
  transactionIconCircle: {
    width: 48,
    height: 48,
    borderRadius: 24,
    backgroundColor: '#E0E0E0',
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: 12,
  },
  transactionLogo: {
    width: 48,
    height: 48,
    borderRadius: 24,
    marginRight: 12,
    resizeMode: 'contain',
  },
  transactionDetails: {
    flex: 1,
  },
  transactionType: {
    fontSize: 16,
    fontWeight: '600',
    color: '#333',
    marginBottom: 4,
  },
  transactionDate: {
    fontSize: 14,
    color: '#666',
  },
  transactionAmountContainer: {
    alignItems: 'flex-end',
  },
  transactionAmount: {
    fontSize: 18,
    fontWeight: 'bold',
    color: '#4CAF50',
    marginBottom: 4,
  },
  transactionStatus: {
    fontSize: 14,
    color: '#4CAF50',
    opacity: 0.8,
  },
  emptyState: {
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 32,
    gap: 12,
  },
  emptyStateText: {
    fontSize: 16,
    color: '#777',
  },
  errorContainer: {
    backgroundColor: '#fdecea',
    borderRadius: 12,
    padding: 12,
    marginBottom: 12,
  },
  errorText: {
    color: '#d32f2f',
    fontSize: 14,
  },
  loadingContainer: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    alignItems: 'center',
    justifyContent: 'center',
    zIndex: 1,
    backgroundColor: 'rgba(255,255,255,0.6)',
  },
  notificationButton: {
    position: 'relative',
    padding: 4,
  },
  notificationOverlay: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(0,0,0,0.15)',
    zIndex: 15,
  },
  notificationPanel: {
    position: 'absolute',
    right: 20,
    width: 300,
    backgroundColor: '#fff',
    borderRadius: 16,
    paddingVertical: 12,
    paddingHorizontal: 16,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.12,
    shadowRadius: 12,
    elevation: 6,
    zIndex: 20,
  },
  notificationPanelHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 8,
  },
  notificationPanelTitle: {
    fontSize: 16,
    fontWeight: '700',
    color: '#1E2533',
  },
  notificationPanelActionText: {
    fontSize: 12,
    fontWeight: '600',
    color: '#FF7F00',
  },
  notificationPanelActionTextDisabled: {
    color: '#BCC0C6',
  },
  notificationPanelBody: {
    maxHeight: 280,
    paddingVertical: 4,
  },
  notificationPanelLoading: {
    paddingVertical: 20,
    alignItems: 'center',
    justifyContent: 'center',
  },
  notificationPanelEmpty: {
    paddingVertical: 24,
    alignItems: 'center',
    justifyContent: 'center',
  },
  notificationPanelEmptyText: {
    fontSize: 13,
    color: '#707A8A',
    marginTop: 8,
  },
  notificationPanelItem: {
    borderRadius: 14,
    backgroundColor: '#F6F7FA',
    padding: 12,
    marginBottom: 10,
  },
  notificationPanelItemUnread: {
    backgroundColor: '#FFF4EC',
  },
  notificationPanelItemContent: {
    marginBottom: 10,
  },
  notificationPanelItemHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 6,
  },
  notificationPreviewUnreadDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: '#FF3B30',
    marginLeft: 8,
  },
  notificationPanelItemTitle: {
    fontSize: 14,
    fontWeight: '600',
    color: '#1E2533',
    flex: 1,
  },
  notificationPanelItemMessage: {
    fontSize: 13,
    color: '#4E5A6D',
    marginBottom: 4,
  },
  notificationPanelItemTimestamp: {
    fontSize: 11,
    color: '#8A94A6',
  },
  notificationPanelToggleButton: {
    alignSelf: 'flex-start',
  },
  notificationPanelToggleText: {
    fontSize: 12,
    fontWeight: '600',
  },
  notificationPanelToggleTextPrimary: {
    color: '#FF7F00',
  },
  notificationPanelToggleTextSecondary: {
    color: '#4E5A6D',
  },
  notificationPanelToggleTextDisabled: {
    color: '#B0B0B0',
  },
  notificationPanelFooter: {
    marginTop: 4,
    paddingTop: 12,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: '#E5E7EB',
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  notificationPanelFooterText: {
    fontSize: 14,
    fontWeight: '600',
    color: '#FF7F00',
  },
  notificationBadge: {
    position: 'absolute',
    top: -4,
    right: -2,
    minWidth: 16,
    height: 16,
    borderRadius: 8,
    backgroundColor: '#FF3B30',
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 3,
  },
  notificationBadgeText: {
    fontSize: 10,
    fontWeight: 'bold',
    color: '#fff',
    lineHeight: 12,
  },
});
