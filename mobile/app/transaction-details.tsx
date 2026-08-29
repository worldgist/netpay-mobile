import { StyleSheet, View, ScrollView, TouchableOpacity, Platform, ImageSourcePropType, Alert, Share } from 'react-native';
import { ThemedView } from '@/components/themed-view';
import { ThemedText } from '@/components/themed-text';
import { MaterialIcons } from '@expo/vector-icons';
import { useRouter, useLocalSearchParams } from 'expo-router';
import * as Clipboard from 'expo-clipboard';
import { Image } from 'expo-image';
import { NetpayLoadingAnimation } from '@/components/netpay-loading-animation';
import * as Print from 'expo-print';
import * as Sharing from 'expo-sharing';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { supabase } from '@/lib/supabase';
import { parseEducationPurchaseMetadata } from '@/utils/education';
import { NGN_LOGO, FUND_WALLET_LABEL, getWalletTransactionLabel, isFundWalletTransaction } from '@/utils/transaction-display';

type DetailTransaction = {
  id: string;
  type: 'credit' | 'debit';
  amount: number;
  status: string;
  reference?: string | null;
  description?: string | null;
  serviceType?: string | null;
  provider?: string | null;
  recipient?: string | null;
  sender?: string | null;
  phoneNumber?: string | null;
  planName?: string | null;
  planValidity?: string | null;
  balanceBefore?: number | null;
  balanceAfter?: number | null;
  createdAt: string;
  formattedDate: string;
  formattedTime: string;
  metadata?: {
    meterType?: string;
    token?: string;
    customerName?: string;
    customerAddress?: string;
    meterNumber?: string;
    educationPin?: string;
    educationSerial?: string;
    educationInstructions?: string;
    examType?: string;
    pins?: { Serial?: string; Pin?: string }[];
    account_number?: string;
    vending_provider?: string;
    transactionType?: string;
    sourceTable?: string;
    grossAmount?: number;
    fundingFee?: number;
    netAmount?: number;
    bankName?: string;
    accountName?: string;
    accountNumber?: string;
  };
};

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
  WAEC: require('@/assets/images/waec.png'),
  NECO: require('@/assets/images/neco.png'),
  JAMB: require('@/assets/images/jamb.png'),
  KAEDCO: require('@/assets/images/KAEDCO.png'),
  JED: require('@/assets/images/JED.png'),
  BET9JA: require('@/assets/images/bet9ja.png'),
  SPORTYBET: require('@/assets/images/sportybet.png'),
  NAIRABET: require('@/assets/images/nairabet.png'),
  '1XBET': require('@/assets/images/1xbet.png'),
  BETKING: require('@/assets/images/betking.png'),
  BETWAY: require('@/assets/images/betway.png'),
  ACCESSBET: require('@/assets/images/accessbet.png'),
  MERRYBET: require('@/assets/images/merrybet.png'),
};

