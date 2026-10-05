import { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import { StyleSheet, View, TextInput, TouchableOpacity, ScrollView, KeyboardAvoidingView, Platform, Alert, ImageSourcePropType, Modal } from 'react-native';
import { ThemedView } from '@/components/themed-view';
import { ThemedText } from '@/components/themed-text';
import { MaterialIcons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import { buildRouteHref } from '@/utils/router-href';
import { useFocusEffect } from 'expo-router/react-navigation';
import { Image } from 'expo-image';
import { ConfirmPaymentModal } from '@/components/confirm-payment-modal';
import { DemoNumbersBanner } from '@/components/demo-numbers-banner';
import { supabase } from '@/lib/supabase';
import { useVendingSettings } from '@/contexts/vending-settings-context';
import { useServiceLogos } from '@/contexts/service-logos-context';
import { suppressHandledNetworkError } from '@/utils/error-handler';
import { PurchaseProgressOverlay } from '@/components/purchase-progress-overlay';
import {
  PurchaseOutcomeSheet,
  type PurchaseOutcomeSheetVariant,
} from '@/components/purchase-outcome-sheet';
import {
  isTransientPurchaseNetworkError,
  parsePurchaseResponse,
} from '@/utils/purchase-flow';
import { validateNigerianPhoneNumber } from '@/utils/phone';
import { useWalletBalance } from '@/hooks/use-wallet-balance';
import * as Clipboard from 'expo-clipboard';

const LOCAL_NETWORK_LOGOS: Record<string, ImageSourcePropType> = {
  MTN: require('@/assets/images/mtn.png'),
  AIRTEL: require('@/assets/images/airtel.png'),
  GLO: require('@/assets/images/glo.png'),
  T2: require('@/assets/images/t2.png'),
  '9MOBILE': require('@/assets/images/t2.png'),
  '9 MOBILE': require('@/assets/images/t2.png'),
};

const DEFAULT_NETWORK_LOGO = require('@/assets/images/logo.png');

const NETWORK_KEY_MAP: Record<string, string> = {
  MTN: 'MTN',
  'MTN NIGERIA': 'MTN',
  AIRTEL: 'AIRTEL',
  'AIRTEL NIGERIA': 'AIRTEL',
  GLO: 'GLO',
  GLOBACOM: 'GLO',
  '9MOBILE': 'T2',
  '9 MOBILE': 'T2',
  ETISALAT: 'T2',
  T2: 'T2',
  'T2 MOBILE': 'T2',
};

const NETWORK_DISPLAY_NAMES: Record<string, string> = {
  MTN: 'MTN',
  AIRTEL: 'Airtel',
  GLO: 'Glo',
  T2: 'T2',
};

const SMEPLUG_NETWORK_IDS: Record<string, string> = {
  MTN: '1',
  AIRTEL: '2',
  T2: '3',
  GLO: '4',
};

const EBILLS_SERVICE_IDS: Record<string, string> = {
  MTN: 'mtn',
  AIRTEL: 'airtel',
  GLO: 'glo',
  T2: '9mobile',
  '9MOBILE': '9mobile',
};

type ProviderDetails = {
  id: string;
  network: string;
  networkName: string;
  displayName: string;
  minAmount: number;
  maxAmount: number;
  apiCode: string;
  identifierLabel: string;
  placeholder?: string;
  logo?: ImageSourcePropType;
};

const isFlutterwaveAirtimeProvider = (vendingProvider: string) =>
  vendingProvider.toLowerCase() === 'flutterwave';

const FALLBACK_PROVIDERS: ProviderDetails[] = [
  { id: 'fallback-mtn', network: 'MTN', networkName: 'MTN', displayName: 'MTN', minAmount: 50, maxAmount: 50000, apiCode: '1', identifierLabel: 'Phone Number', logo: LOCAL_NETWORK_LOGOS.MTN },
  { id: 'fallback-airtel', network: 'AIRTEL', networkName: 'Airtel', displayName: 'Airtel', minAmount: 50, maxAmount: 50000, apiCode: '2', identifierLabel: 'Phone Number', logo: LOCAL_NETWORK_LOGOS.AIRTEL },
  { id: 'fallback-t2', network: 'T2', networkName: '9Mobile', displayName: 'T2', minAmount: 50, maxAmount: 50000, apiCode: '3', identifierLabel: 'Phone Number', logo: LOCAL_NETWORK_LOGOS.T2 },
  { id: 'fallback-glo', network: 'GLO', networkName: 'Glo', displayName: 'Glo', minAmount: 50, maxAmount: 50000, apiCode: '4', identifierLabel: 'Phone Number', logo: LOCAL_NETWORK_LOGOS.GLO },
];

const resolveAirtimeNetworkId = (
  provider: ProviderDetails,
  vendingProvider: string,
): string | null => {
  const normalizedProvider = vendingProvider.toLowerCase();

  if (normalizedProvider === 'ebills') {
    const fromApiCode = provider.apiCode?.trim().toLowerCase();
    if (fromApiCode && !/^\d+$/.test(fromApiCode)) {
      return fromApiCode;
    }
    if (provider.network && EBILLS_SERVICE_IDS[provider.network]) {
      return EBILLS_SERVICE_IDS[provider.network];
    }
    return null;
  }

  if (normalizedProvider === 'mobilenig') {
    return provider.apiCode?.trim().toUpperCase() || null;
  }

  if (normalizedProvider === 'flutterwave') {
    return provider.networkName || provider.displayName || provider.network || null;
  }

  const smeplugId = provider.network ? SMEPLUG_NETWORK_IDS[provider.network] : null;
  return (smeplugId || provider.apiCode)?.trim() || null;
};

const normalizeNetwork = (value?: string | null) => {
  if (!value) return null;
  const upper = value.toUpperCase().trim();
  return NETWORK_KEY_MAP[upper] || upper;
};

const getNetworkDisplayName = (networkId: string) =>
  NETWORK_DISPLAY_NAMES[networkId] || networkId.replace(/_/g, ' ').replace(/\s+/g, ' ').replace(/\b\w/g, (char) => char.toUpperCase());

const formatCurrency = (amount?: number | null) => {
  if (amount === null || amount === undefined || Number.isNaN(amount)) {
    return '₦0.00';
  }
  return `₦${Number(amount).toLocaleString('en-NG', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })}`;
};

const normalizePhoneNumber = (value: string) => {
  let normalized = value.trim().replace(/\s+/g, '');

  if (normalized.startsWith('+234')) {
    normalized = `0${normalized.slice(4)}`;
  } else if (normalized.startsWith('234') && normalized.length === 13) {
    normalized = `0${normalized.slice(3)}`;
  }

  normalized = normalized.replace(/[^0-9]/g, '');

  // 10-digit numbers like 8012345678 → 08012345678
  if (/^[789]\d{9}$/.test(normalized)) {
    normalized = `0${normalized}`;
  }

  return normalized;
};

const isValidNigerianPhone = (value: string) => /^0\d{10}$/.test(value);

export default function AirtimePurchaseScreen() {
  const router = useRouter();
  const [selectedProvider, setSelectedProvider] = useState<string | null>(FALLBACK_PROVIDERS[0]?.id ?? null);
  const [phoneNumber, setPhoneNumber] = useState('');
  const [amount, setAmount] = useState('');
  const [showConfirmModal, setShowConfirmModal] = useState(false);
  const [isProcessing, setIsProcessing] = useState(false);
  const [outcomeSheet, setOutcomeSheet] = useState<{
    visible: boolean;
    variant: PurchaseOutcomeSheetVariant;
    message?: string;
  }>({ visible: false, variant: 'pending' });
  const { balance, refreshBalance } = useWalletBalance();

  const showPurchaseOutcome = (
    variant: PurchaseOutcomeSheetVariant,
    message?: string,
  ) => {
    setShowConfirmModal(false);
    setIsProcessing(false);
    setOutcomeSheet({ visible: true, variant, message });
  };
  const [providers, setProviders] = useState<ProviderDetails[]>(FALLBACK_PROVIDERS);
  const [error, setError] = useState<string | null>(null);
  const [insufficientFundsMessage, setInsufficientFundsMessage] = useState<string | null>(null);
  const [showInsufficientFundsModal, setShowInsufficientFundsModal] = useState(false);
  const [showInvalidPhoneModal, setShowInvalidPhoneModal] = useState(false);
  const [invalidPhoneMessage, setInvalidPhoneMessage] = useState('Please enter a valid 11-digit phone number (e.g. 08012345678).');
  const [isDemoUser, setIsDemoUser] = useState(false);
  const { providers: vendingSettings } = useVendingSettings();
  const { getLogoSource } = useServiceLogos();
  const airtimeVendingProvider = vendingSettings.airtime || 'smeplug';

  const isMounted = useRef(true);
  const providerRef = useRef<string | null>(null);
  const purchaseLockRef = useRef(false);
  const idempotencyKeyRef = useRef<string | null>(null);

  useEffect(() => {
    isMounted.current = true;
    return () => {
      isMounted.current = false;
    };
  }, []);

  useEffect(() => {
    providerRef.current = selectedProvider;
  }, [selectedProvider]);

  const handlePhoneChange = useCallback(
    (value: string) => {
      setPhoneNumber(value);
      const normalized = normalizePhoneNumber(value);
      if (!isValidNigerianPhone(normalized) || providers.length === 0) return;

      const matchedProvider = providers.find((provider) => {
        const check = validateNigerianPhoneNumber(normalized, provider.network);
        return check.isMatch;
      });

      if (matchedProvider) {
        setSelectedProvider(matchedProvider.id);
      }
    },
    [providers]
  );

  const handleAmountChange = useCallback((value: string) => {
    let sanitized = value.replace(/[^0-9.]/g, '');
    const parts = sanitized.split('.');
    if (parts.length > 2) {
      sanitized = `${parts[0]}.${parts.slice(1).join('')}`;
    }
    if (sanitized.startsWith('.')) {
      sanitized = `0${sanitized}`;
    }
    setAmount(sanitized);
  }, []);

  const fetchProviders = useCallback(async () => {
    try {
      if (isMounted.current) {
        setError(null);
      }

      const { data: sessionData, error: sessionError } = await supabase.auth.getSession();
      if (sessionError) throw sessionError;

      const session = sessionData.session;
      if (!session) {
        router.replace('/auth/login');
        return;
      }

      const userEmail = session.user.email;
      if (isMounted.current) {
        setIsDemoUser(userEmail === 'demo@netppay.com');
      }

      const providersRes = await supabase.functions.invoke('fetch-airtime-purchase-options');

      if (providersRes.error) {
        throw providersRes.error;
      }

      if (!providersRes.data?.success) {
        throw new Error(providersRes.data?.error || 'Unable to load airtime providers.');
      }

      const activeVendingProvider = airtimeVendingProvider;
      const usingFlutterwave = isFlutterwaveAirtimeProvider(activeVendingProvider);

      const mappedProviders: ProviderDetails[] = (providersRes.data?.data || [])
        .map((provider) => {
          const rawName = String(provider.display_name || provider.name || provider.network_id || '').trim();
          const normalized = normalizeNetwork(rawName);
          if (!normalized) return null;

          const apiCode = provider.item_code
            ? String(provider.item_code).trim()
            : provider.network_id
              ? String(provider.network_id).trim()
              : SMEPLUG_NETWORK_IDS[normalized] || '1';

          if (usingFlutterwave && (!apiCode || !provider.id)) {
            return null;
          }

          const networkName = rawName || getNetworkDisplayName(normalized);
          const displayName = rawName || getNetworkDisplayName(normalized);

          return {
            id: provider.id,
            network: normalized,
            networkName,
            displayName,
            minAmount: Number(provider.min_amount) || 0,
            maxAmount: Number(provider.max_amount) || 0,
            apiCode,
            identifierLabel: provider.identifier_label || 'Phone Number',
            placeholder: provider.placeholder,
            logo: getLogoSource('airtime', normalized, LOCAL_NETWORK_LOGOS[normalized] || DEFAULT_NETWORK_LOGO),
          } as ProviderDetails;
        })
        .filter((item): item is ProviderDetails => Boolean(item));

      const dedupedProviders = Array.from(
        mappedProviders.reduce((acc, provider) => {
          const existing = acc.get(provider.network);
          if (!existing) {
            acc.set(provider.network, provider);
            return acc;
          }

          const shouldReplace = usingFlutterwave
            ? (provider.apiCode.includes('|') && !existing.apiCode.includes('|')) ||
              provider.maxAmount > existing.maxAmount ||
              (provider.maxAmount === existing.maxAmount && provider.minAmount < existing.minAmount)
            : provider.maxAmount > existing.maxAmount ||
              (provider.maxAmount === existing.maxAmount && provider.minAmount < existing.minAmount);

          if (shouldReplace) {
            acc.set(provider.network, provider);
          }

          return acc;
        }, new Map<string, ProviderDetails>()).values()
      );

      const order: Record<string, number> = { MTN: 0, AIRTEL: 1, T2: 2, GLO: 3 };
      const sortedProviders = dedupedProviders.sort((a, b) => {
        const orderA = order[a.network] ?? 99;
        const orderB = order[b.network] ?? 99;
        if (orderA !== orderB) return orderA - orderB;
        return a.displayName.localeCompare(b.displayName);
      });

      const previousProvider = providerRef.current;
      const effectiveProvider =
        previousProvider && sortedProviders.some((provider) => provider.id === previousProvider)
          ? previousProvider
          : sortedProviders[0]?.id ?? null;

      if (isMounted.current) {
        setProviders(sortedProviders);
        setSelectedProvider(effectiveProvider);
      }
    } catch (err) {
      console.error('Failed to fetch airtime providers:', err);
      if (isMounted.current) {
        setError(err instanceof Error ? err.message : 'Unable to load airtime providers.');
      }
    }
  }, [router, airtimeVendingProvider, getLogoSource]);

  useEffect(() => {
    setProviders((prev) =>
      prev.map((provider) => ({
        ...provider,
        logo: getLogoSource(
          'airtime',
          provider.network,
          LOCAL_NETWORK_LOGOS[provider.network] || DEFAULT_NETWORK_LOGO,
        ),
      })),
    );
  }, [getLogoSource]);

  useFocusEffect(
    useCallback(() => {
      fetchProviders();
    }, [fetchProviders])
  );

  const handleContinue = () => {
    if (!selectedProviderDetails) {
      Alert.alert('Error', 'Please select a network provider');
      return;
    }

    if (Number.isNaN(parsedAmount) || parsedAmount <= 0) {
      Alert.alert('Error', 'Please enter a valid amount');
      return;
    }

    // Basic phone number normalization (remove spaces, format)
    const normalizedPhone = normalizePhoneNumber(phoneNumber);
    if (!isValidNigerianPhone(normalizedPhone)) {
      setInvalidPhoneMessage('Please enter a valid 11-digit phone number (e.g. 08012345678).');
      setShowInvalidPhoneModal(true);
      return;
    }

    // Update phone number if it was normalized
    if (normalizedPhone !== phoneNumber) {
      setPhoneNumber(normalizedPhone);
    }

    const effectiveAmount = parsedAmount;

    if (effectiveAmount < minAmount) {
      Alert.alert('Error', `Minimum amount for ${selectedProviderName} is ${formatCurrency(minAmount)}`);
      return;
    }

    if (effectiveAmount > maxAmount) {
      Alert.alert('Error', `Maximum amount for ${selectedProviderName} is ${formatCurrency(maxAmount)}`);
      return;
    }

    if (effectiveAmount > balance) {
      setInsufficientFundsMessage(
        `Your wallet balance is ${formatCurrency(balance)}. Please fund your wallet to continue.`
      );
      setShowInsufficientFundsModal(true);
      return;
    }

    setShowConfirmModal(true);
  };

  const handleConfirmPayment = useCallback(async () => {
    if (purchaseLockRef.current) return;
    const currentSelectedProviderDetails = selectedProvider ? providers.find((provider) => provider.id === selectedProvider) : undefined;
    if (!currentSelectedProviderDetails) return;

    purchaseLockRef.current = true;
    if (!idempotencyKeyRef.current) {
      idempotencyKeyRef.current = `air-${Date.now()}-${Math.random().toString(36).slice(2, 12)}`;
    }
    setIsProcessing(true);

    try {
      const normalizedNetworkId = resolveAirtimeNetworkId(
        currentSelectedProviderDetails,
        airtimeVendingProvider,
      );

      if (!normalizedNetworkId) {
        Alert.alert('Airtime Purchase', 'Unable to determine the network code for this provider. Please try again.');
        return;
      }

      if (
        isFlutterwaveAirtimeProvider(airtimeVendingProvider) &&
        !currentSelectedProviderDetails.apiCode.includes('|')
      ) {
        Alert.alert(
          'Airtime Purchase',
          'This network is missing Flutterwave bill codes. Please refresh and try again, or contact support.',
        );
        return;
      }

    const sanitizedPhoneNumber = normalizePhoneNumber(phoneNumber);
    const submissionAmount = Number.parseFloat(amount.replace(/,/g, '').trim());

    if (!Number.isFinite(submissionAmount) || submissionAmount <= 0) {
      Alert.alert('Airtime Purchase', 'Unable to determine the amount to charge. Please re-enter the amount.');
      return;
    }

      const { data: sessionData } = await supabase.auth.getSession();
      const accessToken = sessionData?.session?.access_token;

      const purchaseFunction = 'purchase-airtime';

      const purchaseNetworkName = isFlutterwaveAirtimeProvider(airtimeVendingProvider)
        ? currentSelectedProviderDetails.networkName || currentSelectedProviderDetails.displayName
        : currentSelectedProviderDetails.network;

      const purchaseBody = {
        phone_number: sanitizedPhoneNumber,
        amount: submissionAmount,
        network_id: normalizedNetworkId,
        network_name: purchaseNetworkName,
        service_id: normalizedNetworkId,
        provider_id: currentSelectedProviderDetails.id,
        item_code: currentSelectedProviderDetails.apiCode,
        idempotency_key: idempotencyKeyRef.current,
      };

      const { data, error } = await supabase.functions.invoke(purchaseFunction, {
        body: purchaseBody,
        headers: accessToken
          ? {
              Authorization: `Bearer ${accessToken}`,
            }
          : undefined,
      });

      if (error) {
        if (isTransientPurchaseNetworkError(error)) {
          suppressHandledNetworkError(error);
          showPurchaseOutcome('connection_uncertain');
          return;
        }
        throw error;
      }

      const outcome = parsePurchaseResponse(data, true);

      if (outcome.kind === 'pending') {
        const reference = String(data?.reference || data?.data?.reference || outcome.reference || '');
        showPurchaseOutcome(
          'pending',
          reference
            ? `Processing airtime purchase...\nReference: ${reference}`
            : 'Processing airtime purchase...',
        );
        idempotencyKeyRef.current = null;
        await refreshBalance();
        return;
      }

      if (outcome.kind === 'connection_uncertain') {
        showPurchaseOutcome('connection_uncertain', outcome.message);
        return;
      }

      if (!data?.success) {
        const validationErrors = Array.isArray(data?.details?.errors)
          ? data.details.errors.map((entry: unknown) => String(entry)).filter(Boolean).join('. ')
          : null;
        const detailMessage =
          validationErrors ||
          data?.details?.message ||
          data?.details?.error ||
          data?.details?.response_description ||
          data?.details?.data?.message ||
          data?.details?.data?.error ||
          data?.details?.body?.message ||
          data?.details?.body?.error;
        const message = data?.error || detailMessage || data?.details?.msg || 'Unable to complete airtime purchase.';
        console.error('Airtime purchase response (failure):', JSON.stringify(data, null, 2));
        throw new Error(message);
      }

      setShowConfirmModal(false);
      idempotencyKeyRef.current = null;

      await refreshBalance();

      const reference = data?.data?.reference || '';

      const currentAmountValue = Number.isNaN(Number.parseFloat(amount.replace(/,/g, ''))) ? 0 : Number.parseFloat(amount.replace(/,/g, ''));
      const currentSelectedProviderName = currentSelectedProviderDetails?.displayName || '';
      
      router.push(buildRouteHref('/payment-success', {
        amount: currentAmountValue.toString(),
        network: currentSelectedProviderName,
        recipient: phoneNumber,
        serviceType: 'Airtime VTU',
        reference,
      }));
    } catch (purchaseError: any) {
      console.error('Airtime purchase failed:', purchaseError);
      let message = 'Unable to complete airtime purchase. Please try again.';

      if (isTransientPurchaseNetworkError(purchaseError)) {
        showPurchaseOutcome('connection_uncertain');
        return;
      }

      if (purchaseError instanceof Error) {
        message = purchaseError.message || message;
        const extendedDetails =
          (purchaseError as any)?.details ||
          (purchaseError as any)?.context?.details ||
          (purchaseError as any)?.context?.body;
        if (extendedDetails) {
          try {
            const parsed =
              typeof extendedDetails === 'string' ? JSON.parse(extendedDetails) : extendedDetails;
            const nestedMessage =
              parsed?.message ||
              parsed?.error ||
              parsed?.details?.message ||
              parsed?.details?.error ||
              parsed?.details?.response_description;
            if (nestedMessage) {
              message = `${message}\n\nDetails: ${nestedMessage}`;
            } else {
              message = `${message}\n\nDetails: ${JSON.stringify(parsed, null, 2)}`;
            }
          } catch {
            message = `${message}\n\nDetails: ${String(extendedDetails)}`;
          }
        }
      }

      const context = (purchaseError as any)?.context;
      if (context?.body) {
        try {
          const body = typeof context.body === 'string' ? JSON.parse(context.body) : context.body;
          const bodyMessage = body?.error || body?.message || body?.details?.error || body?.details?.message;
          if (bodyMessage && !purchaseError?.message) {
            message = bodyMessage;
          }
        } catch {
          // ignore json parse failures
        }
      }

      Alert.alert('Airtime Purchase', message);
      idempotencyKeyRef.current = null;
    } finally {
      purchaseLockRef.current = false;
      setIsProcessing(false);
    }
  }, [amount, phoneNumber, router, selectedProvider, providers, airtimeVendingProvider, refreshBalance]);

  const selectedProviderDetails = useMemo(() => {
    return selectedProvider ? providers.find((provider) => provider.id === selectedProvider) : undefined;
  }, [providers, selectedProvider]);

  const selectedNetworkLogo = selectedProviderDetails?.logo || DEFAULT_NETWORK_LOGO;

  const selectedProviderName = selectedProviderDetails?.displayName || '';
  const selectedProviderIdentifierLabel = selectedProviderDetails?.identifierLabel || 'Phone Number';
  const selectedProviderPlaceholder = selectedProviderDetails?.placeholder === 'Mobile Number'
    ? '08012345678'
    : selectedProviderDetails?.placeholder
      ? `Enter ${selectedProviderDetails.placeholder.toLowerCase()}`
      : '08012345678';
  const minAmount = selectedProviderDetails?.minAmount ?? 0;
  const maxAmount = selectedProviderDetails?.maxAmount ?? 0;
  const selectedProviderNetworkId = selectedProviderDetails?.apiCode;

  const parsedAmount = useMemo(() => {
    if (!amount) return NaN;
    const sanitized = amount.replace(/,/g, '');
    const parsed = Number.parseFloat(sanitized);
    return Number.isFinite(parsed) ? parsed : NaN;
  }, [amount]);

  const amountValue = Number.isNaN(parsedAmount) ? 0 : parsedAmount;

  const amountHint = selectedProviderDetails
    ? `Min: ${formatCurrency(minAmount)} • Max: ${formatCurrency(maxAmount)}`
    : 'Select a network to view limits';

  const isContinueDisabled =
    !selectedProviderDetails ||
    !amount.trim() ||
    Number.isNaN(parsedAmount) ||
    amountValue <= 0;

  return (
    <ThemedView style={styles.container}>
      <KeyboardAvoidingView
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
        style={styles.keyboardView}>
        <View style={styles.header}>
          <TouchableOpacity onPress={() => router.back()} style={styles.backButton}>
            <MaterialIcons name="arrow-back" size={24} color="#000" />
          </TouchableOpacity>
          <ThemedText style={styles.headerTitle}>Buy Airtime</ThemedText>
          <View style={styles.placeholder} />
        </View>

        <ScrollView 
          style={styles.scrollView} 
          contentContainerStyle={styles.scrollContent}
          showsVerticalScrollIndicator={true}
          bounces={true}>
          {/* Available Balance Card */}
          <View style={styles.balanceCard}>
            <ThemedText style={styles.balanceLabel}>Available Balance</ThemedText>
            <View style={styles.balanceAmountContainer}>
              <ThemedText style={styles.balanceAmount}>{formatCurrency(balance)}</ThemedText>
            </View>
          </View>

          {error && (
            <View style={styles.errorBanner}>
              <MaterialIcons name="error-outline" size={20} color="#d32f2f" style={styles.errorIcon} />
              <ThemedText style={styles.errorText}>{error}</ThemedText>
            </View>
          )}

          {/* Demo Numbers Banner */}
          {isDemoUser && <DemoNumbersBanner type="airtime" />}

          {/* Demo Phone Number Display - Prominent for Apple Reviewers */}
          {isDemoUser && (
            <View style={styles.demoPhoneCard}>
              <View style={styles.demoPhoneHeader}>
                <MaterialIcons name="info" size={24} color="#FF7F00" />
                <ThemedText style={styles.demoPhoneTitle}>Test Phone Number for Apple Review</ThemedText>
              </View>
              <View style={styles.demoPhoneNumberBox}>
                <ThemedText style={styles.demoPhoneLabel}>Use this phone number:</ThemedText>
                <View style={styles.demoPhoneValueContainer}>
                  <ThemedText style={styles.demoPhoneValue}>08012345678</ThemedText>
                  <TouchableOpacity
                    style={styles.demoPhoneCopyButton}
                    onPress={async () => {
                      await Clipboard.setStringAsync('08012345678');
                      Alert.alert('Copied!', 'Phone number copied to clipboard');
                      setPhoneNumber('08012345678');
                    }}
                    activeOpacity={0.7}>
                    <MaterialIcons name="content-copy" size={20} color="#FF7F00" />
                  </TouchableOpacity>
                </View>
                <ThemedText style={styles.demoPhoneNote}>
                  This test number works for all networks (MTN, AIRTEL, GLO, T2)
                </ThemedText>
              </View>
            </View>
          )}

          {/* Select Service Provider */}
          <View style={styles.section}>
            <ThemedText style={styles.sectionTitle}>Select Service Provider</ThemedText>
            {providers.length > 0 ? (
              <View style={styles.networkContainer}>
                {providers.map((provider) => (
                  <TouchableOpacity
                    key={provider.id}
                    style={styles.networkItem}
                    onPress={() => setSelectedProvider(provider.id)}
                    activeOpacity={0.7}>
                    <View
                      style={[
                        styles.networkLogoContainer,
                        {
                          borderWidth: selectedProvider === provider.id ? 2.5 : 1,
                          borderColor: selectedProvider === provider.id ? '#FF7F00' : '#E0E0E0',
                        },
                      ]}>
                      {provider.logo ? (
                        <Image
                          source={provider.logo}
                          style={styles.networkLogoImage}
                          contentFit="contain"
                        />
                      ) : (
                        <MaterialIcons name="signal-cellular-alt" size={28} color="#FF7F00" />
                      )}
                    </View>
                    <ThemedText style={styles.networkName}>{provider.displayName}</ThemedText>
                    <ThemedText style={styles.networkHint}>
                      {`Min ${formatCurrency(provider.minAmount)}`}
                    </ThemedText>
                  </TouchableOpacity>
                ))}
              </View>
            ) : (
              <View style={styles.networkPlaceholder}>
                <ThemedText style={styles.emptyPlansText}>
                  No airtime providers available. Please try again later.
                </ThemedText>
              </View>
            )}
          </View>

          {/* Phone Number Input */}
          <View style={styles.section}>
            <ThemedText style={styles.inputLabel}>{selectedProviderIdentifierLabel}</ThemedText>
            <View style={styles.inputContainer}>
              <TextInput
                style={styles.input}
                placeholder={selectedProviderPlaceholder}
                placeholderTextColor="#999"
                value={phoneNumber}
                onChangeText={handlePhoneChange}
                keyboardType="phone-pad"
              />
            </View>
          </View>

          {/* Data Plan/Amount */}
          <View style={styles.section}>
            <ThemedText style={styles.inputLabel}>Amount (₦)</ThemedText>
            <View style={styles.inputContainer}>
              <TextInput
                style={styles.input}
                placeholder="Enter amount"
                placeholderTextColor="#999"
                value={amount}
                onChangeText={handleAmountChange}
                keyboardType="numeric"
              />
            </View>
            <ThemedText style={styles.helperText}>{amountHint}</ThemedText>
          </View>
        </ScrollView>

        {/* Continue Button */}
        <View style={styles.buttonContainer}>
          <TouchableOpacity
            style={[styles.continueButton, (isContinueDisabled) && styles.continueButtonDisabled]}
            onPress={handleContinue}
            disabled={isContinueDisabled || isProcessing}>
            <ThemedText style={styles.continueButtonText}>Continue</ThemedText>
          </TouchableOpacity>
        </View>
      </KeyboardAvoidingView>

      {selectedProviderDetails && (
        <ConfirmPaymentModal
          visible={showConfirmModal}
          onClose={() => !isProcessing && setShowConfirmModal(false)}
          onConfirm={handleConfirmPayment}
          loading={isProcessing}
          amount={amountValue}
          network={selectedProviderName}
          networkLogo={selectedNetworkLogo}
          recipient={phoneNumber}
          recipientLabel={selectedProviderIdentifierLabel}
          serviceType={`Airtime VTU • Network ID ${selectedProviderNetworkId || ''}`}
        />
      )}

      <PurchaseProgressOverlay
        visible={isProcessing}
        title="Processing airtime purchase..."
        subtitle="Your wallet is reserved and the airtime request is queued."
        hint="You can leave this screen. The purchase continues and shows in Transactions."
      />

      <PurchaseOutcomeSheet
        visible={outcomeSheet.visible}
        variant={outcomeSheet.variant}
        message={outcomeSheet.message}
        onViewTransactions={() => {
          setOutcomeSheet((current) => ({ ...current, visible: false }));
          router.push('/(tabs)/transactions');
        }}
        onClose={() => setOutcomeSheet((current) => ({ ...current, visible: false }))}
      />

      <Modal
        animationType="slide"
        transparent
        visible={showInsufficientFundsModal}
        onRequestClose={() => setShowInsufficientFundsModal(false)}>
        <View style={styles.modalOverlay}>
          <View style={styles.modalCard}>
            <View style={styles.modalIconContainer}>
              <MaterialIcons name="account-balance-wallet" size={36} color="#FF7F00" />
            </View>
            <ThemedText style={styles.modalTitle}>Insufficient Balance</ThemedText>
            <ThemedText style={styles.modalMessage}>
              {insufficientFundsMessage ||
                'Your wallet balance is insufficient for this purchase. Please fund your wallet to continue.'}
            </ThemedText>
            <View style={styles.modalActions}>
              <TouchableOpacity
                style={styles.modalPrimaryButton}
                onPress={() => {
                  setShowInsufficientFundsModal(false);
                  router.push('/add-money');
                }}>
                <ThemedText style={styles.modalPrimaryButtonText}>Fund Wallet</ThemedText>
              </TouchableOpacity>
              <TouchableOpacity
                style={styles.modalSecondaryButton}
                onPress={() => setShowInsufficientFundsModal(false)}>
                <ThemedText style={styles.modalSecondaryButtonText}>Close</ThemedText>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>

      <Modal
        animationType="fade"
        transparent
        visible={showInvalidPhoneModal}
        onRequestClose={() => setShowInvalidPhoneModal(false)}>
        <View style={styles.modalOverlay}>
          <View style={styles.modalCard}>
            <View style={styles.modalIconContainer}>
              <MaterialIcons name="phone-android" size={36} color="#FF7F00" />
            </View>
            <ThemedText style={styles.modalTitle}>Invalid Phone Number</ThemedText>
            <ThemedText style={styles.modalMessage}>{invalidPhoneMessage}</ThemedText>
            <View style={styles.modalActions}>
              <TouchableOpacity
                style={styles.modalPrimaryButton}
                onPress={() => setShowInvalidPhoneModal(false)}>
                <ThemedText style={styles.modalPrimaryButtonText}>Okay</ThemedText>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>
    </ThemedView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#fff',
  },
  keyboardView: {
    flex: 1,
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 20,
    paddingTop: Platform.OS === 'ios' ? 60 : 40,
    paddingBottom: 20,
    backgroundColor: '#fff',
    zIndex: 10,
  },
  backButton: {
    width: 40,
    height: 40,
    justifyContent: 'center',
    alignItems: 'flex-start',
  },
  headerTitle: {
    fontSize: 24,
    fontWeight: 'bold',
    color: '#000',
  },
  placeholder: {
    width: 40,
  },
  scrollView: {
    flex: 1,
  },
  scrollContent: {
    flexGrow: 1,
    paddingBottom: 20,
  },
  balanceCard: {
    backgroundColor: '#FF7F00',
    borderRadius: 12,
    padding: 20,
    marginHorizontal: 20,
    marginBottom: 16,
    alignItems: 'center',
    minHeight: 100,
    justifyContent: 'center',
  },
  balanceLabel: {
    fontSize: 16,
    fontWeight: '500',
    color: '#fff',
    marginBottom: 12,
    opacity: 0.95,
  },
  balanceAmountContainer: {
    minHeight: 50,
    justifyContent: 'center',
  },
  balanceAmount: {
    fontSize: 32,
    fontWeight: 'bold',
    color: '#fff',
    lineHeight: 40,
  },
  section: {
    marginHorizontal: 20,
    marginBottom: 24,
  },
  sectionTitle: {
    fontSize: 18,
    fontWeight: 'bold',
    color: '#000',
    marginBottom: 16,
  },
  networkContainer: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    justifyContent: 'space-between',
    marginBottom: 8,
  },
  networkItem: {
    alignItems: 'center',
    width: '23%',
    marginBottom: 16,
  },
  networkLogoContainer: {
    width: 70,
    height: 70,
    borderRadius: 12,
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 8,
    backgroundColor: '#fff',
    padding: 8,
  },
  networkLogoImage: {
    width: '100%',
    height: '100%',
  },
  networkName: {
    fontSize: 14,
    color: '#333',
    fontWeight: '500',
    textAlign: 'center',
  },
  networkIdText: {
    fontSize: 12,
    color: '#666',
    marginTop: 4,
  },
  networkHint: {
    fontSize: 12,
    color: '#666',
    textAlign: 'center',
  },
  networkPlaceholder: {
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 24,
  },
  emptyPlansText: {
    fontSize: 14,
    color: '#666',
    textAlign: 'center',
  },
  inputLabel: {
    fontSize: 16,
    fontWeight: '600',
    color: '#000',
    marginBottom: 8,
  },
  inputContainer: {
    backgroundColor: '#F5F5F5',
    borderRadius: 8,
    paddingHorizontal: 16,
    borderWidth: 1,
    borderColor: '#E0E0E0',
    minHeight: 50,
  },
  input: {
    fontSize: 16,
    color: '#333',
    paddingVertical: 12,
  },
  helperText: {
    marginTop: 8,
    fontSize: 13,
    color: '#666',
  },
  buttonContainer: {
    paddingHorizontal: 20,
    paddingBottom: 30,
    paddingTop: 10,
  },
  continueButton: {
    backgroundColor: '#FF7F00',
    borderRadius: 12,
    paddingVertical: 16,
    alignItems: 'center',
  },
  continueButtonText: {
    fontSize: 18,
    fontWeight: 'bold',
    color: '#fff',
  },
  continueButtonDisabled: {
    opacity: 0.6,
  },
  errorText: {
    color: '#d32f2f',
    fontSize: 13,
    flex: 1,
  },
  errorBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    borderRadius: 12,
    marginHorizontal: 20,
    marginBottom: 16,
    paddingVertical: 12,
    paddingHorizontal: 14,
    backgroundColor: '#fdecea',
  },
  errorIcon: {
    marginRight: 8,
  },
  modalOverlay: {
    position: 'absolute',
    top: 0,
    bottom: 0,
    left: 0,
    right: 0,
    backgroundColor: 'rgba(0, 0, 0, 0.5)',
    justifyContent: 'center',
    alignItems: 'center',
    padding: 24,
    zIndex: 100,
  },
  modalCard: {
    backgroundColor: '#fff',
    borderRadius: 24,
    padding: 24,
    width: '100%',
    maxWidth: 360,
    alignItems: 'center',
  },
  modalIconContainer: {
    width: 64,
    height: 64,
    borderRadius: 32,
    backgroundColor: 'rgba(255, 127, 0, 0.12)',
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 16,
  },
  modalTitle: {
    fontSize: 20,
    fontWeight: '600',
    color: '#1A1A1A',
    marginBottom: 12,
    textAlign: 'center',
  },
  modalMessage: {
    fontSize: 15,
    color: '#4A4A4A',
    textAlign: 'center',
    lineHeight: 22,
    marginBottom: 24,
  },
  modalActions: {
    width: '100%',
    gap: 12,
  },
  modalPrimaryButton: {
    backgroundColor: '#FF7F00',
    borderRadius: 24,
    paddingVertical: 12,
    paddingHorizontal: 32,
    alignItems: 'center',
  },
  modalPrimaryButtonText: {
    color: '#fff',
    fontSize: 16,
    fontWeight: '600',
  },
  modalSecondaryButton: {
    backgroundColor: 'rgba(255, 127, 0, 0.12)',
    borderRadius: 24,
    paddingVertical: 12,
    paddingHorizontal: 32,
  },
  modalSecondaryButtonText: {
    color: '#FF7F00',
    fontSize: 16,
    fontWeight: '600',
    textAlign: 'center',
  },
  demoPhoneCard: {
    backgroundColor: '#FFF8E1',
    borderRadius: 16,
    marginHorizontal: 20,
    marginBottom: 16,
    padding: 16,
    borderWidth: 2,
    borderColor: '#FF7F00',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 4,
    elevation: 4,
  },
  demoPhoneHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginBottom: 12,
  },
  demoPhoneTitle: {
    fontSize: 16,
    fontWeight: '700',
    color: '#E65100',
    flex: 1,
  },
  demoPhoneNumberBox: {
    backgroundColor: '#FFFFFF',
    borderRadius: 12,
    padding: 16,
    borderWidth: 1,
    borderColor: '#FFE082',
  },
  demoPhoneLabel: {
    fontSize: 14,
    fontWeight: '600',
    color: '#666',
    marginBottom: 8,
  },
  demoPhoneValueContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#F5F5F5',
    borderRadius: 8,
    padding: 12,
    marginBottom: 8,
    gap: 12,
  },
  demoPhoneValue: {
    fontSize: 20,
    fontWeight: '700',
    color: '#000',
    fontFamily: 'monospace',
    flex: 1,
    letterSpacing: 1,
  },
  demoPhoneCopyButton: {
    padding: 8,
    borderRadius: 6,
    backgroundColor: '#FFF8E1',
  },
  demoPhoneNote: {
    fontSize: 12,
    color: '#666',
    fontStyle: 'italic',
    lineHeight: 16,
  },
});


