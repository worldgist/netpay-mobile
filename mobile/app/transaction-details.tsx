import { StyleSheet, View, ScrollView, TouchableOpacity, Platform, ImageSourcePropType, ActivityIndicator } from 'react-native';
import { ThemedView } from '@/components/themed-view';
import { ThemedText } from '@/components/themed-text';
import { MaterialIcons } from '@expo/vector-icons';
import { useRouter, useLocalSearchParams } from 'expo-router';
import * as Clipboard from 'expo-clipboard';
import { Alert } from 'react-native';
import { Image } from 'expo-image';
import * as Print from 'expo-print';
import * as Sharing from 'expo-sharing';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { supabase } from '@/lib/supabase';
import { parseEducationPurchaseMetadata } from '@/utils/education';

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
    meterNumber?: string;
    educationPin?: string;
    educationSerial?: string;
    educationInstructions?: string;
    examType?: string;
    pins?: Array<{ Serial?: string; Pin?: string }>;
  };
};

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
  WAEC: require('@/assets/images/waec.png'),
  NECO: require('@/assets/images/neco.png'),
  JAMB: require('@/assets/images/jamb.png'),
  KAEDCO: require('@/assets/images/KAEDCO.png'),
  JED: require('@/assets/images/JED.png'),
};

const DEFAULT_LOGO = require('@/assets/images/logo.png');

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