const formatCurrency = (amount: number) =>
  `₦${amount.toLocaleString('en-NG', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

const formatDate = (value: string) => {
  const date = new Date(value);
  return date.toLocaleDateString('en-NG', { year: 'numeric', month: 'short', day: 'numeric' });
};

const formatTime = (value: string) => {
  const date = new Date(value);
  return date.toLocaleTimeString('en-NG', { hour: '2-digit', minute: '2-digit' });
};

const parseDateTime = (dateStr?: string, timeStr?: string) => {
  const fallback = new Date();

  if (!dateStr) return fallback;

  const buildDate = (candidate: string) => {
    const parsed = new Date(candidate);
    return Number.isNaN(parsed.getTime()) ? null : parsed;
  };

  if (dateStr.includes('T')) {
    const parsed = buildDate(dateStr);
    if (parsed) return parsed;
  }

  const normalizedTime = timeStr
    ? timeStr.length === 5
      ? `${timeStr}:00`
      : timeStr
    : '00:00:00';

  const isoCandidate = `${dateStr}T${normalizedTime}`;
  const parsedIso = buildDate(isoCandidate);
  if (parsedIso) return parsedIso;

  const fallbackParsed = buildDate(dateStr);
  return fallbackParsed || fallback;
};

const getStatusColor = (status: string) => {
  switch (status.toLowerCase()) {
    case 'completed':
    case 'success':
      return '#4CAF50';
    case 'pending':
      return '#FF9800';
    case 'failed':
    case 'cancelled':
      return '#F44336';
    default:
      return '#666';
  }
};

const getTypeIcon = (type: string) => {
  switch (type.toLowerCase()) {
    case 'credit':
      return 'arrow-downward';
    case 'debit':
      return 'arrow-upward';
    default:
      return 'swap-horiz';
  }
};

const getTypeColor = (type: string) => (type.toLowerCase() === 'credit' ? '#4CAF50' : '#F44336');

/** Wallet rows with `transaction_type` refund are stored as credits; surface them as Refund in UI. */
const getLedgerTypeLabel = (
  walletCategory: string,
  serviceType: string | null | undefined,
  ledgerType: 'credit' | 'debit'
) => {
  if (walletCategory === 'wallet' && (serviceType || '').toLowerCase() === 'refund') return 'Refund';
  if (walletCategory === 'wallet' && ((serviceType || '').toLowerCase() === 'fund wallet' || (serviceType || '').toLowerCase() === 'add money')) {
    return FUND_WALLET_LABEL;
  }
  return ledgerType.charAt(0).toUpperCase() + ledgerType.slice(1);
};

const ELECTRICITY_LOGO_ALIASES: Record<string, ImageSourcePropType> = {
  IKEJA: NETWORK_LOGOS.IKEDC,
  IKEDC: NETWORK_LOGOS.IKEDC,
  EKO: NETWORK_LOGOS.EKEDC,
  ABUJA: NETWORK_LOGOS.AEDC,
  AEDC: NETWORK_LOGOS.AEDC,
  KADUNA: NETWORK_LOGOS.KAEDCO,
  KAEDCO: NETWORK_LOGOS.KAEDCO,
  IBADAN: NETWORK_LOGOS.IBEDC,
  IBEDC: NETWORK_LOGOS.IBEDC,
  KANO: NETWORK_LOGOS.KEDCO,
  KEDCO: NETWORK_LOGOS.KEDCO,
  PORTHARCOURT: NETWORK_LOGOS.PHEDC,
  PHEDC: NETWORK_LOGOS.PHEDC,
  JOS: NETWORK_LOGOS.JED,
  JED: NETWORK_LOGOS.JED,
};

const getTransactionLogo = (serviceType?: string | null, provider?: string | null): ImageSourcePropType | null => {
  if (
    (serviceType || '').toLowerCase() === 'fund wallet' ||
    (serviceType || '').toLowerCase() === 'add money' ||
    (provider || '').toUpperCase() === 'NGN' ||
    (provider || '').toUpperCase() === 'FLUTTERWAVE'
  ) {
    return NGN_LOGO;
  }
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
  return NETWORK_LOGOS[key] || null;
};

const toTitle = (value?: string | null) =>
  value ? value.replace(/_/g, ' ').replace(/\b\w/g, (char) => char.toUpperCase()) : '';

const formatCurrencyPlain = (amount: number) =>
  `N${amount.toLocaleString('en-NG', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

const getStatusLabel = (status: string) => {
  const normalized = status.toLowerCase();
  if (normalized.includes('success')) return 'Success';
  if (normalized.includes('complete')) return 'Completed';
  if (normalized.includes('pending')) return 'Pending';
  if (normalized.includes('fail') || normalized.includes('cancel')) return toTitle(status);
  return toTitle(status) || 'Completed';
};

const getTransactionTitle = (txnCategory: string, txn: DetailTransaction) => {
  if (txnCategory === 'wallet') {
    if ((txn.metadata?.transactionType || '').toLowerCase() === 'funding_fee') {
      return 'Funding Fee';
    }
    return getWalletTransactionLabel({ ...txn, category: txnCategory });
  }

  switch (txnCategory) {
    case 'airtime':
      return 'Airtime Purchase';
    case 'data':
      return 'Data Bundle';
    case 'electricity':
      return `${txn.provider || 'Electricity'} Purchase`;
    case 'education':
      return `${txn.provider || 'Education'} Purchase`;
    case 'betting':
      return `${txn.provider || 'Betting'} Purchase`;
    case 'transfer_sent':
      return 'Transfer Sent';
    case 'transfer_received':
      return 'Transfer Received';
    default:
      return txn.serviceType || 'Transaction';
  }
};

const getDetailTheme = (txnCategory: string, txn: DetailTransaction) => {
  if (
    isFundWalletTransaction({
      category: txnCategory,
      serviceType: txn.serviceType,
      description: txn.description,
      provider: txn.provider,
      type: txn.type,
    })
  ) {
    return { accentColor: '#4CAF50', iconBackground: '#E8F5E9', statusBackground: '#E8F5E9', statusColor: '#4CAF50' };
  }
  if (txnCategory === 'transfer_sent') {
    return { accentColor: '#9C27B0', iconBackground: '#F3E5F5', statusBackground: '#F3E5F5', statusColor: '#9C27B0' };
  }
  if (txnCategory === 'airtime') {
    return { accentColor: '#FFC107', iconBackground: '#FFF8E1', statusBackground: '#E8F5E9', statusColor: '#4CAF50' };
  }
  if (txn.type === 'credit') {
    return { accentColor: '#4CAF50', iconBackground: '#E8F5E9', statusBackground: '#E8F5E9', statusColor: '#4CAF50' };
  }
  return { accentColor: '#FF7F00', iconBackground: '#FFF3E8', statusBackground: '#E8F5E9', statusColor: '#4CAF50' };
};

const FUNDING_FEE_PERCENTAGE = 0.05;
const MIN_FUNDING_FEE = 10;

const calculateFundingFee = (grossAmount: number) => {
  const percentageFee = grossAmount * FUNDING_FEE_PERCENTAGE;
  return Math.max(MIN_FUNDING_FEE, Math.round(percentageFee * 100) / 100);
};

const formatWalletEntryType = (transactionType?: string | null) => {
  switch ((transactionType || '').toLowerCase()) {
    case 'credit':
      return 'Credit';
    case 'debit':
      return 'Debit';
    case 'refund':
      return 'Refund';
    case 'funding_fee':
      return 'Funding Fee';
    case 'purchase':
      return 'Purchase';
    default:
      return transactionType ? toTitle(transactionType) : 'Wallet';
  }
};

const getWalletPaymentMethod = (detail: DetailTransaction) => {
  const description = (detail.description || '').toLowerCase();
  if (detail.metadata?.bankName) {
    return 'Bank Transfer';
  }
  if (description.includes('flutterwave')) {
    return 'Flutterwave';
  }
  if (description.includes('payvessel') || description.includes('bank transfer')) {
    return 'Bank Transfer';
  }
  if (detail.metadata?.sourceTable === 'funding_transactions') {
    return 'Bank Transfer';
  }
  return 'Wallet';
};

const buildFundingWalletDetail = (
  data: {
    id: string;
    amount: number | string;
    status?: string | null;
    reference?: string | null;
    bank_name?: string | null;
    account_name?: string | null;
    account_number?: string | null;
    created_at: string;
  },
  overrides?: Partial<DetailTransaction>,
): DetailTransaction => {
  const grossAmount = Number(data.amount) || 0;
  const fundingFee = calculateFundingFee(grossAmount);
  const netAmount = grossAmount - fundingFee;
  const bankName = data.bank_name || 'Bank Transfer';

  return {
    id: data.id,
    type: 'credit',
    amount: netAmount,
    status: data.status || 'Completed',
    reference: data.reference,
    description: `Wallet funding via ${bankName}`,
    serviceType: FUND_WALLET_LABEL,
    provider: bankName,
    recipient: data.account_name || '',
    sender: bankName,
    phoneNumber: '',
    planName: '',
    planValidity: '',
    balanceBefore: null,
    balanceAfter: null,
    createdAt: data.created_at,
    formattedDate: formatDate(data.created_at),
    formattedTime: formatTime(data.created_at),
    metadata: {
      sourceTable: 'funding_transactions',
      transactionType: 'credit',
      grossAmount,
      fundingFee,
      netAmount,
      bankName,
      accountName: data.account_name || '',
      accountNumber: data.account_number || '',
    },
    ...overrides,
  };
};

const buildUserWalletDetail = (data: {
  id: string;
  amount: number | string;
  transaction_type?: string | null;
  description?: string | null;
  reference?: string | null;
  created_at: string;
  balance_before?: number | null;
  balance_after?: number | null;
}): DetailTransaction => {
  const tt = (data.transaction_type || '').toLowerCase();
  const isRefund = tt === 'refund';
  const isFundingFee = tt === 'funding_fee';
  const description = data.description || '';
  const isFlutterwaveFunding = description.toLowerCase().includes('flutterwave');
  const ledgerType: 'credit' | 'debit' = tt === 'credit' || isRefund ? 'credit' : 'debit';
  const provider = isRefund ? '' : tt === 'credit' ? (isFlutterwaveFunding ? 'Flutterwave' : '') : '';
  const serviceType = isFundingFee
    ? 'Funding Fee'
    : isRefund
      ? 'Refund'
      : getWalletTransactionLabel({
          category: 'wallet',
          description,
          provider,
          type: ledgerType,
        });

  return {
    id: data.id,
    type: ledgerType,
    amount: Number(data.amount) || 0,
    status: 'Completed',
    reference: data.reference,
    description,
    serviceType,
    provider,
    recipient: '',
    sender: '',
    phoneNumber: '',
    planName: '',
    planValidity: '',
    balanceBefore: data.balance_before ?? null,
    balanceAfter: data.balance_after ?? null,
    createdAt: data.created_at,
    formattedDate: formatDate(data.created_at),
    formattedTime: formatTime(data.created_at),
    metadata: {
      transactionType: tt || (isRefund ? 'refund' : ledgerType),
    },
  };
};

const enrichWalletDetailFromFunding = async (
  userId: string,
  detail: DetailTransaction,
): Promise<DetailTransaction> => {
  if (!detail.reference || detail.metadata?.sourceTable === 'funding_transactions') {
    return detail;
  }

  const { data } = await supabase
    .from('funding_transactions')
    .select('id, amount, status, reference, bank_name, account_name, account_number, created_at')
    .eq('user_id', userId)
    .eq('reference', detail.reference)
    .maybeSingle();

  if (!data) {
    return detail;
  }

  const fundingDetail = buildFundingWalletDetail(data, {
    id: detail.id,
    reference: detail.reference,
    balanceBefore: detail.balanceBefore ?? null,
    balanceAfter: detail.balanceAfter ?? null,
    createdAt: detail.createdAt,
    formattedDate: detail.formattedDate,
    formattedTime: detail.formattedTime,
  });

  return {
    ...fundingDetail,
    metadata: {
      ...fundingDetail.metadata,
      transactionType: detail.metadata?.transactionType || 'credit',
    },
  };
};

type DetailRowProps = {
  icon: keyof typeof MaterialIcons.glyphMap;
  label: string;
  value: string;
  onCopy?: () => void;
  multiline?: boolean;
};

function DetailRow({ icon, label, value, onCopy, multiline }: DetailRowProps) {
  return (
    <View style={styles.detailRow}>
      <View style={styles.detailIconCircle}>
        <MaterialIcons name={icon} size={18} color="#FF7F00" />
      </View>
      <ThemedText style={styles.detailLabel}>{label}</ThemedText>
      <View style={styles.detailValueWrap}>
        <ThemedText style={styles.detailValue} numberOfLines={multiline ? 3 : 1}>
          {value}
        </ThemedText>
        {onCopy ? (
          <TouchableOpacity onPress={onCopy} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
            <MaterialIcons name="content-copy" size={18} color="#FF7F00" />
          </TouchableOpacity>
        ) : null}
      </View>
    </View>
  );
}

function TransactionDetailsScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const params = useLocalSearchParams();

  const category = (params.category as string) || 'wallet';
  const paramType = (params.type as string) || 'debit';
  const paramAmount = parseFloat((params.amount as string) || '0');
  const paramDate = (params.date as string) || new Date().toISOString();
  const paramTime = (params.time as string) || '';

  const parsedDate = parseDateTime(paramDate, paramTime);
  const parsedIso = parsedDate.toISOString();

  const recipientParam = ((params.recipient as string) || (params.meterNumber as string) || '');

  const initialTransaction: DetailTransaction = {
    id: (params.id as string) || 'pending',
    type: paramType.toLowerCase() === 'credit' ? 'credit' : 'debit',
    amount: Number.isFinite(paramAmount) ? paramAmount : 0,
    status: (params.status as string) || 'Completed',
    reference: (params.reference as string) || '',
    description: (params.description as string) || '',
    serviceType: (params.serviceType as string) || '',
    provider: (params.network as string) || '',
    recipient: recipientParam,
    sender: (params.sender as string) || '',
    phoneNumber: (params.phoneNumber as string) || '',
    planName: (params.planName as string) || '',
    planValidity: (params.planValidity as string) || '',
    balanceBefore: undefined,
    balanceAfter: undefined,
    createdAt: parsedIso,
    formattedDate: formatDate(parsedIso),
    formattedTime: formatTime(parsedIso),
    metadata: {
      meterType: (params.meterType as string) || '',
      token: (params.token as string) || '',
      customerName: (params.customerName as string) || '',
      customerAddress: (params.customerAddress as string) || '',
      meterNumber: (params.meterNumber as string) || '',
      educationPin: (params.educationPin as string) || '',
      educationSerial: (params.educationSerial as string) || '',
      educationInstructions: (params.educationInstructions as string) || '',
      examType: (params.examType as string) || '',
    },
  };

  const [transaction, setTransaction] = useState<DetailTransaction>(initialTransaction);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const handleCopy = async (text: string, label: string) => {
    try {
      if (!text) {
        Alert.alert('Unavailable', `No ${label.toLowerCase()} to copy.`);
        return;
      }
      if (Platform.OS === 'web') {
        await navigator.clipboard.writeText(text);
      } else {
        await Clipboard.setStringAsync(text);
      }
      Alert.alert('Copied', `${label} copied to clipboard`);
    } catch {
      Alert.alert('Error', 'Failed to copy to clipboard');
    }
  };

  const fetchTransactionDetails = useCallback(async () => {
    try {
      setLoading(true);
      setError(null);

      const { data: sessionData, error: sessionError } = await supabase.auth.getSession();
      if (sessionError) throw sessionError;

      const session = sessionData.session;
      if (!session) {
        router.replace('/auth/login');
        return;
      }

      const userId = session.user.id;
      let detail: DetailTransaction | null = null;

      if (category === 'wallet') {
        const sourceTable = (params.sourceTable as string) || '';

        if (sourceTable === 'funding_transactions') {
          const { data, error } = await supabase
            .from('funding_transactions')
            .select('id, amount, status, reference, bank_name, account_name, account_number, created_at, user_id')
            .eq('id', initialTransaction.id)
            .eq('user_id', userId)
            .maybeSingle();

          if (error) throw error;
          if (data) {
            detail = buildFundingWalletDetail(data);
          }
        }

        if (!detail) {
          const { data, error } = await supabase
            .from('user_transactions')
            .select('id, amount, transaction_type, description, reference, created_at, balance_before, balance_after, user_id')
            .eq('id', initialTransaction.id)
            .eq('user_id', userId)
            .maybeSingle();

          if (error) throw error;
          if (data) {
            const builtDetail = buildUserWalletDetail(data);
            const tt = (data.transaction_type || '').toLowerCase();
            const shouldLookupFunding =
              builtDetail.type === 'credit' &&
              tt !== 'funding_fee' &&
              tt !== 'refund' &&
              !tt.includes('fee');
            detail = shouldLookupFunding
              ? await enrichWalletDetailFromFunding(userId, builtDetail)
              : builtDetail;
          }
        }

        if (!detail) {
          const { data, error } = await supabase
            .from('funding_transactions')
            .select('id, amount, status, reference, bank_name, account_name, account_number, created_at, user_id')
            .eq('id', initialTransaction.id)
            .eq('user_id', userId)
            .maybeSingle();

          if (error) throw error;
          if (data) {
            detail = buildFundingWalletDetail(data);
          }
        }

        if (!detail && initialTransaction.reference) {
          const { data, error } = await supabase
            .from('funding_transactions')
            .select('id, amount, status, reference, bank_name, account_name, account_number, created_at, user_id')
            .eq('user_id', userId)
            .eq('reference', initialTransaction.reference)
            .maybeSingle();

          if (error) throw error;
          if (data) {
            detail = buildFundingWalletDetail(data, {
              id: initialTransaction.id,
              reference: initialTransaction.reference,
            });
          }
        }
      } else if (category === 'airtime') {
        const { data, error } = await supabase
          .from('airtime_transactions')
          .select('id, amount, status, reference, created_at, network, phone_number, user_id')
          .eq('id', initialTransaction.id)
          .eq('user_id', userId)
          .maybeSingle();

        if (error) throw error;
        if (data) {
          detail = {
            id: data.id,
            type: 'debit',
            amount: Number(data.amount) || 0,
            status: data.status,
            reference: data.reference,
            description: `Airtime purchase • ${data.phone_number}`,
            serviceType: 'Airtime VTU',
            provider: data.network,
            recipient: data.phone_number,
            sender: '',
            phoneNumber: data.phone_number,
            planName: '',
            planValidity: '',
            balanceBefore: null,
            balanceAfter: null,
            createdAt: data.created_at,
            formattedDate: formatDate(data.created_at),
            formattedTime: formatTime(data.created_at),
            metadata: (data as any)?.metadata || {},
          };
        }
      } else if (category === 'data') {
        const { data, error } = await supabase
          .from('data_transactions')
          .select('id, amount, status, reference, created_at, network, plan_name, plan_validity, phone_number, user_id')
          .eq('id', initialTransaction.id)
          .eq('user_id', userId)
          .maybeSingle();

        if (error) throw error;
        if (data) {
          detail = {
            id: data.id,
            type: 'debit',
            amount: Number(data.amount) || 0,
            status: data.status,
            reference: data.reference,
            description: data.plan_name,
            serviceType: 'Data Bundle',
            provider: data.network,
            recipient: data.phone_number,
            sender: '',
            phoneNumber: data.phone_number,
            planName: data.plan_name,
            planValidity: data.plan_validity,
            balanceBefore: null,
            balanceAfter: null,
            createdAt: data.created_at,
            formattedDate: formatDate(data.created_at),
            formattedTime: formatTime(data.created_at),
            metadata: (data as any)?.metadata || {},
          };
        }
      } else if (category === 'electricity') {
        const { data, error } = await supabase
          .from('electricity_transactions')
          .select('id, amount, status, reference, created_at, provider, meter_number, meter_type, token, customer_name, api_response, user_id')
          .eq('id', initialTransaction.id)
          .eq('user_id', userId)
          .maybeSingle();

        if (error) throw error;
        if (data) {
          // Extract token - check database field first, then api_response
          let extractedToken = data.token;
          let extractedAddress = (data as any)?.metadata?.customer_address || null;
          
          console.log('Transaction details - Electricity token extraction:', {
            hasDbToken: !!extractedToken,
            dbToken: extractedToken,
            hasApiResponse: !!(data as any).api_response,
          });
          
          if ((data as any).api_response) {
            const apiResponse = (data as any).api_response;

            if (!extractedAddress) {
              extractedAddress =
                apiResponse?.data?.customer_address ||
                apiResponse?.data?.address ||
                apiResponse?.customer_address ||
                apiResponse?.address ||
                null;

              if (extractedAddress) {
                extractedAddress = String(extractedAddress).trim();
                if (extractedAddress === '' || extractedAddress.toLowerCase() === 'null') {
                  extractedAddress = null;
                }
              }
            }

            if (!extractedToken) {
              // Check multiple possible locations in api_response
              extractedToken = apiResponse?.data?.token ||
                              apiResponse?.token ||
                              apiResponse?.details?.token ||
                              null;
              
              console.log('Transaction details - Token from api_response:', {
                foundToken: !!extractedToken,
                tokenValue: extractedToken,
                apiResponseDataKeys: apiResponse?.data ? Object.keys(apiResponse.data) : [],
              });
              
              // Convert to string and validate
              if (extractedToken) {
                extractedToken = String(extractedToken).trim();
                if (extractedToken === '' || extractedToken.toLowerCase() === 'null') {
                  extractedToken = null;
                }
              }
            }
          }
          
          console.log('Transaction details - Final token for metadata:', {
            hasToken: !!extractedToken,
            tokenValue: extractedToken,
          });
          
          detail = {
            id: data.id,
            type: 'debit',
            amount: Number(data.amount) || 0,
            status: data.status,
            reference: data.reference,
            description: `Electricity purchase • ${data.meter_number}`,
            serviceType: 'Electricity',
            provider: data.provider,
            recipient: data.meter_number,
            sender: '',
            phoneNumber: '',
            planName: '',
            planValidity: '',
            balanceBefore: null,
            balanceAfter: null,
            createdAt: data.created_at,
            formattedDate: formatDate(data.created_at),
            formattedTime: formatTime(data.created_at),
            metadata: {
              ...((data as any)?.metadata || {}),
              meterType: data.meter_type,
              token: extractedToken, // Use extracted token (from DB or api_response)
              customerName: data.customer_name,
              customerAddress: extractedAddress,
              meterNumber: data.meter_number,
            },
          };
        }
      } else if (category === 'education') {
        const { data, error } = await supabase
          .from('education_transactions')
          .select('id, amount, status, reference, created_at, exam_type, phone_number, balance_before, balance_after, api_response, metadata, pin, serial_number, pins, user_id')
          .eq('id', initialTransaction.id)
          .eq('user_id', userId)
          .maybeSingle();

        if (error) throw error;
        if (data) {
          // Priority order for PINs:
          // 1. Database columns (pin, serial_number, pins) - most reliable
          // 2. metadata.pins - for backward compatibility
          // 3. Parse from api_response - fallback
          
          let finalPins: { Pin: string; Serial?: string }[] = [];
          let finalPin: string | undefined;
          let finalSerial: string | undefined;
          
          // First, try database columns (highest priority)
          if ((data as any).pins && Array.isArray((data as any).pins)) {
            finalPins = (data as any).pins;
            if (finalPins.length > 0) {
              finalPin = finalPins[0].Pin;
              finalSerial = finalPins[0].Serial;
            }
          } else if ((data as any).pin) {
            // Single PIN from database column
            finalPin = (data as any).pin;
            finalSerial = (data as any).serial_number;
            finalPins = [{ Pin: finalPin, Serial: finalSerial || '' }];
          }
          
          // Fallback to metadata if database columns don't have PINs
          if (finalPins.length === 0) {
            const metadataObj = (data as any)?.metadata || {};
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
              finalPins = [{ Pin: finalPin, Serial: finalSerial || '' }];
            }
          }
          
          // Last fallback: parse from api_response
          if (finalPins.length === 0) {
            const parsedMetadata = parseEducationPurchaseMetadata((data as any)?.api_response);
            if (parsedMetadata.pin) {
              finalPin = parsedMetadata.pin;
              finalSerial = parsedMetadata.serial;
              finalPins = [{ Pin: finalPin, Serial: finalSerial || '' }];
            }
          }
          
          const serviceLabel = data.exam_type ? `Education • ${data.exam_type}` : 'Education';
          const description = data.phone_number
            ? `${data.exam_type || 'Education'} purchase • ${data.phone_number}`
            : `${data.exam_type || 'Education'} purchase`;
          detail = {
            id: data.id,
            type: 'debit',
            amount: Number(data.amount) || 0,
            status: data.status || 'Completed',
            reference: data.reference,
            description,
            serviceType: serviceLabel,
            provider: data.exam_type,
            recipient: data.phone_number || '',
            sender: '',
            phoneNumber: data.phone_number || '',
            planName: '',
            planValidity: '',
            balanceBefore: data.balance_before ?? null,
            balanceAfter: data.balance_after ?? null,
            createdAt: data.created_at,
            formattedDate: formatDate(data.created_at),
            formattedTime: formatTime(data.created_at),
            metadata: {
              ...((data as any)?.metadata || {}),
              pins: finalPins,
              educationPin: finalPin,
              educationSerial: finalSerial,
              educationInstructions: parseEducationPurchaseMetadata((data as any)?.api_response).instructions,
              examType: data.exam_type,
            },
          };
        }
      } else if (category === 'betting') {
        const { data, error } = await supabase
          .from('betting_transactions')
          .select('id, amount, status, reference, created_at, betting_provider, account_number, vending_provider, balance_before, balance_after, purchase_amount, charge_fee, user_id')
          .eq('id', initialTransaction.id)
          .eq('user_id', userId)
          .maybeSingle();

        if (error) throw error;
        if (data) {
          const description = data.account_number
            ? `Betting purchase • ${data.account_number}`
            : 'Betting purchase';
          detail = {
            id: data.id,
            type: 'debit',
            amount: Number(data.amount) || 0,
            status: data.status || 'Completed',
            reference: data.reference,
            description,
            serviceType: `Betting • ${data.betting_provider || 'Betting'}`,
            provider: data.betting_provider,
            recipient: data.account_number || '',
            sender: '',
            phoneNumber: '',
            planName: '',
            planValidity: '',
            balanceBefore: data.balance_before ?? null,
            balanceAfter: data.balance_after ?? null,
            createdAt: data.created_at,
            formattedDate: formatDate(data.created_at),
            formattedTime: formatTime(data.created_at),
            metadata: {
              account_number: data.account_number,
              vending_provider: data.vending_provider,
              purchase_amount: data.purchase_amount,
              charge_fee: data.charge_fee,
            },
          };
        }
      } else if (category === 'transfer_sent' || category === 'transfer_received') {
        const { data, error } = await supabase
          .from('transfer_transactions')
          .select('id, amount, status, reference, description, created_at, sender_id, recipient_id, recipient:profiles!transfer_transactions_recipient_id_fkey(full_name,email), sender:profiles!transfer_transactions_sender_id_fkey(full_name,email)')
          .eq('id', initialTransaction.id)
          .maybeSingle();

        if (error) throw error;
        if (data && (data.sender_id === userId || data.recipient_id === userId)) {
          const isSender = data.sender_id === userId;
          const counterpart = isSender ? data.recipient?.full_name || data.recipient?.email : data.sender?.full_name || data.sender?.email;
          detail = {
            id: data.id,
            type: isSender ? 'debit' : 'credit',
            amount: Number(data.amount) || 0,
            status: data.status || 'Completed',
            reference: data.reference,
            description: data.description,
            serviceType: 'Transfer',
            provider: '',
            recipient: isSender ? counterpart || data.recipient?.email || '' : data.recipient?.email || '',
            sender: isSender ? data.sender?.email || '' : counterpart || data.sender?.email || '',
            phoneNumber: '',
            planName: '',
            planValidity: '',
            balanceBefore: null,
            balanceAfter: null,
            createdAt: data.created_at,
            formattedDate: formatDate(data.created_at),
            formattedTime: formatTime(data.created_at),
            metadata: (data as any)?.metadata || {},
          };
        }
      }

      if (!detail) {
        setError('Transaction not found.');
        return;
      }

      setTransaction(detail);
    } catch (err) {
      console.error('Failed to load transaction details:', err);
      const message = err instanceof Error ? err.message : 'Unable to load transaction details.';
      setError(message);
    } finally {
      setLoading(false);
    }
  }, [category, initialTransaction.id, initialTransaction.reference, params.sourceTable, router]);

  useEffect(() => {
    fetchTransactionDetails();
  }, [fetchTransactionDetails]);

  const showFundWalletLogo = useMemo(
    () =>
      isFundWalletTransaction({
        category,
        serviceType: transaction.serviceType,
        description: transaction.description,
        provider: transaction.provider,
        type: transaction.type,
      }),
    [category, transaction.description, transaction.provider, transaction.serviceType, transaction.type]
  );

  const transactionLogo = useMemo(() => {
    if (showFundWalletLogo) {
      return NGN_LOGO;
    }
    return getTransactionLogo(transaction.serviceType, transaction.provider);
  }, [showFundWalletLogo, transaction.serviceType, transaction.provider]);

  const generateReceiptHTML = () => {
    const currentDate = new Date();
    const formattedDate = currentDate.toLocaleDateString('en-US', {
      year: 'numeric',
      month: 'long',
      day: 'numeric',
    });
    const formattedTime = currentDate.toLocaleTimeString('en-US', {
      hour: '2-digit',
      minute: '2-digit',
      hour12: true,
    });

    return `
      <!DOCTYPE html>
      <html>
        <head>
          <meta charset="utf-8">
          <meta name="viewport" content="width=device-width, initial-scale=1.0">
          <title>Transaction Receipt</title>
          <style>
            * {
              margin: 0;
              padding: 0;
              box-sizing: border-box;
            }
            body {
              font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif;
              padding: 20px;
              background: #fff;
              color: #333;
            }
            .receipt-container {
              max-width: 600px;
              margin: 0 auto;
              background: #fff;
              border: 1px solid #e0e0e0;
              border-radius: 8px;
              padding: 30px;
            }
            .header {
              text-align: center;
              border-bottom: 2px solid #FF7F00;
              padding-bottom: 20px;
              margin-bottom: 30px;
            }
            .logo {
              font-size: 28px;
              font-weight: bold;
              color: #FF7F00;
              margin-bottom: 10px;
            }
            .receipt-title {
              font-size: 24px;
              font-weight: bold;
              color: #333;
              margin-bottom: 5px;
            }
            .receipt-subtitle {
              font-size: 14px;
              color: #666;
            }
            .transaction-info {
              margin-bottom: 30px;
            }
            .info-row {
              display: flex;
              justify-content: space-between;
              padding: 12px 0;
              border-bottom: 1px solid #f0f0f0;
            }
            .info-row:last-child {
              border-bottom: none;
            }
            .info-label {
              font-size: 14px;
              color: #666;
              font-weight: 500;
            }
            .info-value {
              font-size: 14px;
              color: #333;
              font-weight: 600;
              text-align: right;
            }
            .amount-section {
              background: #F5F5F5;
              border-radius: 8px;
              padding: 20px;
              margin: 30px 0;
              text-align: center;
            }
            .amount-label {
              font-size: 14px;
              color: #666;
              margin-bottom: 10px;
            }
            .amount-value {
              font-size: 36px;
              font-weight: bold;
              color: ${getTypeColor(transaction.type)};
            }
            .status-badge {
              display: inline-block;
              padding: 6px 16px;
              border-radius: 20px;
              font-size: 14px;
              font-weight: 600;
              background: ${getStatusColor(transaction.status) + '20'};
              color: ${getStatusColor(transaction.status)};
              margin-top: 10px;
            }
            .footer {
              margin-top: 40px;
              padding-top: 20px;
              border-top: 1px solid #e0e0e0;
              text-align: center;
              font-size: 12px;
              color: #999;
            }
            .reference {
              background: #F5F5F5;
              padding: 15px;
              border-radius: 8px;
              margin: 20px 0;
              text-align: center;
            }
            .reference-code {
              font-size: 16px;
              font-weight: bold;
              color: #333;
              font-family: monospace;
              letter-spacing: 1px;
            }
          </style>
        </head>
        <body>
          <div class="receipt-container">
            <div class="header">
              <div class="logo">NetPay</div>
              <div class="receipt-title">Transaction Receipt</div>
              <div class="receipt-subtitle">${formattedDate} at ${formattedTime}</div>
            </div>

            <div class="amount-section">
              <div class="amount-label">${showFundWalletLogo ? 'Amount Added' : isFundingFeeTxn ? 'Amount Debited' : transaction.type === 'credit' ? 'Amount Received' : 'Amount Sent'}</div>
              <div class="amount-value">${transaction.type === 'credit' ? '+' : '-'}${formatCurrency(transaction.amount)}</div>
              <div class="status-badge">${transaction.status}</div>
            </div>

            <div class="transaction-info">
              ${category === 'wallet' ? `
              ${transaction.metadata?.transactionType ? `
              <div class="info-row">
                <span class="info-label">Entry Type</span>
                <span class="info-value">${formatWalletEntryType(transaction.metadata.transactionType)}</span>
              </div>
              ` : ''}
              <div class="info-row">
                <span class="info-label">Payment Method</span>
                <span class="info-value">${getWalletPaymentMethod(transaction)}</span>
              </div>
              ${transaction.metadata?.bankName ? `
              <div class="info-row">
                <span class="info-label">Bank Name</span>
                <span class="info-value">${transaction.metadata.bankName}</span>
              </div>
              ` : ''}
              ${transaction.metadata?.accountName ? `
              <div class="info-row">
                <span class="info-label">Account Name</span>
                <span class="info-value">${transaction.metadata.accountName}</span>
              </div>
              ` : ''}
              ${transaction.metadata?.accountNumber ? `
              <div class="info-row">
                <span class="info-label">Account Number</span>
                <span class="info-value">${transaction.metadata.accountNumber}</span>
              </div>
              ` : ''}
              ${transaction.metadata?.grossAmount != null ? `
              <div class="info-row">
                <span class="info-label">Gross Amount</span>
                <span class="info-value">${formatCurrency(transaction.metadata.grossAmount)}</span>
              </div>
              ` : ''}
              ${transaction.metadata?.fundingFee != null ? `
              <div class="info-row">
                <span class="info-label">Funding Fee</span>
                <span class="info-value">${formatCurrency(transaction.metadata.fundingFee)}</span>
              </div>
              ` : ''}
              ${transaction.metadata?.netAmount != null ? `
              <div class="info-row">
                <span class="info-label">Net Credit</span>
                <span class="info-value">${formatCurrency(transaction.metadata.netAmount)}</span>
              </div>
              ` : ''}
              ${transaction.description ? `
              <div class="info-row">
                <span class="info-label">Details</span>
                <span class="info-value">${transaction.description}</span>
              </div>
              ` : ''}
              ` : `
              <div class="info-row">
                <span class="info-label">Transaction Type</span>
                <span class="info-value">${getLedgerTypeLabel(category, transaction.serviceType, transaction.type).toUpperCase()}</span>
              </div>
              ${transaction.serviceType ? `
              <div class="info-row">
                <span class="info-label">Service Type</span>
                <span class="info-value">${transaction.serviceType}</span>
              </div>
              ` : ''}
              ${transaction.provider ? `
              <div class="info-row">
                <span class="info-label">Provider</span>
                <span class="info-value">${transaction.provider}</span>
              </div>
              ` : ''}
              `}
              ${transaction.metadata?.examType ? `
              <div class="info-row">
                <span class="info-label">Exam</span>
                <span class="info-value">${transaction.metadata.examType}</span>
              </div>
              ` : ''}
              ${transaction.metadata?.customerName ? `
              <div class="info-row">
                <span class="info-label">Customer</span>
                <span class="info-value">${transaction.metadata.customerName}</span>
              </div>
              ` : ''}
              ${transaction.metadata?.customerAddress ? `
              <div class="info-row">
                <span class="info-label">Address</span>
                <span class="info-value">${transaction.metadata.customerAddress}</span>
              </div>
              ` : ''}
              ${transaction.metadata?.examType ? `
              <div class="info-row">
                <span class="info-label">Exam</span>
                <span class="info-value">${transaction.metadata.examType}</span>
              </div>
              ` : ''}
              ${transaction.metadata?.meterType ? `
              <div class="info-row">
                <span class="info-label">Meter Type</span>
                <span class="info-value">${transaction.metadata.meterType.toUpperCase()}</span>
              </div>
              ` : ''}
              ${transaction.metadata?.token ? `
              <div class="info-row" style="background: #FFF5E6; padding: 16px; border-radius: 8px; margin: 12px 0; border: 2px solid #FF7F00;">
                <div style="width: 100%;">
                  <div style="font-size: 12px; color: #FF7F00; font-weight: 600; text-transform: uppercase; letter-spacing: 0.5px; margin-bottom: 8px;">Electricity Token</div>
                  <div style="font-size: 20px; font-weight: bold; color: #333; font-family: monospace; letter-spacing: 2px; word-break: break-all;">${transaction.metadata.token}</div>
                </div>
              </div>
              ` : ''}
              ${transaction.metadata?.pins && Array.isArray(transaction.metadata.pins) && transaction.metadata.pins.length > 0 ? `
              <div class="info-row" style="background: #E8F5E9; padding: 16px; border-radius: 8px; margin: 12px 0; border: 2px solid #4CAF50; flex-direction: column;">
                <div style="font-size: 12px; color: #4CAF50; font-weight: 600; text-transform: uppercase; letter-spacing: 0.5px; margin-bottom: 12px;">PIN Details</div>
                ${transaction.metadata.pins.map((pinData: any, index: number) => `
                  <div style="margin-bottom: ${index < transaction.metadata.pins.length - 1 ? '16px' : '0'}; padding-bottom: ${index < transaction.metadata.pins.length - 1 ? '16px' : '0'}; border-bottom: ${index < transaction.metadata.pins.length - 1 ? '1px solid #C8E6C9' : 'none'};">
                    ${pinData.Serial ? `
                      <div style="margin-bottom: 8px;">
                        <div style="font-size: 11px; color: #666; margin-bottom: 4px;">Serial Number</div>
                        <div style="font-family: monospace; font-size: 14px; font-weight: 600; color: #333;">${pinData.Serial}</div>
                      </div>
                    ` : ''}
                    ${pinData.Pin ? `
                      <div>
                        <div style="font-size: 11px; color: #666; margin-bottom: 4px;">PIN</div>
                        <div style="font-family: monospace; font-size: 18px; font-weight: bold; color: #1B5E20; letter-spacing: 1px; word-break: break-all;">${pinData.Pin}</div>
                      </div>
                    ` : ''}
                  </div>
                `).join('')}
                <div style="font-size: 11px; color: #666; text-align: center; margin-top: 12px; font-style: italic;">Keep this PIN safe. You'll need it for your exam registration.</div>
              </div>
              ` : ''}
              ${(!transaction.metadata?.pins || !Array.isArray(transaction.metadata.pins) || transaction.metadata.pins.length === 0) && transaction.metadata?.educationPin ? `
              <div class="info-row">
                <span class="info-label">PIN</span>
                <span class="info-value">${transaction.metadata.educationPin}</span>
              </div>
              ` : ''}
              ${transaction.metadata?.educationSerial && (!transaction.metadata?.pins || !Array.isArray(transaction.metadata.pins) || transaction.metadata.pins.length === 0) ? `
              <div class="info-row">
                <span class="info-label">Serial</span>
                <span class="info-value">${transaction.metadata.educationSerial}</span>
              </div>
              ` : ''}
              ${transaction.sender ? `
              <div class="info-row">
                <span class="info-label">Sender</span>
                <span class="info-value">${transaction.sender}</span>
              </div>
              ` : ''}
              ${transaction.recipient ? `
              <div class="info-row">
                <span class="info-label">Recipient</span>
                <span class="info-value">${transaction.recipient}</span>
              </div>
              ` : ''}
              ${transaction.metadata?.account_number ? `
              <div class="info-row">
                <span class="info-label">Account ID / User ID</span>
                <span class="info-value">${transaction.metadata.account_number}</span>
              </div>
              ` : ''}
              ${transaction.metadata?.vending_provider ? `
              <div class="info-row">
                <span class="info-label">Vending Provider</span>
                <span class="info-value">${transaction.metadata.vending_provider.toUpperCase()}</span>
              </div>
              ` : ''}
              ${transaction.phoneNumber ? `
              <div class="info-row">
                <span class="info-label">Phone Number</span>
                <span class="info-value">${transaction.phoneNumber}</span>
              </div>
              ` : ''}
              ${transaction.planName ? `
              <div class="info-row">
                <span class="info-label">Plan</span>
                <span class="info-value">${transaction.planName}${transaction.planValidity ? ` • ${transaction.planValidity}` : ''}</span>
              </div>
              ` : ''}
              <div class="info-row">
                <span class="info-label">Date</span>
                <span class="info-value">${transaction.formattedDate} ${transaction.formattedTime}</span>
              </div>
            </div>

            <div class="reference">
              <div style="font-size: 12px; color: #666; margin-bottom: 5px;">Reference Number</div>
              <div class="reference-code">${transaction.reference || 'N/A'}</div>
            </div>

            <div class="reference">
              <div style="font-size: 12px; color: #666; margin-bottom: 5px;">Transaction ID</div>
              <div class="reference-code">${transaction.id}</div>
            </div>

            <div class="footer">
              <p>This is a computer-generated receipt. No signature is required.</p>
              <p style="margin-top: 10px;">Thank you for using NetPay!</p>
            </div>
          </div>
        </body>
      </html>
    `;
  };

  const handlePrintReceipt = async () => {
    try {
      const html = generateReceiptHTML();
      const { uri } = await Print.printToFileAsync({
        html,
        base64: false,
        width: 612,
        height: 792,
      });

      const isAvailable = await Sharing.isAvailableAsync();

      if (isAvailable) {
        await Sharing.shareAsync(uri, {
          mimeType: 'application/pdf',
          dialogTitle: 'Share Receipt',
        });
      } else {
        Alert.alert('Success', 'Receipt generated successfully!', [{ text: 'OK' }]);
      }
    } catch (error) {
      console.error('Error generating receipt:', error);
      Alert.alert('Error', 'Failed to generate receipt. Please try again.');
    }
  };

  const walletPaymentMethod = category === 'wallet' ? getWalletPaymentMethod(transaction) : '';
  const isFundingFeeTxn = (transaction.metadata?.transactionType || '').toLowerCase() === 'funding_fee';
  const amountLabel = showFundWalletLogo
    ? 'Amount Added'
    : isFundingFeeTxn
      ? 'Amount Debited'
      : transaction.type === 'credit'
        ? 'Amount Received'
        : 'Amount Sent';

  const buildShareMessage = () => {
    const sign = transaction.type === 'credit' ? '+' : '-';
    const lines = [
      getTransactionTitle(category, transaction),
      `${amountLabel}: ${sign}${formatCurrencyPlain(transaction.amount)}`,
      `Status: ${getStatusLabel(transaction.status)}`,
      `Date: ${transaction.formattedDate} • ${transaction.formattedTime}`,
      `Reference: ${transaction.reference || 'N/A'}`,
      `Transaction ID: ${transaction.id}`,
    ];

    if (category === 'wallet') {
      if (transaction.metadata?.transactionType) {
        lines.splice(3, 0, `Entry Type: ${formatWalletEntryType(transaction.metadata.transactionType)}`);
      }
      if (walletPaymentMethod) lines.push(`Payment Method: ${walletPaymentMethod}`);
      if (transaction.metadata?.bankName) lines.push(`Bank Name: ${transaction.metadata.bankName}`);
      if (transaction.metadata?.accountName) lines.push(`Account Name: ${transaction.metadata.accountName}`);
      if (transaction.metadata?.accountNumber) lines.push(`Account Number: ${transaction.metadata.accountNumber}`);
      if (transaction.metadata?.grossAmount != null) {
        lines.push(`Gross Amount: ${formatCurrencyPlain(transaction.metadata.grossAmount)}`);
      }
      if (transaction.metadata?.fundingFee != null) {
        lines.push(`Funding Fee: ${formatCurrencyPlain(transaction.metadata.fundingFee)}`);
      }
      if (transaction.metadata?.netAmount != null) {
        lines.push(`Net Credit: ${formatCurrencyPlain(transaction.metadata.netAmount)}`);
      }
      if (transaction.description) lines.push(`Details: ${transaction.description}`);
    }

    return lines.join('\n');
  };

  const handleShare = async () => {
    try {
      await Share.share({ message: buildShareMessage() });
    } catch (error) {
      console.error('Error sharing transaction:', error);
    }
  };

  const theme = getDetailTheme(category, transaction);
  const transactionTitle = getTransactionTitle(category, transaction);
  const statusLabel = getStatusLabel(transaction.status);
  const isFailed =
    transaction.status.toLowerCase().includes('fail') ||
    transaction.status.toLowerCase().includes('cancel');
  const summarySubtitle =
    category === 'wallet'
      ? transaction.metadata?.accountName ||
        transaction.metadata?.bankName ||
        transaction.metadata?.accountNumber ||
        transaction.sender ||
        transaction.recipient ||
        ''
      : transaction.recipient ||
        transaction.phoneNumber ||
        transaction.sender ||
        transaction.description ||
        '';

  return (
    <ThemedView style={styles.container}>
      <View style={[styles.header, { paddingTop: insets.top + 12 }]}>
        <TouchableOpacity onPress={() => router.back()} style={styles.headerSideButton}>
          <MaterialIcons name="arrow-back" size={24} color="#1A2B4A" />
        </TouchableOpacity>
        <ThemedText style={styles.headerTitle}>Transaction Details</ThemedText>
        <TouchableOpacity onPress={handleShare} style={styles.headerSideButton}>
          <MaterialIcons name="share" size={22} color="#1A2B4A" />
        </TouchableOpacity>
      </View>

      {loading ? (
        <View style={styles.loadingContainer}>
          <NetpayLoadingAnimation message="Loading details…" />
        </View>
      ) : error ? (
        <View style={styles.errorContainer}>
          <MaterialIcons name="error-outline" size={32} color="#d32f2f" />
          <ThemedText style={styles.errorText}>{error}</ThemedText>
        </View>
      ) : (
        <ScrollView
          style={styles.scrollView}
          contentContainerStyle={[styles.scrollContent, { paddingBottom: insets.bottom + 24 }]}
          showsVerticalScrollIndicator={false}>
          <View style={styles.summaryCard}>
            <View style={[styles.summaryAccent, { backgroundColor: theme.accentColor }]} />
            <MaterialIcons
              name="check-circle"
              size={120}
              color="#4CAF50"
              style={styles.summaryWatermark}
            />
            <View style={styles.summaryBody}>
              <View style={styles.summaryLeft}>
                <View style={[styles.summaryIconBox, { backgroundColor: theme.iconBackground }]}>
                  {showFundWalletLogo || transactionLogo ? (
                    <Image
                      source={showFundWalletLogo ? NGN_LOGO : transactionLogo!}
                      style={styles.summaryLogo}
                      contentFit="contain"
                    />
                  ) : (
                    <MaterialIcons
                      name={getTypeIcon(transaction.type) as keyof typeof MaterialIcons.glyphMap}
                      size={24}
                      color={theme.accentColor}
                    />
                  )}
                </View>
                <View style={styles.summaryTextBlock}>
                  <ThemedText style={styles.summaryTitle}>{transactionTitle}</ThemedText>
                  {summarySubtitle ? (
                    <ThemedText style={styles.summarySubtitle} numberOfLines={1}>
                      {summarySubtitle}
                    </ThemedText>
                  ) : null}
                  <View
                    style={[
                      styles.summaryStatusBadge,
                      {
                        backgroundColor: isFailed ? '#FFEBEE' : theme.statusBackground,
                      },
                    ]}>
                    <MaterialIcons
                      name={isFailed ? 'error-outline' : 'check-circle'}
                      size={14}
                      color={isFailed ? '#F44336' : theme.statusColor}
                    />
                    <ThemedText
                      style={[
                        styles.summaryStatusText,
                        { color: isFailed ? '#F44336' : theme.statusColor },
                      ]}>
                      {statusLabel}
                    </ThemedText>
                  </View>
                </View>
              </View>
              <View style={styles.summaryAmountBlock}>
                <ThemedText style={styles.summaryAmountLabel}>{amountLabel}</ThemedText>
                <ThemedText
                  style={[
                    styles.summaryAmountValue,
                    { color: transaction.type === 'credit' ? '#4CAF50' : '#F44336' },
                  ]}>
                  {transaction.type === 'credit' ? '+' : '-'}
                  {formatCurrencyPlain(transaction.amount)}
                </ThemedText>
              </View>
            </View>
          </View>

          <ThemedText style={styles.sectionHeading}>Transaction Information</ThemedText>
          <View style={styles.detailsCard}>
            <DetailRow
              icon="credit-card"
              label="Transaction ID"
              value={transaction.id}
              onCopy={() => handleCopy(transaction.id, 'Transaction ID')}
            />
            <DetailRow
              icon="tag"
              label="Reference Number"
              value={transaction.reference || 'N/A'}
              onCopy={() => handleCopy(transaction.reference || 'N/A', 'Reference number')}
            />
            <DetailRow
              icon="event"
              label="Date & Time"
              value={`${transaction.formattedDate} • ${transaction.formattedTime}`}
            />
            {category === 'wallet' ? (
              <>
                <DetailRow icon="info" label="Status" value={statusLabel} />
                {transaction.metadata?.transactionType ? (
                  <DetailRow
                    icon="swap-horiz"
                    label="Entry Type"
                    value={formatWalletEntryType(transaction.metadata.transactionType)}
                  />
                ) : null}
                <DetailRow icon="payments" label="Payment Method" value={walletPaymentMethod} />
                {transaction.metadata?.bankName ? (
                  <DetailRow icon="account-balance" label="Bank Name" value={transaction.metadata.bankName} />
                ) : null}
                {transaction.metadata?.accountName ? (
                  <DetailRow
                    icon="person"
                    label="Account Name"
                    value={transaction.metadata.accountName}
                  />
                ) : null}
                {transaction.metadata?.accountNumber ? (
                  <DetailRow
                    icon="account-box"
                    label="Account Number"
                    value={transaction.metadata.accountNumber}
                    onCopy={() => handleCopy(transaction.metadata?.accountNumber || '', 'Account number')}
                  />
                ) : null}
                {transaction.metadata?.grossAmount != null ? (
                  <DetailRow
                    icon="attach-money"
                    label="Gross Amount"
                    value={formatCurrencyPlain(transaction.metadata.grossAmount)}
                  />
                ) : null}
                {transaction.metadata?.fundingFee != null ? (
                  <DetailRow
                    icon="receipt-long"
                    label="Funding Fee"
                    value={formatCurrencyPlain(transaction.metadata.fundingFee)}
                  />
                ) : null}
                {transaction.metadata?.netAmount != null ? (
                  <DetailRow
                    icon="account-balance-wallet"
                    label="Net Credit"
                    value={formatCurrencyPlain(transaction.metadata.netAmount)}
                  />
                ) : null}
                {transaction.description ? (
                  <DetailRow icon="description" label="Details" value={transaction.description} multiline />
                ) : null}
              </>
            ) : (
              <>
            {transaction.provider ? (
              <DetailRow icon="cell-tower" label="Provider" value={transaction.provider} />
            ) : null}
            {transaction.recipient ? (
              <DetailRow
                icon="person"
                label="Recipient"
                value={transaction.recipient}
                onCopy={() => handleCopy(transaction.recipient || '', 'Recipient')}
              />
            ) : null}
            {transaction.sender ? (
              <DetailRow icon="person-outline" label="Sender" value={transaction.sender} />
            ) : null}
            {transaction.phoneNumber ? (
              <DetailRow
                icon="phone"
                label="Phone Number"
                value={transaction.phoneNumber}
                onCopy={() => handleCopy(transaction.phoneNumber || '', 'Phone number')}
              />
            ) : null}
              </>
            )}
            {transaction.planName ? (
              <DetailRow
                icon="data-usage"
                label="Plan"
                value={`${transaction.planName}${transaction.planValidity ? ` • ${transaction.planValidity}` : ''}`}
              />
            ) : null}
            {transaction.metadata?.examType ? (
              <DetailRow icon="school" label="Exam" value={transaction.metadata.examType} />
            ) : null}
            {transaction.metadata?.customerName ? (
              <DetailRow icon="badge" label="Customer" value={transaction.metadata.customerName} />
            ) : null}
            {transaction.metadata?.customerAddress ? (
              <DetailRow
                icon="home"
                label="Address"
                value={transaction.metadata.customerAddress}
                onCopy={() => handleCopy(transaction.metadata?.customerAddress || '', 'Address')}
                multiline
              />
            ) : null}
            {transaction.metadata?.meterType ? (
              <DetailRow
                icon="bolt"
                label="Meter Type"
                value={transaction.metadata.meterType.toUpperCase()}
              />
            ) : null}
            {transaction.metadata?.account_number ? (
              <DetailRow
                icon="account-circle"
                label="Account ID / User ID"
                value={transaction.metadata.account_number}
                onCopy={() => handleCopy(transaction.metadata?.account_number || '', 'Account ID')}
              />
            ) : null}
            {transaction.metadata?.vending_provider ? (
              <DetailRow
                icon="store"
                label="Vending Provider"
                value={transaction.metadata.vending_provider.toUpperCase()}
              />
            ) : null}
          </View>

          {transaction.metadata?.token ? (
            <View style={styles.highlightCard}>
              <View style={styles.highlightHeader}>
                <ThemedText style={styles.highlightTitle}>Electricity Token</ThemedText>
                <TouchableOpacity onPress={() => handleCopy(transaction.metadata?.token || '', 'Token')}>
                  <MaterialIcons name="content-copy" size={18} color="#FF7F00" />
                </TouchableOpacity>
              </View>
              <ThemedText style={styles.highlightValue}>{transaction.metadata.token}</ThemedText>
              <ThemedText style={styles.highlightHint}>
                Keep this token safe. You will need it to recharge your meter.
              </ThemedText>
            </View>
          ) : null}

          {transaction.metadata?.pins && Array.isArray(transaction.metadata.pins) && transaction.metadata.pins.length > 0 ? (
            <View style={styles.highlightCardGreen}>
              <ThemedText style={styles.highlightTitleGreen}>PIN Details</ThemedText>
              {transaction.metadata.pins.map((pinData: { Pin?: string; Serial?: string }, index: number) => (
                <View key={`${pinData.Pin || 'pin'}-${index}`} style={styles.pinBlock}>
                  {pinData.Serial ? (
                    <DetailRow
                      icon="confirmation-number"
                      label="Serial Number"
                      value={pinData.Serial}
                      onCopy={() => handleCopy(pinData.Serial || '', 'Serial number')}
                    />
                  ) : null}
                  {pinData.Pin ? (
                    <DetailRow
                      icon="vpn-key"
                      label="PIN"
                      value={pinData.Pin}
                      onCopy={() => handleCopy(pinData.Pin || '', 'PIN')}
                    />
                  ) : null}
                </View>
              ))}
            </View>
          ) : null}

          {(!transaction.metadata?.pins || transaction.metadata.pins.length === 0) && transaction.metadata?.educationPin ? (
            <View style={styles.detailsCard}>
              <DetailRow
                icon="vpn-key"
                label="PIN"
                value={transaction.metadata.educationPin}
                onCopy={() => handleCopy(transaction.metadata?.educationPin || '', 'PIN')}
              />
              {transaction.metadata.educationSerial ? (
                <DetailRow
                  icon="confirmation-number"
                  label="Serial Number"
                  value={transaction.metadata.educationSerial}
                  onCopy={() => handleCopy(transaction.metadata?.educationSerial || '', 'Serial number')}
                />
              ) : null}
            </View>
          ) : null}

          <TouchableOpacity style={styles.printButton} onPress={handlePrintReceipt} activeOpacity={0.85}>
            <MaterialIcons name="print" size={20} color="#fff" />
            <ThemedText style={styles.printButtonText}>Print Receipt</ThemedText>
          </TouchableOpacity>
        </ScrollView>
      )}
    </ThemedView>
  );
}

