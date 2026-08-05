import { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import { StyleSheet, View, TextInput, TouchableOpacity, ScrollView, KeyboardAvoidingView, Platform, Alert, ImageSourcePropType, Modal } from 'react-native';
import { NetpayLoadingAnimation } from '@/components/netpay-loading-animation';
import { ThemedView } from '@/components/themed-view';
import { ThemedText } from '@/components/themed-text';
import { MaterialIcons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import { useFocusEffect } from '@react-navigation/native';
import { Image } from 'expo-image';
import { Dropdown } from '@/components/dropdown';
import { ConfirmPaymentModal } from '@/components/confirm-payment-modal';
import { DemoNumbersBanner } from '@/components/demo-numbers-banner';
import { supabase } from '@/lib/supabase';
import { useVendingSettings } from '@/contexts/vending-settings-context';
import * as Clipboard from 'expo-clipboard';

const NETWORK_LOGOS: Record<string, ImageSourcePropType> = {
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
  '9MOBILE': 'T2',
  '9 MOBILE': 'T2',
  '9MOBILE SME': 'T2',
  '9 MOBILE SME': 'T2',
  ETISALAT: 'T2',
  T2: 'T2',
  'T2 MOBILE': 'T2',
  'T2 SME': 'T2',
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

const SUPPORTED_DATA_NETWORKS = ['MTN', 'AIRTEL', 'GLO', 'T2'] as const;

const mergeLegacyNineMobilePlans = (grouped: Record<string, DataPlan[]>) => {
  const legacyPlans = grouped['9MOBILE'];
  if (!legacyPlans?.length) return grouped;

  grouped['T2'] = [...(grouped['T2'] ?? []), ...legacyPlans];
  delete grouped['9MOBILE'];
  grouped['T2'].sort((a, b) => a.price - b.price);
  return grouped;
};

const mergeLegacyNetworkIdMap = (map: Record<string, string>) => {
  if (map['9MOBILE'] && !map['T2']) {
    map['T2'] = map['9MOBILE'];
  }
  delete map['9MOBILE'];
  return map;
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
  if (
    upper.includes('T2') ||
    upper.includes('9MOBILE') ||
    upper.includes('9 MOBILE') ||
    upper.includes('ETISALAT')
  ) {
    return 'T2';
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
  apiCode?: string | null;
  custom_price?: number | null;
  original_price?: number | null;
};

// Helper function to get effective price (custom_price || original_price || price)
const getEffectivePrice = (plan: DataPlan): number => {
  return plan.custom_price ?? plan.original_price ?? plan.price;
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
  const [selectedPlanCache, setSelectedPlanCache] = useState<DataPlan | null>(null);
  const [showConfirmModal, setShowConfirmModal] = useState(false);
  const [isProcessing, setIsProcessing] = useState(false);
  const [balance, setBalance] = useState(0);
  const [networks, setNetworks] = useState<NetworkOption[]>([]);
  const [plansByNetwork, setPlansByNetwork] = useState<Record<string, DataPlan[]>>({});
const [networkIdMap, setNetworkIdMap] = useState<Record<string, string>>({});
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [insufficientFundsMessage, setInsufficientFundsMessage] = useState<string | null>(null);
  const [showInsufficientFundsModal, setShowInsufficientFundsModal] = useState(false);
  const { providers: vendingSettings } = useVendingSettings();
  const dataProvider = vendingSettings.data;
  const [isDemoUser, setIsDemoUser] = useState(false);

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

      // Check if user is demo user
      const userEmail = session.user.email;
      if (isMounted.current) {
        setIsDemoUser(userEmail === 'demo@netppay.com');
      }

      const userId = session.user.id;
      const accessToken = session.access_token;
      if (!accessToken) {
        throw new Error('Missing access token. Please sign in again.');
      }

      const resolvedProvider = dataProvider || 'smeplug';

      const networksPromise =
        resolvedProvider === 'smeplug'
          ? supabase.functions.invoke('fetch-smeplug-networks', {
              headers: { Authorization: `Bearer ${accessToken}` },
            })
          : Promise.resolve({ data: null, error: null });

      let plansQuery = supabase
        .from('data_plans')
        .select('id, network, plan_name, price, validity, api_code, provider, custom_price, original_price')
        .order('network', { ascending: true })
        .order('price', { ascending: true });

      if (resolvedProvider) {
        plansQuery = plansQuery.eq('provider', resolvedProvider);
      }

      const [profileRes, plansRes, networksRes] = await Promise.all([
        supabase.from('profiles').select('balance').eq('id', userId).single(),
        plansQuery,
        networksPromise,
      ]);

      if (profileRes.error && profileRes.error.code !== 'PGRST116') {
        throw profileRes.error;
      }

      let plansData: any[] = plansRes.data || [];
      if (plansRes.error) {
        const errorCode = String(plansRes.error.code || '');
        const errorMessage = typeof plansRes.error.message === 'string' 
          ? plansRes.error.message 
          : JSON.stringify(plansRes.error.message || plansRes.error);
        const statusCode = (plansRes.error as any).status;
        const httpStatus = typeof statusCode === 'number' ? statusCode : parseInt(String(statusCode || '0'), 10);
        
        console.warn('Data plans query error:', { 
          code: errorCode, 
          message: errorMessage, 
          status: statusCode 
        });
        
        // Handle column missing errors (42703) or 400 Bad Request
        const errorMsgLower = errorMessage.toLowerCase();
        const isColumnError = errorCode === '42703' || 
                             errorCode === 'PGRST100' ||
                             httpStatus === 400 ||
                             (errorMessage && (
                               errorMsgLower.includes('column') ||
                               errorMsgLower.includes('does not exist') ||
                               errorMsgLower.includes('custom_price') ||
                               errorMsgLower.includes('original_price') ||
                               errorMsgLower.includes('provider') ||
                               errorMsgLower.includes('bad request')
                             ));
        
        if (isColumnError) {
          console.warn('Column missing from data_plans, using fallback query', {
            errorCode,
            errorMessage,
            isProviderColumnError: errorMsgLower.includes('provider') && errorMsgLower.includes('does not exist'),
            isCustomPriceError: errorMsgLower.includes('custom_price'),
            isOriginalPriceError: errorMsgLower.includes('original_price'),
          });
          
          // Check if the error is about specific columns
          const isProviderColumnError = errorMsgLower.includes('provider') && 
                                      errorMsgLower.includes('does not exist');
          
          // Start with absolute minimum columns that should always exist
          let fallbackSelect = 'id, network, plan_name, price, validity, api_code';
          
          // Only add provider if we know it exists (not the cause of error)
          if (!isProviderColumnError) {
            fallbackSelect += ', provider';
          }
          
          console.log('Fallback select:', fallbackSelect, 'resolvedProvider:', resolvedProvider);
          
          // Try fallback query with provider filter first
          let fallbackSuccess = false;
          let lastError = null;
          
          // Attempt 1: Try with provider filter if provider column exists
          if (!isProviderColumnError && resolvedProvider) {
            try {
              console.log('Attempt 1: Trying fallback with provider filter:', resolvedProvider);
              const fallbackWithProvider = await supabase
                .from('data_plans')
                .select(fallbackSelect)
                .eq('provider', resolvedProvider)
                .order('network', { ascending: true })
                .order('price', { ascending: true });
              
              console.log('Fallback with provider result:', {
                error: fallbackWithProvider.error,
                dataCount: fallbackWithProvider.data?.length || 0
              });
              
              if (!fallbackWithProvider.error) {
                plansData = fallbackWithProvider.data || [];
                fallbackSuccess = true;
                console.log('Fallback with provider succeeded, got', plansData.length, 'plans');
              } else {
                lastError = fallbackWithProvider.error;
                console.warn('Fallback with provider filter failed:', fallbackWithProvider.error, 'trying without filter');
              }
            } catch (e) {
              lastError = e;
              console.warn('Fallback with provider filter threw error:', e, 'trying without filter');
            }
          }
          
          // Attempt 2: Try without provider filter
          if (!fallbackSuccess) {
            try {
              console.log('Attempt 2: Trying fallback without provider filter');
              const fallbackWithoutProvider = await supabase
                .from('data_plans')
                .select(fallbackSelect)
                .order('network', { ascending: true })
                .order('price', { ascending: true });
              
              console.log('Fallback without provider result:', {
                error: fallbackWithoutProvider.error,
                dataCount: fallbackWithoutProvider.data?.length || 0
              });
              
              if (!fallbackWithoutProvider.error) {
                plansData = fallbackWithoutProvider.data || [];
                fallbackSuccess = true;
                console.log('Fallback without provider succeeded, got', plansData.length, 'plans');
              } else {
                lastError = fallbackWithoutProvider.error;
                console.error('Fallback without provider filter also failed:', fallbackWithoutProvider.error);
              }
            } catch (e) {
              lastError = e;
              console.error('Fallback without provider filter threw error:', e);
            }
          }
          
          if (!fallbackSuccess) {
            console.error('All fallback attempts failed, throwing error');
            throw lastError || plansRes.error;
          }
          
          // Filter by provider in memory to ensure only the selected provider's plans are shown
          if (resolvedProvider && plansData.length > 0) {
            const hasProviderField = plansData.some((plan: any) => plan.provider !== undefined);
            if (hasProviderField) {
              const filteredPlans = plansData.filter((plan: any) => 
                plan.provider === resolvedProvider
              );
              // Only use filtered results if we got matches, otherwise might be all same provider already
              if (filteredPlans.length > 0 || plansData.length === 0) {
                plansData = filteredPlans;
              }
            }
          }
          
          // Map fallback data to include missing columns as null
          plansData = (plansData || []).map((plan: any) => ({
            ...plan,
            provider: plan.provider || resolvedProvider || 'smeplug',
            custom_price: plan.custom_price ?? null,
            original_price: plan.original_price ?? null,
          }));
        } else {
          throw plansRes.error;
        }
      }

      let fetchedNetworkMap: Record<string, string> = {};
      if (resolvedProvider === 'smeplug') {
        if (networksRes.error) {
          console.warn('Failed to fetch SMEPLUG networks. Falling back to default mapping:', networksRes.error);
        } else {
          const payload = networksRes.data;
          if (payload?.success && Array.isArray(payload.data) && payload.data.length > 0) {
            payload.data.forEach((item: { id: string; name: string; network_id: string }) => {
              const normalizedFromName = normalizeNetwork(item.name);
              const normalizedFromId = normalizeNetwork(item.id);
              const derivedKey = normalizedFromName || normalizedFromId;
              if (derivedKey) {
                fetchedNetworkMap[derivedKey] = String(item.network_id || item.id);
              }
            });
          } else {
            console.warn('SMEPLUG networks function returned no data. Falling back to default mapping.');
          }
        }

        if (Object.keys(fetchedNetworkMap).length === 0) {
          fetchedNetworkMap = { ...SMEPLUG_NETWORK_IDS };
        }
      }

      const balanceValue = profileRes.data ? Number(profileRes.data.balance) : 0;

      const grouped: Record<string, DataPlan[]> = {};
      plansData.forEach((plan) => {
        const normalized = normalizeNetwork(plan.network);
        if (!normalized) return;

        if (!grouped[normalized]) {
          grouped[normalized] = [];
        }

        const effectivePrice = plan.custom_price ?? plan.original_price ?? plan.price;
        grouped[normalized].push({
          id: plan.id,
          network: normalized,
          planName: plan.plan_name || 'Data Plan',
          price: Number(effectivePrice) || 0,
          validity: plan.validity,
          apiCode: plan.api_code,
          custom_price: plan.custom_price,
          original_price: plan.original_price,
        });
      });

      Object.keys(grouped).forEach((key) => {
        grouped[key].sort((a, b) => a.price - b.price);
      });

      mergeLegacyNineMobilePlans(grouped);

      const priorityOrder = [...SUPPORTED_DATA_NETWORKS];
      const networkList: NetworkOption[] = priorityOrder.map((networkId) => ({
        id: networkId,
        name: getNetworkDisplayName(networkId),
        logo: NETWORK_LOGOS[networkId] || DEFAULT_NETWORK_LOGO,
      }));

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
        if (!effectivePlanId) {
          setSelectedPlanCache(null);
        }
        setNetworkIdMap(
          resolvedProvider === 'smeplug'
            ? mergeLegacyNetworkIdMap({ ...fetchedNetworkMap })
            : {},
        );
      }
    } catch (err) {
      console.error('Failed to fetch data plans:', err);
      if (isMounted.current) {
        setError(err instanceof Error ? err.message : 'Unable to load data plans.');
        setPlansByNetwork({});
        setNetworks([]);
        setSelectedNetwork(null);
        setDataPlan('');
        setSelectedPlanCache(null);
        setBalance(0);
      }
    } finally {
      if (isMounted.current) {
        setLoading(false);
      }
    }
  }, [router, dataProvider]);

  useEffect(() => {
    fetchDataPlans();
  }, [dataProvider, fetchDataPlans]);

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

    let planToUse = selectedPlan;
    if (!planToUse && currentPlans.length > 0) {
      planToUse = currentPlans[0];
      setDataPlan(planToUse.id);
      setSelectedPlanCache(planToUse);
    }

    if (!planToUse) {
      Alert.alert('Error', 'No available data plans for the selected network.');
      return;
    }

    const effectivePrice = getEffectivePrice(planToUse);
    if (effectivePrice > balance) {
      setInsufficientFundsMessage(
        `Your wallet balance is ${formatCurrency(balance)}. Please fund your wallet to continue.`
      );
      setShowInsufficientFundsModal(true);
      return;
    }

    setShowConfirmModal(true);
  };

  const currentPlans = useMemo(() => {
    return selectedNetwork ? plansByNetwork[selectedNetwork] || [] : [];
  }, [selectedNetwork, plansByNetwork]);

  const handleSelectPlan = useCallback(
    (planId: string) => {
      setDataPlan(planId);
      const match = currentPlans.find((plan) => plan.id === planId);
      setSelectedPlanCache(match ?? null);
    },
    [currentPlans]
  );

  useEffect(() => {
    if (!dataPlan) {
      if (currentPlans.length > 0) {
        const first = currentPlans[0];
        setDataPlan(first.id);
        setSelectedPlanCache(first);
      } else {
        setSelectedPlanCache(null);
      }
      return;
    }

    const found = currentPlans.find((plan) => plan.id === dataPlan);
    if (found) {
      setSelectedPlanCache(found);
    } else if (currentPlans.length > 0) {
      const fallback = currentPlans[0];
      setDataPlan(fallback.id);
      setSelectedPlanCache(fallback);
    } else {
      setSelectedPlanCache(null);
    }
  }, [dataPlan, currentPlans]);

  const dropdownOptions = useMemo(
    () =>
      currentPlans.map((plan) => ({
        id: plan.id,
        name: plan.validity ? `${plan.planName} • ${plan.validity}` : plan.planName,
        amount: getEffectivePrice(plan),
      })),
    [currentPlans]
  );

  const selectedPlan = useMemo(() => {
    return currentPlans.find((plan) => plan.id === dataPlan) || selectedPlanCache || undefined;
  }, [currentPlans, dataPlan, selectedPlanCache]);

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

  const handleConfirmPayment = useCallback(async () => {
    console.log('[ConfirmPayment] handler invoked', {
      selectedPlan: selectedPlan?.id,
      selectedNetwork,
      phoneNumber,
    });

    if (!selectedPlan || !selectedNetwork) {
      console.warn('[ConfirmPayment] Missing plan or network', {
        selectedPlan,
        selectedNetwork,
      });
      return;
    }

    setIsProcessing(true);
    setShowConfirmModal(false);

    try {
      // Basic phone number normalization (remove spaces, format)
      const effectivePhone = phoneNumber.trim().replace(/\s+/g, '');
      if (!effectivePhone || effectivePhone.length < 10) {
        Alert.alert('Error', 'Please enter a valid phone number');
        setIsProcessing(false);
        return;
      }
      const effectivePlanId =
        typeof selectedPlan.id === 'string'
          ? selectedPlan.id.trim()
          : String(selectedPlan.id ?? '').trim();
      const effectiveNetworkId = selectedNetwork.trim();

      if (!effectivePlanId) {
        console.warn('[ConfirmPayment] Empty plan id after normalization', {
          selectedPlan,
        });
        Alert.alert('Data Purchase', 'Please select a data plan.');
        setIsProcessing(false);
        return;
      }

      if (!effectiveNetworkId) {
        console.warn('[ConfirmPayment] Empty network id after normalization', {
          selectedNetwork,
        });
        Alert.alert('Data Purchase', 'Unable to determine the selected network. Please try again.');
        setIsProcessing(false);
        return;
      }

      let rawNetworkId: string | null = null;
      if (dataProvider === 'smeplug') {
        rawNetworkId =
          networkIdMap[effectiveNetworkId] ||
          SMEPLUG_NETWORK_IDS[effectiveNetworkId] ||
          networkIdMap[selectedNetworkName?.toUpperCase?.() ?? ''] ||
          null;
        if (!rawNetworkId) {
          Alert.alert('Data Purchase', 'Unable to determine the network ID for this provider. Please try again.');
          setIsProcessing(false);
          return;
        }
      }

      const sanitizedPhoneNumber = effectivePhone.replace(/\s+/g, '').trim();
      if (!sanitizedPhoneNumber) {
        console.warn('[ConfirmPayment] Sanitized phone is empty', {
          effectivePhone,
        });
        Alert.alert('Data Purchase', 'Phone number is required.');
        setIsProcessing(false);
        return;
      }

      const { data: sessionData } = await supabase.auth.getSession();
      const accessToken = sessionData?.session?.access_token;
      if (!accessToken) {
        console.warn('[ConfirmPayment] Missing access token');
        Alert.alert('Session Expired', 'Please sign in again to continue.');
        setIsProcessing(false);
        router.replace('/auth/login');
        return;
      }

      // Use the new unified purchase-data endpoint with automatic fallback
      const requestBody = {
        phone_number: sanitizedPhoneNumber,
        plan_id: effectivePlanId,
      };
      console.log('Prepared request body:', requestBody);

      console.log('Submitting purchase-data request with automatic fallback:', requestBody);

      // Direct fetch call for better error handling
      const supabaseUrl = process.env.EXPO_PUBLIC_SUPABASE_URL;
      if (!supabaseUrl) {
        throw new Error('Supabase URL is not configured');
      }

      const functionUrl = `${supabaseUrl}/functions/v1/purchase-data`;

      const response = await fetch(functionUrl, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${accessToken}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(requestBody),
      });

      const responseJson = await response.json();
      // Handle both direct response and wrapped response (response.data)
      const responseData = responseJson?.data || responseJson;
      
      console.log('purchase-data response:', { 
        httpStatus: response.status, 
        success: responseData?.success,
        error: responseData?.error,
        message: responseData?.message,
        vendor: responseData?.data?.vendor,
        fullResponse: responseJson,
        extractedData: responseData
      });

      if (!response.ok) {
        // Extract error message from response
        const errorMessage = responseData?.error || responseData?.message || responseJson?.error || `HTTP ${response.status}: ${response.statusText}`;
        throw new Error(errorMessage);
      }

      // Check if transaction failed
      if (responseData?.success === false) {
        const detail =
          responseData?.details?.message ||
          responseData?.details?.error ||
          responseData?.details?.data?.message ||
          responseData?.details?.data?.error;
        let message = detail || responseData?.error || responseData?.message || 'Unable to complete data purchase.';
        
        // Parse vendor error details for better user feedback
        const errorSummary = responseData?.details?.error_summary;
        const lastResponse = responseData?.details?.last_response;
        
        // Check for "all vendors failed" scenarios
        const allVendorsFailed = (errorSummary && (
                                errorSummary.includes('all failed') ||
                                (errorSummary.includes('Attempted') && errorSummary.includes('failed'))
                              )) ||
                                message.includes('All vendors failed') ||
                                message.includes('all failed') ||
                                responseData?.error?.includes('all failed');
        
        // Check if it's a configuration issue (check both message and errorSummary)
        const isConfigError = message.includes('credentials not configured') ||
                            message.includes('not configured') ||
                            message.includes('missing') ||
                            (errorSummary && (
                              errorSummary.includes('credentials not configured') ||
                              errorSummary.includes('missing') ||
                              errorSummary.includes('fallback unavailable')
                            ));
        
        // Check for vendor-specific errors
        const isVendorError = message.includes('VTpass did not return') ||
                             message.includes('did not return transaction details') ||
                             (lastResponse && typeof lastResponse === 'object' && lastResponse.error);
        
        if (allVendorsFailed || isVendorError) {
          // All vendors failed - provide user-friendly message
          message = 'Unable to complete your data purchase at this time. All payment providers are currently unavailable. Please try again in a few minutes or contact support if the issue persists.';
        } else if (isConfigError) {
          message = 'Service temporarily unavailable. Please contact support or try again later.';
        } else if (errorSummary) {
          // Extract the most relevant error from summary for non-config errors
          const lines = errorSummary.split('\n');
          const lastError = lines[lines.length - 1] || message;
          if (lastError && !lastError.startsWith('-')) {
            message = lastError.replace(/^-\s*/, '');
          }
        }
        
        // Ensure we have a user-friendly message
        if (!message || message.length < 10) {
          message = 'Unable to complete data purchase. Please try again or contact support.';
        }
        
        throw new Error(message);
      }

      // Transaction is successful (user debited and transaction recorded)
      // Check if transaction status is pending or delivered
      const transactionStatus = responseData?.data?.status || 'success';
      const vendor = responseData?.data?.vendor || 'vendor';
      const isPending = transactionStatus?.toLowerCase() === 'pending' || 
                       transactionStatus?.toLowerCase() === 'processing' ||
                       transactionStatus?.toLowerCase() === 'queued';

      setShowConfirmModal(false);

      const reference = responseData?.data?.reference || '';
      
      // Navigate to success screen - user is debited and transaction is recorded
      // If pending, transaction will be updated to success when vendor confirms
      const navigateToSuccess = () => {
        router.push({
          pathname: '/payment-success',
          params: {
            amount: getEffectivePrice(selectedPlan).toString(),
            network: selectedNetworkName,
            recipient: sanitizedPhoneNumber,
            serviceType: `Data Bundle - ${selectedPlanLabel || selectedPlan.planName}`,
            reference,
          },
        });
      };

      // If transaction is pending, show info but still navigate to success
      // The transaction is recorded as pending and will be updated when vendor confirms
      if (isPending) {
        Alert.alert(
          'Transaction Processing',
          `Your data purchase is being processed via ${vendor}. Reference: ${reference}. You will be notified when completed.`,
          [
            {
              text: 'View Transactions',
              onPress: () => {
                router.push('/(tabs)/transactions');
              }
            },
            {
              text: 'OK',
              onPress: navigateToSuccess
            }
          ],
          { cancelable: false }
        );
        // Also navigate after a short delay in case user doesn't click
        setTimeout(navigateToSuccess, 100);
      } else {
        // Navigate immediately for delivered transactions
        navigateToSuccess();
      }
    } catch (purchaseError: any) {
      console.error('Data purchase failed:', purchaseError);
      let message = 'Unable to complete data purchase. Please try again.';

      if (purchaseError instanceof Error) {
        message = purchaseError.message || message;
      }

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
      
      // Check for vendor failures
      const isVendorFailure = errorMessage.includes('All vendors') ||
                             errorMessage.includes('all failed') ||
                             errorMessage.includes('payment providers are currently unavailable') ||
                             errorMessage.includes('VTpass did not return') ||
                             errorMessage.includes('did not return transaction details');
      
      // Check for configuration errors
      const isConfigError = errorMessage.includes('credentials not configured') ||
                           errorMessage.includes('not configured') ||
                           errorMessage.includes('missing') ||
                           errorMessage.includes('Service temporarily unavailable');
      
      if (isNetworkError) {
        message = 'Network connection failed. Please check your internet connection and try again.';
        Alert.alert('Connection Error', message);
      } else if (isVendorFailure) {
        // Vendor failures are already handled with user-friendly message in the response check
        Alert.alert(
          'Purchase Unavailable', 
          message, 
          [
            {
              text: 'OK',
              style: 'default'
            }
          ]
        );
      } else if (isConfigError) {
        // Configuration errors are already handled with user-friendly message
        Alert.alert('Service Unavailable', message);
      } else {
        Alert.alert('Data Purchase', message);
      }
    } finally {
      setIsProcessing(false);
    }
  }, [dataProvider, networkIdMap, phoneNumber, router, selectedNetwork, selectedNetworkName, selectedPlan, selectedPlanLabel]);

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
                <NetpayLoadingAnimation size={32} variant="onBrand" strokeWidth={2.5} />
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
          {isDemoUser && <DemoNumbersBanner type="data" />}

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
                  <NetpayLoadingAnimation size={36} strokeWidth={3} />
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
                <NetpayLoadingAnimation size={40} strokeWidth={3} />
              </View>
            ) : (
              <>
                <Dropdown
                  options={dropdownOptions}
                  selectedId={dataPlan || null}
                  onSelect={handleSelectPlan}
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
          amount={getEffectivePrice(selectedPlan)}
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
            <NetpayLoadingAnimation message="Processing payment…" />
          </View>
        </View>
      )}

      <Modal
        animationType="slide"
        transparent
        visible={showInsufficientFundsModal}
        onRequestClose={() => setShowInsufficientFundsModal(false)}>
        <View style={styles.modalOverlay}>
          <View style={styles.insufficientModal}>
            <View style={styles.modalIconContainer}>
              <MaterialIcons name="account-balance-wallet" size={36} color="#FF7F00" />
            </View>
            <ThemedText style={styles.modalTitle}>Insufficient Balance</ThemedText>
            <ThemedText style={styles.modalMessage}>
              {insufficientFundsMessage ||
                'Your wallet balance is insufficient for this transaction. Please fund your wallet to continue.'}
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
    zIndex: 60,
  },
  insufficientModal: {
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