function TransactionDetailsScreen() {
  const router = useRouter();
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
    } catch (error) {
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
        const { data, error } = await supabase
          .from('user_transactions')
          .select('id, amount, transaction_type, description, reference, created_at, balance_before, balance_after, user_id')
          .eq('id', initialTransaction.id)
          .eq('user_id', userId)
          .maybeSingle();

        if (error) throw error;
        if (data) {
          const createdDate = new Date(data.created_at);
          detail = {
            id: data.id,
            type: (data.transaction_type || 'debit').toLowerCase() === 'credit' ? 'credit' : 'debit',
            amount: Number(data.amount) || 0,
            status: 'Completed',
            reference: data.reference,
            description: data.description,
            serviceType: 'Wallet Transaction',
            provider: '',
            recipient: '',
            sender: '',
            createdAt: data.created_at,
            formattedDate: formatDate(data.created_at),
            formattedTime: formatTime(data.created_at),
            phoneNumber: '',
            planName: '',
            planValidity: '',
            balanceBefore: data.balance_before,
            balanceAfter: data.balance_after,
            metadata: (data as any)?.metadata || {},
          };
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
          .select('id, amount, status, reference, created_at, provider, meter_number, meter_type, token, customer_name, user_id')
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
              token: data.token,
              customerName: data.customer_name,
              meterNumber: data.meter_number,
            },
          };
        }
      } else if (category === 'education') {
        const { data, error } = await supabase
          .from('education_transactions')
          .select('id, amount, status, reference, created_at, exam_type, phone_number, balance_before, balance_after, api_response, metadata, user_id')
          .eq('id', initialTransaction.id)
          .eq('user_id', userId)
          .maybeSingle();

        if (error) throw error;
        if (data) {
          // Get PINs from metadata first (primary source), fallback to parsing api_response
          const metadataObj = (data as any)?.metadata || {};
          const pinsFromMetadata = metadataObj.pins || [];
          
          // Also parse from api_response as fallback
          const parsedMetadata = parseEducationPurchaseMetadata((data as any)?.api_response);
          
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
              ...metadataObj,
              // Use pins from metadata if available, otherwise use parsed values
              pins: pinsFromMetadata.length > 0 ? pinsFromMetadata : (parsedMetadata.pin ? [{ Pin: parsedMetadata.pin, Serial: parsedMetadata.serial }] : []),
              educationPin: parsedMetadata.pin,
              educationSerial: parsedMetadata.serial,
              educationInstructions: parsedMetadata.instructions,
              examType: data.exam_type,
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
  }, [category, initialTransaction.id, router]);

  useEffect(() => {
    fetchTransactionDetails();
  }, [fetchTransactionDetails]);

  const transactionLogo = useMemo(() => getTransactionLogo(transaction.serviceType, transaction.provider), [transaction.serviceType, transaction.provider]);

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
              <div class="amount-label">${transaction.type === 'credit' ? 'Amount Received' : 'Amount Sent'}</div>
              <div class="amount-value">${transaction.type === 'credit' ? '+' : '-'}${formatCurrency(transaction.amount)}</div>
              <div class="status-badge">${transaction.status}</div>
            </div>

            <div class="transaction-info">
              <div class="info-row">
                <span class="info-label">Transaction Type</span>
                <span class="info-value">${transaction.type.toUpperCase()}</span>
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

  const statusColor = getStatusColor(transaction.status || 'Completed');

  return (
    <ThemedView style={styles.container}>
      <View style={styles.header}>
        <TouchableOpacity onPress={() => router.back()} style={styles.backButton}>
          <MaterialIcons name="arrow-back" size={24} color="#000" />
        </TouchableOpacity>
        <ThemedText style={styles.headerTitle}>Transaction Details</ThemedText>
        <View style={styles.placeholder} />
      </View>

      {loading ? (
        <View style={styles.loadingContainer}>
          <ActivityIndicator size="large" color="#FF7F00" />
        </View>
      ) : error ? (
        <View style={styles.errorContainer}>
          <MaterialIcons name="error-outline" size={32} color="#d32f2f" />
          <ThemedText style={styles.errorText}>{error}</ThemedText>
        </View>
      ) : (
        <ScrollView style={styles.scrollView} showsVerticalScrollIndicator={false}>
          <View style={styles.amountCard}>
            <View style={[styles.iconContainer, { backgroundColor: transaction.type === 'credit' ? '#E8F5E9' : '#FFEBEE' }]}>
              {transactionLogo ? (
                <Image
                  source={transactionLogo}
                  style={styles.transactionLogo}
                  contentFit="contain"
                />
              ) : (
                <MaterialIcons 
                  name={getTypeIcon(transaction.type) as any} 
                  size={32} 
                  color={getTypeColor(transaction.type)} 
                />
              )}
            </View>
            <ThemedText style={styles.amountLabel}>
              {transaction.type === 'credit' ? 'Amount Received' : 'Amount Sent'}
            </ThemedText>
            <View style={styles.amountValueContainer}>
              <ThemedText style={[styles.amountValue, { color: getTypeColor(transaction.type) }]}>
                {transaction.type === 'credit' ? '+' : '-'}₦{transaction.amount.toLocaleString('en-NG', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
              </ThemedText>
            </View>
            <View style={[styles.statusBadge, { backgroundColor: getStatusColor(transaction.status) + '20' }]}>
              <ThemedText style={[styles.statusText, { color: getStatusColor(transaction.status) }]}>
                {transaction.status}
              </ThemedText>
            </View>
          </View>

          {/* Transaction Information */}
          <View style={styles.infoSection}>
            <ThemedText style={styles.sectionTitle}>Transaction Information</ThemedText>
            
            {/* Transaction Type */}
            <View style={styles.infoRow}>
              <ThemedText style={styles.infoLabel}>Transaction Type</ThemedText>
              <ThemedText style={styles.infoValue} numberOfLines={1}>
                {transaction.type.charAt(0).toUpperCase() + transaction.type.slice(1)}
              </ThemedText>
            </View>

            {/* Date */}
            <View style={styles.infoRow}>
              <ThemedText style={styles.infoLabel}>Date</ThemedText>
              <ThemedText style={styles.infoValue}>{transaction.formattedDate}</ThemedText>
            </View>

            {/* Time */}
            <View style={styles.infoRow}>
              <ThemedText style={styles.infoLabel}>Time</ThemedText>
              <ThemedText style={styles.infoValue}>{transaction.formattedTime}</ThemedText>
            </View>

            {/* Reference Number */}
            <View style={styles.infoRow}>
              <ThemedText style={styles.infoLabel}>Reference Number</ThemedText>
              <TouchableOpacity 
                style={styles.copyRow}
                onPress={() => handleCopy(transaction.reference || 'N/A', 'Reference number')}>
                <ThemedText style={styles.infoValue} numberOfLines={1}>
                  {transaction.reference || 'N/A'}
                </ThemedText>
                <MaterialIcons name="content-copy" size={18} color="#FF7F00" style={styles.copyIcon} />
              </TouchableOpacity>
            </View>

            {/* Description */}
            {transaction.description && (
              <View style={styles.infoRow}>
                <ThemedText style={styles.infoLabel}>Description</ThemedText>
                <ThemedText style={styles.infoValue}>{transaction.description}</ThemedText>
              </View>
            )}

            {/* Service Type */}
            {transaction.serviceType && (
              <View style={styles.infoRow}>
                <ThemedText style={styles.infoLabel}>Service Type</ThemedText>
                <ThemedText style={styles.infoValue}>{transaction.serviceType}</ThemedText>
              </View>
            )}

            {/* Network/Provider */}
            {transaction.provider && (
              <View style={styles.infoRow}>
                <ThemedText style={styles.infoLabel}>Provider</ThemedText>
                <ThemedText style={styles.infoValue}>{transaction.provider}</ThemedText>
              </View>
            )}

            {/* Exam Type */}
            {transaction.metadata?.examType && (
              <View style={styles.infoRow}>
                <ThemedText style={styles.infoLabel}>Exam</ThemedText>
                <ThemedText style={styles.infoValue}>{transaction.metadata.examType}</ThemedText>
              </View>
            )}

            {/* Customer Name */}
            {transaction.metadata?.customerName && (
              <View style={styles.infoRow}>
                <ThemedText style={styles.infoLabel}>Customer</ThemedText>
                <ThemedText style={styles.infoValue}>{transaction.metadata.customerName}</ThemedText>
              </View>
            )}

            {/* Meter Type */}
            {transaction.metadata?.meterType && (
              <View style={styles.infoRow}>
                <ThemedText style={styles.infoLabel}>Meter Type</ThemedText>
                <ThemedText style={styles.infoValue}>{transaction.metadata.meterType.toUpperCase()}</ThemedText>
              </View>
            )}

            {/* Token */}
            {transaction.metadata?.token && (
              <View style={styles.infoRow}>
                <ThemedText style={styles.infoLabel}>Token</ThemedText>
                <TouchableOpacity
                  style={styles.copyRow}
                  onPress={() => handleCopy(transaction.metadata?.token || '', 'Token')}
                >
                  <ThemedText style={styles.infoValue} numberOfLines={1}>
                    {transaction.metadata?.token}
                  </ThemedText>
                  <MaterialIcons name="content-copy" size={18} color="#FF7F00" style={styles.copyIcon} />
                </TouchableOpacity>
              </View>
            )}
 
            {/* Education PIN Details */}
            {transaction.metadata?.pins && Array.isArray(transaction.metadata.pins) && transaction.metadata.pins.length > 0 && (
              <View style={[styles.infoRow, { flexDirection: 'column', alignItems: 'stretch', paddingVertical: 16 }]}>
                <ThemedText style={[styles.infoLabel, { marginBottom: 12, fontSize: 12, textTransform: 'uppercase', letterSpacing: 0.5, color: '#4CAF50', fontWeight: '600' }]}>
                  PIN Details
                </ThemedText>
                <View style={{ backgroundColor: '#E8F5E9', borderWidth: 2, borderColor: '#4CAF50', borderRadius: 8, padding: 16 }}>
                  {transaction.metadata.pins.map((pinData: any, index: number) => (
                    <View key={index} style={{ marginBottom: index < transaction.metadata.pins.length - 1 ? 16 : 0, paddingBottom: index < transaction.metadata.pins.length - 1 ? 16 : 0, borderBottomWidth: index < transaction.metadata.pins.length - 1 ? 1 : 0, borderBottomColor: '#C8E6C9' }}>
                      {pinData.Serial && (
                        <View style={{ marginBottom: 8 }}>
                          <ThemedText style={{ fontSize: 11, color: '#666', marginBottom: 4 }}>Serial Number</ThemedText>
                          <TouchableOpacity
                            style={styles.copyRow}
                            onPress={() => handleCopy(pinData.Serial || '', 'Serial number')}>
                            <ThemedText style={{ fontFamily: 'monospace', fontSize: 14, fontWeight: '600', color: '#333' }} numberOfLines={1}>
                              {pinData.Serial}
                            </ThemedText>
                            <MaterialIcons name="content-copy" size={16} color="#FF7F00" style={styles.copyIcon} />
                          </TouchableOpacity>
                        </View>
                      )}
                      {pinData.Pin && (
                        <View>
                          <ThemedText style={{ fontSize: 11, color: '#666', marginBottom: 4 }}>PIN</ThemedText>
                          <TouchableOpacity
                            style={styles.copyRow}
                            onPress={() => handleCopy(pinData.Pin || '', 'PIN')}>
                            <ThemedText style={{ fontFamily: 'monospace', fontSize: 18, fontWeight: 'bold', color: '#1B5E20', letterSpacing: 1 }} numberOfLines={0}>
                              {pinData.Pin}
                            </ThemedText>
                            <MaterialIcons name="content-copy" size={16} color="#FF7F00" style={styles.copyIcon} />
                          </TouchableOpacity>
                        </View>
                      )}
                    </View>
                  ))}
                </View>
                <ThemedText style={{ fontSize: 11, color: '#666', textAlign: 'center', marginTop: 12, fontStyle: 'italic' }}>
                  Keep this PIN safe. You'll need it for your exam registration.
                </ThemedText>
              </View>
            )}
            
            {/* Fallback: Show single PIN if pins array not available */}
            {(!transaction.metadata?.pins || !Array.isArray(transaction.metadata.pins) || transaction.metadata.pins.length === 0) && transaction.metadata?.educationPin && (
              <>
                <View style={styles.infoRow}>
                  <ThemedText style={styles.infoLabel}>PIN</ThemedText>
                  <TouchableOpacity
                    style={styles.copyRow}
                    onPress={() => handleCopy(transaction.metadata?.educationPin || '', 'PIN')}>
                    <ThemedText style={[styles.infoValue, styles.monospaceValue]} numberOfLines={1}>
                      {transaction.metadata?.educationPin}
                    </ThemedText>
                    <MaterialIcons name="content-copy" size={18} color="#FF7F00" style={styles.copyIcon} />
                  </TouchableOpacity>
                </View>
                {transaction.metadata?.educationSerial && (
                  <View style={styles.infoRow}>
                    <ThemedText style={styles.infoLabel}>Serial Number</ThemedText>
                    <TouchableOpacity
                      style={styles.copyRow}
                      onPress={() => handleCopy(transaction.metadata?.educationSerial || '', 'Serial number')}>
                      <ThemedText style={[styles.infoValue, styles.monospaceValue]} numberOfLines={1}>
                        {transaction.metadata?.educationSerial}
                      </ThemedText>
                      <MaterialIcons name="content-copy" size={18} color="#FF7F00" style={styles.copyIcon} />
                    </TouchableOpacity>
                  </View>
                )}
              </>
            )}

            {/* Recipient */}
            {transaction.recipient && (
              <View style={styles.infoRow}>
                <ThemedText style={styles.infoLabel}>Recipient</ThemedText>
                <TouchableOpacity 
                  style={styles.copyRow}
                  onPress={() => handleCopy(transaction.recipient || '', 'Recipient')}>
                  <ThemedText style={styles.infoValue} numberOfLines={1}>
                    {transaction.recipient}
                  </ThemedText>
                  <MaterialIcons name="content-copy" size={18} color="#FF7F00" style={styles.copyIcon} />
                </TouchableOpacity>
              </View>
            )}

            {/* Sender */}
            {transaction.sender && (
              <View style={styles.infoRow}>
                <ThemedText style={styles.infoLabel}>Sender</ThemedText>
                <ThemedText style={styles.infoValue}>{transaction.sender}</ThemedText>
              </View>
            )}

            {/* Phone Number */}
            {transaction.phoneNumber && (
              <View style={styles.infoRow}>
                <ThemedText style={styles.infoLabel}>Phone Number</ThemedText>
                <ThemedText style={styles.infoValue}>{transaction.phoneNumber}</ThemedText>
              </View>
            )}

            {/* Plan Name */}
            {transaction.planName && (
              <View style={styles.infoRow}>
                <ThemedText style={styles.infoLabel}>Plan</ThemedText>
                <ThemedText style={styles.infoValue}>{transaction.planName}{transaction.planValidity ? ` • ${transaction.planValidity}` : ''}</ThemedText>
              </View>
            )}

            {/* Balance Before */}
            {transaction.balanceBefore != null && (
              <View style={styles.infoRow}>
                <ThemedText style={styles.infoLabel}>Balance Before</ThemedText>
                <ThemedText style={styles.infoValue}>{formatCurrency(transaction.balanceBefore)}</ThemedText>
              </View>
            )}

            {/* Balance After */}
            {transaction.balanceAfter != null && (
              <View style={styles.infoRow}>
                <ThemedText style={styles.infoLabel}>Balance After</ThemedText>
                <ThemedText style={styles.infoValue}>{formatCurrency(transaction.balanceAfter)}</ThemedText>
              </View>
            )}
          </View>

          {/* Transaction ID */}
          <View style={styles.infoSection}>
            <View style={styles.infoRow}>
              <ThemedText style={styles.infoLabel}>Transaction ID</ThemedText>
              <TouchableOpacity 
                style={styles.copyRow}
                onPress={() => handleCopy(transaction.id, 'Transaction ID')}>
                <ThemedText style={styles.infoValue} numberOfLines={1}>
                  {transaction.id}
                </ThemedText>
                <MaterialIcons name="content-copy" size={18} color="#FF7F00" style={styles.copyIcon} />
              </TouchableOpacity>
            </View>
          </View>

          {/* Print Receipt Button */}
          <View style={styles.buttonContainer}>
            <TouchableOpacity 
              style={styles.printButton}
              onPress={handlePrintReceipt}
              activeOpacity={0.8}>
              <MaterialIcons name="print" size={20} color="#fff" style={styles.printIcon} />
              <ThemedText style={styles.printButtonText}>Print Receipt</ThemedText>
            </TouchableOpacity>
          </View>
        </ScrollView>
      )}
    </ThemedView>
  );
}

export default TransactionDetailsScreen;

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#fff',
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 20,
    paddingTop: 60,
    paddingBottom: 20,
  },
  backButton: {
    width: 40,
    height: 40,
    justifyContent: 'center',
    alignItems: 'flex-start',
  },
  headerTitle: {
    fontSize: 20,
    fontWeight: 'bold',
    color: '#000',
  },
  placeholder: {
    width: 40,
  },
  scrollView: {
    flex: 1,
  },
  loadingContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: '#fff',
  },
  errorContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: '#fff',
    padding: 20,
  },
  errorText: {
    color: '#d32f2f',
    textAlign: 'center',
    marginTop: 10,
  },
  amountCard: {
    backgroundColor: '#F5F5F5',
    borderRadius: 16,
    padding: 32,
    marginHorizontal: 20,
    marginBottom: 24,
    alignItems: 'center',
    minHeight: 200,
    justifyContent: 'center',
  },
  iconContainer: {
    width: 80,
    height: 80,
    borderRadius: 40,
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 20,
    padding: 12,
  },
  transactionLogo: {
    width: '100%',
    height: '100%',
  },
  amountLabel: {
    fontSize: 14,
    color: '#666',
    marginBottom: 12,
    fontWeight: '500',
  },
  amountValueContainer: {
    minHeight: 60,
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 20,
    width: '100%',
  },
  amountValue: {
    fontSize: 40,
    fontWeight: 'bold',
    lineHeight: 48,
    textAlign: 'center',
  },
  statusBadge: {
    paddingHorizontal: 16,
    paddingVertical: 6,
    borderRadius: 20,
  },
  statusText: {
    fontSize: 14,
    fontWeight: '600',
  },
  infoSection: {
    backgroundColor: '#F5F5F5',
    borderRadius: 12,
    padding: 20,
    marginHorizontal: 20,
    marginBottom: 16,
  },
  sectionTitle: {
    fontSize: 18,
    fontWeight: 'bold',
    color: '#333',
    marginBottom: 16,
  },
  infoRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: '#E0E0E0',
  },
  infoRowMultiline: {
    alignItems: 'flex-start',
  },
  infoLabel: {
    fontSize: 14,
    color: '#666',
    flex: 1,
  },
  infoValue: {
    fontSize: 14,
    fontWeight: '600',
    color: '#333',
    flex: 1,
    textAlign: 'right',
  },
  infoValueMultiline: {
    fontSize: 14,
    fontWeight: '600',
    color: '#333',
    flex: 1,
    textAlign: 'right',
    lineHeight: 20,
  },
  monospaceValue: {
    fontFamily: Platform.select({
      ios: 'Menlo',
      android: 'monospace',
      default: 'Courier New',
    }),
    letterSpacing: 0.5,
  },
  copyRow: {
    flexDirection: 'row',
    alignItems: 'center',
    flex: 1,
    justifyContent: 'flex-end',
  },
  copyRowMultiline: {
    alignItems: 'flex-start',
  },
  copyIcon: {
    marginLeft: 8,
  },
  buttonContainer: {
    paddingHorizontal: 20,
    paddingTop: 10,
    paddingBottom: 30,
  },
  printButton: {
    backgroundColor: '#FF7F00',
    borderRadius: 12,
    paddingVertical: 16,
    flexDirection: 'row',
    justifyContent: 'center',
    alignItems: 'center',
  },
  printIcon: {
    marginRight: 8,
  },
  printButtonText: {
    fontSize: 18,
    fontWeight: 'bold',
    color: '#fff',
  },
});

