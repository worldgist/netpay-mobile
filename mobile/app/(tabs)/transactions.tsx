import { StyleSheet, View, ScrollView, TouchableOpacity, ImageSourcePropType, ActivityIndicator, RefreshControl } from 'react-native';
import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { MaterialIcons } from '@expo/vector-icons';
import { useRouter, useFocusEffect } from 'expo-router';
import { Image } from 'expo-image';
import { useState, useCallback, useRef, useMemo } from 'react';
import { supabase } from '@/lib/supabase';
import { parseEducationPurchaseMetadata } from '@/utils/education';
import { getSessionOrRedirect } from '@/utils/session';

const NETWORK_LOGOS: Record<string, ImageSourcePropType> = {
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

type MobileTransaction = {
  id: string;
  category: 'wallet' | 'airtime' | 'data' | 'electricity' | 'education' | 'betting' | 'transfer_sent' | 'transfer_received';
  type: 'credit' | 'debit';
  amount: number;
  status?: string | null;
  reference?: string | null;
  description?: string | null;
  serviceType?: string | null;
  provider?: string | null;
  createdAt: string;
  formattedDate: string;
  formattedTime: string;
  counterparty?: string | null;
  extra?: Record<string, any>;
};

const formatCurrency = (amount: number) =>
  `N${amount.toLocaleString('en-NG', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })}`;

const toTitle = (value?: string | null) =>
  value ? value.replace(/_/g, ' ').replace(/\b\w/g, (char) => char.toUpperCase()) : '';

const getLogo = (serviceType?: string | null, provider?: string | null): ImageSourcePropType | null => {
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
    // For betting, try to get logo from provider
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
  const [transactions, setTransactions] = useState<MobileTransaction[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const isMounted = useRef(true);

  const fetchTransactions = useCallback(async (isRefresh = false) => {
    try {
      if (isRefresh) {
        setRefreshing(true);
      } else {
        setLoading(true);
      }
      setError(null);

      const session = await getSessionOrRedirect();
      if (!session) {
        return;
      }

      const userId = session.user.id;

      const [walletRes, airtimeRes, dataRes, electricityRes, educationRes, bettingRes, transfersSentRes, transfersReceivedRes] = await Promise.all([
        supabase
          .from('user_transactions')
          .select('id, amount, transaction_type, description, reference, created_at')
          .eq('user_id', userId)
          .order('created_at', { ascending: false })
          .limit(50),
        supabase
          .from('airtime_transactions')
          .select('id, amount, network, status, reference, phone_number, created_at')
          .eq('user_id', userId)
          .order('created_at', { ascending: false })
          .limit(50),
        supabase
          .from('data_transactions')
          .select('id, amount, network, plan_name, plan_validity, status, reference, phone_number, created_at')
          .eq('user_id', userId)
          .order('created_at', { ascending: false })
          .limit(50),
        supabase
          .from('electricity_transactions')
          .select('id, amount, provider, status, reference, created_at, meter_number, meter_type, token, customer_name, api_response, vending_provider')
          .eq('user_id', userId)
          .order('created_at', { ascending: false })
          .limit(50),
        supabase
          .from('education_transactions')
          .select('id, amount, exam_type, status, reference, created_at, phone_number, balance_before, balance_after, api_response, metadata, pin, serial_number, pins')
          .eq('user_id', userId)
          .order('created_at', { ascending: false })
          .limit(50),
        supabase
          .from('betting_transactions')
          .select('id, amount, betting_provider, status, reference, created_at, account_number, vending_provider')
          .eq('user_id', userId)
          .order('created_at', { ascending: false })
          .limit(50),
        supabase
          .from('transfer_transactions')
          .select('id, amount, status, reference, description, created_at, recipient_id')
          .eq('sender_id', userId)
          .order('created_at', { ascending: false })
          .limit(50),
        supabase
          .from('transfer_transactions')
          .select('id, amount, status, reference, description, created_at, sender_id')
          .eq('recipient_id', userId)
          .order('created_at', { ascending: false })
          .limit(50),
      ]);

      const walletTransactions: MobileTransaction[] = (walletRes.data || []).map((txn) => {
        const createdDate = new Date(txn.created_at);
        return {
          id: txn.id,
          category: 'wallet',
          type: (txn.transaction_type || 'debit').toLowerCase() === 'credit' ? 'credit' : 'debit',
          amount: Number(txn.amount) || 0,
          status: 'Completed',
          reference: txn.reference,
          description: txn.description,
          serviceType: 'Wallet Transaction',
          provider: null,
          createdAt: txn.created_at,
          formattedDate: createdDate.toLocaleDateString('en-NG', { year: 'numeric', month: 'short', day: 'numeric' }),
          formattedTime: createdDate.toLocaleTimeString('en-NG', { hour: '2-digit', minute: '2-digit' }),
        };
      });

      const airtimeTransactions: MobileTransaction[] = (airtimeRes.data || []).map((txn) => {
        const createdDate = new Date(txn.created_at);
        return {
          id: txn.id,
          category: 'airtime',
          type: 'debit',
          amount: Number(txn.amount) || 0,
          status: txn.status,
          reference: txn.reference,
          description: `Airtime purchase • ${txn.phone_number}`,
          serviceType: 'Airtime VTU',
          provider: txn.network,
          createdAt: txn.created_at,
          formattedDate: createdDate.toLocaleDateString('en-NG', { year: 'numeric', month: 'short', day: 'numeric' }),
          formattedTime: createdDate.toLocaleTimeString('en-NG', { hour: '2-digit', minute: '2-digit' }),
          extra: { phone_number: txn.phone_number },
        };
      });

      const dataTransactions: MobileTransaction[] = (dataRes.data || []).map((txn) => {
        const createdDate = new Date(txn.created_at);
        return {
          id: txn.id,
          category: 'data',
          type: 'debit',
          amount: Number(txn.amount) || 0,
          status: txn.status,
          reference: txn.reference,
          description: txn.plan_name,
          serviceType: 'Data Bundle',
          provider: txn.network,
          createdAt: txn.created_at,
          formattedDate: createdDate.toLocaleDateString('en-NG', { year: 'numeric', month: 'short', day: 'numeric' }),
          formattedTime: createdDate.toLocaleTimeString('en-NG', { hour: '2-digit', minute: '2-digit' }),
          extra: { plan_validity: txn.plan_validity, phone_number: txn.phone_number },
        };
      });

      const electricityTransactions: MobileTransaction[] = (electricityRes.data || []).map((txn) => {
        const createdDate = new Date(txn.created_at);
        
        // Extract token - check database field first, then api_response
        let extractedToken = txn.token;
        
        // If token is null and we have api_response, try to extract from there
        if (!extractedToken && (txn as any).api_response) {
          const apiResponse = (txn as any).api_response;
          // Check multiple possible locations in api_response
          extractedToken = apiResponse?.data?.token ||
                          apiResponse?.token ||
                          apiResponse?.details?.token ||
                          null;
          
          // Convert to string and validate
          if (extractedToken) {
            extractedToken = String(extractedToken).trim();
            if (extractedToken === '' || extractedToken.toLowerCase() === 'null') {
              extractedToken = null;
            }
          }
        }
        
        return {
          id: txn.id,
          category: 'electricity',
          type: 'debit',
          amount: Number(txn.amount) || 0,
          status: txn.status,
          reference: txn.reference,
          description: txn.meter_number,
          serviceType: txn.provider || 'Electricity',
          provider: txn.provider,
          createdAt: txn.created_at,
          formattedDate: createdDate.toLocaleDateString('en-NG', { year: 'numeric', month: 'short', day: 'numeric' }),
          formattedTime: createdDate.toLocaleTimeString('en-NG', { hour: '2-digit', minute: '2-digit' }),
          extra: { 
            meterType: txn.meter_type, 
            token: extractedToken, // Use extracted token (from DB or api_response)
            meter_number: txn.meter_number, 
            customerName: txn.customer_name,
            vendingProvider: (txn as any).vending_provider,
          },
        };
      });

      const educationTransactions: MobileTransaction[] = (educationRes.data || []).map((txn) => {
        const createdDate = new Date(txn.created_at);
        
        // Priority order for PINs:
        // 1. Database columns (pin, serial_number, pins) - most reliable
        // 2. metadata.pins - for backward compatibility
        // 3. Parse from api_response - fallback
        
        let finalPins: Array<{ Pin: string; Serial?: string }> = [];
        let finalPin: string | undefined;
        let finalSerial: string | undefined;
        
        // First, try database columns (highest priority)
        if ((txn as any).pins && Array.isArray((txn as any).pins)) {
          finalPins = (txn as any).pins;
          if (finalPins.length > 0) {
            finalPin = finalPins[0].Pin;
            finalSerial = finalPins[0].Serial;
          }
        } else if ((txn as any).pin) {
          // Single PIN from database column
          finalPin = (txn as any).pin;
          finalSerial = (txn as any).serial_number;
          finalPins = [{ Pin: finalPin || '', Serial: finalSerial || '' }];
        }
        
        // Fallback to metadata if database columns don't have PINs
        if (finalPins.length === 0) {
          const metadataObj = (txn as any)?.metadata || {};
          const pinsFromMetadata = metadataObj.pins || [];
          
          if (pinsFromMetadata.length > 0) {
            finalPins = pinsFromMetadata;
            if (finalPins.length > 0) {
              finalPin = finalPins[0].Pin;
              finalSerial = finalPins[0].Serial;
            }
          } else if (metadataObj.educationPin) {
            finalPin = metadataObj.educationPin;
            finalSerial = metadataObj.educationSerial;
            finalPins = [{ Pin: finalPin || '', Serial: finalSerial || '' }];
          }
        }
        
        // Last fallback: parse from api_response
        if (finalPins.length === 0) {
          const parsedMetadata = parseEducationPurchaseMetadata((txn as any)?.api_response);
          if (parsedMetadata.pin) {
            finalPin = parsedMetadata.pin;
            finalSerial = parsedMetadata.serial;
            finalPins = [{ Pin: finalPin, Serial: finalSerial || '' }];
          }
        }
        
        const description = txn.phone_number
          ? `${txn.exam_type || 'Education'} purchase • ${txn.phone_number}`
          : `${txn.exam_type || 'Education'} purchase`;
        return {
          id: txn.id,
          category: 'education',
          type: 'debit',
          amount: Number(txn.amount) || 0,
          status: txn.status,
          reference: txn.reference,
          description,
          serviceType: txn.exam_type ? `Education • ${txn.exam_type}` : 'Education',
          provider: txn.exam_type,
          createdAt: txn.created_at,
          formattedDate: createdDate.toLocaleDateString('en-NG', { year: 'numeric', month: 'short', day: 'numeric' }),
          formattedTime: createdDate.toLocaleTimeString('en-NG', { hour: '2-digit', minute: '2-digit' }),
          extra: {
            phone_number: txn.phone_number,
            examType: txn.exam_type,
            pins: finalPins,
            educationPin: finalPin,
            educationSerial: finalSerial,
            educationInstructions: parseEducationPurchaseMetadata((txn as any)?.api_response).instructions,
            balanceBefore: txn.balance_before,
            balanceAfter: txn.balance_after,
          },
        };
      });

      const transferSent: MobileTransaction[] = (transfersSentRes.data || []).map((txn) => {
        const createdDate = new Date(txn.created_at);
        return {
          id: txn.id,
          category: 'transfer_sent',
          type: 'debit',
          amount: Number(txn.amount) || 0,
          status: txn.status,
          reference: txn.reference,
          description: txn.description || 'Transfer sent',
          serviceType: 'Transfer',
          provider: null,
          createdAt: txn.created_at,
          formattedDate: createdDate.toLocaleDateString('en-NG', { year: 'numeric', month: 'short', day: 'numeric' }),
          formattedTime: createdDate.toLocaleTimeString('en-NG', { hour: '2-digit', minute: '2-digit' }),
          counterparty: 'Recipient',
        };
      });

      const transferReceived: MobileTransaction[] = (transfersReceivedRes.data || []).map((txn) => {
        const createdDate = new Date(txn.created_at);
        return {
          id: txn.id,
          category: 'transfer_received',
          type: 'credit',
          amount: Number(txn.amount) || 0,
          status: txn.status,
          reference: txn.reference,
          description: txn.description || 'Transfer received',
          serviceType: 'Transfer',
          provider: null,
          createdAt: txn.created_at,
          formattedDate: createdDate.toLocaleDateString('en-NG', { year: 'numeric', month: 'short', day: 'numeric' }),
          formattedTime: createdDate.toLocaleTimeString('en-NG', { hour: '2-digit', minute: '2-digit' }),
          counterparty: 'Sender',
        };
      });

      const bettingTransactions: MobileTransaction[] = (bettingRes.data || []).map((txn) => {
        const createdDate = new Date(txn.created_at);
        return {
          id: txn.id,
          category: 'betting',
          type: 'debit',
          amount: Number(txn.amount) || 0,
          status: txn.status,
          reference: txn.reference,
          description: txn.account_number ? `Betting purchase • ${txn.account_number}` : 'Betting purchase',
          serviceType: 'Betting',
          provider: txn.betting_provider,
          createdAt: txn.created_at,
          formattedDate: createdDate.toLocaleDateString('en-NG', { year: 'numeric', month: 'short', day: 'numeric' }),
          formattedTime: createdDate.toLocaleTimeString('en-NG', { hour: '2-digit', minute: '2-digit' }),
          extra: { account_number: txn.account_number, vending_provider: txn.vending_provider },
        };
      });

      const combined = [
        ...walletTransactions,
        ...airtimeTransactions,
        ...dataTransactions,
        ...electricityTransactions,
        ...educationTransactions,
        ...bettingTransactions,
        ...transferSent,
        ...transferReceived,
      ]
        .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime())
        .slice(0, 100);

      if (isMounted.current) {
        setTransactions(combined);
      }
    } catch (err) {
      console.error('Failed to load transactions:', err);
      if (isMounted.current) {
        const message = err instanceof Error ? err.message : 'Unable to load transactions.';
        setError(message);
        setTransactions([]);
      }
    } finally {
      if (isMounted.current) {
        setLoading(false);
        setRefreshing(false);
      }
    }
  }, []);

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
          phoneNumber: transaction.extra?.phone_number || transaction.extra?.phoneNumber || '',
          educationPin: transaction.extra?.educationPin || '',
          educationSerial: transaction.extra?.educationSerial || '',
          educationInstructions: transaction.extra?.educationInstructions || '',
          examType: transaction.extra?.examType || '',
          accountNumber: transaction.extra?.account_number || '',
          vendingProvider: transaction.extra?.vending_provider || '',
        },
      });
    },
    [router]
  );

  const renderTransactionTitle = (transaction: MobileTransaction) => {
    let title = '';
    switch (transaction.category) {
      case 'wallet':
        title = 'Wallet Transaction';
        break;
      case 'airtime':
        title = 'Airtime Purchase';
        break;
      case 'data':
        title = 'Data Bundle';
        break;
      case 'electricity':
        title = `${transaction.provider || transaction.description || 'Electricity'} Purchase`;
        break;
      case 'education':
        title = `${transaction.provider || 'Education'} Purchase`;
        break;
      case 'betting':
        title = `${transaction.provider || 'Betting'} Purchase`;
        break;
      case 'transfer_sent':
        title = 'Transfer Sent';
        break;
      case 'transfer_received':
        title = 'Transfer Received';
        break;
    }
    return title;
  };

  const content = useMemo(() => {
    if (loading && !refreshing) {
      return (
        <View style={styles.loadingContainer}>
          <ActivityIndicator size="large" color="#FF7F00" />
        </View>
      );
    }

    if (transactions.length === 0) {
      return (
        <View style={styles.emptyContainer}>
          <MaterialIcons name="receipt-long" size={64} color="#999" />
          <ThemedText style={styles.emptyText}>No transactions yet</ThemedText>
          <ThemedText style={styles.emptySubtext}>Your transactions will appear here</ThemedText>
        </View>
      );
    }

    return transactions.map((transaction) => {
      const logo = getLogo(transaction.serviceType, transaction.provider);
      return (
        <TouchableOpacity
          key={`${transaction.category}-${transaction.id}`}
          style={styles.transactionCard}
          onPress={() => handleTransactionPress(transaction)}
          activeOpacity={0.7}
        >
          <View style={styles.transactionIconContainer}>
            {logo ? (
              <Image source={logo} style={styles.transactionLogo} contentFit="contain" />
            ) : (
              <MaterialIcons
                name={transaction.type === 'credit' ? 'arrow-downward' : 'arrow-upward'}
                size={24}
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
              ]}
            >
              {transaction.type === 'credit' ? '+' : '-'}{formatCurrency(Math.abs(Number(transaction.amount)))}
            </ThemedText>
            <ThemedText style={styles.transactionStatus}>
              {transaction.status ? toTitle(transaction.status) : transaction.type === 'credit' ? 'Credit' : 'Debit'}
            </ThemedText>
          </View>
        </TouchableOpacity>
      );
    });
  }, [handleTransactionPress, loading, refreshing, transactions]);

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
          <RefreshControl
            refreshing={refreshing}
            onRefresh={handleRefresh}
            tintColor="#FF7F00"
            colors={["#FF7F00"]}
          />
        }
      >
        {error && !loading ? (
          <View style={styles.errorBanner}>
            <MaterialIcons name="error-outline" size={20} color="#d32f2f" style={styles.errorIcon} />
            <ThemedText style={styles.errorText}>{error}</ThemedText>
          </View>
        ) : null}
        {content}
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
    fontSize: 24,
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
    padding: 16,
    marginBottom: 16,
  },
  transactionIconContainer: {
    width: 56,
    height: 56,
    borderRadius: 28,
    backgroundColor: '#fff',
    borderWidth: 1,
    borderColor: '#E0E0E0',
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: 16,
    padding: 8,
  },
  transactionLogo: {
    width: '100%',
    height: '100%',
  },
  transactionDetails: {
    flex: 1,
  },
  transactionType: {
    fontSize: 18,
    fontWeight: 'bold',
    color: '#333',
    marginBottom: 4,
    textTransform: 'capitalize',
  },
  transactionDate: {
    fontSize: 14,
    color: '#666',
    marginBottom: 4,
  },
  transactionReference: {
    fontSize: 12,
    color: '#999',
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
    fontWeight: '500',
  },
  emptyContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    paddingVertical: 80,
  },
  emptyText: {
    fontSize: 18,
    fontWeight: '600',
    color: '#666',
    marginTop: 16,
    marginBottom: 8,
  },
  emptySubtext: {
    fontSize: 14,
    color: '#999',
    textAlign: 'center',
  },
});

