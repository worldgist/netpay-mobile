import { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import { StyleSheet, View, TextInput, TouchableOpacity, ScrollView, KeyboardAvoidingView, Platform, Alert, ActivityIndicator, ImageSourcePropType } from 'react-native';
import { ThemedView } from '@/components/themed-view';
import { ThemedText } from '@/components/themed-text';
import { MaterialIcons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import { useFocusEffect } from '@react-navigation/native';
import { Image } from 'expo-image';
import { Dropdown } from '@/components/dropdown';
import { ConfirmPaymentModal } from '@/components/confirm-payment-modal';
import { supabase } from '@/lib/supabase';
import { validateNigerianPhoneNumber } from '@/utils/phone';
import { createTransactionNotification } from '@/utils/notifications';

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
  'MTN SME': 'MTN',
  'MTN SME DATA': 'MTN',
  'MTN SME PLAN': 'MTN',
  'MTN CORPORATE': 'MTN',
  'MTN DIRECT': 'MTN',
  AIRTEL: 'AIRTEL',
  'AIRTEL NIGERIA': 'AIRTEL',
  'AIRTEL SME': 'AIRTEL',
  'AIRTEL SME DATA': 'AIRTEL',
  'AIRTEL CORPORATE': 'AIRTEL',
  GLO: 'GLO',
  GLOBACOM: 'GLO',
  'GLO SME': 'GLO',
  'GLO SME DATA': 'GLO',
  '9MOBILE': '9MOBILE',
  '9 MOBILE': '9MOBILE',
  '9MOBILE SME': '9MOBILE',
  '9 MOBILE SME': '9MOBILE',
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

  if (NETWORK_KEY_MAP[upper]) {
    return NETWORK_KEY_MAP[upper];
  }

  if (upper.includes('MTN')) {
    return 'MTN';
  }
  if (upper.includes('AIRTEL')) {
    return 'AIRTEL';
  }
  if (upper.includes('GLO') || upper.includes('GLOBACOM')) {
    return 'GLO';
  }
  if (upper.includes('9MOBILE') || upper.includes('9 MOBILE') || upper.includes('ETISALAT')) {
    return '9MOBILE';
  }

  return upper;
};

const getNetworkDisplayName = (networkId: string) => {
  return NETWORK_DISPLAY_NAMES[networkId] || networkId.replace(/_/g, ' ').replace(/\s+/g, ' ').replace(/\b\w/g, (char) => char.toUpperCase());
};

const formatCurrency = (amount?: number | null) => {
  if (amount === null || amount === undefined || Number.isNaN(amount)) {
    return '₦0.00';
  }
  return `₦${Number(amount).toLocaleString('en-NG', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })}`;
};

type DataPlan = {
  id: string;
  network: string;
  planName: string;
  price: number;
  validity?: string | null;
};

type NetworkOption = {
  id: string;
  name: string;
  logo?: ImageSourcePropType;
};

export default function DataPurchaseScreen() {
  const router = useRouter();
  const [selectedNetwork, setSelectedNetwork] = useState<string | null>(null);
  const [phoneNumber, setPhoneNumber] = useState('');
  const [dataPlan, setDataPlan] = useState('');
  const [showConfirmModal, setShowConfirmModal] = useState(false);
  const [isProcessing, setIsProcessing] = useState(false);
  const [balance, setBalance] = useState(0);
  const [networks, setNetworks] = useState<NetworkOption[]>([]);
  const [plansByNetwork, setPlansByNetwork] = useState<Record<string, DataPlan[]>>({});
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const isMounted = useRef(true);
  const selectedNetworkRef = useRef<string | null>(null);
  const dataPlanRef = useRef<string>('');

  useEffect(() => {
    isMounted.current = true;
    return () => {
      isMounted.current = false;
    };
  }, []);

  useEffect(() => {
    selectedNetworkRef.current = selectedNetwork;
  }, [selectedNetwork]);

  useEffect(() => {
    dataPlanRef.current = dataPlan;
  }, [dataPlan]);

  const fetchDataPlans = useCallback(async () => {
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

      const userId = session.user.id;

      const [profileRes, plansRes] = await Promise.all([
        supabase
          .from('profiles')
          .select('balance')
          .eq('id', userId)
          .single(),
        supabase
          .from('data_plans')
          .select('id, network, plan_name, price, validity')
          .order('network', { ascending: true })
          .order('price', { ascending: true }),
      ]);

      if (profileRes.error && profileRes.error.code !== 'PGRST116') {
        throw profileRes.error;
      }

      if (plansRes.error) {
        throw plansRes.error;
      }

      const balanceValue = profileRes.data ? Number(profileRes.data.balance) : 0;

      const grouped: Record<string, DataPlan[]> = {};
      (plansRes.data || []).forEach((plan) => {
        const normalized = normalizeNetwork(plan.network);
        if (!normalized) return;

        if (!grouped[normalized]) {
          grouped[normalized] = [];
        }

        grouped[normalized].push({
          id: plan.id,
          network: normalized,
          planName: plan.plan_name || 'Data Plan',
          price: Number(plan.price) || 0,
          validity: plan.validity,
        });
      });

      Object.keys(grouped).forEach((key) => {
        grouped[key].sort((a, b) => a.price - b.price);
      });

      const priorityOrder = ['MTN', 'AIRTEL', 'GLO', '9MOBILE'];
      const networkList: NetworkOption[] = Object.keys(grouped)
        .map((networkId) => ({
          id: networkId,
          name: getNetworkDisplayName(networkId),
          logo: NETWORK_LOGOS[networkId] || DEFAULT_NETWORK_LOGO,
        }))
        .sort((a, b) => {
          const aIndex = priorityOrder.indexOf(a.id);
          const bIndex = priorityOrder.indexOf(b.id);
          if (aIndex === -1 && bIndex === -1) {
            return a.name.localeCompare(b.name);
          }
          if (aIndex === -1) return 1;
          if (bIndex === -1) return -1;
          return aIndex - bIndex;
        });

      const previousNetwork = selectedNetworkRef.current;
      const effectiveNetwork =
        previousNetwork && networkList.some((n) => n.id === previousNetwork)
          ? previousNetwork
          : networkList[0]?.id ?? null;

      const previousPlanId = dataPlanRef.current;
      const currentPlansForNetwork = effectiveNetwork ? grouped[effectiveNetwork] || [] : [];
      const effectivePlanId =
        previousPlanId && currentPlansForNetwork.some((plan) => plan.id === previousPlanId)
          ? previousPlanId
          : '';

      if (isMounted.current) {
        setBalance(balanceValue);
        setPlansByNetwork(grouped);
        setNetworks(networkList);
        setSelectedNetwork(effectiveNetwork);
        setDataPlan(effectivePlanId);
      }
    } catch (err) {
      console.error('Failed to fetch data plans:', err);
      if (isMounted.current) {
        setError(err instanceof Error ? err.message : 'Unable to load data plans.');
        setPlansByNetwork({});
        setNetworks([]);
        setSelectedNetwork(null);
        setDataPlan('');
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
      fetchDataPlans();
    }, [fetchDataPlans])
  );

  const handleContinue = () => {
    if (!selectedNetwork) {
      Alert.alert('Error', 'Please select a network provider');
      return;
    }

    const validation = validateNigerianPhoneNumber(phoneNumber, selectedNetwork);
    if (!validation.isMatch || validation.message) {
      Alert.alert('Invalid Phone Number', validation.message || 'Please enter a valid phone number');
      return;
    }

    const normalizedPhone = validation.normalized;
    if (normalizedPhone !== phoneNumber) {
      setPhoneNumber(normalizedPhone);
    }

    if (!selectedPlan) {
      Alert.alert('Error', 'Please select a data plan');
      return;
    }

    if (selectedPlan.price > balance) {
      Alert.alert(
        'Insufficient Balance',
        `Your wallet balance is ${formatCurrency(balance)}. Please fund your wallet to continue.`
      );
      return;
    }

    setShowConfirmModal(true);
  };

  const handleConfirmPayment = useCallback(async () => {
    if (!selectedPlan || !selectedNetwork) return;

    setIsProcessing(true);

    try {
      const rawNetworkId = SMEPLUG_NETWORK_IDS[selectedNetwork];
      if (!rawNetworkId) {
        Alert.alert('Data Purchase', 'Unable to determine the network ID for this provider. Please try again.');
        return;
      }

      const sanitizedPhoneNumber = phoneNumber.replace(/\s+/g, '').trim();
      if (!sanitizedPhoneNumber) {
        Alert.alert('Data Purchase', 'Phone number is required.');
        return;
      }

      const { data: sessionData } = await supabase.auth.getSession();
      const accessToken = sessionData?.session?.access_token;

      const { data, error } = await supabase.functions.invoke('purchase-smeplug-data', {
        body: {
          phone_number: sanitizedPhoneNumber,
          plan_id: selectedPlan.id,
          network_id: rawNetworkId,
          network_name: selectedNetworkName,
        },
        headers: accessToken
          ? {
              Authorization: `Bearer ${accessToken}`,
            }
          : undefined,
      });

      if (error) {
        throw error;
      }

      if (!data?.success) {
        const detail =
          data?.details?.message ||
          data?.details?.error ||
          data?.details?.data?.message ||
          data?.details?.data?.error;
        const message = detail || data?.error || 'Unable to complete data purchase.';
        throw new Error(message);
      }

      setShowConfirmModal(false);

      const reference = data?.data?.reference || '';

      await createTransactionNotification({
        title: 'Data Purchase Successful',
        message: `${selectedPlanLabel || selectedPlan.planName} on ${selectedNetworkName} for ${sanitizedPhoneNumber}${reference ? ` (ref: ${reference})` : ''}.`,
      });

      router.push({
        pathname: '/payment-success',
        params: {
          amount: selectedPlan.price.toString(),
          network: selectedNetworkName,
          recipient: sanitizedPhoneNumber,
          serviceType: `Data Bundle - ${selectedPlanLabel || selectedPlan.planName}`,
          reference,
        },
      });
    } catch (purchaseError) {
      console.error('Data purchase failed:', purchaseError);
      let message = 'Unable to complete data purchase. Please try again.';

      if (purchaseError instanceof Error) {
        message = purchaseError.message || message;
      }

      const context = (purchaseError as any)?.context;
      if (context?.body) {
        try {
          const body = typeof context.body === 'string' ? JSON.parse(context.body) : context.body;
          const bodyMessage =
            body?.error ||
            body?.message ||
            body?.details?.error ||
            body?.details?.message ||
            body?.details?.data?.message ||
            body?.details?.data?.error;
          if (bodyMessage) {
            message = bodyMessage;
          }
        } catch (_err) {
          // ignore
        }
      }

      Alert.alert('Data Purchase', message);
    } finally {
      setIsProcessing(false);
    }
  }, [phoneNumber, router, selectedNetwork, selectedNetworkName, selectedPlan, selectedPlanLabel]);

  const currentPlans = useMemo(() => {
    return selectedNetwork ? plansByNetwork[selectedNetwork] || [] : [];
  }, [selectedNetwork, plansByNetwork]);

  const dropdownOptions = useMemo(
    () =>
      currentPlans.map((plan) => ({
        id: plan.id,
        name: plan.validity ? `${plan.planName} • ${plan.validity}` : plan.planName,
        amount: plan.price,
      })),
    [currentPlans]
  );

  const selectedPlan = useMemo(() => {
    return currentPlans.find((plan) => plan.id === dataPlan);
  }, [currentPlans, dataPlan]);

  const selectedNetworkDetails = useMemo(
    () => (selectedNetwork ? networks.find((item) => item.id === selectedNetwork) : undefined),
    [selectedNetwork, networks]
  );

  const selectedNetworkLogo = selectedNetworkDetails?.logo || DEFAULT_NETWORK_LOGO;
  const selectedNetworkName = selectedNetworkDetails?.name || (selectedNetwork ? getNetworkDisplayName(selectedNetwork) : '');
  const selectedPlanLabel = selectedPlan
    ? selectedPlan.validity
      ? `${selectedPlan.planName} • ${selectedPlan.validity}`
      : selectedPlan.planName
    : '';

  const planPlaceholder = loading
    ? 'Loading data plans...'
    : dropdownOptions.length
      ? 'Select a data plan'
      : selectedNetwork
        ? `No data plans for ${selectedNetworkName}`
        : 'Select a network first';

  const isContinueDisabled = loading || !selectedNetwork || !selectedPlan;

  return (
    <ThemedView style={styles.container}>
      <KeyboardAvoidingView
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
        style={styles.keyboardView}>
        <View style={styles.header}>
          <TouchableOpacity onPress={() => router.back()} style={styles.backButton}>
            <MaterialIcons name="arrow-back" size={24} color="#000" />
          </TouchableOpacity>
          <ThemedText style={styles.headerTitle}>Buy Data</ThemedText>
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

          {/* Select Service Provider */}
          <View style={styles.section}>
            <ThemedText style={styles.sectionTitle}>Select Service Provider</ThemedText>
            {networks.length > 0 ? (
              <View style={styles.networkContainer}>
                {networks.map((network) => (
                  <TouchableOpacity
                    key={network.id}
                    style={styles.networkItem}
                    onPress={() => {
                      setSelectedNetwork(network.id);
                      setDataPlan('');
                    }}
                    activeOpacity={0.7}
                  >
                    <View
                      style={[
                        styles.networkLogoContainer,
                        {
                          borderWidth: selectedNetwork === network.id ? 2.5 : 1,
                          borderColor: selectedNetwork === network.id ? '#FF7F00' : '#E0E0E0',
                        },
                      ]}
                    >
                      {network.logo ? (
                        <Image source={network.logo} style={styles.networkLogoImage} contentFit="contain" />
                      ) : (
                        <MaterialIcons name="signal-cellular-alt" size={28} color="#FF7F00" />
                      )}
                    </View>
                    <ThemedText style={styles.networkName}>{network.name}</ThemedText>
                  </TouchableOpacity>
                ))}
              </View>
            ) : (
              <View style={styles.networkPlaceholder}>
                {loading ? (
                  <ActivityIndicator color="#FF7F00" />
                ) : (
                  <ThemedText style={styles.emptyPlansText}>
                    No networks available. Please try again later.
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

          {/* Data Plan Selection */}
          <View style={styles.section}>
            <ThemedText style={styles.inputLabel}>Select Data Plan</ThemedText>
            {loading ? (
              <View style={styles.loadingPlansContainer}>
                <ActivityIndicator color="#FF7F00" />
              </View>
            ) : (
              <>
                <Dropdown
                  options={dropdownOptions}
                  selectedId={dataPlan || null}
                  onSelect={setDataPlan}
                  placeholder={planPlaceholder}
                />
                {!dropdownOptions.length && selectedNetwork && !loading && (
                  <ThemedText style={styles.emptyPlansText}>
                    No data plans available for {selectedNetworkName}. Please choose a different network.
                  </ThemedText>
                )}
              </>
            )}
          </View>
        </ScrollView>

        {/* Continue Button */}
        <View style={styles.buttonContainer}>
          <TouchableOpacity
            style={[
              styles.continueButton,
              (isContinueDisabled || isProcessing) && styles.continueButtonDisabled,
            ]}
            onPress={handleContinue}
            disabled={isContinueDisabled || isProcessing}>
            <ThemedText style={styles.continueButtonText}>Continue</ThemedText>
          </TouchableOpacity>
        </View>
      </KeyboardAvoidingView>

      {selectedPlan && selectedNetworkName && (
        <ConfirmPaymentModal
          visible={showConfirmModal}
          onClose={() => setShowConfirmModal(false)}
          onConfirm={handleConfirmPayment}
          loading={isProcessing}
          amount={selectedPlan.price}
          network={selectedNetworkName}
          networkLogo={selectedNetworkLogo}
          recipient={phoneNumber}
          serviceType={`Data Bundle - ${selectedPlanLabel || selectedPlan.planName}`}
          planDetails={selectedPlanLabel || selectedPlan.planName}
        />
      )}

      {isProcessing && (
        <View style={styles.processingOverlay}>
          <View style={styles.processingCard}>
            <ActivityIndicator size="large" color="#FF7F00" />
            <ThemedText style={styles.processingText}>Processing payment…</ThemedText>
          </View>
        </View>
      )}
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
    marginBottom: 24,
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
  networkPlaceholder: {
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 24,
  },
  emptyPlansText: {
    marginTop: 12,
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
  loadingPlansContainer: {
    backgroundColor: '#F5F5F5',
    borderRadius: 8,
    paddingVertical: 20,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: '#E0E0E0',
  },
  continueButtonDisabled: {
    opacity: 0.6,
  },
  processingOverlay: {
    position: 'absolute',
    top: 0,
    bottom: 0,
    left: 0,
    right: 0,
    backgroundColor: 'rgba(0, 0, 0, 0.25)',
    justifyContent: 'center',
    alignItems: 'center',
    zIndex: 50,
  },
  processingCard: {
    backgroundColor: '#fff',
    paddingHorizontal: 28,
    paddingVertical: 24,
    borderRadius: 18,
    alignItems: 'center',
    gap: 12,
    shadowColor: '#000',
    shadowOpacity: 0.18,
    shadowRadius: 12,
    shadowOffset: { width: 0, height: 8 },
    elevation: 10,
  },
  processingText: {
    fontSize: 14,
    fontWeight: '600',
    color: '#333',
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
  errorText: {
    color: '#d32f2f',
    fontSize: 13,
    flex: 1,
  },
});



