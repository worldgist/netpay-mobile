import { useState, useCallback, useRef, useMemo } from 'react';
import { StyleSheet, View, ScrollView, TouchableOpacity, Alert, RefreshControl } from 'react-native';
import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { MaterialIcons } from '@expo/vector-icons';
import { useRouter, useFocusEffect } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import DateTimePicker from '@react-native-community/datetimepicker';
import { supabase } from '@/lib/supabase';
import { getSessionOrRedirect } from '@/utils/session';
import { downloadStatementPDF, sendStatementEmail } from '@/utils/statement';

const DEMO_USER_EMAIL = 'demo@netppay.com';

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

type SummaryCardProps = {
  icon: keyof typeof MaterialIcons.glyphMap;
  iconColor: string;
  iconBackground: string;
  label: string;
  value: string;
  valueColor?: string;
};

const formatCurrency = (amount: number) =>
  `₦${amount.toLocaleString('en-NG', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })}`;

const formatPickerDate = (date: Date) =>
  date.toLocaleDateString('en-GB', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
  });

const startOfDay = (date: Date) => {
  const normalized = new Date(date);
  normalized.setHours(0, 0, 0, 0);
  return normalized;
};

const endOfDay = (date: Date) => {
  const normalized = new Date(date);
  normalized.setHours(23, 59, 59, 999);
  return normalized;
};

function SummaryCard({ icon, iconColor, iconBackground, label, value, valueColor = '#1A2B4A' }: SummaryCardProps) {
  return (
    <View style={styles.summaryCard}>
      <View style={[styles.summaryIconWrap, { backgroundColor: iconBackground }]}>
        <MaterialIcons name={icon} size={22} color={iconColor} />
      </View>
      <View style={styles.summaryTextWrap}>
        <ThemedText style={styles.summaryLabel}>{label}</ThemedText>
        <ThemedText style={[styles.summaryValue, { color: valueColor }]} numberOfLines={1}>
          {value}
        </ThemedText>
      </View>
    </View>
  );
}

