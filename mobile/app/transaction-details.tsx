import { StyleSheet, View, ScrollView, TouchableOpacity, Platform, ImageSourcePropType, Alert, Share, Modal, TextInput, KeyboardAvoidingView } from 'react-native';
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
import { NGN_LOGO, FUND_WALLET_LABEL, buildTransactionTimestampFields, extractFundWalletBankName, formatBankDisplayName, formatTransactionDateTime, getFundWalletDepositLabel, getTransactionDisplayDateTime, getWalletTransactionLabel, isFundWalletTransaction } from '@/utils/transaction-display';
import { buildTransactionReportMessage, submitTransactionReport } from '@/utils/report-transaction';

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
  formattedDateTime: string;
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
    transferFee?: number;
    totalDebited?: number;
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
  const normalized = status.toLowerCase();
  if (normalized.includes('fail') || normalized.includes('cancel')) {
    return '#F44336';
  }
  if (normalized.includes('pending')) {
    return '#FF9800';
  }
  if (
    normalized.includes('success') ||
    normalized.includes('complete') ||
    normalized.includes('processing')
  ) {
    return '#4CAF50';
  }
  return '#4CAF50';
};

const getStatusLabel = (status: string) => {
  const normalized = status.toLowerCase();
  if (normalized.includes('fail') || normalized.includes('cancel')) {
    return toTitle(status);
  }
  if (normalized.includes('pending')) {
    return 'Pending';
  }
  return 'Completed';
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
  ledgerType: 'credit' | 'debit',
  txn?: Pick<DetailTransaction, 'description' | 'provider' | 'metadata' | 'serviceType' | 'type'>,
) => {
  if (walletCategory === 'wallet' && (serviceType || '').toLowerCase() === 'refund') return 'Refund';
  if (walletCategory === 'wallet' && ((serviceType || '').toLowerCase() === 'fund wallet' || (serviceType || '').toLowerCase() === 'add money')) {
    return getFundWalletDepositLabel({
      category: walletCategory,
      serviceType,
      description: txn?.description,
      provider: txn?.provider,
      type: txn?.type || ledgerType,
      metadata: txn?.metadata,
    });
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
  `₦${amount.toLocaleString('en-NG', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

const getServiceDisplayTitle = (txnCategory: string, txn: DetailTransaction) => {
  const provider = txn.provider?.trim();
  switch (txnCategory) {
    case 'airtime':
      return provider ? `${provider} Airtime VTU Topup` : 'Airtime VTU Topup';
    case 'data':
      return provider ? `${provider} Data Bundle` : txn.planName || 'Data Bundle';
    case 'electricity':
      return provider ? `${provider} Electricity Payment` : 'Electricity Payment';
    case 'education':
      return provider ? `${provider} Education Purchase` : 'Education Purchase';
    case 'betting':
      return provider ? `${provider} Betting Top-up` : 'Betting Top-up';
    case 'transfer_sent':
      return 'Transfer Sent';
    case 'transfer_received':
      return 'Transfer Received';
    case 'wallet':
      if (
        isFundWalletTransaction({
          category: txnCategory,
          serviceType: txn.serviceType,
          description: txn.description,
          provider: txn.provider,
          type: txn.type,
          metadata: txn.metadata,
        })
      ) {
        return getFundWalletDepositLabel({
          category: txnCategory,
          serviceType: txn.serviceType,
          description: txn.description,
          provider: txn.provider,
          type: txn.type,
          metadata: txn.metadata,
        });
      }
      return getTransactionTitle(txnCategory, txn);
    default:
      return getTransactionTitle(txnCategory, txn);
  }
};

const getSuccessMessage = (txnCategory: string, txn: DetailTransaction, failed: boolean) => {
  if (failed) {
    return 'This transaction could not be completed. Please try again or contact support.';
  }

  switch (txnCategory) {
    case 'airtime':
      return 'Your airtime purchase was successful.';
    case 'data':
      return 'Your data purchase was successful.';
    case 'electricity':
      return 'Your electricity payment was successful.';
    case 'education':
      return 'Your education purchase was successful.';
    case 'betting':
      return 'Your betting purchase was successful.';
    case 'transfer_sent':
      return 'Your transfer was sent successfully.';
    case 'transfer_received':
      return 'You received a transfer successfully.';
    case 'wallet':
      if ((txn.metadata?.transactionType || '').toLowerCase() === 'funding_fee') {
        return 'Your funding fee was processed successfully.';
      }
      if (
        isFundWalletTransaction({
          category: txnCategory,
          serviceType: txn.serviceType,
          description: txn.description,
          provider: txn.provider,
          type: txn.type,
          metadata: txn.metadata,
        }) &&
        txn.type === 'credit'
      ) {
        return `Your ${extractFundWalletBankName({
          category: txnCategory,
          serviceType: txn.serviceType,
          description: txn.description,
          provider: txn.provider,
          type: txn.type,
          metadata: txn.metadata,
        })} deposit was successful.`;
      }
      if (txn.type === 'credit') {
        return 'Your wallet was funded successfully.';
      }
      return 'Your wallet transaction was successful.';
    default:
      return 'Your transaction was successful.';
  }
};

const getDisplayFee = (
  txn: DetailTransaction,
  txnCategory: string,
  transferWithFee: boolean,
) => {
  if (transferWithFee && txn.metadata?.transferFee != null) {
    return txn.metadata.transferFee;
  }
  if (txn.metadata?.fundingFee != null) {
    return txn.metadata.fundingFee;
  }
  if ((txn.metadata?.transactionType || '').toLowerCase() === 'funding_fee') {
    return txn.amount;
  }
  return 0;
};

const getRecipientDisplay = (txn: DetailTransaction, txnCategory: string) => {
  if (txn.phoneNumber) return txn.phoneNumber;
  if (txn.recipient) return txn.recipient;
  if (txn.metadata?.meterNumber) return txn.metadata.meterNumber;
  if (txn.metadata?.account_number) return txn.metadata.account_number;
  if (txn.sender) return txn.sender;
  if (txnCategory === 'wallet' && txn.metadata?.accountNumber) return txn.metadata.accountNumber;
  return '';
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
const TRANSFER_FEE_PERCENTAGE = 0.05;
const MIN_TRANSFER_FEE = 10;

const calculateFundingFee = (grossAmount: number) => {
  const percentageFee = grossAmount * FUNDING_FEE_PERCENTAGE;
  return Math.max(MIN_FUNDING_FEE, Math.round(percentageFee * 100) / 100);
};

const calculateTransferFee = (amount: number) => {
  const percentageFee = amount * TRANSFER_FEE_PERCENTAGE;
  return Math.max(MIN_TRANSFER_FEE, Math.round(percentageFee * 100) / 100);
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
  const bankName = formatBankDisplayName(data.bank_name || 'Bank Transfer');

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
    ...buildTransactionTimestampFields(data.created_at),
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
  const fundingBankName =
    !isRefund && !isFundingFee && ledgerType === 'credit'
      ? extractFundWalletBankName({
          category: 'wallet',
          description,
          provider,
          serviceType: tt === 'credit' ? FUND_WALLET_LABEL : serviceType,
          type: ledgerType,
        })
      : null;

  return {
    id: data.id,
    type: ledgerType,
    amount: Number(data.amount) || 0,
    status: 'Completed',
    reference: data.reference,
    description,
    serviceType: isFundingFee ? serviceType : tt === 'credit' && !isRefund ? FUND_WALLET_LABEL : serviceType,
    provider:
      fundingBankName && fundingBankName !== 'Bank Transfer'
        ? fundingBankName
        : provider,
    recipient: '',
    sender: '',
    phoneNumber: '',
    planName: '',
    planValidity: '',
    balanceBefore: data.balance_before ?? null,
    balanceAfter: data.balance_after ?? null,
    createdAt: data.created_at,
    ...buildTransactionTimestampFields(data.created_at),
    metadata: {
      transactionType: tt || (isRefund ? 'refund' : ledgerType),
      ...(fundingBankName && fundingBankName !== 'Bank Transfer' ? { bankName: fundingBankName } : {}),
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
    formattedDateTime: detail.formattedDateTime,
  });

  return {
    ...fundingDetail,
    metadata: {
      ...fundingDetail.metadata,
      transactionType: detail.metadata?.transactionType || 'credit',
    },
  };
};

const enrichWalletDetailWithFee = async (
  userId: string,
  detail: DetailTransaction,
): Promise<DetailTransaction> => {
  if (detail.metadata?.fundingFee != null || detail.type !== 'credit' || !detail.reference) {
    return detail;
  }

  const feeReference = `${detail.reference}-FEE`;
  const { data: feeTxn } = await supabase
    .from('user_transactions')
    .select('amount')
    .eq('user_id', userId)
    .eq('transaction_type', 'funding_fee')
    .eq('reference', feeReference)
    .maybeSingle();

  if (!feeTxn) {
    return detail;
  }

  const fundingFee = Number(feeTxn.amount) || 0;
  const netAmount = detail.amount;

  return {
    ...detail,
    metadata: {
      ...detail.metadata,
      fundingFee,
      grossAmount: netAmount + fundingFee,
      netAmount,
    },
  };
};

const enrichTransferDetailWithFee = async (
  userId: string,
  detail: DetailTransaction,
): Promise<DetailTransaction> => {
  if (detail.metadata?.transferFee != null || !detail.reference) {
    return detail;
  }

  const feeReference = `${detail.reference}-FEE`;
  const { data: feeTxn } = await supabase
    .from('user_transactions')
    .select('amount')
    .eq('user_id', userId)
    .eq('transaction_type', 'transfer_fee')
    .eq('reference', feeReference)
    .maybeSingle();

  const transferFee = feeTxn ? Number(feeTxn.amount) || 0 : calculateTransferFee(detail.amount);

  return {
    ...detail,
    metadata: {
      ...detail.metadata,
      transferFee,
      totalDebited: detail.amount + transferFee,
    },
  };
};

const resolveFundingFeeParentDetail = async (
  userId: string,
  feeReference: string,
): Promise<DetailTransaction | null> => {
  const baseReference = feeReference.replace(/-FEE$/, '');
  if (!baseReference) {
    return null;
  }

  const { data: fundingData } = await supabase
    .from('funding_transactions')
    .select('id, amount, status, reference, bank_name, account_name, account_number, created_at')
    .eq('user_id', userId)
    .eq('reference', baseReference)
    .maybeSingle();

  if (fundingData) {
    return buildFundingWalletDetail(fundingData);
  }

  const { data: creditData } = await supabase
    .from('user_transactions')
    .select('id, amount, transaction_type, description, reference, created_at, balance_before, balance_after')
    .eq('user_id', userId)
    .eq('reference', baseReference)
    .eq('transaction_type', 'credit')
    .maybeSingle();

  if (!creditData) {
    return null;
  }

  const creditDetail = buildUserWalletDetail(creditData);
  const withFunding = await enrichWalletDetailFromFunding(userId, creditDetail);
  return enrichWalletDetailWithFee(userId, withFunding);
};

type DetailRowProps = {
  icon: keyof typeof MaterialIcons.glyphMap;
  label: string;
  value: string;
  onCopy?: () => void;
  multiline?: boolean;
  isLast?: boolean;
};

function DetailRow({ icon, label, value, onCopy, multiline, isLast }: DetailRowProps) {
  return (
    <View style={[styles.detailRow, isLast && styles.detailRowLast]}>
      <View style={styles.detailIconBox}>
        <MaterialIcons name={icon} size={18} color="#FF7F00" />
      </View>
      <ThemedText style={styles.detailLabel}>{label}</ThemedText>
      <View style={styles.detailValueWrap}>
        <ThemedText style={styles.detailValue} numberOfLines={multiline ? 3 : 2}>
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
    ...buildTransactionTimestampFields(parsedIso),
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
      transferFee: parseFloat((params.transferFee as string) || '') || undefined,
      totalDebited: parseFloat((params.totalDebited as string) || '') || undefined,
      grossAmount: parseFloat((params.grossAmount as string) || '') || undefined,
      fundingFee: parseFloat((params.fundingFee as string) || '') || undefined,
      netAmount: parseFloat((params.netAmount as string) || '') || undefined,
      bankName: (params.bankName as string) || '',
    },
  };

  const [transaction, setTransaction] = useState<DetailTransaction>(initialTransaction);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [showReportModal, setShowReportModal] = useState(false);
  const [reportMessage, setReportMessage] = useState('');
  const [reportSubmitting, setReportSubmitting] = useState(false);

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
            const tt = (data.transaction_type || '').toLowerCase();
            if (tt === 'funding_fee') {
              detail = await resolveFundingFeeParentDetail(userId, data.reference || '');
            } else {
              const builtDetail = buildUserWalletDetail(data);
              const shouldLookupFunding =
                builtDetail.type === 'credit' &&
                tt !== 'refund' &&
                !tt.includes('fee');
              detail = shouldLookupFunding
                ? await enrichWalletDetailWithFee(userId, await enrichWalletDetailFromFunding(userId, builtDetail))
                : builtDetail;
            }
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
            ...buildTransactionTimestampFields(data.created_at),
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
            ...buildTransactionTimestampFields(data.created_at),
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
            ...buildTransactionTimestampFields(data.created_at),
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
            ...buildTransactionTimestampFields(data.created_at),
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
            ...buildTransactionTimestampFields(data.created_at),
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
            ...buildTransactionTimestampFields(data.created_at),
            metadata: {
              ...((data as any)?.metadata || {}),
              transferFee: initialTransaction.metadata?.transferFee,
              totalDebited: initialTransaction.metadata?.totalDebited,
            },
          };

          if (isSender) {
            detail = await enrichTransferDetailWithFee(userId, detail);
          }
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
    const receiptDateTime = formatTransactionDateTime(currentDate);

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
              <div class="receipt-subtitle">${receiptDateTime}</div>
            </div>

            <div class="amount-section">
              <div class="amount-label">${showFundWalletLogo ? 'Amount Added' : isFundingFeeTxn ? 'Amount Debited' : transaction.type === 'credit' ? 'Amount Received' : 'Amount Sent'}</div>
              <div class="amount-value">${transaction.type === 'credit' ? '+' : '-'}${formatCurrency(transaction.amount)}</div>
              <div class="status-badge">${getStatusLabel(transaction.status)}</div>
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
              ${transaction.metadata?.accountName && !showFundWalletLogo ? `
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
                <span class="info-value">${getLedgerTypeLabel(category, transaction.serviceType, transaction.type, transaction).toUpperCase()}</span>
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
                <span class="info-value">${getTransactionDisplayDateTime(transaction)}</span>
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

  const walletPaymentMethod = category === 'wallet' ? getWalletPaymentMethod(transaction) : '';
  const isFundingFeeTxn = (transaction.metadata?.transactionType || '').toLowerCase() === 'funding_fee';
  const isTransferWithFee =
    category === 'transfer_sent' &&
    transaction.metadata?.transferFee != null &&
    transaction.metadata?.totalDebited != null;
  const displayAmount = transaction.amount;
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
      `${amountLabel}: ${sign}${formatCurrencyPlain(displayAmount)}`,
      `Status: ${getStatusLabel(transaction.status)}`,
      `Date: ${getTransactionDisplayDateTime(transaction)}`,
      `Reference: ${transaction.reference || 'N/A'}`,
      `Transaction ID: ${transaction.id}`,
    ];

    if (category === 'wallet') {
      if (transaction.metadata?.transactionType) {
        lines.splice(3, 0, `Entry Type: ${formatWalletEntryType(transaction.metadata.transactionType)}`);
      }
      if (walletPaymentMethod) lines.push(`Payment Method: ${walletPaymentMethod}`);
      if (transaction.metadata?.bankName) lines.push(`Bank Name: ${transaction.metadata.bankName}`);
      if (transaction.metadata?.accountName && !showFundWalletLogo) {
        lines.push(`Account Name: ${transaction.metadata.accountName}`);
      }
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

  const shareHtmlReceipt = async (dialogTitle = 'Share Transaction Receipt') => {
    try {
      const html = generateReceiptHTML();

      if (Platform.OS === 'web') {
        await Share.share({ message: buildShareMessage() });
        return;
      }

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
          dialogTitle,
        });
      } else {
        Alert.alert('Success', 'Receipt generated successfully!', [{ text: 'OK' }]);
      }
    } catch (error) {
      console.error('Error sharing receipt:', error);
      Alert.alert('Error', 'Failed to share receipt. Please try again.');
    }
  };

  const handleShare = async () => {
    await shareHtmlReceipt('Share Transaction Receipt');
  };

  const statusLabel = getStatusLabel(transaction.status);
  const isFailed =
    transaction.status.toLowerCase().includes('fail') ||
    transaction.status.toLowerCase().includes('cancel');
  const serviceDisplayTitle = getServiceDisplayTitle(category, transaction);
  const successMessage = getSuccessMessage(category, transaction, isFailed);
  const feeAmount = getDisplayFee(transaction, category, isTransferWithFee);
  const recipientDisplay = getRecipientDisplay(transaction, category);
  const transactionIdDisplay = transaction.reference || transaction.id;
  const showRecipient = Boolean(recipientDisplay) && !showFundWalletLogo;
  const showFeeRow = category !== 'airtime' && category !== 'data';

  const handleSubmitReport = async () => {
    const trimmedMessage = reportMessage.trim();
    if (!trimmedMessage) {
      Alert.alert('Required', 'Please describe the issue with this transaction.');
      return;
    }

    try {
      setReportSubmitting(true);

      const { data: sessionData, error: sessionError } = await supabase.auth.getSession();
      if (sessionError) throw sessionError;

      const session = sessionData.session;
      if (!session) {
        router.replace('/auth/login');
        return;
      }

      const email = session.user.email || '';
      const { data: profile } = await supabase
        .from('profiles')
        .select('full_name')
        .eq('id', session.user.id)
        .maybeSingle();

      const name = profile?.full_name?.trim() || email.split('@')[0] || 'NetPay User';
      const reportTitle = serviceDisplayTitle || getTransactionTitle(category, transaction);
      const subject = `Transaction Report - ${transaction.reference || transaction.id}`;
      const message = buildTransactionReportMessage({
        title: reportTitle,
        category,
        amount: displayAmount,
        status: statusLabel,
        dateTime: getTransactionDisplayDateTime(transaction),
        reference: transaction.reference,
        transactionId: transaction.id,
        userMessage: trimmedMessage,
      });

      await submitTransactionReport({ name, email, subject, message });

      setShowReportModal(false);
      setReportMessage('');
      Alert.alert(
        'Report Submitted',
        'Our support team will review this transaction and contact you if needed.',
      );
    } catch (err) {
      console.error('Report transaction error:', err);
      Alert.alert(
        'Report Failed',
        err instanceof Error ? err.message : 'Unable to submit your report. Please try again.',
      );
    } finally {
      setReportSubmitting(false);
    }
  };

  return (
    <ThemedView style={styles.container}>
      <View style={[styles.header, { paddingTop: insets.top + 12 }]}>
        <TouchableOpacity onPress={() => router.back()} style={styles.headerSideButton}>
          <MaterialIcons name="arrow-back" size={24} color="#FF7F00" />
        </TouchableOpacity>
        <ThemedText style={styles.headerTitle}>Transaction Details</ThemedText>
        <TouchableOpacity onPress={handleShare} style={styles.headerSideButton}>
          <MaterialIcons name="share" size={22} color="#FF7F00" />
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
          <View style={[styles.heroCard, isFailed && styles.heroCardFailed]}>
            <View style={styles.heroIconCircle}>
              <MaterialIcons
                name={isFailed ? 'close' : 'check'}
                size={34}
                color={isFailed ? '#D32F2F' : '#FF7F00'}
              />
            </View>
            <ThemedText lightColor="#FFFFFF" darkColor="#FFFFFF" style={styles.heroAmount}>
              {formatCurrency(displayAmount)}
            </ThemedText>
            <View style={styles.heroStatusRow}>
              <ThemedText lightColor="#FFFFFF" darkColor="#FFFFFF" style={styles.heroStatusText}>
                {statusLabel}
              </ThemedText>
              {!isFailed ? (
                <MaterialIcons name="check-circle" size={18} color="#FFFFFF" />
              ) : null}
            </View>
            <ThemedText lightColor="#FFFFFF" darkColor="#FFFFFF" style={styles.heroMessage}>
              {successMessage}
            </ThemedText>
          </View>

          <View style={styles.detailsCardWrap}>
            <View style={styles.providerLogoBadge}>
              {showFundWalletLogo || transactionLogo ? (
                <Image
                  source={showFundWalletLogo ? NGN_LOGO : transactionLogo!}
                  style={styles.providerLogo}
                  contentFit="contain"
                />
              ) : (
                <MaterialIcons
                  name={getTypeIcon(transaction.type) as keyof typeof MaterialIcons.glyphMap}
                  size={28}
                  color="#FF7F00"
                />
              )}
            </View>

            <View style={styles.detailsCard}>
              <ThemedText style={styles.serviceTitle}>{serviceDisplayTitle}</ThemedText>

              <DetailRow icon="description" label="Amount" value={formatCurrencyPlain(displayAmount)} />
              {showRecipient ? (
                <DetailRow
                  icon="phone"
                  label="Recipient"
                  value={recipientDisplay}
                  onCopy={() => handleCopy(recipientDisplay, 'Recipient')}
                />
              ) : null}
              {showFeeRow ? (
                <DetailRow icon="account-balance-wallet" label="Fee" value={formatCurrencyPlain(feeAmount)} />
              ) : null}
              <DetailRow icon="event" label="Date & Time" value={getTransactionDisplayDateTime(transaction)} />
              <DetailRow
                icon="tag"
                label="Transaction ID"
                value={transactionIdDisplay}
                onCopy={() => handleCopy(transactionIdDisplay, 'Transaction ID')}
              />

              {category === 'wallet' ? (
                <>
                  {!showFundWalletLogo && transaction.metadata?.transactionType ? (
                    <DetailRow
                      icon="swap-horiz"
                      label="Entry Type"
                      value={formatWalletEntryType(transaction.metadata.transactionType)}
                    />
                  ) : null}
                  {!showFundWalletLogo && transaction.metadata?.bankName ? (
                    <DetailRow icon="account-balance" label="Bank Name" value={transaction.metadata.bankName} />
                  ) : null}
                  {transaction.metadata?.accountName && !showFundWalletLogo ? (
                    <DetailRow icon="person" label="Account Name" value={transaction.metadata.accountName} />
                  ) : null}
                  {transaction.metadata?.accountNumber ? (
                    <DetailRow
                      icon="account-box"
                      label="Account Number"
                      value={transaction.metadata.accountNumber}
                      onCopy={() => handleCopy(transaction.metadata?.accountNumber || '', 'Account number')}
                    />
                  ) : null}
                  {!showFundWalletLogo && transaction.metadata?.grossAmount != null ? (
                    <DetailRow
                      icon="attach-money"
                      label="Gross Amount"
                      value={formatCurrencyPlain(transaction.metadata.grossAmount)}
                    />
                  ) : null}
                  {!showFundWalletLogo && transaction.metadata?.netAmount != null ? (
                    <DetailRow
                      icon="account-balance-wallet"
                      label="Net Credit"
                      value={formatCurrencyPlain(transaction.metadata.netAmount)}
                    />
                  ) : null}
                  {!showFundWalletLogo && transaction.description ? (
                    <DetailRow icon="info" label="Details" value={transaction.description} multiline />
                  ) : null}
                </>
              ) : null}

              {category !== 'wallet' ? (
                <>
                  {transaction.sender ? (
                    <DetailRow icon="person-outline" label="Sender" value={transaction.sender} />
                  ) : null}
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
                </>
              ) : null}

              <View style={styles.securityBanner}>
                <MaterialIcons name="security" size={22} color="#FF7F00" />
                <View style={styles.securityTextWrap}>
                  <ThemedText style={styles.securityTitle}>Secure Transaction</ThemedText>
                  <ThemedText style={styles.securityText}>
                    This transaction is secure and your details are protected.
                  </ThemedText>
                </View>
              </View>
            </View>
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

          <TouchableOpacity
            style={styles.reportButton}
            onPress={() => setShowReportModal(true)}
            activeOpacity={0.85}>
            <MaterialIcons name="report-problem" size={20} color="#fff" />
            <ThemedText style={styles.reportButtonText}>Report Transaction</ThemedText>
          </TouchableOpacity>
        </ScrollView>
      )}

      <Modal
        visible={showReportModal}
        animationType="slide"
        transparent
        onRequestClose={() => {
          if (!reportSubmitting) {
            setShowReportModal(false);
          }
        }}>
        <KeyboardAvoidingView
          behavior={Platform.OS === 'ios' ? 'padding' : undefined}
          style={styles.reportModalOverlay}>
          <View style={styles.reportModalCard}>
            <View style={styles.reportModalHeader}>
              <ThemedText style={styles.reportModalTitle}>Report Transaction</ThemedText>
              <TouchableOpacity
                onPress={() => {
                  if (!reportSubmitting) {
                    setShowReportModal(false);
                  }
                }}
                disabled={reportSubmitting}
                hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
                <MaterialIcons name="close" size={24} color="#666" />
              </TouchableOpacity>
            </View>

            <ThemedText style={styles.reportModalSubtitle}>
              Tell us what went wrong with this transaction. Include any extra details that can help our
              support team investigate.
            </ThemedText>

            <View style={styles.reportSummaryBox}>
              <ThemedText style={styles.reportSummaryTitle}>{serviceDisplayTitle}</ThemedText>
              <ThemedText style={styles.reportSummaryMeta}>
                {formatCurrencyPlain(displayAmount)} • {statusLabel}
              </ThemedText>
              <ThemedText style={styles.reportSummaryMeta}>
                Ref: {transactionIdDisplay}
              </ThemedText>
            </View>

            <TextInput
              style={styles.reportInput}
              placeholder="Describe the issue..."
              placeholderTextColor="#999"
              value={reportMessage}
              onChangeText={setReportMessage}
              multiline
              textAlignVertical="top"
              editable={!reportSubmitting}
            />

            <TouchableOpacity
              style={[styles.reportSubmitButton, reportSubmitting && styles.reportSubmitButtonDisabled]}
              onPress={handleSubmitReport}
              disabled={reportSubmitting}
              activeOpacity={0.85}>
              {reportSubmitting ? (
                <NetpayLoadingAnimation size={28} variant="onBrand" strokeWidth={2.5} />
              ) : (
                <ThemedText style={styles.reportSubmitButtonText}>Submit Report</ThemedText>
              )}
            </TouchableOpacity>
          </View>
        </KeyboardAvoidingView>
      </Modal>
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
  heroCard: {
    backgroundColor: '#FF7F00',
    borderRadius: 20,
    paddingTop: 28,
    paddingBottom: 44,
    paddingHorizontal: 24,
    alignItems: 'center',
    marginBottom: 0,
  },
  heroCardFailed: {
    backgroundColor: '#B71C1C',
  },
  heroIconCircle: {
    width: 64,
    height: 64,
    borderRadius: 32,
    backgroundColor: '#FFFFFF',
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 16,
  },
  heroAmount: {
    fontSize: 36,
    fontWeight: '800',
    color: '#FFFFFF',
    lineHeight: 44,
    letterSpacing: 0.5,
    marginBottom: 10,
    textAlign: 'center',
    ...Platform.select({
      ios: {
        textShadowColor: 'rgba(0,0,0,0.15)',
        textShadowOffset: { width: 0, height: 1 },
        textShadowRadius: 2,
      },
      android: {},
    }),
  },
  heroStatusRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    marginBottom: 10,
  },
  heroStatusText: {
    fontSize: 16,
    fontWeight: '600',
    color: '#FFFFFF',
    lineHeight: 22,
  },
  heroMessage: {
    fontSize: 14,
    color: 'rgba(255,255,255,0.95)',
    textAlign: 'center',
    lineHeight: 22,
    paddingHorizontal: 8,
  },
  detailsCardWrap: {
    marginTop: -20,
    marginBottom: 16,
    position: 'relative',
    zIndex: 1,
  },
  providerLogoBadge: {
    alignSelf: 'center',
    width: 72,
    height: 72,
    borderRadius: 36,
    backgroundColor: '#FFFFFF',
    justifyContent: 'center',
    alignItems: 'center',
    zIndex: 2,
    marginBottom: -36,
    borderWidth: 3,
    borderColor: '#FFFFFF',
    ...Platform.select({
      ios: {
        shadowColor: '#000',
        shadowOffset: { width: 0, height: 2 },
        shadowOpacity: 0.12,
        shadowRadius: 6,
      },
      android: { elevation: 4 },
    }),
  },
  providerLogo: {
    width: 52,
    height: 52,
  },
  serviceTitle: {
    fontSize: 17,
    fontWeight: '700',
    color: '#1A2B4A',
    textAlign: 'center',
    marginTop: 44,
    marginBottom: 8,
    paddingHorizontal: 16,
  },
  detailsCard: {
    backgroundColor: '#fff',
    borderRadius: 16,
    paddingVertical: 4,
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
  detailRowLast: {
    borderBottomWidth: 0,
  },
  detailIconBox: {
    width: 36,
    height: 36,
    borderRadius: 10,
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
  securityBanner: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    backgroundColor: '#FFF3E8',
    borderRadius: 12,
    padding: 14,
    margin: 14,
    marginTop: 8,
    gap: 12,
  },
  securityTextWrap: {
    flex: 1,
  },
  securityTitle: {
    fontSize: 14,
    fontWeight: '700',
    color: '#FF7F00',
    marginBottom: 4,
  },
  securityText: {
    fontSize: 13,
    color: '#666',
    lineHeight: 18,
  },
  reportButton: {
    backgroundColor: '#FF7F00',
    borderRadius: 14,
    paddingVertical: 16,
    flexDirection: 'row',
    justifyContent: 'center',
    alignItems: 'center',
    gap: 8,
    marginTop: 8,
  },
  reportButtonText: {
    fontSize: 16,
    fontWeight: '700',
    color: '#fff',
  },
  reportModalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.5)',
    justifyContent: 'flex-end',
  },
  reportModalCard: {
    backgroundColor: '#fff',
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    paddingHorizontal: 20,
    paddingTop: 20,
    paddingBottom: Platform.OS === 'ios' ? 34 : 24,
  },
  reportModalHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 12,
  },
  reportModalTitle: {
    fontSize: 20,
    fontWeight: '700',
    color: '#1A2B4A',
  },
  reportModalSubtitle: {
    fontSize: 14,
    color: '#666',
    lineHeight: 20,
    marginBottom: 16,
  },
  reportSummaryBox: {
    backgroundColor: '#FFF3E8',
    borderRadius: 12,
    padding: 14,
    marginBottom: 16,
  },
  reportSummaryTitle: {
    fontSize: 15,
    fontWeight: '700',
    color: '#1A2B4A',
    marginBottom: 6,
  },
  reportSummaryMeta: {
    fontSize: 13,
    color: '#666',
    marginTop: 2,
  },
  reportInput: {
    minHeight: 120,
    borderWidth: 1,
    borderColor: '#E0E0E0',
    borderRadius: 12,
    paddingHorizontal: 14,
    paddingVertical: 12,
    fontSize: 14,
    color: '#333',
    backgroundColor: '#FAFAFA',
    marginBottom: 16,
  },
  reportSubmitButton: {
    backgroundColor: '#FF7F00',
    borderRadius: 14,
    paddingVertical: 16,
    alignItems: 'center',
    justifyContent: 'center',
    minHeight: 52,
  },
  reportSubmitButtonDisabled: {
    opacity: 0.7,
  },
  reportSubmitButtonText: {
    fontSize: 16,
    fontWeight: '700',
    color: '#fff',
  },
});

