import {
  StyleSheet,
  View,
  ScrollView,
  TouchableOpacity,
  RefreshControl,
  ActivityIndicator,
  Image,
} from 'react-native';
import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { MaterialIcons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import { useCallback, useRef, useState, useEffect } from 'react';
import { useFocusEffect } from '@react-navigation/native';
import { supabase } from '@/lib/supabase';

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

export default function HomeScreen() {
  const router = useRouter();
  const [balanceVisible, setBalanceVisible] = useState(true);
  const [balance, setBalance] = useState<number | null>(null);
  const [userName, setUserName] = useState('User');
  const [transactions, setTransactions] = useState<CombinedTransaction[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const isMounted = useRef(true);

  useEffect(() => {
    isMounted.current = true;
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
          if (isMounted.current) {
            setLoading(false);
            setRefreshing(false);
          }
          router.replace('/auth/login');
          return;
        }

        const userId = session.user.id;

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

        const combined: CombinedTransaction[] = [
          ...((userTxns.data || []).map((txn) => ({ ...txn, type: 'user' })) as CombinedTransaction[]),
          ...((airtimeTxns.data || []).map((txn) => ({ ...txn, type: 'airtime' })) as CombinedTransaction[]),
          ...((dataTxns.data || []).map((txn) => ({ ...txn, type: 'data' })) as CombinedTransaction[]),
          ...((transfersSent.data || []).map((txn) => ({ ...txn, type: 'transfer_sent' })) as CombinedTransaction[]),
          ...((transfersReceived.data || []).map((txn) => ({ ...txn, type: 'transfer_received' })) as CombinedTransaction[]),
        ]
          .sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime())
          .slice(0, 5);

        if (isMounted.current) {
          setTransactions(combined);
        }

        const errors = [userTxns.error, airtimeTxns.error, dataTxns.error, transfersSent.error, transfersReceived.error].filter(Boolean);
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
    [router]
  );

  useFocusEffect(
    useCallback(() => {
      fetchDashboardData();
    }, [fetchDashboardData])
  );

  const onRefresh = useCallback(() => {
    fetchDashboardData({ refresh: true });
  }, [fetchDashboardData]);

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

  return (
    <ThemedView style={styles.container}>
      {loading && !refreshing ? (
        <View style={styles.loadingContainer}>
          <ActivityIndicator size="large" color="#FF7F00" />
        </View>
      ) : null}

      <ScrollView
        style={styles.scrollView}
        showsVerticalScrollIndicator={false}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor="#FF7F00" />}>
        <View style={styles.header}>
          <ThemedText style={styles.headerTitle}>Home</ThemedText>
          <TouchableOpacity onPress={() => router.push('/notifications')}>
            <MaterialIcons name="notifications" size={24} color="#333" />
          </TouchableOpacity>
        </View>

        <View style={styles.welcomeSection}>
          <ThemedText style={styles.welcomeName}>Hello, {userName}</ThemedText>
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
            <TouchableOpacity onPress={() => router.push('/(tabs)/transactions')}>
              <ThemedText style={styles.seeAllText}>See All</ThemedText>
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
            transactions.map((txn) => {
              const isCredit =
                txn.type === 'transfer_received' ||
                (typeof txn.transaction_type === 'string' && txn.transaction_type.toLowerCase().includes('credit'));

              return (
                <View key={`${txn.type}-${txn.id}`} style={styles.transactionItem}>
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
                </View>
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
    backgroundColor: '#fff',
  },
  scrollView: {
    flex: 1,
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 20,
    paddingTop: 60,
    paddingBottom: 20,
  },
  headerTitle: {
    fontSize: 24,
    fontWeight: 'bold',
    color: '#333',
  },
  welcomeSection: {
    paddingHorizontal: 20,
    marginBottom: 24,
  },
  welcomeName: {
    fontSize: 28,
    fontWeight: 'bold',
    color: '#333',
    marginBottom: 4,
  },
  welcomeBack: {
    fontSize: 16,
    color: '#666',
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
});