export default function StatementOfAccountScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const [userId, setUserId] = useState<string | null>(null);
  const [userEmail, setUserEmail] = useState('');
  const [isDemoUser, setIsDemoUser] = useState(false);
  const [transactions, setTransactions] = useState<StatementTransaction[]>([]);
  const [refreshing, setRefreshing] = useState(false);
  const [downloading, setDownloading] = useState(false);
  const [sendingEmail, setSendingEmail] = useState(false);

  const [startDate, setStartDate] = useState<Date>(() => {
    const date = new Date();
    date.setMonth(date.getMonth() - 1);
    return date;
  });
  const [endDate, setEndDate] = useState<Date>(new Date());
  const [showStartPicker, setShowStartPicker] = useState(false);
  const [showEndPicker, setShowEndPicker] = useState(false);

  const isMounted = useRef(true);
  const demoSetupAttempted = useRef(false);

  const fetchTransactions = useCallback(async (isRefresh = false) => {
    try {
      if (isRefresh) {
        setRefreshing(true);
      }

      const session = await getSessionOrRedirect();
      if (!session) {
        return;
      }

      const currentUserId = session.user.id;
      const currentUserEmail = session.user.email || '';
      const demoUser = currentUserEmail.trim().toLowerCase() === DEMO_USER_EMAIL;
      setUserId(currentUserId);
      setUserEmail(currentUserEmail);
      setIsDemoUser(demoUser);

      const rangeStart = startOfDay(startDate).toISOString();
      const rangeEnd = endOfDay(endDate).toISOString();

      const [
        userTxns,
        fundingTxns,
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
          .gte('created_at', rangeStart)
          .lte('created_at', rangeEnd)
          .order('created_at', { ascending: false }),
        supabase
          .from('funding_transactions')
          .select('id, amount, status, reference, bank_name, created_at')
          .eq('user_id', currentUserId)
          .eq('status', 'completed')
          .gte('created_at', rangeStart)
          .lte('created_at', rangeEnd)
          .order('created_at', { ascending: false }),
        supabase
          .from('airtime_transactions')
          .select('id, amount, network, status, reference, phone_number, created_at')
          .eq('user_id', currentUserId)
          .gte('created_at', rangeStart)
          .lte('created_at', rangeEnd)
          .order('created_at', { ascending: false }),
        supabase
          .from('data_transactions')
          .select('id, amount, network, plan_name, status, reference, phone_number, created_at')
          .eq('user_id', currentUserId)
          .gte('created_at', rangeStart)
          .lte('created_at', rangeEnd)
          .order('created_at', { ascending: false }),
        supabase
          .from('electricity_transactions')
          .select('id, amount, provider, status, reference, meter_number, created_at')
          .eq('user_id', currentUserId)
          .gte('created_at', rangeStart)
          .lte('created_at', rangeEnd)
          .order('created_at', { ascending: false }),
        supabase
          .from('education_transactions')
          .select('id, amount, exam_type, status, reference, created_at')
          .eq('user_id', currentUserId)
          .gte('created_at', rangeStart)
          .lte('created_at', rangeEnd)
          .order('created_at', { ascending: false }),
        supabase
          .from('betting_transactions')
          .select('id, amount, betting_provider, status, reference, created_at')
          .eq('user_id', currentUserId)
          .gte('created_at', rangeStart)
          .lte('created_at', rangeEnd)
          .order('created_at', { ascending: false }),
        supabase
          .from('transfer_transactions')
          .select('id, amount, status, reference, description, created_at, recipient:profiles!transfer_transactions_recipient_id_fkey(full_name)')
          .eq('sender_id', currentUserId)
          .gte('created_at', rangeStart)
          .lte('created_at', rangeEnd)
          .order('created_at', { ascending: false }),
        supabase
          .from('transfer_transactions')
          .select('id, amount, status, reference, description, created_at, sender:profiles!transfer_transactions_sender_id_fkey(full_name)')
          .eq('recipient_id', currentUserId)
          .gte('created_at', rangeStart)
          .lte('created_at', rangeEnd)
          .order('created_at', { ascending: false }),
      ]);

      const walletReferences = new Set(
        (userTxns.data || [])
          .map((txn) => txn.reference)
          .filter((reference): reference is string => Boolean(reference)),
      );

      const combined: StatementTransaction[] = [
        ...(userTxns.data || []).map((txn) => {
          const tt = (txn.transaction_type || '').toLowerCase();
          const isRefund = tt === 'refund';
          return {
            id: `wallet:${txn.id}`,
            date: txn.created_at,
            description: isRefund ? txn.description || 'Refund' : txn.description || txn.transaction_type,
            type: tt === 'credit' || isRefund ? 'credit' : 'debit',
            amount: Number(txn.amount) || 0,
            balanceAfter: txn.balance_after || 0,
            reference: txn.reference || '',
            category: 'Wallet',
          };
        }),
        ...(fundingTxns.data || [])
          .filter((txn) => txn.reference && !walletReferences.has(txn.reference))
          .map((txn) => ({
            id: `funding:${txn.id}`,
            date: txn.created_at,
            description: `Account Funding - ${txn.bank_name || 'Bank Transfer'}`,
            type: 'credit' as const,
            amount: Number(txn.amount) || 0,
            balanceAfter: 0,
            reference: txn.reference || '',
            category: 'Funding',
          })),
        ...(airtimeTxns.data || []).map((txn) => ({
          id: `airtime:${txn.id}`,
          date: txn.created_at,
          description: `Airtime - ${txn.network} ${txn.phone_number}`,
          type: 'debit' as const,
          amount: Number(txn.amount) || 0,
          balanceAfter: 0,
          reference: txn.reference || '',
          category: 'Airtime',
        })),
        ...(dataTxns.data || []).map((txn) => ({
          id: `data:${txn.id}`,
          date: txn.created_at,
          description: `Data - ${txn.network} ${txn.plan_name}`,
          type: 'debit' as const,
          amount: Number(txn.amount) || 0,
          balanceAfter: 0,
          reference: txn.reference || '',
          category: 'Data',
        })),
        ...(electricityTxns.data || []).map((txn) => ({
          id: `electricity:${txn.id}`,
          date: txn.created_at,
          description: `Electricity - ${txn.provider} ${txn.meter_number}`,
          type: 'debit' as const,
          amount: Number(txn.amount) || 0,
          balanceAfter: 0,
          reference: txn.reference || '',
          category: 'Electricity',
        })),
        ...(educationTxns.data || []).map((txn) => ({
          id: `education:${txn.id}`,
          date: txn.created_at,
          description: `Education - ${txn.exam_type}`,
          type: 'debit' as const,
          amount: Number(txn.amount) || 0,
          balanceAfter: 0,
          reference: txn.reference || '',
          category: 'Education',
        })),
        ...(bettingTxns.data || []).map((txn) => ({
          id: `betting:${txn.id}`,
          date: txn.created_at,
          description: `Betting - ${txn.betting_provider}`,
          type: 'debit' as const,
          amount: Number(txn.amount) || 0,
          balanceAfter: 0,
          reference: txn.reference || '',
          category: 'Betting',
        })),
        ...(transfersSent.data || []).map((txn) => ({
          id: `transfer-out:${txn.id}`,
          date: txn.created_at,
          description: `Transfer to ${(txn.recipient as { full_name?: string } | null)?.full_name || 'User'}`,
          type: 'debit' as const,
          amount: Number(txn.amount) || 0,
          balanceAfter: 0,
          reference: txn.reference || '',
          category: 'Transfer',
        })),
        ...(transfersReceived.data || []).map((txn) => ({
          id: `transfer-in:${txn.id}`,
          date: txn.created_at,
          description: `Transfer from ${(txn.sender as { full_name?: string } | null)?.full_name || 'User'}`,
          type: 'credit' as const,
          amount: Number(txn.amount) || 0,
          balanceAfter: 0,
          reference: txn.reference || '',
          category: 'Transfer',
        })),
      ].sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());

      if (isMounted.current) {
        setTransactions(combined);
      }

      if (
        demoUser &&
        combined.length === 0 &&
        !demoSetupAttempted.current &&
        isMounted.current
      ) {
        demoSetupAttempted.current = true;
        try {
          const { error: setupError } = await supabase.functions.invoke('setup-demo-user', {
            body: {},
          });
          if (!setupError && isMounted.current) {
            await fetchTransactions(isRefresh);
          }
        } catch (setupError) {
          console.warn('Demo statement setup error (non-critical):', setupError);
        }
      }
    } catch (error) {
      console.error('Failed to fetch transactions:', error);
      if (isMounted.current) {
        Alert.alert('Error', 'Failed to load statement summary. Please try again.');
      }
    } finally {
      if (isMounted.current) {
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
    }, [fetchTransactions]),
  );

  const handleRefresh = useCallback(() => {
    fetchTransactions(true);
  }, [fetchTransactions]);

  const handleDownloadPDF = useCallback(async () => {
    if (!userId) return;

    setDownloading(true);
    try {
      await downloadStatementPDF(userId, startOfDay(startDate), endOfDay(endDate));
    } catch (err) {
      console.error('Download PDF error:', err);
      Alert.alert('Error', err instanceof Error ? err.message : 'Failed to download statement');
    } finally {
      setDownloading(false);
    }
  }, [userId, startDate, endDate]);

  const handleSendEmail = useCallback(async () => {
    if (!userId || !userEmail) {
      Alert.alert('Email unavailable', 'No email address is linked to your account.');
      return;
    }

    setSendingEmail(true);
    try {
      const message = await sendStatementEmail(userId, userEmail, startOfDay(startDate), endOfDay(endDate));
      Alert.alert('Success', message);
    } catch (err) {
      Alert.alert('Error', err instanceof Error ? err.message : 'Failed to send statement');
    } finally {
      setSendingEmail(false);
    }
  }, [userId, userEmail, startDate, endDate]);

  const summary = useMemo(() => {
    const credits = transactions
      .filter((t) => t.type === 'credit')
      .reduce((sum, t) => sum + t.amount, 0);
    const debits = transactions
      .filter((t) => t.type === 'debit')
      .reduce((sum, t) => sum + t.amount, 0);
    return {
      totalCredits: credits,
      totalDebits: debits,
      netAmount: credits - debits,
      transactionCount: transactions.length,
    };
  }, [transactions]);

  const netAmountColor = summary.netAmount >= 0 ? '#10B981' : '#EF4444';

  return (
    <ThemedView style={styles.container}>
      <View style={[styles.header, { paddingTop: insets.top + 10 }]}>
        <TouchableOpacity onPress={() => router.back()} style={styles.headerSide}>
          <MaterialIcons name="arrow-back" size={24} color="#1A2B4A" />
        </TouchableOpacity>
        <ThemedText style={styles.headerTitle}>Statement</ThemedText>
        <View style={styles.headerSide} />
      </View>

      <ScrollView
        style={styles.scrollView}
        contentContainerStyle={[styles.scrollContent, { paddingBottom: insets.bottom + 24 }]}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={handleRefresh} tintColor="#FF7F00" />}
        showsVerticalScrollIndicator={false}>
        {isDemoUser ? (
          <View style={styles.demoUserCard}>
            <View style={styles.demoUserHeader}>
              <MaterialIcons name="info" size={22} color="#FF7F00" />
              <ThemedText style={styles.demoUserTitle}>Demo Statement</ThemedText>
            </View>
            <View style={styles.demoUserContent}>
              <ThemedText style={styles.demoUserText}>
                You are viewing a sample statement for the demo account ({DEMO_USER_EMAIL}). Transaction history
                includes funding, airtime, data, bills, and transfers for testing.
              </ThemedText>
              <ThemedText style={styles.demoUserText}>
                Use Download PDF or Send to Email to preview statement delivery during Apple review.
              </ThemedText>
            </View>
          </View>
        ) : null}

        <View style={styles.dateRangeContainer}>
          <ThemedText style={styles.sectionTitle}>Date Range</ThemedText>
          <View style={styles.dateRow}>
            <TouchableOpacity style={styles.dateButton} onPress={() => setShowStartPicker(true)}>
              <MaterialIcons name="calendar-today" size={18} color="#FF7F00" />
              <ThemedText style={styles.dateText}>{formatPickerDate(startDate)}</ThemedText>
            </TouchableOpacity>
            <ThemedText style={styles.dateSeparator}>to</ThemedText>
            <TouchableOpacity style={styles.dateButton} onPress={() => setShowEndPicker(true)}>
              <MaterialIcons name="calendar-today" size={18} color="#FF7F00" />
              <ThemedText style={styles.dateText}>{formatPickerDate(endDate)}</ThemedText>
            </TouchableOpacity>
          </View>

          {showStartPicker ? (
            <DateTimePicker
              value={startDate}
              mode="date"
              display="default"
              maximumDate={endDate}
              onChange={(_event, date) => {
                setShowStartPicker(false);
                if (date) setStartDate(date);
              }}
            />
          ) : null}
          {showEndPicker ? (
            <DateTimePicker
              value={endDate}
              mode="date"
              display="default"
              maximumDate={new Date()}
              minimumDate={startDate}
              onChange={(_event, date) => {
                setShowEndPicker(false);
                if (date) setEndDate(date);
              }}
            />
          ) : null}
        </View>

        <View style={styles.summaryGrid}>
          <SummaryCard
            icon="account-balance-wallet"
            iconColor="#10B981"
            iconBackground="#ECFDF5"
            label="Total Credits"
            value={formatCurrency(summary.totalCredits)}
            valueColor="#10B981"
          />
          <SummaryCard
            icon="account-balance-wallet"
            iconColor="#EF4444"
            iconBackground="#FEF2F2"
            label="Total Debits"
            value={formatCurrency(summary.totalDebits)}
            valueColor="#EF4444"
          />
          <SummaryCard
            icon="pie-chart"
            iconColor="#FF7F00"
            iconBackground="#FFF3E8"
            label="Net Amount"
            value={formatCurrency(summary.netAmount)}
            valueColor={netAmountColor}
          />
          <SummaryCard
            icon="description"
            iconColor="#FF7F00"
            iconBackground="#FFF3E8"
            label="Transactions"
            value={String(summary.transactionCount)}
            valueColor="#1A2B4A"
          />
        </View>

        <View style={styles.actionButtons}>
          <TouchableOpacity
            style={[styles.actionButton, styles.downloadButton]}
            onPress={handleDownloadPDF}
            disabled={downloading}
            activeOpacity={0.85}>
            <MaterialIcons name="file-download" size={20} color="#fff" />
            <ThemedText style={styles.actionButtonText}>
              {downloading ? 'Downloading...' : 'Download PDF'}
            </ThemedText>
          </TouchableOpacity>
          <TouchableOpacity
            style={[styles.actionButton, styles.emailButton]}
            onPress={handleSendEmail}
            disabled={sendingEmail || !userEmail}
            activeOpacity={0.85}>
            <MaterialIcons name="email" size={20} color="#fff" />
            <ThemedText style={styles.actionButtonText}>
              {sendingEmail ? 'Sending...' : 'Send to Email'}
            </ThemedText>
          </TouchableOpacity>
        </View>

        <View style={styles.infoBox}>
          <MaterialIcons name="info-outline" size={18} color="#667085" />
          <ThemedText style={styles.infoText}>
            Download the PDF or send it to your email to view the full transaction list for this period.
          </ThemedText>
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
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 20,
    paddingBottom: 16,
    backgroundColor: '#FFFFFF',
  },
  headerSide: {
    width: 40,
    alignItems: 'flex-start',
  },
  headerTitle: {
    fontSize: 18,
    fontWeight: '700',
    color: '#1A2B4A',
  },
  scrollView: {
    flex: 1,
  },
  scrollContent: {
    paddingHorizontal: 20,
    paddingTop: 8,
  },
  demoUserCard: {
    backgroundColor: '#FFF8E1',
    borderRadius: 12,
    padding: 16,
    marginBottom: 20,
    borderWidth: 1.5,
    borderColor: '#FFE082',
  },
  demoUserHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginBottom: 10,
  },
  demoUserTitle: {
    fontSize: 15,
    fontWeight: '700',
    color: '#E65100',
    flex: 1,
  },
  demoUserContent: {
    gap: 8,
  },
  demoUserText: {
    fontSize: 13,
    color: '#666',
    lineHeight: 20,
  },
  dateRangeContainer: {
    marginBottom: 24,
  },
  sectionTitle: {
    fontSize: 16,
    fontWeight: '600',
    color: '#1A2B4A',
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
    backgroundColor: '#FFFFFF',
    borderRadius: 10,
    paddingVertical: 14,
    paddingHorizontal: 12,
    borderWidth: 1.5,
    borderColor: '#FF7F00',
    gap: 8,
  },
  dateText: {
    fontSize: 14,
    color: '#1A2B4A',
    fontWeight: '500',
  },
  dateSeparator: {
    marginHorizontal: 10,
    fontSize: 14,
    color: '#667085',
  },
  summaryGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    justifyContent: 'space-between',
    marginBottom: 28,
    gap: 14,
  },
  summaryCard: {
    width: '47%',
    backgroundColor: '#FFFFFF',
    borderRadius: 14,
    padding: 16,
    borderWidth: 1,
    borderColor: '#EEF2F6',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.06,
    shadowRadius: 8,
    elevation: 2,
    minHeight: 96,
    justifyContent: 'center',
  },
  summaryIconWrap: {
    width: 40,
    height: 40,
    borderRadius: 20,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 12,
  },
  summaryTextWrap: {
    gap: 4,
  },
  summaryLabel: {
    fontSize: 13,
    color: '#667085',
  },
  summaryValue: {
    fontSize: 18,
    fontWeight: '700',
  },
  actionButtons: {
    flexDirection: 'row',
    gap: 12,
  },
  actionButton: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: 10,
    paddingVertical: 16,
    gap: 8,
  },
  downloadButton: {
    backgroundColor: '#FF7F00',
  },
  emailButton: {
    backgroundColor: '#007AFF',
  },
  actionButtonText: {
    color: '#FFFFFF',
    fontSize: 15,
    fontWeight: '700',
  },
  infoBox: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 10,
    marginTop: 20,
    padding: 14,
    borderRadius: 10,
    backgroundColor: '#F9FAFB',
    borderWidth: 1,
    borderColor: '#EEF2F6',
  },
  infoText: {
    flex: 1,
    fontSize: 13,
    lineHeight: 20,
    color: '#667085',
  },
});
