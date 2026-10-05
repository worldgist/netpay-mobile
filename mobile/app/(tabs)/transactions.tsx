import {
  StyleSheet,
  View,
  ScrollView,
  TouchableOpacity,
  ImageSourcePropType,
  RefreshControl,
  Platform,
  Modal,
  Alert,
} from 'react-native';
import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { MaterialIcons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import { Image } from 'expo-image';
import { NetpayLoadingAnimation } from '@/components/netpay-loading-animation';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import {
  useTransactions,
  TRANSACTIONS_PAGE_SIZE,
  type MobileTransaction,
} from '@/contexts/transactions-context';
import { getWalletTransactionLabel, getTransactionDisplayDateTime, isFundWalletTransaction, NGN_LOGO } from '@/utils/transaction-display';
import { buildTransactionDetailsHref } from '@/utils/transaction-navigation';
import { shareTransactionReceiptPdf } from '@/utils/transaction-receipt-pdf';
import {
  isTransactionStatusFailed,
  isTransactionStatusPending,
  normalizeTransactionStatusLabel,
} from '@/utils/purchase-flow';

const NETWORK_LOGOS: Record<string, ImageSourcePropType> = {
  NGN: NGN_LOGO,
  MTN: require('@/assets/images/mtn.png'),
  AIRTEL: require('@/assets/images/airtel.png'),
  GLO: require('@/assets/images/glo.png'),
  '9MOBILE': require('@/assets/images/9mobile.png'),
  '9 MOBILE': require('@/assets/images/9mobile.png'),
  DSTV: require('@/assets/images/dstv.png'),
  GOTV: require('@/assets/images/gotv.png'),
  STARTIMES: require('@/assets/images/startimes.png'),
  AEDC: require('@/assets/images/AEDC.png'),
  EEDC: require('@/assets/images/EEDC.png'),
  EKEDC: require('@/assets/images/EKEDC.png'),
  IKEDC: require('@/assets/images/IKEDC.png'),
  KEDCO: require('@/assets/images/KEDCO.png'),
  PHEDC: require('@/assets/images/PHEDC.png'),
  KAEDCO: require('@/assets/images/KAEDCO.png'),
  JED: require('@/assets/images/JED.png'),
  WAEC: require('@/assets/images/waec.png'),
  NECO: require('@/assets/images/neco.png'),
  JAMB: require('@/assets/images/jamb.png'),
  BET9JA: require('@/assets/images/bet9ja.png'),
  SPORTYBET: require('@/assets/images/sportybet.png'),
  NAIRABET: require('@/assets/images/nairabet.png'),
  '1XBET': require('@/assets/images/1xbet.png'),
  BETKING: require('@/assets/images/betking.png'),
  BETWAY: require('@/assets/images/betway.png'),
  ACCESSBET: require('@/assets/images/accessbet.png'),
  MERRYBET: require('@/assets/images/merrybet.png'),
  BANGBET: require('@/assets/images/bangbet.png.jpeg'),
  BETLAND: require('@/assets/images/betland.png.jpeg'),
  CLOUDBET: require('@/assets/images/cloudbet.png.jpeg'),
  LIVESCOREBET: require('@/assets/images/livescorebet.png.jpeg'),
  NAIJABET: require('@/assets/images/naijabet.png.jpeg'),
  SUPABET: require('@/assets/images/supabet.png.jpeg'),
};

const ELECTRICITY_LOGO_ALIASES: Record<string, ImageSourcePropType> = {
  IKEJA: NETWORK_LOGOS.IKEDC,
  EKO: NETWORK_LOGOS.EKEDC,
  ABUJA: NETWORK_LOGOS.AEDC,
  KADUNA: NETWORK_LOGOS.KAEDCO,
  IBADAN: NETWORK_LOGOS.IBEDC,
  KANO: NETWORK_LOGOS.KEDCO,
  PORTHARCOURT: NETWORK_LOGOS.PHEDC,
  JOS: NETWORK_LOGOS.JED,
};

type TransactionFilter = 'all' | 'credit' | 'debit' | 'transfers' | 'purchases';

type TransactionTheme = {
  accentColor: string;
  iconBackground: string;
  statusBackground: string;
  statusColor: string;
};

const FILTER_OPTIONS: { id: TransactionFilter; label: string }[] = [
  { id: 'all', label: 'All Transactions' },
  { id: 'credit', label: 'Credits (Money In)' },
  { id: 'debit', label: 'Debits (Money Out)' },
  { id: 'transfers', label: 'Transfers' },
  { id: 'purchases', label: 'Purchases' },
];

const TAB_BAR_HEIGHT = 64;

const APP_COLORS = {
  brand: '#FF7F00',
  brandLight: '#FFF3E8',
  brandBorder: '#FFD9B3',
  textPrimary: '#1A2B4A',
  textTitle: '#333333',
  textSecondary: '#666666',
  textMuted: '#9CA3AF',
  credit: '#2E7D32',
  debit: '#1A2B4A',
  success: '#2E7D32',
  successLight: '#E8F5E9',
  error: '#D32F2F',
  errorLight: '#FFEBEE',
};

const formatCurrency = (amount: number) =>
  `N${amount.toLocaleString('en-NG', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })}`;

const toTitle = (value?: string | null) =>
  value ? value.replace(/_/g, ' ').replace(/\b\w/g, (char) => char.toUpperCase()) : '';

const getLogo = (serviceType?: string | null, provider?: string | null): ImageSourcePropType | null => {
  if ((serviceType || '').toLowerCase() === 'fund wallet' || (serviceType || '').toLowerCase() === 'add money') {
    return NGN_LOGO;
  }
  if (!provider && !serviceType) return null;
  const key = (provider || serviceType || '').toUpperCase();
  if (key.includes('ELECTRICITY')) {
    if (provider) {
      const providerOnly = provider.split('•')[0].trim().toUpperCase();
      if (NETWORK_LOGOS[providerOnly]) {
        return NETWORK_LOGOS[providerOnly];
      }
      if (ELECTRICITY_LOGO_ALIASES[providerOnly]) {
        return ELECTRICITY_LOGO_ALIASES[providerOnly];
      }
    }
    return NETWORK_LOGOS.AEDC;
  }
  if (key.includes('BETTING')) {
    if (provider) {
      const providerKey = provider.toUpperCase();
      if (NETWORK_LOGOS[providerKey]) {
        return NETWORK_LOGOS[providerKey];
      }
    }
  }
  return NETWORK_LOGOS[key] || null;
};

const getTransactionTheme = (transaction: MobileTransaction): TransactionTheme => {
  if (isFundWalletTransaction(transaction) || transaction.category === 'transfer_received') {
    return {
      accentColor: APP_COLORS.credit,
      iconBackground: APP_COLORS.successLight,
      statusBackground: APP_COLORS.successLight,
      statusColor: APP_COLORS.credit,
    };
  }

  if (transaction.category === 'transfer_sent') {
    return {
      accentColor: '#9C27B0',
      iconBackground: '#F3E5F5',
      statusBackground: '#F3E5F5',
      statusColor: '#9C27B0',
    };
  }

  if (transaction.category === 'wallet' && transaction.type === 'debit') {
    return {
      accentColor: APP_COLORS.brand,
      iconBackground: APP_COLORS.brandLight,
      statusBackground: APP_COLORS.brandLight,
      statusColor: APP_COLORS.brand,
    };
  }

  if (transaction.category === 'airtime') {
    return {
      accentColor: APP_COLORS.brand,
      iconBackground: APP_COLORS.brandLight,
      statusBackground: APP_COLORS.successLight,
      statusColor: APP_COLORS.credit,
    };
  }

  if (transaction.type === 'credit') {
    return {
      accentColor: APP_COLORS.credit,
      iconBackground: APP_COLORS.successLight,
      statusBackground: APP_COLORS.successLight,
      statusColor: APP_COLORS.credit,
    };
  }

  return {
    accentColor: APP_COLORS.brand,
    iconBackground: APP_COLORS.brandLight,
    statusBackground: APP_COLORS.successLight,
    statusColor: APP_COLORS.credit,
  };
};

const getStatusLabel = (transaction: MobileTransaction) => {
  const status = transaction.status || '';
  if (isFundWalletTransaction(transaction)) return 'Completed';
  if (transaction.category === 'transfer_sent' || transaction.category === 'transfer_received') {
    return 'Completed';
  }
  if (transaction.type === 'credit' && !status) return 'Completed';
  return normalizeTransactionStatusLabel(status);
};

const applyFilter = (transactions: MobileTransaction[], filter: TransactionFilter) => {
  switch (filter) {
    case 'credit':
      return transactions.filter((transaction) => transaction.type === 'credit');
    case 'debit':
      return transactions.filter((transaction) => transaction.type === 'debit');
    case 'transfers':
      return transactions.filter(
        (transaction) => transaction.category === 'transfer_sent' || transaction.category === 'transfer_received',
      );
    case 'purchases':
      return transactions.filter(
        (transaction) =>
          transaction.category !== 'transfer_sent' &&
          transaction.category !== 'transfer_received' &&
          transaction.category !== 'wallet',
      );
    default:
      return transactions;
  }
};

export default function TransactionsScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const scrollRef = useRef<ScrollView>(null);
  const [activeFilter, setActiveFilter] = useState<TransactionFilter>('all');
  const [showFilterModal, setShowFilterModal] = useState(false);
  const [currentPage, setCurrentPage] = useState(1);
  const {
    transactions,
    loading,
    refreshing,
    error,
    refresh,
  } = useTransactions();

  const filteredTransactions = useMemo(
    () => applyFilter(transactions, activeFilter),
    [transactions, activeFilter],
  );

  const totalCount = filteredTransactions.length;
  const totalPages = Math.max(1, Math.ceil(totalCount / TRANSACTIONS_PAGE_SIZE));
  const safePage = Math.min(currentPage, totalPages);
  const rangeStart = totalCount === 0 ? 0 : (safePage - 1) * TRANSACTIONS_PAGE_SIZE + 1;
  const rangeEnd = Math.min(safePage * TRANSACTIONS_PAGE_SIZE, totalCount);
  const hasPreviousPage = safePage > 1;
  const hasNextPage = safePage < totalPages;

  const paginatedTransactions = useMemo(() => {
    const start = (safePage - 1) * TRANSACTIONS_PAGE_SIZE;
    return filteredTransactions.slice(start, start + TRANSACTIONS_PAGE_SIZE);
  }, [filteredTransactions, safePage]);

  useEffect(() => {
    setCurrentPage(1);
  }, [activeFilter]);

  useEffect(() => {
    scrollRef.current?.scrollTo({ y: 0, animated: false });
  }, [safePage, activeFilter]);

  const handleTransactionPress = useCallback(
    (transaction: MobileTransaction) => {
      router.push(buildTransactionDetailsHref(transaction));
    },
    [router],
  );

  const renderTransactionTitle = (transaction: MobileTransaction) => {
    switch (transaction.category) {
      case 'wallet':
        return getWalletTransactionLabel(transaction);
      case 'airtime':
        return 'Airtime Purchase';
      case 'data':
        return 'Data Bundle';
      case 'electricity':
        return `${transaction.provider || transaction.description || 'Electricity'} Purchase`;
      case 'education':
        return `${transaction.provider || 'Education'} Purchase`;
      case 'betting':
        return `${transaction.provider || 'Betting'} Purchase`;
      case 'transfer_sent':
        return 'Transfer Sent';
      case 'transfer_received':
        return 'Transfer Received';
      default:
        return 'Transaction';
    }
  };

  const showInitialLoading = loading && transactions.length === 0;
  const activeFilterLabel = FILTER_OPTIONS.find((option) => option.id === activeFilter)?.label ?? 'All Transactions';

  const shareHistoryReceipt = useCallback(async (transaction: MobileTransaction) => {
    const extra = transaction.extra || {};
    const amount = Math.abs(Number(transaction.amount) || 0);
    const pins = Array.isArray(extra.pins) ? extra.pins : [];
    const pinText = pins
      .map((entry: { Pin?: string; Serial?: string }, index: number) => {
        const pin = String(entry?.Pin || '').trim();
        if (!pin) return '';
        const serial = String(entry?.Serial || '').trim();
        const label = pins.length > 1 ? `PIN ${index + 1}` : 'PIN';
        return serial ? `${label}: ${pin} (Serial ${serial})` : `${label}: ${pin}`;
      })
      .filter(Boolean)
      .join('\n');
    const safeName = String(transaction.reference || transaction.id).replace(/[^a-zA-Z0-9-]/g, '');

    try {
      await shareTransactionReceiptPdf({
        title: renderTransactionTitle(transaction),
        amountText: `${transaction.type === 'credit' ? '+' : '-'} NGN ${amount.toLocaleString('en-NG', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`,
        status: getStatusLabel(transaction),
        fileName: `NetPay-Receipt-${safeName}.pdf`,
        rows: [
          { label: 'Service', value: transaction.serviceType || '' },
          { label: 'Provider', value: transaction.provider || '' },
          { label: 'Customer name', value: String(extra.customerName || extra.customer_name || '') },
          { label: 'Customer address', value: String(extra.customerAddress || extra.customer_address || '') },
          { label: 'Meter number', value: String(extra.meter_number || '') },
          { label: 'Meter type', value: String(extra.meterType || '') },
          { label: 'Electricity token', value: String(extra.token || '') },
          { label: 'Phone number', value: String(extra.phone_number || '') },
          { label: 'Exam', value: String(extra.examType || '') },
          { label: 'PIN', value: pinText || String(extra.educationPin || '') },
          { label: 'Date', value: getTransactionDisplayDateTime(transaction) },
          { label: 'Reference', value: transaction.reference || '' },
          { label: 'Transaction ID', value: transaction.id },
        ],
      });
    } catch (error) {
      console.error('Error sharing transaction receipt:', error);
      Alert.alert('Share', 'Failed to create the PDF receipt. Please try again.');
    }
  }, []);

  const content = useMemo(() => {
    if (showInitialLoading) {
      return (
        <View style={styles.loadingContainer}>
          <NetpayLoadingAnimation message="Loading transactions…" />
        </View>
      );
    }

    if (totalCount === 0) {
      return (
        <View style={styles.emptyContainer}>
          <MaterialIcons name="receipt-long" size={64} color="#999" />
          <ThemedText style={styles.emptyText}>
            {activeFilter === 'all' ? 'No transactions yet' : 'No matching transactions'}
          </ThemedText>
          <ThemedText style={styles.emptySubtext}>
            {activeFilter === 'all'
              ? 'Your transactions will appear here'
              : 'Try a different filter to see more results'}
          </ThemedText>
        </View>
      );
    }

    return paginatedTransactions.map((transaction) => {
      const theme = getTransactionTheme(transaction);
      const logo = isFundWalletTransaction(transaction)
        ? NGN_LOGO
        : getLogo(transaction.serviceType, transaction.provider);
      const statusLabel = getStatusLabel(transaction);
      const isFailed = isTransactionStatusFailed(transaction.status);
      const isPending = isTransactionStatusPending(transaction.status);

      return (
        <TouchableOpacity
          key={`${transaction.category}-${transaction.id}`}
          style={styles.transactionCard}
          onPress={() => handleTransactionPress(transaction)}
          activeOpacity={0.7}>
          <View style={[styles.accentBar, { backgroundColor: theme.accentColor }]} />
          <View style={styles.cardContent}>
            <View style={[styles.transactionIconContainer, { backgroundColor: theme.iconBackground }]}>
              {logo ? (
                <Image source={logo} style={styles.transactionLogo} contentFit="contain" />
              ) : (
                <MaterialIcons
                  name={transaction.type === 'credit' ? 'account-balance-wallet' : 'arrow-upward'}
                  size={22}
                  color={theme.accentColor}
                />
              )}
            </View>

            <View style={styles.transactionDetails}>
              <ThemedText style={styles.transactionType} numberOfLines={1}>
                {renderTransactionTitle(transaction)}
              </ThemedText>
              <View style={styles.dateRow}>
                <MaterialIcons name="event" size={14} color={APP_COLORS.textMuted} />
                <ThemedText style={styles.transactionDate}>{getTransactionDisplayDateTime(transaction)}</ThemedText>
              </View>
            </View>

            <View style={styles.transactionAmountContainer}>
              <TouchableOpacity
                onPress={(event) => {
                  event.stopPropagation();
                  void shareHistoryReceipt(transaction);
                }}
                hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
                style={styles.shareButton}
                accessibilityLabel="Share PDF receipt">
                <MaterialIcons name="share" size={18} color={APP_COLORS.brand} />
              </TouchableOpacity>
              <ThemedText
                style={[
                  styles.transactionAmount,
                  { color: transaction.type === 'credit' ? APP_COLORS.credit : APP_COLORS.debit },
                ]}>
                {transaction.type === 'credit' ? '+' : '-'}
                {formatCurrency(Math.abs(Number(transaction.amount)))}
              </ThemedText>
              <View
                style={[
                  styles.statusBadge,
                  {
                    backgroundColor: isFailed
                      ? '#FFEBEE'
                      : isPending
                        ? '#FFF3E0'
                        : theme.statusBackground,
                  },
                ]}>
                <MaterialIcons
                  name={isFailed ? 'error-outline' : isPending ? 'hourglass-top' : 'check-circle'}
                  size={14}
                  color={isFailed ? APP_COLORS.error : isPending ? '#E65100' : theme.statusColor}
                />
                <ThemedText
                  style={[
                    styles.statusBadgeText,
                    {
                      color: isFailed
                        ? APP_COLORS.error
                        : isPending
                          ? '#E65100'
                          : theme.statusColor,
                    },
                  ]}
                  numberOfLines={1}>
                  {statusLabel}
                </ThemedText>
              </View>
            </View>
          </View>
        </TouchableOpacity>
      );
    });
  }, [activeFilter, handleTransactionPress, paginatedTransactions, shareHistoryReceipt, showInitialLoading, totalCount]);

  return (
    <ThemedView style={styles.container}>
      <View style={[styles.header, { paddingTop: insets.top + 16 }]}>
        <View style={styles.headerTitleWrap}>
          <ThemedText style={styles.headerTitle}>Transactions</ThemedText>
        </View>
        <TouchableOpacity
          style={styles.filterButton}
          onPress={() => setShowFilterModal(true)}
          activeOpacity={0.7}>
          <MaterialIcons name="filter-list" size={18} color={APP_COLORS.brand} />
          <ThemedText style={styles.filterButtonText}>Filter</ThemedText>
        </TouchableOpacity>
      </View>

      {activeFilter !== 'all' ? (
        <View style={styles.activeFilterBanner}>
          <ThemedText style={styles.activeFilterText}>{activeFilterLabel}</ThemedText>
          <TouchableOpacity onPress={() => setActiveFilter('all')} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
            <MaterialIcons name="close" size={18} color="#666" />
          </TouchableOpacity>
        </View>
      ) : null}

      <ScrollView
        ref={scrollRef}
        style={styles.scrollView}
        contentContainerStyle={[
          styles.scrollContent,
          { paddingBottom: insets.bottom + TAB_BAR_HEIGHT + 24 },
        ]}
        showsVerticalScrollIndicator={false}
        refreshControl={
          <RefreshControl refreshing={refreshing} onRefresh={refresh} tintColor={APP_COLORS.brand} colors={[APP_COLORS.brand]} />
        }>
        {error && !showInitialLoading ? (
          <View style={styles.errorBanner}>
            <MaterialIcons name="error-outline" size={20} color="#d32f2f" style={styles.errorIcon} />
            <ThemedText style={styles.errorText}>{error}</ThemedText>
          </View>
        ) : null}
        {content}

        {totalCount > 0 ? (
          <View style={styles.paginationContainer}>
            <ThemedText style={styles.paginationLabel}>
              Showing {rangeStart}-{rangeEnd} of {totalCount}
            </ThemedText>
            <View style={styles.paginationButtons}>
              <TouchableOpacity
                style={[styles.paginationButton, styles.paginationButtonLeft, !hasPreviousPage && styles.paginationButtonDisabled]}
                onPress={() => setCurrentPage((page) => Math.max(page - 1, 1))}
                disabled={!hasPreviousPage}
                activeOpacity={0.7}>
                <MaterialIcons
                  name="chevron-left"
                  size={20}
                  color={hasPreviousPage ? APP_COLORS.brand : '#BDBDBD'}
                  style={styles.paginationIconLeft}
                />
                <ThemedText
                  style={[styles.paginationButtonText, !hasPreviousPage && styles.paginationButtonTextDisabled]}
                  numberOfLines={1}>
                  Previous
                </ThemedText>
              </TouchableOpacity>

              <TouchableOpacity
                style={[styles.paginationButton, styles.paginationButtonRight, !hasNextPage && styles.paginationButtonDisabled]}
                onPress={() => setCurrentPage((page) => Math.min(page + 1, totalPages))}
                disabled={!hasNextPage}
                activeOpacity={0.7}>
                <ThemedText
                  style={[styles.paginationButtonText, !hasNextPage && styles.paginationButtonTextDisabled]}
                  numberOfLines={1}>
                  Next
                </ThemedText>
                <MaterialIcons
                  name="chevron-right"
                  size={20}
                  color={hasNextPage ? APP_COLORS.brand : '#BDBDBD'}
                  style={styles.paginationIconRight}
                />
              </TouchableOpacity>
            </View>
          </View>
        ) : null}
      </ScrollView>

      <Modal
        visible={showFilterModal}
        transparent
        animationType="fade"
        onRequestClose={() => setShowFilterModal(false)}>
        <View style={styles.filterOverlay}>
          <TouchableOpacity style={styles.filterBackdrop} activeOpacity={1} onPress={() => setShowFilterModal(false)} />
          <View style={[styles.filterSheet, { paddingBottom: insets.bottom + 16 }]}>
            <View style={styles.filterSheetHeader}>
              <ThemedText style={styles.filterSheetTitle}>Filter Transactions</ThemedText>
              <TouchableOpacity onPress={() => setShowFilterModal(false)}>
                <MaterialIcons name="close" size={24} color="#333" />
              </TouchableOpacity>
            </View>
            {FILTER_OPTIONS.map((option) => {
              const selected = activeFilter === option.id;
              return (
                <TouchableOpacity
                  key={option.id}
                  style={[styles.filterOption, selected && styles.filterOptionSelected]}
                  onPress={() => {
                    setActiveFilter(option.id);
                    setShowFilterModal(false);
                  }}
                  activeOpacity={0.7}>
                  <ThemedText style={[styles.filterOptionText, selected && styles.filterOptionTextSelected]}>
                    {option.label}
                  </ThemedText>
                  {selected ? <MaterialIcons name="check-circle" size={20} color={APP_COLORS.brand} /> : null}
                </TouchableOpacity>
              );
            })}
          </View>
        </View>
      </Modal>
    </ThemedView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#F5F7FA',
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingBottom: 16,
    paddingHorizontal: 20,
  },
  headerTitleWrap: {
    flex: 1,
    marginRight: 12,
    minWidth: 0,
  },
  headerTitle: {
    fontSize: 24,
    fontWeight: '700',
    color: APP_COLORS.textPrimary,
  },
  filterButton: {
    flexShrink: 0,
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: 20,
    borderWidth: 1,
    borderColor: APP_COLORS.brand,
    backgroundColor: '#fff',
    gap: 6,
  },
  filterButtonText: {
    fontSize: 14,
    fontWeight: '600',
    color: APP_COLORS.brand,
  },
  activeFilterBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginHorizontal: 20,
    marginBottom: 12,
    paddingHorizontal: 14,
    paddingVertical: 10,
    borderRadius: 12,
    backgroundColor: APP_COLORS.brandLight,
  },
  activeFilterText: {
    fontSize: 13,
    fontWeight: '600',
    color: APP_COLORS.brand,
    flex: 1,
  },
  scrollView: {
    flex: 1,
    paddingHorizontal: 20,
  },
  scrollContent: {
    flexGrow: 1,
  },
  loadingContainer: {
    paddingVertical: 80,
    alignItems: 'center',
  },
  errorBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#fdecea',
    borderRadius: 12,
    paddingHorizontal: 14,
    paddingVertical: 12,
    marginBottom: 16,
  },
  errorIcon: {
    marginRight: 8,
  },
  errorText: {
    flex: 1,
    fontSize: 13,
    color: '#d32f2f',
  },
  transactionCard: {
    flexDirection: 'row',
    backgroundColor: '#fff',
    borderRadius: 16,
    marginBottom: 12,
    overflow: 'hidden',
    ...Platform.select({
      ios: {
        shadowColor: '#000',
        shadowOffset: { width: 0, height: 2 },
        shadowOpacity: 0.08,
        shadowRadius: 8,
      },
      android: {
        elevation: 3,
      },
    }),
  },
  accentBar: {
    width: 4,
  },
  cardContent: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 14,
    paddingHorizontal: 12,
  },
  transactionIconContainer: {
    width: 48,
    height: 48,
    borderRadius: 12,
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: 12,
    padding: 8,
  },
  transactionLogo: {
    width: '100%',
    height: '100%',
  },
  transactionDetails: {
    flex: 1,
    minWidth: 0,
    marginRight: 8,
  },
  transactionType: {
    fontSize: 15,
    fontWeight: '700',
    color: APP_COLORS.textTitle,
    marginBottom: 6,
  },
  dateRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  transactionDate: {
    fontSize: 12,
    color: APP_COLORS.textSecondary,
    flexShrink: 1,
  },
  transactionAmountContainer: {
    alignItems: 'flex-end',
    flexShrink: 0,
  },
  shareButton: {
    width: 28,
    height: 28,
    borderRadius: 14,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: APP_COLORS.brandLight,
    marginBottom: 6,
  },
  transactionAmount: {
    fontSize: 15,
    fontWeight: '700',
    marginBottom: 6,
  },
  statusBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 12,
    gap: 4,
  },
  statusBadgeText: {
    fontSize: 11,
    fontWeight: '600',
  },
  emptyContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    paddingVertical: 80,
  },
  emptyText: {
    fontSize: 16,
    fontWeight: '600',
    color: APP_COLORS.textMuted,
    marginTop: 16,
    marginBottom: 8,
  },
  emptySubtext: {
    fontSize: 12,
    color: APP_COLORS.textMuted,
    textAlign: 'center',
    paddingHorizontal: 24,
  },
  paginationContainer: {
    marginTop: 8,
    paddingTop: 16,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: '#E0E0E0',
  },
  paginationLabel: {
    fontSize: 13,
    color: APP_COLORS.textSecondary,
    textAlign: 'center',
    marginBottom: 12,
  },
  paginationButtons: {
    flexDirection: 'row',
    alignItems: 'stretch',
  },
  paginationButton: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    minHeight: 48,
    backgroundColor: APP_COLORS.brandLight,
    borderRadius: 12,
    paddingVertical: 12,
    paddingHorizontal: 10,
    borderWidth: 1,
    borderColor: APP_COLORS.brandBorder,
  },
  paginationButtonLeft: {
    marginRight: 6,
  },
  paginationButtonRight: {
    marginLeft: 6,
  },
  paginationIconLeft: {
    marginRight: 4,
  },
  paginationIconRight: {
    marginLeft: 4,
  },
  paginationButtonDisabled: {
    backgroundColor: '#F5F5F5',
    borderColor: '#E0E0E0',
  },
  paginationButtonText: {
    fontSize: 14,
    fontWeight: '600',
    color: APP_COLORS.brand,
    flexShrink: 1,
    ...(Platform.OS === 'android' ? { includeFontPadding: false } : null),
  },
  paginationButtonTextDisabled: {
    color: '#BDBDBD',
  },
  filterOverlay: {
    flex: 1,
    justifyContent: 'flex-end',
  },
  filterBackdrop: {
    ...StyleSheet.absoluteFill,
    backgroundColor: 'rgba(0, 0, 0, 0.45)',
  },
  filterSheet: {
    backgroundColor: '#fff',
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    paddingBottom: 24,
  },
  filterSheetHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 20,
    paddingVertical: 18,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: '#E0E0E0',
  },
  filterSheetTitle: {
    fontSize: 18,
    fontWeight: '700',
    color: APP_COLORS.textPrimary,
  },
  filterOption: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 20,
    paddingVertical: 16,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: '#F0F0F0',
  },
  filterOptionSelected: {
    backgroundColor: APP_COLORS.brandLight,
  },
  filterOptionText: {
    fontSize: 15,
    color: APP_COLORS.textTitle,
  },
  filterOptionTextSelected: {
    color: APP_COLORS.brand,
    fontWeight: '600',
  },
});
