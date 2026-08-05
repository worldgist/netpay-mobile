import { StyleSheet, View, ScrollView, TouchableOpacity, ImageSourcePropType, RefreshControl } from 'react-native';
import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { MaterialIcons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import { Image } from 'expo-image';
import { NetpayLoadingAnimation } from '@/components/netpay-loading-animation';
import { useCallback, useMemo } from 'react';
import { useTransactions, type MobileTransaction } from '@/contexts/transactions-context';
import { getWalletTransactionLabel, isFundWalletTransaction, NGN_LOGO, FUND_WALLET_LABEL } from '@/utils/transaction-display';

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

export default function TransactionsScreen() {
  const router = useRouter();
  const {
    paginatedTransactions,
    loading,
    refreshing,
    error,
    refresh,
    rangeStart,
    rangeEnd,
    totalCount,
    hasPreviousPage,
    hasNextPage,
    goToNextPage,
    goToPreviousPage,
  } = useTransactions();

  const handleTransactionPress = useCallback(
    (transaction: MobileTransaction) => {
      router.push({
        pathname: '/transaction-details',
        params: {
          id: transaction.id,
          category: transaction.category,
          type: transaction.type,
          amount: transaction.amount.toString(),
          status: transaction.status || '',
          reference: transaction.reference || '',
          description: transaction.description || '',
          serviceType: transaction.serviceType || '',
          network: transaction.provider || '',
          date: transaction.formattedDate,
          time: transaction.formattedTime,
          meterType: transaction.extra?.meterType || '',
          token: transaction.extra?.token || '',
          meterNumber: transaction.extra?.meter_number || '',
          customerName: transaction.extra?.customerName || '',
          customerAddress: transaction.extra?.customerAddress || '',
          phoneNumber: transaction.extra?.phone_number || transaction.extra?.phoneNumber || '',
          educationPin: transaction.extra?.educationPin || '',
          educationSerial: transaction.extra?.educationSerial || '',
          educationInstructions: transaction.extra?.educationInstructions || '',
          examType: transaction.extra?.examType || '',
          accountNumber: transaction.extra?.account_number || '',
          vendingProvider: transaction.extra?.vending_provider || '',
          sourceTable: transaction.extra?.sourceTable || '',
        },
      });
    },
    [router]
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

  const showInitialLoading = loading && totalCount === 0;

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
          <ThemedText style={styles.emptyText}>No transactions yet</ThemedText>
          <ThemedText style={styles.emptySubtext}>Your transactions will appear here</ThemedText>
        </View>
      );
    }

    return paginatedTransactions.map((transaction) => {
      const logo = isFundWalletTransaction(transaction)
        ? NGN_LOGO
        : getLogo(transaction.serviceType, transaction.provider);
      return (
        <TouchableOpacity
          key={`${transaction.category}-${transaction.id}`}
          style={styles.transactionCard}
          onPress={() => handleTransactionPress(transaction)}
          activeOpacity={0.7}>
          <View style={styles.transactionIconContainer}>
            {logo ? (
              <Image source={logo} style={styles.transactionLogo} contentFit="contain" />
            ) : (
              <MaterialIcons
                name={transaction.type === 'credit' ? 'arrow-downward' : 'arrow-upward'}
                size={20}
                color={transaction.type === 'credit' ? '#4CAF50' : '#F44336'}
              />
            )}
          </View>
          <View style={styles.transactionDetails}>
            <ThemedText style={styles.transactionType}>{renderTransactionTitle(transaction)}</ThemedText>
            <ThemedText style={styles.transactionDate}>{transaction.formattedDate}</ThemedText>
            {transaction.reference ? (
              <ThemedText style={styles.transactionReference}>{transaction.reference}</ThemedText>
            ) : null}
          </View>
          <View style={styles.transactionAmountContainer}>
            <ThemedText
              style={[
                styles.transactionAmount,
                { color: transaction.type === 'credit' ? '#4CAF50' : '#F44336' },
              ]}>
              {transaction.type === 'credit' ? '+' : '-'}
              {formatCurrency(Math.abs(Number(transaction.amount)))}
            </ThemedText>
            <ThemedText style={styles.transactionStatus}>
              {transaction.status
                ? toTitle(transaction.status)
                : transaction.serviceType === 'Refund'
                  ? 'Refund'
                  : isFundWalletTransaction(transaction)
                    ? FUND_WALLET_LABEL
                    : transaction.type === 'credit'
                      ? 'Credit'
                      : 'Debit'}
            </ThemedText>
          </View>
        </TouchableOpacity>
      );
    });
  }, [handleTransactionPress, paginatedTransactions, showInitialLoading, totalCount]);

  return (
    <ThemedView style={styles.container}>
      <View style={styles.header}>
        <ThemedText style={styles.headerTitle}>Transactions</ThemedText>
      </View>

      <ScrollView
        style={styles.scrollView}
        contentContainerStyle={styles.scrollContent}
        showsVerticalScrollIndicator={false}
        refreshControl={
          <RefreshControl refreshing={refreshing} onRefresh={refresh} tintColor="#FF7F00" colors={['#FF7F00']} />
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
                style={[styles.paginationButton, !hasPreviousPage && styles.paginationButtonDisabled]}
                onPress={goToPreviousPage}
                disabled={!hasPreviousPage}
                activeOpacity={0.7}>
                <MaterialIcons
                  name="chevron-left"
                  size={20}
                  color={hasPreviousPage ? '#FF7F00' : '#BDBDBD'}
                />
                <ThemedText
                  style={[styles.paginationButtonText, !hasPreviousPage && styles.paginationButtonTextDisabled]}>
                  Previous
                </ThemedText>
              </TouchableOpacity>

              <TouchableOpacity
                style={[styles.paginationButton, !hasNextPage && styles.paginationButtonDisabled]}
                onPress={goToNextPage}
                disabled={!hasNextPage}
                activeOpacity={0.7}>
                <ThemedText
                  style={[styles.paginationButtonText, !hasNextPage && styles.paginationButtonTextDisabled]}>
                  Next
                </ThemedText>
                <MaterialIcons name="chevron-right" size={20} color={hasNextPage ? '#FF7F00' : '#BDBDBD'} />
              </TouchableOpacity>
            </View>
          </View>
        ) : null}
      </ScrollView>
    </ThemedView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#fff',
  },
  header: {
    paddingTop: 60,
    paddingBottom: 20,
    paddingHorizontal: 20,
    alignItems: 'center',
  },
  headerTitle: {
    fontSize: 21,
    fontWeight: 'bold',
    color: '#333',
  },
  scrollView: {
    flex: 1,
    paddingHorizontal: 20,
  },
  scrollContent: {
    paddingBottom: 40,
  },
  loadingContainer: {
    paddingVertical: 80,
    alignItems: 'center',
  },
  errorBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#fdecea',
    borderRadius: 10,
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
    alignItems: 'center',
    backgroundColor: '#F5F5F5',
    borderRadius: 12,
    padding: 12,
    marginBottom: 12,
  },
  transactionIconContainer: {
    width: 48,
    height: 48,
    borderRadius: 24,
    backgroundColor: '#fff',
    borderWidth: 1,
    borderColor: '#E0E0E0',
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: 12,
    padding: 6,
  },
  transactionLogo: {
    width: '100%',
    height: '100%',
  },
  transactionDetails: {
    flex: 1,
  },
  transactionType: {
    fontSize: 15,
    fontWeight: 'bold',
    color: '#333',
    marginBottom: 2,
    textTransform: 'capitalize',
  },
  transactionDate: {
    fontSize: 12,
    color: '#666',
    marginBottom: 2,
  },
  transactionReference: {
    fontSize: 11,
    color: '#999',
  },
  transactionAmountContainer: {
    alignItems: 'flex-end',
  },
  transactionAmount: {
    fontSize: 15,
    fontWeight: 'bold',
    color: '#4CAF50',
    marginBottom: 2,
  },
  transactionStatus: {
    fontSize: 12,
    color: '#4CAF50',
    fontWeight: '500',
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
    color: '#666',
    marginTop: 16,
    marginBottom: 8,
  },
  emptySubtext: {
    fontSize: 12,
    color: '#999',
    textAlign: 'center',
  },
  paginationContainer: {
    marginTop: 8,
    paddingTop: 16,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: '#E0E0E0',
  },
  paginationLabel: {
    fontSize: 13,
    color: '#666',
    textAlign: 'center',
    marginBottom: 12,
  },
  paginationButtons: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    gap: 12,
  },
  paginationButton: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 4,
    backgroundColor: '#FFF3E8',
    borderRadius: 12,
    paddingVertical: 12,
    paddingHorizontal: 16,
    borderWidth: 1,
    borderColor: '#FFD4A8',
  },
  paginationButtonDisabled: {
    backgroundColor: '#F5F5F5',
    borderColor: '#E0E0E0',
  },
  paginationButtonText: {
    fontSize: 14,
    fontWeight: '600',
    color: '#FF7F00',
  },
  paginationButtonTextDisabled: {
    color: '#BDBDBD',
  },
});