export default TransactionDetailsScreen;

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#F5F7FA',
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 20,
    paddingBottom: 16,
  },
  headerSideButton: {
    width: 40,
    height: 40,
    justifyContent: 'center',
    alignItems: 'center',
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
  },
  loadingContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  errorContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    padding: 20,
  },
  errorText: {
    color: '#d32f2f',
    textAlign: 'center',
    marginTop: 10,
  },
  summaryCard: {
    backgroundColor: '#fff',
    borderRadius: 16,
    marginBottom: 16,
    overflow: 'hidden',
    position: 'relative',
    ...Platform.select({
      ios: {
        shadowColor: '#000',
        shadowOffset: { width: 0, height: 2 },
        shadowOpacity: 0.08,
        shadowRadius: 8,
      },
      android: { elevation: 3 },
    }),
  },
  summaryAccent: {
    position: 'absolute',
    left: 0,
    top: 0,
    bottom: 0,
    width: 4,
  },
  summaryWatermark: {
    position: 'absolute',
    right: -10,
    bottom: -20,
    opacity: 0.08,
  },
  summaryBody: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    justifyContent: 'space-between',
    padding: 16,
    paddingLeft: 18,
  },
  summaryLeft: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'flex-start',
    marginRight: 12,
  },
  summaryIconBox: {
    width: 52,
    height: 52,
    borderRadius: 12,
    justifyContent: 'center',
    alignItems: 'center',
    padding: 8,
    marginRight: 12,
  },
  summaryLogo: {
    width: '100%',
    height: '100%',
  },
  summaryTextBlock: {
    flex: 1,
    minWidth: 0,
  },
  summaryTitle: {
    fontSize: 16,
    fontWeight: '700',
    color: '#1A2B4A',
    marginBottom: 4,
  },
  summarySubtitle: {
    fontSize: 13,
    color: '#9E9E9E',
    marginBottom: 8,
  },
  summaryStatusBadge: {
    alignSelf: 'flex-start',
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 12,
    gap: 4,
  },
  summaryStatusText: {
    fontSize: 12,
    fontWeight: '600',
  },
  summaryAmountBlock: {
    alignItems: 'flex-end',
    flexShrink: 0,
  },
  summaryAmountLabel: {
    fontSize: 12,
    color: '#9E9E9E',
    marginBottom: 4,
  },
  summaryAmountValue: {
    fontSize: 18,
    fontWeight: '700',
  },
  sectionHeading: {
    fontSize: 16,
    fontWeight: '700',
    color: '#1A2B4A',
    marginBottom: 12,
  },
  detailsCard: {
    backgroundColor: '#fff',
    borderRadius: 16,
    paddingVertical: 4,
    marginBottom: 16,
    overflow: 'hidden',
    ...Platform.select({
      ios: {
        shadowColor: '#000',
        shadowOffset: { width: 0, height: 2 },
        shadowOpacity: 0.06,
        shadowRadius: 6,
      },
      android: { elevation: 2 },
    }),
  },
  detailRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 14,
    paddingVertical: 14,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: '#F0F0F0',
  },
  detailIconCircle: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: '#FFF3E8',
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: 10,
  },
  detailLabel: {
    width: 108,
    fontSize: 13,
    color: '#666',
  },
  detailValueWrap: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'flex-end',
    gap: 8,
    minWidth: 0,
  },
  detailValue: {
    flex: 1,
    fontSize: 13,
    fontWeight: '600',
    color: '#1A2B4A',
    textAlign: 'right',
  },
  highlightCard: {
    backgroundColor: '#FFF5E6',
    borderWidth: 1,
    borderColor: '#FFD4A8',
    borderRadius: 16,
    padding: 16,
    marginBottom: 16,
  },
  highlightHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 12,
  },
  highlightTitle: {
    fontSize: 13,
    fontWeight: '700',
    color: '#FF7F00',
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
  highlightValue: {
    fontSize: 18,
    fontWeight: '700',
    color: '#1A2B4A',
    fontFamily: Platform.select({ ios: 'Menlo', android: 'monospace', default: 'monospace' }),
    letterSpacing: 1,
    marginBottom: 8,
  },
  highlightHint: {
    fontSize: 12,
    color: '#666',
    fontStyle: 'italic',
  },
  highlightCardGreen: {
    backgroundColor: '#E8F5E9',
    borderWidth: 1,
    borderColor: '#C8E6C9',
    borderRadius: 16,
    padding: 16,
    marginBottom: 16,
  },
  highlightTitleGreen: {
    fontSize: 13,
    fontWeight: '700',
    color: '#2E7D32',
    textTransform: 'uppercase',
    letterSpacing: 0.5,
    marginBottom: 8,
  },
  pinBlock: {
    marginBottom: 8,
  },
  printButton: {
    backgroundColor: '#FF7F00',
    borderRadius: 14,
    paddingVertical: 16,
    flexDirection: 'row',
    justifyContent: 'center',
    alignItems: 'center',
    gap: 8,
    marginTop: 8,
  },
  printButtonText: {
    fontSize: 16,
    fontWeight: '700',
    color: '#fff',
  },
});

