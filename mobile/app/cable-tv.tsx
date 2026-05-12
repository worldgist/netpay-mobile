import { useEffect, useMemo, useRef, useState, useCallback } from 'react';
import { StyleSheet, View, TextInput, TouchableOpacity, ScrollView, KeyboardAvoidingView, Platform, Alert, Modal } from 'react-native';
import { NetpayLoadingAnimation } from '@/components/netpay-loading-animation';
import { ThemedView } from '@/components/themed-view';
import { ThemedText } from '@/components/themed-text';
import { MaterialIcons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import { Image } from 'expo-image';
import { Dropdown } from '@/components/dropdown';
import { ConfirmPaymentModal } from '@/components/confirm-payment-modal';
import { InsufficientBalanceModal } from '@/components/insufficient-balance-modal';
import { DemoNumbersBanner } from '@/components/demo-numbers-banner';
import { supabase } from '@/lib/supabase';
import * as Clipboard from 'expo-clipboard';

const PROVIDER_LOGOS: Record<string, any> = {
  DSTV: require('@/assets/images/dstv.png'),
  GOTV: require('@/assets/images/gotv.png'),
  STARTIMES: require('@/assets/images/startimes.png'),
};

const fallbackLogo = require('@/assets/images/logo.png');

// Static list of cable TV providers (not fetched from API)
const STATIC_PROVIDERS: CableProvider[] = [
  { name: 'DSTV', logo: PROVIDER_LOGOS.DSTV },
  { name: 'GOTV', logo: PROVIDER_LOGOS.GOTV },
  { name: 'STARTIMES', logo: PROVIDER_LOGOS.STARTIMES },
];

type CableProvider = {
  name: string;
  logo: any;
};

type CablePlan = {
  id: string;
  packageName: string;
  price: number;
};

export default function CableTVScreen() {
  const router = useRouter();
  const isMounted = useRef(true);
  const [providers, setProviders] = useState<CableProvider[]>([]);
  const [plansByProvider, setPlansByProvider] = useState<Record<string, CablePlan[]>>({});
  const [selectedProvider, setSelectedProvider] = useState<string | null>(null);
  const [smartCardNumber, setSmartCardNumber] = useState('');
  const [packagePlan, setPackagePlan] = useState('');
  const [showConfirmModal, setShowConfirmModal] = useState(false);
  const [loading, setLoading] = useState(true);
  const [refreshingPlans, setRefreshingPlans] = useState(false);
  const [fetchError, setFetchError] = useState<string | null>(null);
  const [verifying, setVerifying] = useState(false);
  const [verifiedName, setVerifiedName] = useState<string | null>(null);
  const [balance, setBalance] = useState<number | null>(null);
  const [balanceLoading, setBalanceLoading] = useState<boolean>(true);
  const [showServiceUnavailableModal, setShowServiceUnavailableModal] = useState(false);
  const [showInvalidCardModal, setShowInvalidCardModal] = useState(false);
  const [invalidCardMessage, setInvalidCardMessage] = useState('');
  const [showInsufficientBalance, setShowInsufficientBalance] = useState(false);
  const [showTryAgainLaterModal, setShowTryAgainLaterModal] = useState(false);
  const [isDemoUser, setIsDemoUser] = useState(false);
  const [isProcessing, setIsProcessing] = useState(false);

  const fetchPackagesForAllProviders = async () => {
    try {
      if (isMounted.current) {
        setRefreshingPlans(true);
      }
      
      const { data: sessionData, error: sessionError } = await supabase.auth.getSession();
      if (sessionError) throw sessionError;

      const session = sessionData.session;
      if (!session) {
        if (isMounted.current) {
          setRefreshingPlans(false);
        }
        return;
      }

      const supabaseUrl = process.env.EXPO_PUBLIC_SUPABASE_URL;
      if (!supabaseUrl) {
        throw new Error('Supabase URL is not configured');
      }

      // Get the active cable vending provider setting
      const { data: providerSetting } = await supabase
        .from('app_settings')
        .select('setting_value')
        .eq('setting_key', 'cable_provider')
        .maybeSingle();

      const rawProvider = providerSetting?.setting_value?.provider || 'mobilenig';
      const vendingProvider = rawProvider;
      console.log('Cable TV vending provider (fetchPackagesForAllProviders):', vendingProvider, '(raw:', rawProvider, ')');

      // Fetch packages for each static provider from API
      const grouped: Record<string, CablePlan[]> = {};
      
      for (const provider of STATIC_PROVIDERS) {
        try {
          // Determine which function to call based on vending provider
          let functionName: string;
          let requestBody: any;

          if (vendingProvider === 'vtpass') {
            functionName = 'fetch-vtpass-cable-packages';
            requestBody = { provider: provider.name };
          } else if (vendingProvider === 'mobilenig') {
            functionName = 'fetch-mobilenig-cable-packages';
            requestBody = { provider: provider.name };
          } else if (vendingProvider === 'anyone') {
            // ANYONE provider - use VTpass as fallback
            functionName = 'fetch-vtpass-cable-packages';
            requestBody = { provider: provider.name };
          } else {
            // Default to VTpass if unknown provider
            console.warn(`Unknown provider: ${vendingProvider}, defaulting to VTpass`);
            functionName = 'fetch-vtpass-cable-packages';
            requestBody = { provider: provider.name };
          }

          console.log(`Fetching packages for ${provider.name} using function: ${functionName} (provider: ${vendingProvider})`);
          const functionUrl = `${supabaseUrl}/functions/v1/${functionName}`;
          
          const response = await fetch(functionUrl, {
            method: 'POST',
            headers: {
              'Authorization': `Bearer ${session.access_token}`,
              'Content-Type': 'application/json',
            },
            body: JSON.stringify(requestBody),
          });

          const responseData = await response.json();
          
          console.log(`Response for ${provider.name}:`, {
            ok: response.ok,
            status: response.status,
            success: responseData?.success,
            dataLength: responseData?.data?.length || 0,
            error: responseData?.error,
            debugRawVariation: responseData?.metadata?.debug_raw_variation,
            fullResponse: responseData,
          });

          if (response.ok && responseData?.success && responseData?.data?.length > 0) {
            console.log(`Raw package data for ${provider.name}:`, JSON.stringify(responseData.data.slice(0, 2), null, 2));
            
            const rawPackages: CablePlan[] = responseData.data.map((pkg: any) => {
              const packageName = pkg.package_name || pkg.name || pkg.variation_name || pkg.variation_code || 'Unknown Package';
              const price = pkg.price || pkg.variation_amount || pkg.custom_price || 0;
              const id = pkg.api_code || pkg.variation_id || `${provider.name}-${packageName}`;
              
              console.log(`Package mapping for ${provider.name}:`, {
                raw: pkg,
                mapped: { id, packageName, price },
              });
              
              return {
                id,
                packageName,
                price,
              };
            });

            // Deduplicate packages by normalized package name (especially for DSTV after price validation)
            const seenIds = new Set<string>();
            const seenPackageNames = new Set<string>();
            const packages = rawPackages.filter((pkg) => {
              const normalizedName = (pkg.packageName || '').toLowerCase().trim();
              
              // Check for duplicate by ID first
              if (pkg.id && seenIds.has(pkg.id)) {
                console.log(`Removing duplicate package by ID: ${pkg.packageName} (ID: ${pkg.id})`);
                return false;
              }
              
              // Check for duplicate by normalized package name (for DSTV after price validation)
              if (provider.name === 'DSTV' && normalizedName && seenPackageNames.has(normalizedName)) {
                console.log(`Removing duplicate package by name: ${pkg.packageName} (ID: ${pkg.id})`);
                return false;
              }
              
              if (pkg.id) seenIds.add(pkg.id);
              if (normalizedName) seenPackageNames.add(normalizedName);
              return true;
            });

            grouped[provider.name] = packages;
            console.log(`Fetched ${rawPackages.length} packages for ${provider.name} (${packages.length} unique):`, packages.map(p => ({ name: p.packageName, price: p.price })));
          } else {
            // Filter out SSL certificate errors from warnings (vendor-side issue)
            const errorMessage = responseData?.error || responseData?.message || 'Unknown error';
            if (!errorMessage.includes('SSL certificate') && 
                !errorMessage.includes('invalid peer certificate') &&
                !errorMessage.includes('certificate has expired')) {
              console.warn(`No packages found for ${provider.name}:`, errorMessage);
            } else {
              console.log(`No packages found for ${provider.name}: Vendor SSL certificate issue (temporary)`);
            }
            grouped[provider.name] = [];
          }
        } catch (error: any) {
          console.error(`Error fetching packages for ${provider.name}:`, error);
          grouped[provider.name] = [];
        }
      }

      if (isMounted.current) {
        setPlansByProvider(grouped);
        setRefreshingPlans(false);
      }
    } catch (error: any) {
      // Ignore database errors about missing tables - we're fetching from API now
      const errorMessage = error?.message || String(error);
      const errorCode = error?.code || '';
      
      // Only log if it's not a cable_tv_plans table error
      if (!errorMessage.includes('cable_tv_plans') && 
          errorCode !== 'PGRST205' &&
          !(typeof errorMessage === 'string' && errorMessage.includes('Could not find the table'))) {
        console.error('Error fetching packages for all providers:', error);
      }
      
      if (isMounted.current) {
        setPlansByProvider({});
        setRefreshingPlans(false);
      }
    }
  };

  const loadData = useCallback(async () => {
      try {
        if (isMounted.current) {
          setLoading(true);
          setFetchError(null);
          setBalanceLoading(true);
        }

        const { data: sessionData, error: sessionError } = await supabase.auth.getSession();
        if (sessionError) throw sessionError;

        const session = sessionData.session;
        if (!session) {
          if (isMounted.current) {
            setLoading(false);
            setBalanceLoading(false);
          }
          router.replace('/auth/login');
          return;
        }

        // Check if user is demo user
        const userEmail = session.user.email;
        if (isMounted.current) {
          setIsDemoUser(userEmail === 'demo@netpayy.ng');
        }

        const userId = session.user.id;

        const { data: profile, error: profileError } = await supabase
          .from('profiles')
          .select('balance')
          .eq('id', userId)
          .single();

        if (profileError) throw profileError;

        const userBalance = Number(profile?.balance) || 0;
        if (isMounted.current) {
          setBalance(userBalance);
          setBalanceLoading(false);
        }

        // Set static providers immediately (not fetched from API)
        if (isMounted.current) {
          setProviders(STATIC_PROVIDERS);
          setSelectedProvider((current) => {
            // Only set if not already set
            if (!current && STATIC_PROVIDERS.length > 0) {
              return STATIC_PROVIDERS[0].name;
            }
            return current;
          });
          // Hide main loading screen - show providers immediately
          setLoading(false);
        }

        // Fetch packages from API in the background (non-blocking)
        fetchPackagesForAllProviders().catch((error) => {
          console.error('Background package fetch failed:', error);
          // Don't show error to user - packages will just be empty
        });
      } catch (error: any) {
        if (isMounted.current) {
          const errorMessage = error instanceof Error ? error.message : String(error);
          const errorCode = error?.code || '';
          
          // Ignore database errors about missing cable_tv_plans table
          if (errorMessage.includes('cable_tv_plans') || 
              errorCode === 'PGRST205' || 
              (typeof errorMessage === 'string' && errorMessage.includes('Could not find the table'))) {
            // Silently ignore - this is expected since we're fetching from API now
            // Still set providers and try to fetch packages
            setProviders(STATIC_PROVIDERS);
            setSelectedProvider((current) => {
              // Only set if not already set
              if (!current && STATIC_PROVIDERS.length > 0) {
                return STATIC_PROVIDERS[0].name;
              }
              return current;
            });
            setLoading(false);
            setBalanceLoading(false);
            // Try to fetch packages anyway
            fetchPackagesForAllProviders().catch(() => {
              // Silently fail - packages will be empty
            });
            return;
          }
          
          // Only log non-ignored errors
          console.error('Failed to load cable data:', error);
          
          // Check for network errors
          const isNetworkError = errorMessage.includes('Network request failed') ||
                                errorMessage.includes('network') ||
                                errorMessage.includes('fetch') ||
                                errorMessage.includes('Failed to fetch') ||
                                errorMessage.includes('ERR_INTERNET_DISCONNECTED') ||
                                errorMessage.includes('ERR_NETWORK_CHANGED') ||
                                errorMessage.includes('TypeError') ||
                                error?.code === 'NETWORK_ERROR' ||
                                error?.name === 'TypeError';
          
          setFetchError(isNetworkError 
            ? 'Network connection failed. Please check your internet connection.'
            : errorMessage || 'Unable to load cable TV data'
          );
          setPlansByProvider({});
          // Keep providers static even on error
          if (isMounted.current) {
            setProviders(STATIC_PROVIDERS);
          }
        }
      } finally {
        if (isMounted.current) {
          setLoading(false);
          setRefreshingPlans(false);
          setBalanceLoading(false);
        }
      }
    }, [router]);

  useEffect(() => {
    isMounted.current = true;
    loadData();
    return () => {
      isMounted.current = false;
    };
  }, [loadData]);

  const fetchPackagesFromAPI = async () => {
    try {
      setRefreshingPlans(true);
      setFetchError(null);

      const { data: sessionData, error: sessionError } = await supabase.auth.getSession();
      if (sessionError) throw sessionError;

      const session = sessionData.session;
      if (!session) {
        Alert.alert('Session Expired', 'Please sign in again.');
        router.replace('/auth/login');
        return;
      }

      const supabaseUrl = process.env.EXPO_PUBLIC_SUPABASE_URL;
      if (!supabaseUrl) {
        throw new Error('Supabase URL is not configured');
      }

      // Get the active cable vending provider setting
      const { data: providerSetting } = await supabase
        .from('app_settings')
        .select('setting_value')
        .eq('setting_key', 'cable_provider')
        .maybeSingle();

      const rawProvider = providerSetting?.setting_value?.provider || 'mobilenig';
      const vendingProvider = rawProvider;
      console.log('Cable TV vending provider (fetchPackagesFromAPI):', vendingProvider, '(raw:', rawProvider, ')');

      // Fetch packages for each static provider
      const fetchPromises = STATIC_PROVIDERS.map(async (provider) => {
        try {
          // Determine which function to call based on vending provider
          let functionName: string;
          let requestBody: any;

          if (vendingProvider === 'vtpass') {
            functionName = 'fetch-vtpass-cable-packages';
            requestBody = { provider: provider.name };
          } else if (vendingProvider === 'mobilenig') {
            functionName = 'fetch-mobilenig-cable-packages';
            requestBody = { provider: provider.name };
          } else if (vendingProvider === 'anyone') {
            // ANYONE provider - use VTpass as fallback
            functionName = 'fetch-vtpass-cable-packages';
            requestBody = { provider: provider.name };
          } else {
            // Default to VTpass if unknown provider
            console.warn(`Unknown provider: ${vendingProvider}, defaulting to VTpass`);
            functionName = 'fetch-vtpass-cable-packages';
            requestBody = { provider: provider.name };
          }

          console.log(`Fetching packages for ${provider.name} using function: ${functionName} (provider: ${vendingProvider})`);
          const functionUrl = `${supabaseUrl}/functions/v1/${functionName}`;
          
          const response = await fetch(functionUrl, {
            method: 'POST',
            headers: {
              'Authorization': `Bearer ${session.access_token}`,
              'Content-Type': 'application/json',
            },
            body: JSON.stringify(requestBody),
          });

          const responseData = await response.json();
          
          if (response.ok && responseData?.success && responseData?.data?.length > 0) {
            console.log(`Fetched ${responseData.data.length} packages for ${provider.name}`);
            return { provider: provider.name, success: true, count: responseData.data.length };
          } else {
            // Filter out SSL certificate errors from warnings (vendor-side issue)
            const errorMessage = responseData?.error || 'Unknown error';
            if (!errorMessage.includes('SSL certificate') && 
                !errorMessage.includes('invalid peer certificate') &&
                !errorMessage.includes('certificate has expired')) {
              console.warn(`Failed to fetch packages for ${provider.name}:`, errorMessage);
            } else {
              console.log(`Failed to fetch packages for ${provider.name}: Vendor SSL certificate issue (temporary)`);
            }
            return { provider: provider.name, success: false, error: errorMessage };
          }
        } catch (error: any) {
          console.error(`Error fetching packages for ${provider.name}:`, error);
          return { provider: provider.name, success: false, error: error.message || 'Network error' };
        }
      });

      const results = await Promise.all(fetchPromises);
      const successCount = results.filter(r => r.success).length;
      
      if (successCount > 0) {
        // Reload packages after fetching
        await fetchPackagesForAllProviders();
        Alert.alert(
          'Packages Updated',
          `Successfully fetched packages for ${successCount} provider(s).`
        );
      } else {
        Alert.alert(
          'Fetch Failed',
          'Unable to fetch packages from API. Please try again later or contact support.'
        );
      }
    } catch (error: any) {
      console.error('Error fetching packages from API:', error);
      Alert.alert(
        'Error',
        error.message || 'Failed to fetch packages from API. Please try again.'
      );
    } finally {
      setRefreshingPlans(false);
    }
  };

  useEffect(() => {
    // reset plan when provider changes
    setPackagePlan('');
  }, [selectedProvider]);

  const currentPlans: CablePlan[] = useMemo(() => {
    if (!selectedProvider) return [];
    return plansByProvider[selectedProvider] || [];
  }, [selectedProvider, plansByProvider]);

  const availableBalance = balance ?? 0;

  const handleVerifySmartCard = async () => {
    if (!selectedProvider) {
      Alert.alert('Error', 'Please select a cable TV provider first');
      return;
    }
    if (!smartCardNumber.trim() || smartCardNumber.length < 10) {
      Alert.alert('Error', 'Please enter a valid smart card number');
      return;
    }
    if (verifying) return;

    try {
      setVerifying(true);
      setVerifiedName(null);
      setShowServiceUnavailableModal(false);
      setShowInvalidCardModal(false);

      const { data, error } = await supabase.functions.invoke('validate-cable-customer', {
        body: {
          card_number: smartCardNumber.trim(),
          provider: selectedProvider.toUpperCase(),
        },
      });

      // Handle edge function errors (network, timeout, etc.)
      if (error) {
        console.error('Edge function error:', error);
        setVerifiedName(null);
        
        // Check for network errors
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
          Alert.alert(
            'Connection Error',
            'Network connection failed. Please check your internet connection and try again.',
            [{ text: 'OK' }]
          );
        } else {
          setShowServiceUnavailableModal(true);
        }
        return;
      }

      // Check if validation was successful
      if (data?.success === true && data?.data?.customer_name) {
        const name = data.data.customer_name || selectedProvider;
        setVerifiedName(name);
        // Clear any error modals
        setShowServiceUnavailableModal(false);
        setShowInvalidCardModal(false);
      } else {
        // Handle validation failure
        const errorMessage = data?.error || 'Unable to verify smart card number';
        const errorType = data?.errorType || '';
        
        console.log('Verification failed:', errorMessage, 'ErrorType:', errorType);
        setVerifiedName(null);
        
        // Check if it's an invalid card number error
        const isInvalidCard = errorType === 'invalid_card' ||
                             errorMessage.toLowerCase().includes('invalid') || 
                             errorMessage.toLowerCase().includes('card number') ||
                             errorMessage.toLowerCase().includes('smart card') ||
                             errorMessage.toLowerCase().includes('customer not found') ||
                             errorMessage.toLowerCase().includes('not found') ||
                             errorMessage.toLowerCase().includes('wrong');
        
        if (isInvalidCard) {
          // Set a user-friendly message
          setInvalidCardMessage('Wrong card number. Please check the card number and try again.');
          setShowInvalidCardModal(true);
        } else {
          setShowServiceUnavailableModal(true);
        }
      }
    } catch (error: any) {
      console.error('Smart card verification failed:', error);
      setVerifiedName(null);
      
      // Check for network errors
      const errorMessage = error?.message || String(error);
      const isNetworkError = errorMessage.includes('Network request failed') ||
                            errorMessage.includes('network') ||
                            errorMessage.includes('fetch') ||
                            errorMessage.includes('Failed to fetch') ||
                            errorMessage.includes('ERR_INTERNET_DISCONNECTED') ||
                            errorMessage.includes('ERR_NETWORK_CHANGED') ||
                            errorMessage.includes('TypeError') ||
                            error?.code === 'NETWORK_ERROR' ||
                            error?.name === 'TypeError';
      
      if (isNetworkError) {
        Alert.alert(
          'Connection Error',
          'Network connection failed. Please check your internet connection and try again.',
          [{ text: 'OK' }]
        );
      } else {
        setShowServiceUnavailableModal(true);
      }
    } finally {
      setVerifying(false);
    }
  };

  const selectedPlan = useMemo(() => currentPlans.find((p) => p.id === packagePlan), [currentPlans, packagePlan]);

  // Calculate charge fee (2% of package price)
  const chargeFee = useMemo(() => {
    if (!selectedPlan || !selectedPlan.price) return 0;
    const price = typeof selectedPlan.price === 'number' ? selectedPlan.price : parseFloat(String(selectedPlan.price)) || 0;
    if (price <= 0) return 0;
    const fee = price * 0.02; // 2% charge fee
    // Round to 2 decimal places
    return Math.round(fee * 100) / 100;
  }, [selectedPlan]);

  // Calculate total amount (price + charge fee)
  const totalAmount = useMemo(() => {
    if (!selectedPlan) return 0;
    return selectedPlan.price + chargeFee;
  }, [selectedPlan, chargeFee]);

  const handleContinue = () => {
    if (!selectedProvider) {
      Alert.alert('Error', 'Please select a cable TV provider');
      return;
    }
    if (!smartCardNumber.trim() || smartCardNumber.length < 10) {
      Alert.alert('Error', 'Please enter a valid smart card number');
      return;
    }
    if (!selectedPlan) {
      Alert.alert('Error', 'Please select a package plan');
      return;
    }
    if (balance === null) {
      Alert.alert('Balance Unavailable', 'Unable to load wallet balance. Please try again.');
      return;
    }
    // Check balance against total amount (price + charge fee)
    if (totalAmount > availableBalance) {
      setShowInsufficientBalance(true);
      return;
    }

    // For non-demo users, recommend verification (but don't block)
    // The purchase function will handle the requirement based on provider
    if (!isDemoUser && !verifiedName) {
      Alert.alert(
        'Verify Smart Card',
        'We recommend verifying your smart card number before purchase. You can proceed without verification, but it may be required for some providers.',
        [
          {
            text: 'Verify First',
            onPress: () => handleVerifySmartCard(),
          },
          {
            text: 'Continue Anyway',
            onPress: () => setShowConfirmModal(true),
            style: 'default',
          },
        ]
      );
      return;
    }

    setShowConfirmModal(true);
  };

  const handleConfirmPayment = async () => {
    if (!selectedPlan || !selectedProvider) return;
    
    setIsProcessing(true);
    setShowConfirmModal(false);

    try {
      // Get session token
      const { data: sessionData } = await supabase.auth.getSession();
      const accessToken = sessionData?.session?.access_token;
      
      if (!accessToken) {
        Alert.alert('Session Expired', 'Please sign in again to continue.');
        setIsProcessing(false);
        router.replace('/auth/login');
        return;
      }

      // Get customer information if verified
      // For MobileNig and some providers, customer info is required
      // If not verified, we'll use the card number and a default name
      let customerNumber: string | undefined = smartCardNumber.trim();
      let customerName: string | undefined = verifiedName || selectedProvider;
      
      // If we have verified name, use it; otherwise use provider name as fallback
      if (verifiedName) {
        customerName = verifiedName;
      }

      // Call purchase API
      const supabaseUrl = process.env.EXPO_PUBLIC_SUPABASE_URL;
      if (!supabaseUrl) {
        throw new Error('Supabase URL is not configured');
      }

      const functionUrl = `${supabaseUrl}/functions/v1/purchase-cable-tv`;

      const response = await fetch(functionUrl, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${accessToken}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          card_number: smartCardNumber.trim(),
          plan_id: selectedPlan.id,
          provider: selectedProvider,
          customer_number: customerNumber,
          customer_name: customerName,
          package_name: selectedPlan.packageName,
          price: selectedPlan.price,
          api_code: selectedPlan.id,
        }),
      });

      const responseJson = await response.json();
      const responseData = responseJson?.data || responseJson;

      if (!response.ok) {
        const errorMessage = responseData?.error || responseData?.message || `HTTP ${response.status}: ${response.statusText}`;
        const errorDetails = responseData?.details || '';
        const detailsText = typeof errorDetails === 'string' 
          ? errorDetails 
          : (errorDetails?.message || errorDetails?.reason || JSON.stringify(errorDetails) || '');
        const fullErrorText = `${errorMessage} ${detailsText}`.toLowerCase();
        
        // Check if it's a MobileNig insufficient balance or service unavailable error
        // Check both the error message and details for insufficient balance indicators
        const errorDetailsObj = typeof errorDetails === 'object' ? errorDetails : {};
        const isInsufficientBalanceFlag = errorDetailsObj?.isInsufficientBalance === true;
        const isMobileNigServiceError = isInsufficientBalanceFlag ||
                                       fullErrorText.includes('insufficient wallet balance') ||
                                       fullErrorText.includes('insufficient balance') ||
                                       fullErrorText.includes('insufficient balance in mobilenig account') ||
                                       fullErrorText.includes('low wallet balance') ||
                                       (fullErrorText.includes('wallet balance') && fullErrorText.includes('insufficient')) ||
                                       (fullErrorText.includes('wallet balance') && fullErrorText.includes('low')) ||
                                       (fullErrorText.includes('transaction was cancelled by mobilenig') && fullErrorText.includes('insufficient')) ||
                                       (fullErrorText.includes('transaction not approved') && fullErrorText.includes('insufficient')) ||
                                       (errorMessage.toLowerCase().includes('status: unknown') && fullErrorText.includes('insufficient'));
        
        // Check if it's an invalid card error from the response
        const isInvalidCardError = errorMessage.toLowerCase().includes('invalid') || 
                                  errorMessage.toLowerCase().includes('card number') ||
                                  errorMessage.toLowerCase().includes('smart card') ||
                                  errorMessage.toLowerCase().includes('customer not found') ||
                                  errorMessage.toLowerCase().includes('not found') ||
                                  responseData?.details?.message?.toLowerCase().includes('invalid') ||
                                  responseData?.details?.message?.toLowerCase().includes('card');
        
        if (isMobileNigServiceError) {
          setShowTryAgainLaterModal(true);
          setIsProcessing(false);
          return;
        }
        
        if (isInvalidCardError) {
          setInvalidCardMessage('The smart card number you entered is incorrect. Please check the number and try again.');
          setShowInvalidCardModal(true);
          setIsProcessing(false);
          return;
        }
        
        throw new Error(errorMessage);
      }

      if (responseData?.success === false) {
        const errorMessage = responseData?.error || responseData?.message || 'Purchase failed';
        const errorDetails = responseData?.details || '';
        // Handle both string and object details
        const detailsText = typeof errorDetails === 'string' 
          ? errorDetails 
          : (errorDetails?.message || errorDetails?.reason || JSON.stringify(errorDetails) || '');
        const fullErrorText = `${errorMessage} ${detailsText}`.toLowerCase();
        
        // Check if it's a MobileNig insufficient balance or service unavailable error
        // Check both the error message and details for insufficient balance indicators
        const errorDetailsObj = typeof errorDetails === 'object' ? errorDetails : {};
        const isInsufficientBalanceFlag = errorDetailsObj?.isInsufficientBalance === true;
        const isMobileNigInsufficientBalance = isInsufficientBalanceFlag ||
                                             fullErrorText.includes('insufficient wallet balance') ||
                                             fullErrorText.includes('insufficient balance') ||
                                             fullErrorText.includes('insufficient balance in mobilenig account') ||
                                             fullErrorText.includes('low wallet balance') ||
                                             (fullErrorText.includes('wallet balance') && fullErrorText.includes('insufficient')) ||
                                             (fullErrorText.includes('wallet balance') && fullErrorText.includes('low')) ||
                                             (fullErrorText.includes('transaction was cancelled by mobilenig') && fullErrorText.includes('insufficient')) ||
                                             (fullErrorText.includes('transaction not approved') && fullErrorText.includes('insufficient')) ||
                                             (errorMessage.toLowerCase().includes('status: unknown') && fullErrorText.includes('insufficient'));
        
        // Check if it's an invalid card error
        const isInvalidCardError = errorMessage.toLowerCase().includes('invalid') || 
                                  errorMessage.toLowerCase().includes('card number') ||
                                  errorMessage.toLowerCase().includes('smart card') ||
                                  errorMessage.toLowerCase().includes('customer not found') ||
                                  errorMessage.toLowerCase().includes('not found') ||
                                  responseData?.details?.message?.toLowerCase().includes('invalid') ||
                                  responseData?.details?.message?.toLowerCase().includes('card');
        
        if (isMobileNigInsufficientBalance) {
          setShowTryAgainLaterModal(true);
          setIsProcessing(false);
          return;
        }
        
        if (isInvalidCardError) {
          setInvalidCardMessage('The smart card number you entered is incorrect. Please check the number and try again.');
          setShowInvalidCardModal(true);
          setIsProcessing(false);
          return;
        }
        
        throw new Error(errorMessage);
      }

      // Handle pending transactions
      if (responseData?.pending === true) {
        Alert.alert(
          'Transaction Processing',
          'Your cable TV subscription is being processed. You will be notified when completed.',
          [{ text: 'OK' }]
        );
        setIsProcessing(false);
        return;
      }

      // Success - navigate to success screen
      const reference = responseData?.data?.reference || '';
      
      router.push({
        pathname: '/payment-success',
        params: {
          amount: totalAmount.toString(), // Total amount including charge fee
          network: selectedProvider,
          recipient: smartCardNumber,
          serviceType: `Cable TV • ${selectedPlan.packageName}`,
          reference,
          chargeFee: chargeFee.toString(), // Include charge fee for display
        },
      });
    } catch (purchaseError: any) {
      console.error('Cable TV purchase failed:', purchaseError);
      setIsProcessing(false);
      
      let message = 'Unable to complete cable TV purchase. Please try again.';
      
      if (purchaseError instanceof Error) {
        message = purchaseError.message || message;
      }

      // Check for network errors
      const errorMessage = purchaseError?.message || String(purchaseError);
      const isNetworkError = errorMessage.includes('Network request failed') ||
                            errorMessage.includes('Failed to send a request to the Edge Function') ||
                            errorMessage.includes('Failed to fetch') ||
                            errorMessage.includes('ERR_INTERNET_DISCONNECTED') ||
                            errorMessage.includes('ERR_NETWORK_CHANGED') ||
                            errorMessage.includes('TypeError');

      // Check if it's a MobileNig insufficient balance error
      // Check both the error message and any details/responseData properties
      const errorDetails = purchaseError?.details || purchaseError?.responseData?.details || '';
      const errorDetailsObj = typeof errorDetails === 'object' ? errorDetails : {};
      const errorDetailsText = typeof errorDetails === 'string' 
        ? errorDetails 
        : (errorDetailsObj?.message || errorDetailsObj?.reason || JSON.stringify(errorDetails) || '');
      const fullErrorText = `${errorMessage} ${errorDetailsText}`.toLowerCase();
      const isInsufficientBalanceFlag = errorDetailsObj?.isInsufficientBalance === true;
      const isMobileNigInsufficientBalance = isInsufficientBalanceFlag ||
                                             fullErrorText.includes('insufficient wallet balance') ||
                                             fullErrorText.includes('insufficient balance') ||
                                             fullErrorText.includes('insufficient balance in mobilenig account') ||
                                             fullErrorText.includes('low wallet balance') ||
                                             (fullErrorText.includes('wallet balance') && fullErrorText.includes('insufficient')) ||
                                             (fullErrorText.includes('wallet balance') && fullErrorText.includes('low')) ||
                                             errorMessage.toLowerCase().includes('insufficient wallet balance') ||
                                             errorMessage.toLowerCase().includes('insufficient balance');
      
      // Check if it's an invalid card number error
      const isInvalidCard = errorMessage.toLowerCase().includes('invalid') || 
                           errorMessage.toLowerCase().includes('card number') ||
                           errorMessage.toLowerCase().includes('smart card') ||
                           errorMessage.toLowerCase().includes('customer not found') ||
                           errorMessage.toLowerCase().includes('not found') ||
                           errorMessage.toLowerCase().includes('wrong') ||
                           errorMessage.toLowerCase().includes('incorrect') ||
                           errorMessage.toLowerCase().includes('invalid card');

      if (isNetworkError) {
        Alert.alert(
          'Connection Error',
          'Network connection failed. Please check your internet connection and try again.',
          [{ text: 'OK' }]
        );
      } else if (isMobileNigInsufficientBalance) {
        // Show try again later modal for MobileNig insufficient balance
        setShowTryAgainLaterModal(true);
      } else if (isInvalidCard) {
        // Show invalid card modal
        setInvalidCardMessage('The smart card number you entered is incorrect. Please check the number and try again.');
        setShowInvalidCardModal(true);
      } else {
        Alert.alert('Purchase Failed', message, [{ text: 'OK' }]);
      }
    }
  };

  const getProviderLogo = (providerName: string | null) => {
    if (!providerName) return fallbackLogo;
    const match = providers.find((provider) => provider.name === providerName);
    return match?.logo || fallbackLogo;
  };

  const selectedProviderLogo = getProviderLogo(selectedProvider);

  return (
    <ThemedView style={styles.container}>
      <KeyboardAvoidingView
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
        style={styles.keyboardView}>
        <View style={styles.header}>
          <TouchableOpacity onPress={() => router.back()} style={styles.backButton}>
            <MaterialIcons name="arrow-back" size={24} color="#000" />
          </TouchableOpacity>
          <ThemedText style={styles.headerTitle}>Cable TV</ThemedText>
          <View style={styles.placeholder} />
        </View>

        {loading ? (
          <View style={styles.loaderContainer}>
            <NetpayLoadingAnimation message="Loading cable packages…" />
          </View>
        ) : (
          <ScrollView
            style={styles.scrollView}
            contentContainerStyle={styles.scrollContent}
            showsVerticalScrollIndicator
            bounces>
            <View style={styles.balanceCard}>
              <ThemedText style={styles.balanceLabel}>Available Balance</ThemedText>
              <View style={styles.balanceAmountContainer}>
                {balanceLoading ? (
                  <NetpayLoadingAnimation size={32} variant="onBrand" strokeWidth={2.5} />
                ) : (
                  <ThemedText style={styles.balanceAmount}>₦{availableBalance.toFixed(2)}</ThemedText>
                )}
              </View>
            </View>

            {fetchError ? (
              <View style={styles.errorBanner}>
                <MaterialIcons name="error-outline" size={20} color="#B3261E" />
                <ThemedText style={styles.errorText}>{fetchError}</ThemedText>
              </View>
            ) : null}

            {/* Demo Numbers Banner */}
            {isDemoUser && <DemoNumbersBanner type="cable" />}

            {/* Demo Smartcard Number Display - Prominent for Apple Reviewers */}
            {isDemoUser && (
              <View style={styles.demoSmartcardCard}>
                <View style={styles.demoSmartcardHeader}>
                  <MaterialIcons name="info" size={24} color="#FF7F00" />
                  <ThemedText style={styles.demoSmartcardTitle}>Test Smartcard Numbers for Apple Review</ThemedText>
                </View>
                <View style={styles.demoSmartcardBox}>
                  <ThemedText style={styles.demoSmartcardLabel}>Use these smartcard numbers:</ThemedText>
                  <View style={styles.demoSmartcardNumbersList}>
                    <View style={styles.demoSmartcardItem}>
                      <ThemedText style={styles.demoSmartcardProvider}>DStv:</ThemedText>
                      <View style={styles.demoSmartcardValueRow}>
                        <ThemedText style={styles.demoSmartcardValue}>1234567890</ThemedText>
                        <TouchableOpacity
                          style={styles.demoSmartcardCopyButton}
                          onPress={async () => {
                            await Clipboard.setStringAsync('1234567890');
                            Alert.alert('Copied!', 'DStv smartcard number copied');
                            setSmartCardNumber('1234567890');
                          }}
                          activeOpacity={0.7}>
                          <MaterialIcons name="content-copy" size={18} color="#FF7F00" />
                        </TouchableOpacity>
                      </View>
                    </View>
                    <View style={styles.demoSmartcardItem}>
                      <ThemedText style={styles.demoSmartcardProvider}>GOtv:</ThemedText>
                      <View style={styles.demoSmartcardValueRow}>
                        <ThemedText style={styles.demoSmartcardValue}>3456789012</ThemedText>
                        <TouchableOpacity
                          style={styles.demoSmartcardCopyButton}
                          onPress={async () => {
                            await Clipboard.setStringAsync('3456789012');
                            Alert.alert('Copied!', 'GOtv smartcard number copied');
                            setSmartCardNumber('3456789012');
                          }}
                          activeOpacity={0.7}>
                          <MaterialIcons name="content-copy" size={18} color="#FF7F00" />
                        </TouchableOpacity>
                      </View>
                    </View>
                    <View style={styles.demoSmartcardItem}>
                      <ThemedText style={styles.demoSmartcardProvider}>StarTimes:</ThemedText>
                      <View style={styles.demoSmartcardValueRow}>
                        <ThemedText style={styles.demoSmartcardValue}>5678901234</ThemedText>
                        <TouchableOpacity
                          style={styles.demoSmartcardCopyButton}
                          onPress={async () => {
                            await Clipboard.setStringAsync('5678901234');
                            Alert.alert('Copied!', 'StarTimes smartcard number copied');
                            setSmartCardNumber('5678901234');
                          }}
                          activeOpacity={0.7}>
                          <MaterialIcons name="content-copy" size={18} color="#FF7F00" />
                        </TouchableOpacity>
                      </View>
                    </View>
                  </View>
                  <ThemedText style={styles.demoSmartcardNote}>
                    Click copy next to any provider to auto-fill the smartcard number field.
                  </ThemedText>
                </View>
              </View>
            )}

            <View style={styles.section}>
              <View style={styles.sectionHeaderRow}>
                <ThemedText style={styles.sectionTitle}>Select Service Provider</ThemedText>
                <TouchableOpacity
                  onPress={fetchPackagesFromAPI}
                  disabled={refreshingPlans}
                >
                  {refreshingPlans ? (
                    <NetpayLoadingAnimation size={22} strokeWidth={2} />
                  ) : (
                    <MaterialIcons name="refresh" size={20} color="#666" />
                  )}
                </TouchableOpacity>
              </View>
              <View style={styles.networkContainer}>
                {providers.map((provider) => (
                  <TouchableOpacity
                    key={provider.name}
                    style={styles.networkItem}
                    onPress={() => setSelectedProvider(provider.name)}
                    activeOpacity={0.7}>
                    <View
                      style={[
                        styles.networkLogoContainer,
                        {
                          borderWidth: selectedProvider === provider.name ? 2.5 : 1,
                          borderColor: selectedProvider === provider.name ? '#FF7F00' : '#E0E0E0',
                        },
                      ]}>
                      <Image
                        source={provider.logo}
                        style={styles.networkLogoImage}
                        contentFit="contain"
                      />
                    </View>
                    <ThemedText style={styles.networkName}>{provider.name}</ThemedText>
                  </TouchableOpacity>
                ))}
              </View>
            </View>

            <View style={styles.section}>
              <ThemedText style={styles.inputLabel}>Smart Card Number</ThemedText>
              <View style={styles.inputRow}>
                <TextInput
                  style={styles.input}
                  placeholder="Enter smart card number"
                  placeholderTextColor="#999"
                  value={smartCardNumber}
                  onChangeText={setSmartCardNumber}
                  keyboardType="numeric"
                />
                {!isDemoUser && (
                  <TouchableOpacity style={styles.verifyButton} onPress={handleVerifySmartCard}>
                    {verifying ? (
                      <NetpayLoadingAnimation size={24} strokeWidth={2} />
                    ) : (
                      <ThemedText style={styles.verifyButtonText}>Verify</ThemedText>
                    )}
                  </TouchableOpacity>
                )}
              </View>
              {verifiedName ? (
                <View style={styles.verifiedBanner}>
                  <MaterialIcons name="check-circle" size={16} color="#4CAF50" />
                  <ThemedText style={styles.verifiedText}>{verifiedName}</ThemedText>
                </View>
              ) : null}
            </View>

            <View style={styles.section}>
              <View style={styles.inputLabelRow}>
                <ThemedText style={styles.inputLabel}>Select Package Plan</ThemedText>
                {refreshingPlans && (
                  <View style={styles.loadingIndicatorRow}>
                    <NetpayLoadingAnimation size={22} strokeWidth={2} />
                    <ThemedText style={styles.loadingText}>Loading packages...</ThemedText>
                  </View>
                )}
              </View>
              <Dropdown
                options={currentPlans.map((plan) => ({
                  id: plan.id,
                  name: plan.packageName,
                  amount: plan.price,
                }))}
                selectedId={packagePlan}
                onSelect={setPackagePlan}
                placeholder={
                  refreshingPlans 
                    ? 'Loading packages...' 
                    : currentPlans.length 
                    ? 'Select a package plan' 
                    : 'No plans available'
                }
                disabled={currentPlans.length === 0 || refreshingPlans}
              />
            </View>
          </ScrollView>
        )}

        <View style={styles.buttonContainer}>
          <TouchableOpacity style={styles.continueButton} onPress={handleContinue} disabled={loading || balanceLoading}>
            <ThemedText style={styles.continueButtonText}>Continue</ThemedText>
          </TouchableOpacity>
        </View>
      </KeyboardAvoidingView>

      {selectedProvider && selectedPlan && (
        <ConfirmPaymentModal
          visible={showConfirmModal}
          onClose={() => !isProcessing && setShowConfirmModal(false)}
          onConfirm={handleConfirmPayment}
          amount={selectedPlan.price}
          charges={chargeFee}
          network={selectedProvider}
          networkLogo={selectedProviderLogo}
          recipient={smartCardNumber}
          serviceType={`Cable TV • ${selectedPlan.packageName}`}
          {...({ disabled: isProcessing } as any)}
        />
      )}

      {/* Processing Overlay */}
      {isProcessing && (
        <Modal
          visible={isProcessing}
          transparent={true}
          animationType="fade"
        >
          <View style={styles.processingOverlay}>
            <View style={styles.processingContent}>
              <NetpayLoadingAnimation message="Processing purchase…" />
            </View>
          </View>
        </Modal>
      )}

      {/* Service Unavailable Modal */}
      <Modal
        visible={showServiceUnavailableModal}
        transparent={true}
        animationType="fade"
        onRequestClose={() => setShowServiceUnavailableModal(false)}
      >
        <View style={styles.modalOverlay}>
          <View style={styles.modalContent}>
            <View style={styles.modalIconContainer}>
              <MaterialIcons name="error-outline" size={64} color="#FF7F00" />
            </View>
            <ThemedText style={styles.modalTitle}>Services Unavailable</ThemedText>
            <ThemedText style={styles.modalMessage}>
              We&apos;re experiencing technical difficulties. Please try again later.
            </ThemedText>
            <TouchableOpacity
              style={styles.modalButton}
              onPress={() => setShowServiceUnavailableModal(false)}
              activeOpacity={0.8}
            >
              <ThemedText style={styles.modalButtonText}>Try Again</ThemedText>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>

      {/* Invalid Card Number Modal */}
      <Modal
        visible={showInvalidCardModal}
        transparent={true}
        animationType="fade"
        onRequestClose={() => {
          setShowInvalidCardModal(false);
          setSmartCardNumber('');
        }}
      >
        <View style={styles.modalOverlay}>
          <View style={styles.modalContent}>
            <View style={styles.modalIconContainer}>
              <MaterialIcons name="error-outline" size={64} color="#FF5252" />
            </View>
            <ThemedText style={styles.modalTitle}>Wrong Smart Card Number</ThemedText>
            <ThemedText style={styles.modalMessage}>
              {invalidCardMessage || 'The smart card number you entered is incorrect. Please check the number and try again.'}
            </ThemedText>
            <View style={styles.modalButtonContainer}>
              <TouchableOpacity
                style={[styles.modalButton, styles.modalButtonPrimary]}
                onPress={() => {
                  setShowInvalidCardModal(false);
                  setSmartCardNumber('');
                  setVerifiedName(null);
                }}
                activeOpacity={0.8}
              >
                <ThemedText style={styles.modalButtonText}>Try Again</ThemedText>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>

      {/* Try Again Later Modal - MobileNig Insufficient Balance */}
      <Modal
        visible={showTryAgainLaterModal}
        transparent={true}
        animationType="fade"
        onRequestClose={() => setShowTryAgainLaterModal(false)}
      >
        <View style={styles.modalOverlay}>
          <View style={styles.modalContent}>
            <View style={styles.modalIconContainer}>
              <MaterialIcons name="schedule" size={64} color="#FF7F00" />
            </View>
            <ThemedText style={styles.modalTitle}>Service Temporarily Unavailable</ThemedText>
            <ThemedText style={styles.modalMessage}>
              We&apos;re currently unable to process your cable TV purchase. Our service provider is experiencing temporary issues. Please try again later.
            </ThemedText>
            <View style={styles.modalButtonContainer}>
              <TouchableOpacity
                style={[styles.modalButton, styles.modalButtonPrimary]}
                onPress={() => setShowTryAgainLaterModal(false)}
                activeOpacity={0.8}
              >
                <ThemedText style={styles.modalButtonText}>OK</ThemedText>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>

      {/* Insufficient Balance Modal */}
      <InsufficientBalanceModal
        visible={showInsufficientBalance}
        onClose={() => setShowInsufficientBalance(false)}
        currentBalance={balance || 0}
        requiredAmount={selectedPlan?.price}
      />
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
  loaderContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    gap: 12,
  },
  loaderText: {
    fontSize: 14,
    color: '#666',
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
  sectionHeaderRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 16,
  },
  sectionTitle: {
    fontSize: 18,
    fontWeight: 'bold',
    color: '#000',
  },
  networkContainer: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginBottom: 8,
  },
  networkItem: {
    alignItems: 'center',
    flex: 1,
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
  },
  inputLabel: {
    fontSize: 16,
    fontWeight: '600',
    color: '#000',
    marginBottom: 8,
  },
  inputLabelRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 8,
  },
  loadingIndicatorRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  loadingText: {
    fontSize: 12,
    color: '#FF7F00',
    fontWeight: '500',
  },
  inputRow: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#F5F5F5',
    borderRadius: 8,
    paddingHorizontal: 12,
    borderWidth: 1,
    borderColor: '#E0E0E0',
    minHeight: 50,
  },
  input: {
    flex: 1,
    fontSize: 16,
    color: '#333',
    paddingVertical: 12,
  },
  verifyButton: {
    backgroundColor: '#E0E0E0',
    paddingHorizontal: 16,
    paddingVertical: 8,
    borderRadius: 8,
    marginLeft: 8,
    minHeight: 36,
    minWidth: 70,
    justifyContent: 'center',
    alignItems: 'center',
  },
  verifyButtonText: {
    fontSize: 14,
    fontWeight: '600',
    color: '#333',
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
  errorBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#FFE2E2',
    borderRadius: 12,
    padding: 12,
    gap: 8,
    marginHorizontal: 20,
    marginBottom: 20,
  },
  errorText: {
    fontSize: 14,
    color: '#8B1D1D',
    flex: 1,
  },
  verifiedBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    marginTop: 8,
    gap: 6,
  },
  verifiedText: {
    fontSize: 14,
    color: '#4CAF50',
    fontWeight: '600',
  },
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.5)',
    justifyContent: 'center',
    alignItems: 'center',
    padding: 20,
  },
  modalContent: {
    backgroundColor: '#fff',
    borderRadius: 20,
    padding: 24,
    width: '100%',
    maxWidth: 400,
    alignItems: 'center',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.3,
    shadowRadius: 8,
    elevation: 8,
  },
  modalIconContainer: {
    marginBottom: 16,
  },
  modalTitle: {
    fontSize: 22,
    fontWeight: 'bold',
    color: '#FF7F00',
    marginBottom: 12,
    textAlign: 'center',
  },
  modalMessage: {
    fontSize: 16,
    color: '#666',
    textAlign: 'center',
    marginBottom: 24,
    lineHeight: 22,
  },
  modalButtonContainer: {
    width: '100%',
    marginTop: 8,
  },
  modalButton: {
    backgroundColor: '#F5F5F5',
    borderRadius: 12,
    paddingVertical: 14,
    paddingHorizontal: 32,
    width: '100%',
    alignItems: 'center',
  },
  modalButtonPrimary: {
    backgroundColor: '#FF7F00',
  },
  modalButtonText: {
    color: '#fff',
    fontSize: 16,
    fontWeight: '600',
  },
  demoSmartcardCard: {
    backgroundColor: '#FFF8E1',
    borderRadius: 16,
    marginHorizontal: 16,
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
  demoSmartcardHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginBottom: 12,
  },
  demoSmartcardTitle: {
    fontSize: 16,
    fontWeight: '700',
    color: '#E65100',
    flex: 1,
  },
  demoSmartcardBox: {
    backgroundColor: '#FFFFFF',
    borderRadius: 12,
    padding: 16,
    borderWidth: 1,
    borderColor: '#FFE082',
  },
  demoSmartcardLabel: {
    fontSize: 14,
    fontWeight: '600',
    color: '#666',
    marginBottom: 12,
  },
  demoSmartcardNumbersList: {
    gap: 12,
    marginBottom: 8,
  },
  demoSmartcardItem: {
    gap: 6,
  },
  demoSmartcardProvider: {
    fontSize: 13,
    fontWeight: '600',
    color: '#E65100',
    marginBottom: 4,
  },
  demoSmartcardValueRow: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#F5F5F5',
    borderRadius: 8,
    padding: 12,
    gap: 12,
  },
  demoSmartcardValue: {
    fontSize: 18,
    fontWeight: '700',
    color: '#000',
    fontFamily: 'monospace',
    flex: 1,
    letterSpacing: 1,
  },
  demoSmartcardCopyButton: {
    padding: 6,
    borderRadius: 6,
    backgroundColor: '#FFF8E1',
  },
  demoSmartcardNote: {
    fontSize: 12,
    color: '#666',
    fontStyle: 'italic',
    lineHeight: 16,
    marginTop: 4,
  },
  processingOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.5)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  processingContent: {
    backgroundColor: '#fff',
    borderRadius: 12,
    padding: 24,
    alignItems: 'center',
    minWidth: 200,
  },
  processingText: {
    marginTop: 16,
    fontSize: 16,
    color: '#333',
    textAlign: 'center',
  },
});

