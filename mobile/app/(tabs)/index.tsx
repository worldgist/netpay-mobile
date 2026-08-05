import {
  StyleSheet,
  View,
  ScrollView,
  TouchableOpacity,
  RefreshControl,
  Pressable,
  Alert,
  Dimensions,
  NativeSyntheticEvent,
  NativeScrollEvent,
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
import { useThemeColor } from '@/hooks/use-theme-color';
import { Image } from 'expo-image';
import { NetpayLoadingAnimation } from '@/components/netpay-loading-animation';
import { useProfile } from '@/contexts/profile-context';
import { useTransactions, type MobileTransaction } from '@/contexts/transactions-context';
import { getWalletTransactionLabel, isFundWalletTransaction, NGN_LOGO } from '@/utils/transaction-display';

const SCREEN_WIDTH = Dimensions.get('window').width;
const HORIZONTAL_PADDING = 20;
const SERVICE_CARD_WIDTH = SCREEN_WIDTH - HORIZONTAL_PADDING * 2;

const SERVICE_PAGES = [
  [
    { id: 'airtime', label: 'Airtime', icon: 'smartphone' as const, route: '/airtime-purchase' },
    { id: 'data', label: 'Data', icon: 'wifi' as const, route: '/data-purchase' },
    { id: 'electricity', label: 'Electricity', icon: 'flash-on' as const, route: '/electricity' },
    { id: 'cable', label: 'Cable TV', icon: 'tv' as const, route: '/cable-tv' },
  ],
  [
    { id: 'education', label: 'Education', icon: 'school' as const, route: '/education' },
    { id: 'betting', label: 'Betting', icon: 'casino' as const, route: '/betting' },
    { id: 'flight', label: 'Flights', icon: 'flight' as const, route: '/flight-booking' },
    { id: 'pay-bills', label: 'Pay Bills', icon: 'credit-card' as const, route: '/(tabs)/pay-bills' },
  ],
] as const;

const NETWORK_LOGOS: Record<string, any> = {
  NGN: NGN_LOGO,
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

const formatUnreadBadgeCount = (count: number) => (count > 99 ? '99+' : String(count));

const SHOW_NOTIFICATION_PANEL = false;

export default function HomeScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { profile } = useProfile();
  const { transactions: cachedTransactions, refresh: refreshTransactions } = useTransactions();
  const headerIconColor = useThemeColor({}, 'icon');
  const [balanceVisible, setBalanceVisible] = useState(true);
  const [balance, setBalance] = useState<number | null>(null);
  const [userName, setUserName] = useState('User');
  const [loading, setLoading] = useState(true);
  const [servicePage, setServicePage] = useState(0);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [unreadCount, setUnreadCount] = useState(0);
  const [notificationPreview, setNotificationPreview] = useState<NotificationPreviewItem[]>([]);
  const [notificationPanelVisible, setNotificationPanelVisible] = useState(false);
  const [notificationLoading, setNotificationLoading] = useState(false);
  const [notificationProcessing, setNotificationProcessing] = useState(false);
  const [userId, setUserId] = useState<string | null>(null);
  const isMounted = useRef(true);
  const balanceChannelRef = useRef<RealtimeChannel | null>(null);
  const hasShownPushSetupAlertRef = useRef(false);

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
    if (profile?.full_name) {
      setUserName(profile.full_name.split(' ')[0] || 'User');
    }
  }, [profile?.full_name]);

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
            const reason = (result.reason || '').toLowerCase();
            if (
              !hasShownPushSetupAlertRef.current &&
              (reason.includes('android push notifications are not available in expo go') ||
                reason.includes('development build'))
            ) {
              hasShownPushSetupAlertRef.current = true;
              Alert.alert(
                'Android Notifications Setup',
                'Push notifications do not work in Expo Go on Android. Build and install a development build (or production APK/AAB), then test again.',
              );
            }
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

        const { count: unreadCountResult, error: unreadError } = await supabase
          .from('notification_recipients')
          .select('*', { count: 'exact', head: true })
          .eq('user_id', userId)
          .eq('is_read', false);

        if (isMounted.current) {
          setUnreadCount(unreadCountResult || 0);
        }

        await fetchNotificationPreview(userId);

        if (unreadError && isMounted.current) {
          setError('Some dashboard data could not be loaded.');
        }
      } catch (err) {
        if (isMounted.current) {
          setError(err instanceof Error ? err.message : 'Unable to load dashboard data.');
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

  useEffect(() => {
    if (!userId) {
      return;
    }

    if (balanceChannelRef.current) {
      supabase.removeChannel(balanceChannelRef.current);
      balanceChannelRef.current = null;
    }

    const channel = supabase
      .channel(`wallet-balance-${userId}`)
      .on(
        'postgres_changes',
        {
          event: 'UPDATE',
          schema: 'public',
          table: 'profiles',
          filter: `id=eq.${userId}`,
        },
        () => {
          fetchDashboardData({ refresh: true });
        }
      )
      .subscribe();

    balanceChannelRef.current = channel;

    return () => {
      if (balanceChannelRef.current) {
        supabase.removeChannel(balanceChannelRef.current);
        balanceChannelRef.current = null;
      }
    };
  }, [fetchDashboardData, userId]);

  const onRefresh = useCallback(() => {
    fetchDashboardData({ refresh: true });
    void refreshTransactions();
  }, [fetchDashboardData, refreshTransactions]);

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

  const renderTransactionIcon = (txn: MobileTransaction) => {
    if (isFundWalletTransaction(txn)) {
      return <Image source={NGN_LOGO} style={styles.transactionLogo} contentFit="contain" />;
    }

    const networkLogo = txn.provider ? NETWORK_LOGOS[(txn.provider || '').toUpperCase()] : null;

    if (networkLogo) {
      return <Image source={networkLogo} style={styles.transactionLogo} />;
    }

    if (txn.category === 'transfer_sent') {
      return (
        <View style={[styles.transactionIconCircle, { backgroundColor: '#fdecea' }]}>
          <MaterialIcons name="north-east" size={20} color="#d32f2f" />
        </View>
      );
    }

    if (txn.category === 'transfer_received') {
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

  const renderTransactionTitle = (txn: MobileTransaction) => {
    switch (txn.category) {
      case 'transfer_sent':
        return 'Transfer Sent';
      case 'transfer_received':
        return 'Transfer Received';
      case 'airtime':
        return `${txn.provider || 'Airtime'} Purchase`;
      case 'data':
        return `${txn.provider || 'Data'} Bundle`;
      case 'wallet':
        return getWalletTransactionLabel(txn);
      case 'electricity':
        return `${txn.provider || 'Electricity'} Purchase`;
      case 'education':
        return `${txn.provider || 'Education'} Purchase`;
      case 'betting':
        return `${txn.provider || 'Betting'} Purchase`;
      default:
        return txn.description || 'Transaction';
    }
  };

  const renderTransactionAmount = (txn: MobileTransaction) => {
    const isCredit = txn.type === 'credit';
    const prefix = isCredit ? '+' : '-';
    const color = isCredit ? '#2e7d32' : '#000';
    return (
      <ThemedText style={[styles.transactionAmount, { color }]}>
        {`${prefix}${formatCurrency(Math.abs(Number(txn.amount)))}`}
      </ThemedText>
    );
  };

  const handleTransactionPress = (txn: MobileTransaction) => {
    router.push({
      pathname: '/transaction-details',
      params: {
        id: txn.id,
        category: txn.category,
        type: txn.type,
        amount: txn.amount.toString(),
        status: txn.status || '',
        reference: txn.reference || '',
        description: txn.description || '',
        serviceType: txn.serviceType || '',
        network: txn.provider || '',
        date: txn.formattedDate,
        time: txn.formattedTime,
        meterType: txn.extra?.meterType || '',
        token: txn.extra?.token || '',
        meterNumber: txn.extra?.meter_number || '',
        customerName: txn.extra?.customerName || '',
        phoneNumber: txn.extra?.phone_number || '',
        educationPin: txn.extra?.educationPin || '',
        educationSerial: txn.extra?.educationSerial || '',
        examType: txn.extra?.examType || '',
        accountNumber: txn.extra?.account_number || '',
        sourceTable: txn.extra?.sourceTable || '',
      },
    });
  };

  const handleServiceScroll = (event: NativeSyntheticEvent<NativeScrollEvent>) => {
    const page = Math.round(event.nativeEvent.contentOffset.x / SERVICE_CARD_WIDTH);
    setServicePage(page);
  };

  const displayedTransactions = cachedTransactions.slice(0, 3);

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
                  <NetpayLoadingAnimation size={36} strokeWidth={3} />
                </View>
              ) : notificationPreview.length === 0 ? (
                <View style={styles.notificationPanelEmpty}>
                  <MaterialIcons name="notifications-none" size={28} color="#999" />
                  <ThemedText style={styles.notificationPanelEmptyText}>You&apos;re all caught up</ThemedText>
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

      <View style={[styles.header, { paddingTop: insets.top + 8 }]}>
        <View style={styles.headerTitleWrap}>
          <ThemedText style={styles.headerTitle} numberOfLines={1}>
            Home
          </ThemedText>
        </View>
        <TouchableOpacity
          style={styles.notificationButton}
          onPress={handleNotificationBellPress}
          activeOpacity={0.8}
          hitSlop={{ top: 8, right: 8, bottom: 8, left: 8 }}
          accessibilityRole="button"
          accessibilityLabel={
            unreadCount > 0 ? `Notifications, ${unreadCount} unread` : 'Notifications'
          }
        >
          <MaterialIcons name="notifications-none" size={26} color={headerIconColor} />
          {unreadCount > 0 && (
            <View style={styles.notificationBadge}>
              <ThemedText style={styles.notificationBadgeText}>
                {formatUnreadBadgeCount(unreadCount)}
              </ThemedText>
            </View>
          )}
        </TouchableOpacity>
      </View>

      <ScrollView
        style={styles.scrollView}
        showsVerticalScrollIndicator={false}
        contentContainerStyle={[styles.scrollContent, { paddingBottom: insets.bottom + 96 }]}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor="#FF7F00" />}>
        <View style={styles.welcomeSection}>
          <View style={styles.welcomeLeft}>
            <ThemedText style={styles.welcomeGreetingLine}>
              Hello, <ThemedText style={styles.welcomeName}>{userName}</ThemedText>
            </ThemedText>
            <ThemedText style={styles.welcomeBack}>Welcome back!</ThemedText>
          </View>
          <TouchableOpacity
            style={styles.welcomeAvatar}
            onPress={() => router.push('/(tabs)/profile')}
            activeOpacity={0.8}>
            <MaterialIcons name="person" size={26} color="#FF7F00" />
          </TouchableOpacity>
        </View>

        <View style={styles.balanceCard}>
          <View style={styles.balanceCardPattern} />
          <View style={styles.balanceHeader}>
            <ThemedText style={styles.balanceLabel}>Available Balance</ThemedText>
            <TouchableOpacity onPress={() => setBalanceVisible(!balanceVisible)} style={styles.eyeButton}>
              <MaterialIcons name={balanceVisible ? 'visibility' : 'visibility-off'} size={22} color="#fff" />
            </TouchableOpacity>
          </View>
          <View style={styles.balanceAmountContainer}>
            {loading && !refreshing && balance === null ? (
              <NetpayLoadingAnimation size={32} variant="onBrand" strokeWidth={2.5} />
            ) : (
              <ThemedText style={styles.balanceAmount}>
                {balanceVisible ? formatCurrency(balance) : '₦••••'}
              </ThemedText>
            )}
          </View>
          <View style={styles.balanceButtons}>
            <TouchableOpacity style={styles.addMoneyButton} onPress={() => router.push('/add-money')} activeOpacity={0.8}>
              <MaterialIcons name="add" size={18} color="#fff" />
              <ThemedText style={styles.addMoneyText}>Fund Wallet</ThemedText>
            </TouchableOpacity>
            <TouchableOpacity style={styles.transferButton} onPress={() => router.push('/transfer')} activeOpacity={0.8}>
              <MaterialIcons name="send" size={18} color="#FF7F00" />
              <ThemedText style={styles.transferText}>Transfer</ThemedText>
            </TouchableOpacity>
          </View>
        </View>

        <View style={styles.servicesSection}>
          <ScrollView
            horizontal
            pagingEnabled
            showsHorizontalScrollIndicator={false}
            onMomentumScrollEnd={handleServiceScroll}
            decelerationRate="fast"
            snapToInterval={SERVICE_CARD_WIDTH}
            contentContainerStyle={styles.servicesScrollContent}>
            {SERVICE_PAGES.map((page, pageIndex) => (
              <View key={`service-page-${pageIndex}`} style={[styles.servicesPage, { width: SERVICE_CARD_WIDTH }]}>
                {page.map((service) => (
                  <TouchableOpacity
                    key={service.id}
                    style={styles.serviceItem}
                    onPress={() => router.push(service.route as any)}
                    activeOpacity={0.8}>
                    <View style={styles.serviceIconWrap}>
                      <MaterialIcons name={service.icon} size={24} color="#FF7F00" />
                    </View>
                    <ThemedText style={styles.serviceLabel}>{service.label}</ThemedText>
                  </TouchableOpacity>
                ))}
              </View>
            ))}
          </ScrollView>
          <View style={styles.serviceDots}>
            {SERVICE_PAGES.map((_, index) => (
              <View key={`dot-${index}`} style={[styles.serviceDot, index === servicePage && styles.serviceDotActive]} />
            ))}
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

          {!loading && displayedTransactions.length === 0 ? (
            <View style={styles.emptyStateCard}>
              <View style={styles.emptyStateIconCircle}>
                <MaterialIcons name="receipt-long" size={36} color="#C4C4C4" />
              </View>
              <ThemedText style={styles.emptyStateText}>No transactions yet</ThemedText>
              <ThemedText style={styles.emptyStateSubtext}>Your transactions will appear here</ThemedText>
            </View>
          ) : (
            displayedTransactions.map((txn) => {
              const isCredit = txn.type === 'credit';

              return (
                <TouchableOpacity
                  key={`${txn.category}-${txn.id}`}
                  style={styles.transactionItem}
                  activeOpacity={0.85}
                  onPress={() => handleTransactionPress(txn)}>
                  {renderTransactionIcon(txn)}
                  <View style={styles.transactionDetails}>
                    <ThemedText style={styles.transactionType}>{renderTransactionTitle(txn)}</ThemedText>
                    <ThemedText style={styles.transactionDate}>{txn.formattedDate}</ThemedText>
                  </View>
                  <View style={styles.transactionAmountContainer}>
                    {renderTransactionAmount(txn)}
                    <ThemedText style={styles.transactionStatus}>
                      {txn.serviceType === 'Refund' ? 'Refund' : isCredit ? 'Credit' : 'Debit'}
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
    backgroundColor: '#FFFFFF',
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
    paddingHorizontal: HORIZONTAL_PADDING,
    paddingBottom: 12,
    backgroundColor: '#FFFFFF',
    zIndex: 2,
  },
  headerTitleWrap: {
    flex: 1,
    marginRight: 12,
    minWidth: 0,
  },
  headerTitle: {
    fontSize: 24,
    fontWeight: '700',
    color: '#111827',
  },
  notificationButton: {
    position: 'relative',
    padding: 4,
    flexShrink: 0,
  },
  notificationBadge: {
    position: 'absolute',
    top: 0,
    right: 0,
    minWidth: 18,
    height: 18,
    paddingHorizontal: 4,
    borderRadius: 9,
    backgroundColor: '#FF7F00',
    borderWidth: 1.5,
    borderColor: '#FFFFFF',
    alignItems: 'center',
    justifyContent: 'center',
  },
  notificationBadgeText: {
    color: '#FFFFFF',
    fontSize: 10,
    fontWeight: '700',
    lineHeight: 12,
    textAlign: 'center',
  },
  welcomeSection: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: '#FFFFFF',
    marginHorizontal: HORIZONTAL_PADDING,
    marginTop: 8,
    marginBottom: 16,
    borderRadius: 16,
    paddingVertical: 18,
    paddingHorizontal: 18,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.06,
    shadowRadius: 8,
    elevation: 2,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: '#F0F0F0',
  },
  welcomeLeft: {
    flex: 1,
    paddingRight: 12,
  },
  welcomeGreetingLine: {
    fontSize: 16,
    color: '#374151',
  },
  welcomeName: {
    fontSize: 16,
    fontWeight: '700',
    color: '#111827',
  },
  welcomeBack: {
    marginTop: 4,
    fontSize: 13,
    color: '#9CA3AF',
  },
  welcomeAvatar: {
    width: 48,
    height: 48,
    borderRadius: 24,
    backgroundColor: '#FFF3E8',
    alignItems: 'center',
    justifyContent: 'center',
  },
  balanceCard: {
    backgroundColor: '#FF7F00',
    borderRadius: 20,
    padding: 22,
    marginHorizontal: HORIZONTAL_PADDING,
    marginBottom: 16,
    overflow: 'hidden',
  },
  balanceCardPattern: {
    position: 'absolute',
    right: -30,
    top: -20,
    width: 160,
    height: 160,
    borderRadius: 80,
    backgroundColor: 'rgba(255, 255, 255, 0.08)',
  },
  balanceHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 16,
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
    marginBottom: 20,
    minHeight: 52,
    justifyContent: 'center',
  },
  balanceAmount: {
    fontSize: 32,
    fontWeight: '700',
    color: '#fff',
    lineHeight: 40,
  },
  balanceButtons: {
    flexDirection: 'row',
    gap: 12,
  },
  addMoneyButton: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    backgroundColor: 'rgba(255, 255, 255, 0.22)',
    borderRadius: 12,
    paddingVertical: 12,
  },
  addMoneyText: {
    color: '#fff',
    fontSize: 14,
    fontWeight: '600',
  },
  transferButton: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    backgroundColor: '#fff',
    borderRadius: 12,
    paddingVertical: 12,
  },
  transferText: {
    color: '#FF7F00',
    fontSize: 14,
    fontWeight: '600',
  },
  servicesSection: {
    marginHorizontal: HORIZONTAL_PADDING,
    marginBottom: 20,
    backgroundColor: '#FFFFFF',
    borderRadius: 16,
    paddingTop: 18,
    paddingBottom: 14,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.06,
    shadowRadius: 8,
    elevation: 2,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: '#F0F0F0',
  },
  servicesScrollContent: {
    paddingHorizontal: 0,
  },
  servicesPage: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    paddingHorizontal: 12,
  },
  serviceItem: {
    width: '23%',
    alignItems: 'center',
  },
  serviceIconWrap: {
    width: 56,
    height: 56,
    borderRadius: 14,
    backgroundColor: '#FFF3E8',
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 8,
  },
  serviceLabel: {
    fontSize: 11,
    fontWeight: '600',
    color: '#374151',
    textAlign: 'center',
  },
  serviceDots: {
    flexDirection: 'row',
    justifyContent: 'center',
    alignItems: 'center',
    gap: 6,
    marginTop: 12,
  },
  serviceDot: {
    width: 7,
    height: 7,
    borderRadius: 4,
    backgroundColor: '#D1D5DB',
  },
  serviceDotActive: {
    backgroundColor: '#FF7F00',
    width: 8,
    height: 8,
    borderRadius: 4,
  },
  transactionsSection: {
    paddingHorizontal: HORIZONTAL_PADDING,
    marginBottom: 40,
  },
  sectionHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 16,
  },
  sectionTitle: {
    fontSize: 17,
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
    fontSize: 12,
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
    fontSize: 14,
    fontWeight: '600',
    color: '#333',
    marginBottom: 4,
  },
  transactionDate: {
    fontSize: 12,
    color: '#666',
  },
  transactionAmountContainer: {
    alignItems: 'flex-end',
  },
  transactionAmount: {
    fontSize: 15,
    fontWeight: 'bold',
    color: '#4CAF50',
    marginBottom: 4,
  },
  transactionStatus: {
    fontSize: 12,
    color: '#4CAF50',
    opacity: 0.8,
  },
  emptyStateCard: {
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#FFFFFF',
    borderRadius: 16,
    paddingVertical: 40,
    paddingHorizontal: 24,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: '#F0F0F0',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.04,
    shadowRadius: 4,
    elevation: 1,
  },
  emptyStateIconCircle: {
    width: 72,
    height: 72,
    borderRadius: 36,
    backgroundColor: '#F3F4F6',
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 16,
  },
  emptyStateText: {
    fontSize: 15,
    fontWeight: '600',
    color: '#6B7280',
    marginBottom: 6,
  },
  emptyStateSubtext: {
    fontSize: 13,
    color: '#9CA3AF',
    textAlign: 'center',
  },
  errorContainer: {
    backgroundColor: '#fdecea',
    borderRadius: 12,
    padding: 12,
    marginBottom: 12,
  },
  errorText: {
    color: '#d32f2f',
    fontSize: 12,
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
    backgroundColor: '#fff',
  },
  loadingLogo: {
    width: 120,
    height: 120,
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
});
