import { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import { StyleSheet, View, TextInput, TouchableOpacity, ScrollView, KeyboardAvoidingView, Platform, Alert, ActivityIndicator, ImageSourcePropType, Modal } from 'react-native';
import { ThemedView } from '@/components/themed-view';
import { ThemedText } from '@/components/themed-text';
import { MaterialIcons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import { useFocusEffect } from '@react-navigation/native';
import { Image } from 'expo-image';
import { ConfirmPaymentModal } from '@/components/confirm-payment-modal';
import { DemoNumbersBanner } from '@/components/demo-numbers-banner';
import { supabase } from '@/lib/supabase';
import * as Clipboard from 'expo-clipboard';

const NETWORK_LOGOS: Record<string, ImageSourcePropType> = {
  MTN: require('@/assets/images/mtn.png'),
  AIRTEL: require('@/assets/images/airtel.png'),
  GLO: require('@/assets/images/glo.png'),
  '9MOBILE': require('@/assets/images/9mobile.png'),
  '9 MOBILE': require('@/assets/images/9mobile.png'),
};

const DEFAULT_NETWORK_LOGO = require('@/assets/images/logo.png');

const NETWORK_KEY_MAP: Record<string, string> = {
  MTN: 'MTN',
  'MTN NIGERIA': 'MTN',
  AIRTEL: 'AIRTEL',
  'AIRTEL NIGERIA': 'AIRTEL',
  GLO: 'GLO',
  GLOBACOM: 'GLO',
  '9MOBILE': '9MOBILE',
  '9 MOBILE': '9MOBILE',
  ETISALAT: '9MOBILE',
};

const NETWORK_DISPLAY_NAMES: Record<string, string> = {
  MTN: 'MTN',
  AIRTEL: 'Airtel',
  GLO: 'Glo',
  '9MOBILE': '9Mobile',
};

const SMEPLUG_NETWORK_IDS: Record<string, string> = {
  MTN: '1',
  AIRTEL: '2',
  '9MOBILE': '3',
  GLO: '4',
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

type ProviderDetails = {
  id: string;
  network: string;
  displayName: string;
  minAmount: number;
  maxAmount: number;
  apiCode: string;
  logo?: ImageSourcePropType;
};

export default function AirtimePurchaseScreen() {
  const router = useRouter();
  const [selectedProvider, setSelectedProvider] = useState<string | null>(null);
  const [phoneNumber, setPhoneNumber] = useState('');
  const [amount, setAmount] = useState('');
  const [showConfirmModal, setShowConfirmModal] = useState(false);
  const [balance, setBalance] = useState(0);
  const [providers, setProviders] = useState<ProviderDetails[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [insufficientFundsMessage, setInsufficientFundsMessage] = useState<string | null>(null);
  const [showInsufficientFundsModal, setShowInsufficientFundsModal] = useState(false);
  const [isDemoUser, setIsDemoUser] = useState(false);

  const isMounted = useRef(true);
  const providerRef = useRef<string | null>(null);

  useEffect(() => {
    isMounted.current = true;
    return () => {
      isMounted.current = false;
    };
  }, []);

  useEffect(() => {
    providerRef.current = selectedProvider;
  }, [selectedProvider]);

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
        setLoading(true);
        setError(null);
      }

      const { data: sessionData, error: sessionError } = await supabase.auth.getSession();
      if (sessionError) throw sessionError;

      const session = sessionData.session;
      if (!session) {
        router.replace('/auth/login');
        return;
      }

      // Check if user is demo user
      const userEmail = session.user.email;
      if (isMounted.current) {
        setIsDemoUser(userEmail === 'demo@netpayy.ng');
      }

      const userId = session.user.id;

      const [profileRes, providersRes] = await Promise.all([
        supabase
          .from('profiles')
          .select('balance')
          .eq('id', userId)
          .single(),
        supabase
          .from('airtime_providers')
          .select('id, network_name, min_amount, max_amount, api_code, is_active')
          .eq('is_active', true)
          .order('network_name', { ascending: true }),
      ]);

      if (profileRes.error && profileRes.error.code !== 'PGRST116') {
        throw profileRes.error;
      }

      if (providersRes.error) {
        throw providersRes.error;
      }

      const balanceValue = profileRes.data ? Number(profileRes.data.balance) : 0;

      const mappedProviders: ProviderDetails[] = (providersRes.data || [])
        .map((provider) => {
          const normalized = normalizeNetwork(provider.network_name);
          if (!normalized) return null;
          const displayName = getNetworkDisplayName(normalized);
          return {
            id: provider.id,
            network: normalized,
            displayName,
            minAmount: Number(provider.min_amount) || 0,
            maxAmount: Number(provider.max_amount) || 0,
            apiCode: provider.api_code && /^\d+$/.test(String(provider.api_code))
              ? String(provider.api_code)
              : SMEPLUG_NETWORK_IDS[normalized] || '1',
            logo: NETWORK_LOGOS[normalized] || DEFAULT_NETWORK_LOGO,
          } as ProviderDetails;
        })
        .filter((item): item is ProviderDetails => Boolean(item));

      const order: Record<string, number> = { MTN: 0, AIRTEL: 1, '9MOBILE': 2, GLO: 3 };
      const sortedProviders = mappedProviders.sort((a, b) => {
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
        setBalance(balanceValue);
        setProviders(sortedProviders);
        setSelectedProvider(effectiveProvider);
      }
    } catch (err) {
      console.error('Failed to fetch airtime providers:', err);
      if (isMounted.current) {
        setError(err instanceof Error ? err.message : 'Unable to load airtime providers.');
        setProviders([]);
        setSelectedProvider(null);
        setBalance(0);
      }
    } finally {
      if (isMounted.current) {
        setLoading(false);
      }
    }
  }, [router]);

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
    const normalizedPhone = phoneNumber.trim().replace(/\s+/g, '');
    if (!normalizedPhone || normalizedPhone.length < 10) {
      Alert.alert('Error', 'Please enter a valid phone number');
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
    const currentSelectedProviderDetails = selectedProvider ? providers.find((provider) => provider.id === selectedProvider) : undefined;
    if (!currentSelectedProviderDetails) return;

    try {
      const rawNetworkId =
        currentSelectedProviderDetails.apiCode ||
        (currentSelectedProviderDetails.network ? SMEPLUG_NETWORK_IDS[currentSelectedProviderDetails.network] : null);
      const normalizedNetworkId = rawNetworkId ? String(rawNetworkId).trim() : null;

      if (!normalizedNetworkId || !/^\d+$/.test(normalizedNetworkId)) {
        Alert.alert('Airtime Purchase', 'Unable to determine the network ID for this provider. Please try again.');
        return;
      }

    const sanitizedPhoneNumber = phoneNumber.replace(/\s+/g, '').trim();
    const submissionAmount = Number.parseFloat(amount.replace(/,/g, '').trim());

    if (!Number.isFinite(submissionAmount) || submissionAmount <= 0) {
      Alert.alert('Airtime Purchase', 'Unable to determine the amount to charge. Please re-enter the amount.');
      return;
    }

      const { data: sessionData } = await supabase.auth.getSession();
      const accessToken = sessionData?.session?.access_token;

      const { data, error } = await supabase.functions.invoke('purchase-smeplug-airtime', {
        body: {
          phone_number: sanitizedPhoneNumber,
          amount: submissionAmount,
          network_id: normalizedNetworkId,
          network_name: currentSelectedProviderDetails.network,
        },
        headers: accessToken
          ? {
              Authorization: `Bearer ${accessToken}`,
            }
          : undefined,
      });

      if (error) {
        // Check for network errors before throwing
        const errorMessage = error?.message || String(error);
        const errorName = error?.name || error?.constructor?.name || '';
        const isNetworkError = errorMessage.includes('Network request failed') ||
                              errorMessage.includes('Failed to send a request to the Edge Function') ||
                              errorMessage.includes('Failed to fetch') ||
                              errorMessage.includes('ERR_INTERNET_DISCONNECTED') ||
                              errorMessage.includes('ERR_NETWORK_CHANGED') ||
                              errorMessage.includes('TypeError') ||
                              errorName === 'FunctionsFetchError' ||
                              errorName === 'TypeError' ||
                              error?.code === 'NETWORK_ERROR';
        
        if (isNetworkError) {
          // Suppress this error from global error handler
          const { suppressHandledNetworkError } = require('@/utils/error-handler');
          suppressHandledNetworkError(error);
          
          Alert.alert(
            'Connection Error',
            'Network connection failed. Please check your internet connection and try again.',
            [{ text: 'OK' }]
          );
          return;
        }
        
        throw error;
      }

      if (!data?.success) {
        const detailMessage =
          data?.details?.message ||
          data?.details?.error ||
          data?.details?.response_description ||
          data?.details?.data?.message ||
          data?.details?.data?.error;
        const message = detailMessage || data?.error || 'Unable to complete airtime purchase.';
        const detailString = data?.details ? JSON.stringify(data.details, null, 2) : null;
        console.error('Airtime purchase response (failure):', JSON.stringify(data, null, 2));
        throw new Error(detailString ? `${message}\n\nDetails: ${detailString}` : message);
      }

      setShowConfirmModal(false);

      const reference = data?.data?.reference || '';

      const currentAmountValue = Number.isNaN(Number.parseFloat(amount.replace(/,/g, ''))) ? 0 : Number.parseFloat(amount.replace(/,/g, ''));
      const currentSelectedProviderName = currentSelectedProviderDetails?.displayName || '';
      
      router.push({
        pathname: '/payment-success',
        params: {
          amount: currentAmountValue.toString(),
          network: currentSelectedProviderName,
          recipient: phoneNumber,
          serviceType: 'Airtime VTU',
          reference,
        },
      });
    } catch (purchaseError: any) {
      console.error('Airtime purchase failed:', purchaseError);
      let message = 'Unable to complete airtime purchase. Please try again.';

      // Check for network errors
      const errorMessage = purchaseError?.message || String(purchaseError);
      const errorName = purchaseError?.name || purchaseError?.constructor?.name || '';
      const isNetworkError = errorMessage.includes('Network request failed') ||
                            errorMessage.includes('Failed to send a request to the Edge Function') ||
                            errorMessage.includes('Failed to fetch') ||
                            errorMessage.includes('ERR_INTERNET_DISCONNECTED') ||
                            errorMessage.includes('ERR_NETWORK_CHANGED') ||
                            errorMessage.includes('TypeError') ||
                            errorName === 'FunctionsFetchError' ||
                            errorName === 'TypeError' ||
                            purchaseError?.code === 'NETWORK_ERROR';
      
      if (isNetworkError) {
        Alert.alert(
          'Connection Error',
          'Network connection failed. Please check your internet connection and try again.',
          [{ text: 'OK' }]
        );
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
          if (bodyMessage) {
            message = bodyMessage;
          }
        } catch (_parseError) {
          // ignore json parse failures
        }
      }

      Alert.alert('Airtime Purchase', message);
    }
  }, [amount, phoneNumber, router, selectedProvider, providers]);

  const getNetworkLogo = (networkName: string) => {
    const network = providers.find(n => n.network === networkName);
    return network?.logo;
  };

  const selectedNetworkLogo = selectedProvider ? getNetworkLogo(selectedProvider) : null;

  const selectedProviderDetails = useMemo(() => {
    return selectedProvider ? providers.find((provider) => provider.id === selectedProvider) : undefined;
  }, [providers, selectedProvider]);

  const selectedProviderName = selectedProviderDetails?.displayName || '';
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
    loading ||
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
              {loading ? (
                <ActivityIndicator color="#fff" />
              ) : (
                <ThemedText style={styles.balanceAmount}>{formatCurrency(balance)}</ThemedText>
              )}
            </View>
          </View>

          {error && !loading && (
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
                  This test number works for all networks (MTN, AIRTEL, GLO, 9MOBILE)
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
                {loading ? (
                  <ActivityIndicator color="#FF7F00" />
                ) : (
                  <ThemedText style={styles.emptyPlansText}>
                    No airtime providers available. Please try again later.
                  </ThemedText>
                )}
              </View>
            )}
          </View>

          {/* Phone Number Input */}
          <View style={styles.section}>
            <ThemedText style={styles.inputLabel}>Phone Number</ThemedText>
            <View style={styles.inputContainer}>
              <TextInput
                style={styles.input}
                placeholder="08012345678"
                placeholderTextColor="#999"
                value={phoneNumber}
                onChangeText={setPhoneNumber}
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
            disabled={isContinueDisabled}>
            <ThemedText style={styles.continueButtonText}>Continue</ThemedText>
          </TouchableOpacity>
        </View>
      </KeyboardAvoidingView>

      {selectedProviderDetails && (
        <ConfirmPaymentModal
          visible={showConfirmModal}
          onClose={() => setShowConfirmModal(false)}
          onConfirm={handleConfirmPayment}
          amount={amountValue}
          network={selectedProviderName}
          networkLogo={selectedNetworkLogo}
          recipient={phoneNumber}
          serviceType={`Airtime VTU • Network ID ${selectedProviderNetworkId || ''}`}
        />
      )}

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


