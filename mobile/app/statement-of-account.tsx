import { useState, useCallback, useRef, useMemo } from 'react';
import { StyleSheet, View, ScrollView, TouchableOpacity, Alert, RefreshControl, ActivityIndicator, Platform } from 'react-native';
import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { MaterialIcons } from '@expo/vector-icons';
import { useRouter, useFocusEffect } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import DateTimePicker from '@react-native-community/datetimepicker';
import { supabase } from '@/lib/supabase';
import { getSessionOrRedirect } from '@/utils/session';
import { downloadStatementPDF, sendStatementEmail } from '@/utils/statement';

type StatementTransaction = {
  id: string;
  date: string;
  description: string;
  type: 'credit' | 'debit';
  amount: number;
  balanceAfter: number;
  reference: string;
  category: string;
};

const formatCurrency = (amount: number) =>
  `₦${amount.toLocaleString('en-NG', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })}`;

const formatDate = (dateString: string) => {
  const date = new Date(dateString);
  return date.toLocaleDateString('en-NG', {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
  });
};

export default function StatementOfAccountScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const [userId, setUserId] = useState<string | null>(null);
  const [userEmail, setUserEmail] = useState('');
  const [transactions, setTransactions] = useState<StatementTransaction[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [downloading, setDownloading] = useState(false);
  const [sendingEmail, setSendingEmail] = useState(false);
  
  // Date range state
  const [startDate, setStartDate] = useState<Date>(() => {
    const date = new Date();
    date.setMonth(date.getMonth() - 1); // Default to last month
    return date;
  });
  const [endDate, setEndDate] = useState<Date>(new Date());
  const [showStartPicker, setShowStartPicker] = useState(false);
  const [showEndPicker, setShowEndPicker] = useState(false);
  
  const isMounted = useRef(true);

  const fetchTransactions = useCallback(async (isRefresh = false) => {
    try {
      if (isRefresh) {
        setRefreshing(true);
      } else {
        setLoading(true);
      }

      const session = await getSessionOrRedirect();
      if (!session) {
        return;
      }

      const currentUserId = session.user.id;
      setUserId(currentUserId);
      setUserEmail(session.user.email || '');

      // Fetch all transaction types
      const [
        userTxns,
        airtimeTxns,
        dataTxns,
        electricityTxns,
        educationTxns,
        bettingTxns,
        transfersSent,
        transfersReceived,
      ] = await Promise.all([
        supabase
          .from('user_transactions')
          .select('id, amount, transaction_type, description, reference, created_at, balance_after')
          .eq('user_id', currentUserId)
          .gte('created_at', startDate.toISOString())
          .lte('created_at', endDate.toISOString())
          .order('created_at', { ascending: false }),
        supabase
          .from('airtime_transactions')
          .select('id, amount, network, status, reference, phone_number, created_at')
          .eq('user_id', currentUserId)
          .gte('created_at', startDate.toISOString())
          .lte('created_at', endDate.toISOString())
          .order('created_at', { ascending: false }),
        supabase
          .from('data_transactions')
          .select('id, amount, network, plan_name, status, reference, phone_number, created_at')
          .eq('user_id', currentUserId)
          .gte('created_at', startDate.toISOString())
          .lte('created_at', endDate.toISOString())
          .order('created_at', { ascending: false }),
        supabase
          .from('electricity_transactions')
          .select('id, amount, provider, status, reference, meter_number, created_at')
          .eq('user_id', currentUserId)
          .gte('created_at', startDate.toISOString())
          .lte('created_at', endDate.toISOString())
          .order('created_at', { ascending: false }),
        supabase
          .from('education_transactions')
          .select('id, amount, exam_type, status, reference, created_at')
          .eq('user_id', currentUserId)
          .gte('created_at', startDate.toISOString())
          .lte('created_at', endDate.toISOString())
          .order('created_at', { ascending: false }),
        supabase
          .from('betting_transactions')
          .select('id, amount, betting_provider, status, reference, created_at')
          .eq('user_id', currentUserId)
          .gte('created_at', startDate.toISOString())
          .lte('created_at', endDate.toISOString())
          .order('created_at', { ascending: false }),
        supabase
          .from('transfer_transactions')
          .select('id, amount, status, reference, description, created_at, recipient:profiles!transfer_transactions_recipient_id_fkey(full_name)')
          .eq('sender_id', currentUserId)
          .gte('created_at', startDate.toISOString())
          .lte('created_at', endDate.toISOString())
          .order('created_at', { ascending: false }),
        supabase
          .from('transfer_transactions')
          .select('id, amount, status, reference, description, created_at, sender:profiles!transfer_transactions_sender_id_fkey(full_name)')
          .eq('recipient_id', currentUserId)
          .gte('created_at', startDate.toISOString())
          .lte('created_at', endDate.toISOString())
          .order('created_at', { ascending: false }),
      ]);

      // Combine and format transactions
      const combined: StatementTransaction[] = [
        ...(userTxns.data || []).map((txn) => ({
          id: txn.id,
          date: txn.created_at,
          description: txn.description || txn.transaction_type,
          type: txn.transaction_type === 'credit' ? 'credit' : 'debit',
          amount: txn.amount,
          balanceAfter: txn.balance_after || 0,
          reference: txn.reference || '',
          category: 'Wallet',
        })),
        ...(airtimeTxns.data || []).map((txn) => ({
          id: txn.id,
          date: txn.created_at,
          description: `Airtime - ${txn.network} ${txn.phone_number}`,
          type: 'debit',
          amount: txn.amount,
          balanceAfter: 0,
          reference: txn.reference || '',
          category: 'Airtime',
        })),
        ...(dataTxns.data || []).map((txn) => ({
          id: txn.id,
          date: txn.created_at,
          description: `Data - ${txn.network} ${txn.plan_name}`,
          type: 'debit',
          amount: txn.amount,
          balanceAfter: 0,
          reference: txn.reference || '',
          category: 'Data',
        })),
        ...(electricityTxns.data || []).map((txn) => ({
          id: txn.id,
          date: txn.created_at,
          description: `Electricity - ${txn.provider} ${txn.meter_number}`,
          type: 'debit',
          amount: txn.amount,
          balanceAfter: 0,
          reference: txn.reference || '',
          category: 'Electricity',
        })),
        ...(educationTxns.data || []).map((txn) => ({
          id: txn.id,
          date: txn.created_at,
          description: `Education - ${txn.exam_type}`,
          type: 'debit',
          amount: txn.amount,
          balanceAfter: 0,
          reference: txn.reference || '',
          category: 'Education',
        })),
        ...(bettingTxns.data || []).map((txn) => ({
          id: txn.id,
          date: txn.created_at,
          description: `Betting - ${txn.betting_provider}`,
          type: 'debit',
          amount: txn.amount,
          balanceAfter: 0,
          reference: txn.reference || '',
          category: 'Betting',
        })),
        ...(transfersSent.data || []).map((txn) => ({
          id: txn.id,
          date: txn.created_at,
          description: `Transfer to ${(txn.recipient as any)?.full_name || 'User'}`,
          type: 'debit',
          amount: txn.amount,
          balanceAfter: 0,
          reference: txn.reference || '',
          category: 'Transfer',
        })),
        ...(transfersReceived.data || []).map((txn) => ({
          id: txn.id,
          date: txn.created_at,
          description: `Transfer from ${(txn.sender as any)?.full_name || 'User'}`,
          type: 'credit',
          amount: txn.amount,
          balanceAfter: 0,
          reference: txn.reference || '',
          category: 'Transfer',
        })),
      ]
        .sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());

      if (isMounted.current) {
        setTransactions(combined);
      }
    } catch (error) {
      console.error('Failed to fetch transactions:', error);
      if (isMounted.current) {
        Alert.alert('Error', 'Failed to load transactions. Please try again.');
      }
    } finally {
      if (isMounted.current) {
        setLoading(false);
        setRefreshing(false);
      }
    }
  }, [startDate, endDate]);

  useFocusEffect(
    useCallback(() => {
      isMounted.current = true;
      fetchTransactions();
      return () => {
        isMounted.current = false;
      };
    }, [fetchTransactions])
  );

  const handleRefresh = useCallback(() => {
    fetchTransactions(true);
  }, [fetchTransactions]);

  const handleDownloadPDF = useCallback(async () => {
    if (!userId) return;

    setDownloading(true);
    try {
      await downloadStatementPDF(userId, startDate, endDate);
    } catch (err) {
      console.error('Download PDF error:', err);
      const errorMessage = err instanceof Error ? err.message : 'Failed to download statement';
      Alert.alert('Error', errorMessage);
    } finally {
      setDownloading(false);
    }
  }, [userId, startDate, endDate]);

  const handleSendEmail = useCallback(async () => {
    if (!userId || !userEmail) return;

    setSendingEmail(true);
    try {
      await sendStatementEmail(userId, userEmail, startDate, endDate);
    } catch (err) {
      Alert.alert('Error', err instanceof Error ? err.message : 'Failed to send statement');
    } finally {
      setSendingEmail(false);
    }
  }, [userId, userEmail, startDate, endDate]);

  // Calculate summary statistics
  const summary = useMemo(() => {
    const credits = transactions.filter((t) => t.type === 'credit').reduce((sum, t) => sum + t.amount, 0);
    const debits = transactions.filter((t) => t.type === 'debit').reduce((sum, t) => sum + t.amount, 0);
    return {
      totalCredits: credits,
      totalDebits: debits,
      netAmount: credits - debits,
      transactionCount: transactions.length,
    };
  }, [transactions]);

  if (loading && !refreshing) {
    return (
      <ThemedView style={[styles.container, styles.centerContent]}>
        <ActivityIndicator size="large" color="#FF7F00" />
        <ThemedText style={styles.loadingText}>Loading statement...</ThemedText>
      </ThemedView>
    );
  }

  return (
    <ThemedView style={styles.container}>
      {/* Header */}
      <View style={[styles.header, { paddingTop: insets.top + 10 }]}>
        <TouchableOpacity onPress={() => router.back()} style={styles.backButton}>
          <MaterialIcons name="arrow-back" size={24} color="#333" />
        </TouchableOpacity>
        <ThemedText style={styles.headerTitle}>Statement of Account</ThemedText>
        <View style={styles.placeholder} />
      </View>

      <ScrollView
        style={styles.scrollView}
        contentContainerStyle={[styles.scrollContent, { paddingBottom: insets.bottom + 20 }]}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={handleRefresh} tintColor="#FF7F00" />}
      >
        {/* Date Range Selector */}
        <View style={styles.dateRangeContainer}>
          <ThemedText style={styles.sectionTitle}>Date Range</ThemedText>
          <View style={styles.dateRow}>
            <TouchableOpacity
              style={styles.dateButton}
              onPress={() => setShowStartPicker(true)}
            >
              <MaterialIcons name="calendar-today" size={20} color="#FF7F00" />
              <ThemedText style={styles.dateText}>
                {startDate.toLocaleDateString('en-NG')}
              </ThemedText>
            </TouchableOpacity>
            <ThemedText style={styles.dateSeparator}>to</ThemedText>
            <TouchableOpacity
              style={styles.dateButton}
              onPress={() => setShowEndPicker(true)}
            >
              <MaterialIcons name="calendar-today" size={20} color="#FF7F00" />
              <ThemedText style={styles.dateText}>
                {endDate.toLocaleDateString('en-NG')}
              </ThemedText>
            </TouchableOpacity>
          </View>

          {showStartPicker && (
            <DateTimePicker
              value={startDate}
              mode="date"
              display="default"
              maximumDate={endDate}
              onChange={(event, date) => {
                setShowStartPicker(false);
                if (date) {
                  setStartDate(date);
                }
              }}
            />
          )}
          {showEndPicker && (
            <DateTimePicker
              value={endDate}
              mode="date"
              display="default"
              maximumDate={new Date()}
              minimumDate={startDate}
              onChange={(event, date) => {
                setShowEndPicker(false);
                if (date) {
                  setEndDate(date);
                }
              }}
            />
          )}
        </View>

        {/* Summary Cards */}
        <View style={styles.summaryContainer}>
          <View style={styles.summaryCard}>
            <ThemedText style={styles.summaryLabel}>Total Credits</ThemedText>
            <ThemedText style={[styles.summaryValue, styles.creditText]}>
              {formatCurrency(summary.totalCredits)}
            </ThemedText>
          </View>
          <View style={styles.summaryCard}>
            <ThemedText style={styles.summaryLabel}>Total Debits</ThemedText>
            <ThemedText style={[styles.summaryValue, styles.debitText]}>
              {formatCurrency(summary.totalDebits)}
            </ThemedText>
          </View>
          <View style={styles.summaryCard}>
            <ThemedText style={styles.summaryLabel}>Net Amount</ThemedText>
            <ThemedText
              style={[
                styles.summaryValue,
                summary.netAmount >= 0 ? styles.creditText : styles.debitText,
              ]}
            >
              {formatCurrency(summary.netAmount)}
            </ThemedText>
          </View>
          <View style={styles.summaryCard}>
            <ThemedText style={styles.summaryLabel}>Transactions</ThemedText>
            <ThemedText style={styles.summaryValue}>{summary.transactionCount}</ThemedText>
          </View>
        </View>

        {/* Action Buttons */}
        <View style={styles.actionButtons}>
          <TouchableOpacity
            style={[styles.actionButton, styles.downloadButton]}
            onPress={handleDownloadPDF}
            disabled={downloading || transactions.length === 0}
          >
            <MaterialIcons name="download" size={20} color="#fff" />
            <ThemedText style={styles.actionButtonText}>
              {downloading ? 'Downloading...' : 'Download PDF'}
            </ThemedText>
          </TouchableOpacity>
          <TouchableOpacity
            style={[styles.actionButton, styles.emailButton]}
            onPress={handleSendEmail}
            disabled={sendingEmail || transactions.length === 0}
          >
            <MaterialIcons name="email" size={20} color="#fff" />
            <ThemedText style={styles.actionButtonText}>
              {sendingEmail ? 'Sending...' : 'Send to Email'}
            </ThemedText>
          </TouchableOpacity>
        </View>

        {/* Transactions List */}
        <View style={styles.transactionsContainer}>
          <ThemedText style={styles.sectionTitle}>
            Recent Transactions ({Math.min(transactions.length, 4)} of {transactions.length})
          </ThemedText>
          {transactions.length === 0 ? (
            <View style={styles.emptyState}>
              <MaterialIcons name="description" size={48} color="#ccc" />
              <ThemedText style={styles.emptyText}>No transactions found</ThemedText>
              <ThemedText style={styles.emptySubtext}>
                Try adjusting your date range
              </ThemedText>
            </View>
          ) : (
            transactions.slice(0, 4).map((transaction) => (
              <TouchableOpacity
                key={transaction.id}
                style={styles.transactionCard}
                activeOpacity={0.7}
              >
                <View style={styles.transactionLeft}>
                  <View
                    style={[
                      styles.transactionIcon,
                      transaction.type === 'credit' ? styles.creditIcon : styles.debitIcon,
                    ]}
                  >
                    <MaterialIcons
                      name={transaction.type === 'credit' ? 'arrow-downward' : 'arrow-upward'}
                      size={20}
                      color="#fff"
                    />
                  </View>
                  <View style={styles.transactionDetails}>
                    <ThemedText style={styles.transactionDescription}>
                      {transaction.description}
                    </ThemedText>
                    <ThemedText style={styles.transactionDate}>
                      {formatDate(transaction.date)}
                    </ThemedText>
                    {transaction.reference && (
                      <ThemedText style={styles.transactionRef}>
                        Ref: {transaction.reference}
                      </ThemedText>
                    )}
                  </View>
                </View>
                <View style={styles.transactionRight}>
                  <ThemedText
                    style={[
                      styles.transactionAmount,
                      transaction.type === 'credit' ? styles.creditText : styles.debitText,
                    ]}
                  >
                    {transaction.type === 'credit' ? '+' : '-'}
                    {formatCurrency(transaction.amount)}
                  </ThemedText>
                  {transaction.balanceAfter > 0 && (
                    <ThemedText style={styles.transactionBalance}>
                      Balance: {formatCurrency(transaction.balanceAfter)}
                    </ThemedText>
                  )}
                </View>
              </TouchableOpacity>
            ))
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
  centerContent: {
    justifyContent: 'center',
    alignItems: 'center',
  },
  loadingText: {
    marginTop: 12,
    fontSize: 16,
    color: '#666',
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 20,
    paddingBottom: 16,
    borderBottomWidth: 1,
    borderBottomColor: '#E5E5E5',
  },
  backButton: {
    padding: 8,
  },
  headerTitle: {
    fontSize: 18,
    fontWeight: '600',
    color: '#333',
  },
  placeholder: {
    width: 40,
  },
  scrollView: {
    flex: 1,
  },
  scrollContent: {
    paddingHorizontal: 20,
    paddingTop: 20,
  },
  dateRangeContainer: {
    marginBottom: 24,
  },
  sectionTitle: {
    fontSize: 16,
    fontWeight: '600',
    color: '#333',
    marginBottom: 12,
  },
  dateRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  dateButton: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#F5F5F5',
    borderRadius: 8,
    padding: 12,
    borderWidth: 1,
    borderColor: '#FF7F00',
    gap: 8,
  },
  dateText: {
    fontSize: 14,
    color: '#333',
  },
  dateSeparator: {
    marginHorizontal: 12,
    fontSize: 14,
    color: '#666',
  },
  summaryContainer: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    marginBottom: 24,
    gap: 12,
  },
  summaryCard: {
    flex: 1,
    minWidth: '45%',
    backgroundColor: '#F5F5F5',
    borderRadius: 12,
    padding: 16,
    alignItems: 'center',
  },
  summaryLabel: {
    fontSize: 12,
    color: '#666',
    marginBottom: 8,
  },
  summaryValue: {
    fontSize: 18,
    fontWeight: '600',
    color: '#333',
  },
  creditText: {
    color: '#10B981',
  },
  debitText: {
    color: '#EF4444',
  },
  actionButtons: {
    flexDirection: 'row',
    gap: 12,
    marginBottom: 24,
  },
  actionButton: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: 8,
    padding: 14,
    gap: 8,
  },
  downloadButton: {
    backgroundColor: '#FF7F00',
  },
  emailButton: {
    backgroundColor: '#007AFF',
  },
  actionButtonText: {
    color: '#fff',
    fontSize: 16,
    fontWeight: '600',
  },
  transactionsContainer: {
    marginBottom: 24,
  },
  transactionCard: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: '#F5F5F5',
    borderRadius: 12,
    padding: 16,
    marginBottom: 12,
  },
  transactionLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    flex: 1,
  },
  transactionIcon: {
    width: 40,
    height: 40,
    borderRadius: 20,
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 12,
  },
  creditIcon: {
    backgroundColor: '#10B981',
  },
  debitIcon: {
    backgroundColor: '#EF4444',
  },
  transactionDetails: {
    flex: 1,
  },
  transactionDescription: {
    fontSize: 16,
    fontWeight: '500',
    color: '#333',
    marginBottom: 4,
  },
  transactionDate: {
    fontSize: 12,
    color: '#666',
    marginBottom: 2,
  },
  transactionRef: {
    fontSize: 11,
    color: '#999',
  },
  transactionRight: {
    alignItems: 'flex-end',
  },
  transactionAmount: {
    fontSize: 16,
    fontWeight: '600',
    marginBottom: 4,
  },
  transactionBalance: {
    fontSize: 11,
    color: '#666',
  },
  emptyState: {
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 48,
  },
  emptyText: {
    fontSize: 16,
    fontWeight: '500',
    color: '#666',
    marginTop: 16,
  },
  emptySubtext: {
    fontSize: 14,
    color: '#999',
    marginTop: 8,
  },
});
