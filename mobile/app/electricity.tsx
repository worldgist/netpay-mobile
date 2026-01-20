import { useEffect, useMemo, useState, useRef, useCallback } from 'react';
import { StyleSheet, View, TextInput, TouchableOpacity, ScrollView, KeyboardAvoidingView, Platform, Alert, ActivityIndicator, Modal } from 'react-native';
import { ThemedView } from '@/components/themed-view';
import { ThemedText } from '@/components/themed-text';
import { MaterialIcons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import { Image } from 'expo-image';
import { ConfirmPaymentModal } from '@/components/confirm-payment-modal';
import { Dropdown } from '@/components/dropdown';
import { DemoNumbersBanner } from '@/components/demo-numbers-banner';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { supabase } from '@/lib/supabase';
import { useFocusEffect } from '@react-navigation/native';
import { validateNigerianPhoneNumber } from '@/utils/phone';
import * as Clipboard from 'expo-clipboard';

type ElectricityProvider = {
  id: string;
  name: string;
  logo: any;
  meterTypes: ('prepaid' | 'postpaid')[];
  serviceIds: {
    prepaid: string;
    postpaid: string;
  };
};

const FALLBACK_PROVIDERS: ElectricityProvider[] = [
  {
    id: 'IKEJA',
    name: 'Ikeja Electricity',
    logo: require('@/assets/images/IKEDC.png'),
    meterTypes: ['prepaid', 'postpaid'],
    serviceIds: { prepaid: 'AMA', postpaid: 'AMB' },
  },
  {
    id: 'EKO',
    name: 'Eko Electricity',
    logo: require('@/assets/images/EKEDC.png'),
    meterTypes: ['prepaid', 'postpaid'],
    serviceIds: { prepaid: 'ANA', postpaid: 'ANB' },
  },
  {
    id: 'ABUJA',
    name: 'Abuja Electricity',
    logo: require('@/assets/images/AEDC.png'),
    meterTypes: ['prepaid', 'postpaid'],
    serviceIds: { prepaid: 'AHB', postpaid: 'AHA' },
  },
  {
    id: 'KADUNA',
    name: 'Kaduna Electricity',
    logo: require('@/assets/images/KAEDCO.png'),
    meterTypes: ['prepaid', 'postpaid'],
    serviceIds: { prepaid: 'AGB', postpaid: 'AGA' },
  },
  {
    id: 'IBADAN',
    name: 'Ibadan Electricity',
    logo: require('@/assets/images/IBEDC.png'),
    meterTypes: ['prepaid', 'postpaid'],
    serviceIds: { prepaid: 'AEA', postpaid: 'AEB' },
  },
  {
    id: 'KANO',
    name: 'Kano Electricity Distribution',
    logo: require('@/assets/images/KEDCO.png'),
    meterTypes: ['prepaid', 'postpaid'],
    serviceIds: { prepaid: 'AFA', postpaid: 'AFB' },
  },
  {
    id: 'PORTHARCOURT',
    name: 'Port-Harcourt Electricity',
    logo: require('@/assets/images/PHEDC.png'),
    meterTypes: ['prepaid', 'postpaid'],
    serviceIds: { prepaid: 'ADB', postpaid: 'ADA' },
  },
  {
    id: 'JOS',
    name: 'Jos Electricity',
    logo: require('@/assets/images/JED.png'),
    meterTypes: ['prepaid', 'postpaid'],
    serviceIds: { prepaid: 'ACB', postpaid: 'ACA' },
  },
  {
    id: 'BENIN',
    name: 'Benin Electricity',
    logo: require('@/assets/images/BEDC.png'),
    meterTypes: ['prepaid', 'postpaid'],
    serviceIds: { prepaid: 'AAB', postpaid: 'AAA' },
  },
  {
    id: 'YOLA',
    name: 'Yola Electricity',
    logo: require('@/assets/images/YEDC.png'),
    meterTypes: ['prepaid', 'postpaid'],
    serviceIds: { prepaid: 'ALA', postpaid: 'ALB' },
  },
];

type ElectricityPlan = {
  id: string;
  provider: string;
  meterType: 'prepaid' | 'postpaid';
  minAmount: number;
  maxAmount: number | null;
};

const FALLBACK_PLANS: ElectricityPlan[] = FALLBACK_PROVIDERS.flatMap((provider) => [
  {
    id: `${provider.id}-PREPAID`,
    provider: provider.id,
    meterType: 'prepaid',
    minAmount: 1000,
    maxAmount: null,
  },
  {
    id: `${provider.id}-POSTPAID`,
    provider: provider.id,
    meterType: 'postpaid',
    minAmount: 2000,
    maxAmount: null,
  },
]);

export default function ElectricityScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const [providers] = useState<ElectricityProvider[]>(FALLBACK_PROVIDERS);
  const [plans] = useState<ElectricityPlan[]>(FALLBACK_PLANS);
  const [selectedProvider, setSelectedProvider] = useState<string | null>(FALLBACK_PROVIDERS[0]?.id || null);
  const [vendingProvider, setVendingProvider] = useState<'vtpass' | 'mobilenig' | 'smeplug'>('vtpass');
  const [meterType, setMeterType] = useState<'prepaid' | 'postpaid' | ''>('');
  const [meterNumber, setMeterNumber] = useState('');
  const [amount, setAmount] = useState('');
  const [phoneNumber, setPhoneNumber] = useState('');
  const [showConfirmModal, setShowConfirmModal] = useState(false);
  const [verificationLoading, setVerificationLoading] = useState(false);
  const [verifiedName, setVerifiedName] = useState<string | null>(null);
  const [verifiedAddress, setVerifiedAddress] = useState<string | null>(null);
  const [meterInfo, setMeterInfo] = useState<any>(null);
  const [token, setToken] = useState<string | null>(null);
  const [transactionReference, setTransactionReference] = useState<string | null>(null);
  const [transactionStatus, setTransactionStatus] = useState<string | null>(null);
  const [providerFilter, setProviderFilter] = useState('all');
  const [balance, setBalance] = useState<number>(0);
  const [isDemoUser, setIsDemoUser] = useState(false);
  const [balanceLoading, setBalanceLoading] = useState<boolean>(true);
  const [verificationError, setVerificationError] = useState<string | null>(null);
  const [showVerificationErrorModal, setShowVerificationErrorModal] = useState(false);
  const [invalidMeterMessage, setInvalidMeterMessage] = useState<string | null>(null);
  const [showInvalidMeterModal, setShowInvalidMeterModal] = useState(false);
  const [insufficientFundsMessage, setInsufficientFundsMessage] = useState<string | null>(null);
  const [showInsufficientFundsModal, setShowInsufficientFundsModal] = useState(false);
  const isMounted = useRef(true);

  useEffect(() => {
    isMounted.current = true;
    return () => {
      isMounted.current = false;
    };
  }, []);

  const fetchBalance = useCallback(async () => {
    try {
      if (isMounted.current) {
        setBalanceLoading(true);
      }

      const { data: sessionData, error: sessionError } = await supabase.auth.getSession();
      if (sessionError) throw sessionError;

      const session = sessionData.session;
      if (!session) {
        if (isMounted.current) {
          setBalance(0);
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
        .maybeSingle();

      if (profileError && profileError.code !== 'PGRST116') {
        throw profileError;
      }

      if (isMounted.current) {
        setBalance(Number(profile?.balance) || 0);
      }
    } catch (error) {
      console.error('Failed to load wallet balance:', error);
      if (isMounted.current) {
        setBalance(0);
      }
    } finally {
      if (isMounted.current) {
        setBalanceLoading(false);
      }
    }
  }, [router]);

  useFocusEffect(
    useCallback(() => {
      fetchBalance();
      // fetchElectricityProvider is defined later, so we call it directly
      const fetchProvider = async () => {
        // Provider fetching logic will be called here
      };
      fetchProvider();
    }, [fetchBalance])
  );

  const fetchElectricityProvider = useCallback(async () => {
    try {
      const { data, error } = await supabase
        .from('app_settings')
        .select('setting_value')
        .eq('setting_key', 'electricity_provider')
        .maybeSingle();

      if (error) {
        console.error('Error fetching electricity provider setting:', error);
        setVendingProvider('vtpass');
        return;
      }

      if (data?.setting_value) {
        const provider = (data.setting_value as any)?.provider || 'vtpass';
        const validProviders = ['vtpass', 'mobilenig', 'smeplug'];
        const selectedProvider = validProviders.includes(provider) ? provider as 'vtpass' | 'mobilenig' | 'smeplug' : 'vtpass';
        setVendingProvider(selectedProvider);
      }
    } catch (error) {
      console.error('Error fetching electricity provider setting:', error);
      setVendingProvider('vtpass');
    }
  }, []);

  useEffect(() => {
    if (providers.length) {
      setMeterType(providers[0].meterTypes[0] || 'prepaid');
    }
  }, [providers]);

  useEffect(() => {
    if (!selectedProvider) return;
    setPackageConstraints();
    const provider = providers.find((p) => p.id === selectedProvider);
    if (provider && provider.meterTypes.length) {
      const currentMeterType = meterType === '' ? null : meterType;
      const validMeterType = currentMeterType && provider.meterTypes.includes(currentMeterType as 'prepaid' | 'postpaid') 
        ? currentMeterType as 'prepaid' | 'postpaid'
        : provider.meterTypes[0];
      setMeterType(validMeterType);
    }
  }, [selectedProvider]);

  const setPackageConstraints = () => {
    setToken(null);
    setVerifiedName(null);
    setVerifiedAddress(null);
    setMeterInfo(null);
  };

  const handleVerifyMeter = async () => {
    if (!selectedProvider) {
      Alert.alert('Error', 'Please select an electricity provider first');
      return;
    }
    if (!meterType) {
      Alert.alert('Error', 'Please select whether this is a prepaid or postpaid meter.');
      return;
    }
    if (!meterNumber.trim() || meterNumber.length < 10) {
      Alert.alert('Error', 'Please enter a valid meter number');
      return;
    }

    try {
      setVerificationLoading(true);
      setToken(null);
      setVerifiedName(null);
      setVerifiedAddress(null);
      setVerificationError(null);
      setShowVerificationErrorModal(false);
      setMeterInfo(null);

      // Get and refresh session to ensure we have a valid token
      const { data: { session }, error: sessionError } = await supabase.auth.getSession();
      
      if (sessionError || !session) {
        throw new Error('Please sign in to continue');
      }
      
      // Refresh session to ensure token is not expired
      const { data: { session: refreshedSession }, error: refreshError } = await supabase.auth.refreshSession();
      
      if (refreshError || !refreshedSession) {
        // If refresh fails, try using the original session
        console.log('Session refresh failed, using original session:', refreshError);
      }

      let responseData: any = null;
      
      // Use refreshed session if available, otherwise use original
      const activeSession = refreshedSession || session;

      // Try supabase.functions.invoke first
      try {
        const { data, error } = await supabase.functions.invoke('validate-meter-number', {
          body: {
            meter_number: meterNumber.trim(),
            provider: selectedProvider,
            meter_type: meterType,
            vending_provider: vendingProvider,
          },
        });

        if (error) {
          console.error('Supabase invoke error for meter validation:', error);
          // Check if it's an authentication error
          if (error.message?.includes('Unauthorized') || 
              error.message?.includes('unauthorized') ||
              error.message?.includes('Session expired') ||
              error?.status === 401) {
            throw new Error('Session expired. Please sign in again.');
          }
          throw error;
        }

        if (data) {
          console.log('Meter validation invoke response:', {
            success: data?.success,
            error: data?.error,
            hasData: !!data?.data
          });
          responseData = data;
        } else {
          throw new Error('No response data from server');
        }
      } catch (invokeError: any) {
        console.log('Supabase invoke failed, trying direct fetch:', invokeError);

        // Refresh session before direct fetch to ensure we have a valid token
        const { data: { session: fallbackSession }, error: fallbackError } = await supabase.auth.getSession();
        
        if (fallbackError || !fallbackSession) {
          throw new Error('Please sign in to continue');
        }
        
        // Try to refresh the session to get a fresh token
        const { data: { session: refreshedFallbackSession }, error: refreshFallbackError } = await supabase.auth.refreshSession();
        const activeFallbackSession = refreshedFallbackSession || fallbackSession;
        
        if (!activeFallbackSession) {
          throw new Error('Please sign in to continue');
        }

        // Fallback to direct fetch
        const supabaseUrl = process.env.EXPO_PUBLIC_SUPABASE_URL || 
                           (supabase as any).supabaseUrl ||
                           'https://rekkdwpkzkhgnejgzhac.supabase.co';

        const response = await fetch(`${supabaseUrl}/functions/v1/validate-meter-number`, {
          method: 'POST',
          headers: {
            'Authorization': `Bearer ${activeFallbackSession.access_token}`,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            meter_number: meterNumber.trim(),
            provider: selectedProvider,
            meter_type: meterType,
            vending_provider: vendingProvider,
          }),
        });

        const responseText = await response.text();
        
        if (!responseText || responseText.trim().length === 0) {
          console.error('Empty response from validate-meter-number');
          throw new Error('No response from server. Please try again.');
        }
        
        try {
          responseData = JSON.parse(responseText);
        } catch (parseError) {
          console.error('Failed to parse validation response:', parseError, 'Response:', responseText);
          if (response.status >= 500) {
            throw new Error('Server error. Please try again later.');
          }
          throw new Error(`Invalid response from server: ${responseText.substring(0, 200)}`);
        }

        // Check for success in response data first (even if HTTP status is not 200)
        if (responseData?.success === false || (!responseData?.success && response.status !== 200)) {
          const errorMsg = responseData?.error || responseData?.message || 'Meter validation failed';
          console.error('Meter validation error:', {
            status: response.status,
            error: errorMsg,
            responseData
          });
          throw new Error(errorMsg);
        }
        
        // Also check HTTP status for 401/403 errors
        if (response.status === 401 || response.status === 403) {
          throw new Error('Session expired. Please sign in again.');
        }
        
        if (!response.ok && response.status >= 500) {
          throw new Error('Server error. Please try again later.');
        }
      }

      if (!responseData) {
        throw new Error('No data received from server');
      }

      console.log('Meter validation response:', responseData);

      if (responseData?.success) {
        setVerifiedName(responseData.data?.customer_name || 'Customer');
        setVerifiedAddress(responseData.data?.address || '');
        setMeterInfo(responseData.data || null);
        setToken(responseData.data?.token || null);
        Alert.alert('Verified', 'Meter details confirmed.');
      } else {
        // Extract error message from various possible locations
        const failedMessage = 
          responseData?.error || 
          responseData?.details?.details ||
          responseData?.details?.message ||
          responseData?.message || 
          'Meter not found.';
        
        // Check status code for EXC010 (data not found)
        const statusCode = responseData?.details?.statusCode || responseData?.statusCode;
        const isEXC010 = statusCode === 'EXC010';
        
        // Check errorType from response (set by backend function)
        const errorType = responseData?.errorType;
        
        // Check if it's an invalid meter number error
        const isInvalidMeter = 
          errorType === 'invalid_meter' ||
          isEXC010 ||
          failedMessage.toLowerCase().includes('invalid') ||
          failedMessage.toLowerCase().includes('meter number') ||
          failedMessage.toLowerCase().includes('meter not found') ||
          failedMessage.toLowerCase().includes('customer not found') ||
          failedMessage.toLowerCase().includes('cannot be found') ||
          failedMessage.toLowerCase().includes('not found') ||
          failedMessage.toLowerCase().includes('wrong') ||
          failedMessage.toLowerCase().includes('incorrect') ||
          failedMessage.toLowerCase().includes('data you are looking for');
        
        if (isInvalidMeter) {
          setInvalidMeterMessage('Wrong meter number. Please check the meter number and try again.');
          setShowInvalidMeterModal(true);
        } else {
          setVerificationError(failedMessage);
          setShowVerificationErrorModal(true);
        }
      }
    } catch (error: any) {
      console.error('Meter verification failed:', error);
      
      let message = 'Unable to verify meter at the moment.';
      
      // Handle session/auth errors
      if (error.message?.includes('Session expired') ||
          error.message?.includes('Please sign in') ||
          error.message?.includes('Unauthorized') ||
          error.message?.toLowerCase().includes('unauthorized')) {
        message = 'Your session has expired. Please sign in again.';
        setVerificationError(message);
        setShowVerificationErrorModal(true);
        setVerifiedAddress(null);
        setMeterInfo(null);
        setVerificationLoading(false);
        // Optionally redirect to login
        setTimeout(() => {
          router.replace('/auth/login');
        }, 2000);
        return;
      }
      
      // Handle network/connection errors
      if (error.name === 'FunctionsFetchError' || 
          error.message?.includes('edge function') ||
          error.message?.includes('Edge Function') ||
          error.message?.includes('Failed to fetch') ||
          error.message?.includes('Network request failed') ||
          error.message?.includes('NetworkError') ||
          error.message?.includes('timeout') ||
          error.message?.includes('timed out') ||
          error.message?.includes('Connection error')) {
        message = 'Connection error. Please check your internet connection and try again.';
        setVerificationError(message);
        setShowVerificationErrorModal(true);
        setVerifiedAddress(null);
        setMeterInfo(null);
        setVerificationLoading(false);
        return;
      }
      
      // Handle other errors
      if (error instanceof Error) {
        message = error.message;
      } else if (error?.message) {
        message = error.message;
      }
      
      // Check if error indicates invalid meter number
      const errorMessage = message.toLowerCase();
      const errorDetails = error?.details || {};
      const detailsText = typeof errorDetails === 'string' 
        ? errorDetails 
        : (errorDetails?.message || errorDetails?.error || JSON.stringify(errorDetails) || '');
      const fullErrorText = `${errorMessage} ${detailsText}`.toLowerCase();
      
      const isInvalidMeter = 
        fullErrorText.includes('invalid meter') ||
        fullErrorText.includes('invalid meter number') ||
        fullErrorText.includes('invalid customer') ||
        fullErrorText.includes('invalid customer_id') ||
        fullErrorText.includes('meter number') ||
        fullErrorText.includes('meter not found') ||
        fullErrorText.includes('customer not found') ||
        fullErrorText.includes('cannot be found') ||
        fullErrorText.includes('data you are looking for') ||
        fullErrorText.includes('not found') ||
        fullErrorText.includes('wrong meter') ||
        fullErrorText.includes('incorrect meter') ||
        errorDetails?.code === 'invalid_customer_id' ||
        errorDetails?.errorCode === 'invalid_customer_id' ||
        error?.code === 'invalid_customer_id' ||
        error?.errorCode === 'invalid_customer_id';
      
      if (isInvalidMeter) {
        setInvalidMeterMessage('Wrong meter number. Please check the meter number and try again.');
        setShowInvalidMeterModal(true);
      } else {
        setVerificationError(message);
        setShowVerificationErrorModal(true);
      }
      setVerifiedAddress(null);
      setMeterInfo(null);
    } finally {
      setVerificationLoading(false);
    }
  };

  const handleContinue = async () => {
    if (!selectedProvider) {
      Alert.alert('Error', 'Please select an electricity provider');
      return;
    }
    const selectedProviderObj = providers.find(p => p.id === selectedProvider);
    if (!selectedProviderObj) {
      Alert.alert('Error', 'Please select a valid electricity provider');
      return;
    }
    if (!meterType) {
      Alert.alert('Error', 'Please choose prepaid or postpaid.');
      return;
    }
    if (!meterNumber.trim() || meterNumber.length < 10) {
      Alert.alert('Error', 'Please enter a valid meter number');
      return;
    }
    
    // Require meter verification before purchase (except for demo users)
    if (!isDemoUser && !meterInfo && !verifiedName) {
      Alert.alert(
        'Verify Meter Number',
        'Please verify your meter number before proceeding with the purchase.',
        [
          {
            text: 'Verify Now',
            onPress: () => handleVerifyMeter(),
          },
          {
            text: 'Cancel',
            style: 'cancel',
          },
        ]
      );
      return;
    }
    
    // For demo users, skip phone validation (meter number will be used as phone)
    if (!isDemoUser) {
      const phoneValidation = validateNigerianPhoneNumber(phoneNumber);
      if (!phoneValidation.isMatch || phoneValidation.message) {
        Alert.alert('Invalid Phone Number', phoneValidation.message || 'Please enter a valid phone number');
        return;
      }
      const normalizedPhone = phoneValidation.normalized;
      if (normalizedPhone !== phoneNumber) {
        setPhoneNumber(normalizedPhone);
      }
    }
    const purchaseAmount = parseFloat(amount);
    if (isNaN(purchaseAmount) || purchaseAmount <= 0) {
      Alert.alert('Error', 'Please enter a valid amount');
      return;
    }
    if (balanceLoading) {
      Alert.alert('Balance Loading', 'Please wait while we retrieve your wallet balance.');
      return;
    }
    if (planLimits) {
      if (purchaseAmount < planLimits.minAmount) {
        Alert.alert('Error', `Minimum amount for ${meterType.toUpperCase()} is ₦${planLimits.minAmount.toLocaleString()}`);
        return;
      }
      if (planLimits.maxAmount && purchaseAmount > planLimits.maxAmount) {
        Alert.alert('Error', `Maximum amount for ${meterType.toUpperCase()} is ₦${planLimits.maxAmount.toLocaleString()}`);
        return;
      }
    }
    // Calculate charge fee (10% for electricity)
    const CHARGE_FEE_RATE = 0.1;
    const chargeFee = Math.round(purchaseAmount * CHARGE_FEE_RATE * 100) / 100;
    const totalAmount = purchaseAmount + chargeFee;

    if (totalAmount > balance) {
      const formattedBalance = `₦${Number(balance).toLocaleString('en-NG', {
        minimumFractionDigits: 2,
        maximumFractionDigits: 2,
      })}`;
      setInsufficientFundsMessage(`Your wallet balance is ${formattedBalance}. Please fund your wallet to continue.`);
      setShowInsufficientFundsModal(true);
      return;
    }

    // Show confirmation modal
    setShowConfirmModal(true);
  };

  const handleConfirmPayment = useCallback(async () => {
    if (!selectedProvider) return;

    const purchaseAmount = parseFloat(amount);
    if (!Number.isFinite(purchaseAmount) || purchaseAmount <= 0) {
      Alert.alert('Electricity Purchase', 'Amount is required.');
      return;
    }

    // Require meter verification before purchase (except for demo users)
    if (!isDemoUser && !meterInfo && !verifiedName) {
      Alert.alert(
        'Meter Not Verified',
        'Please verify your meter number before making a purchase. This ensures the meter number is correct.',
        [
          {
            text: 'Verify Now',
            onPress: () => {
              setShowConfirmModal(false);
              handleVerifyMeter();
            },
          },
          {
            text: 'Cancel',
            style: 'cancel',
            onPress: () => setShowConfirmModal(false),
          },
        ]
      );
      return;
    }

    const sanitizedMeter = meterNumber.trim();
    // For demo users, use meter number as phone number (single number for testing)
    const sanitizedPhone = isDemoUser 
      ? sanitizedMeter 
      : phoneNumber.replace(/\s+/g, '').trim();
    const providerEntry = providers.find((p) => p.id === selectedProvider);
    const providerName = providerEntry?.name || selectedProvider;

    try {
      const { data: { session } } = await supabase.auth.getSession();
      
      if (!session) {
        throw new Error('Please sign in to continue');
      }

      let responseData: any = null;

      // Use the unified purchase-electricity endpoint which routes based on admin settings
      try {
        const { data, error } = await supabase.functions.invoke('purchase-electricity', {
          body: {
            meter_number: sanitizedMeter,
            provider: selectedProvider,
            meter_type: meterType,
            amount: purchaseAmount,
            customer_name: verifiedName || undefined,
            customer_address: verifiedAddress || undefined,
            minimum_vend: meterInfo?.minimum_vend || undefined,
          },
        });

        if (error) {
          console.error('Supabase invoke error:', error);
          // Check if it's a network error before throwing
          const errorMsg = error?.message || String(error);
          const errorStack = error?.stack || '';
          const isNetworkErr = errorMsg.includes('Network request failed') ||
                              errorMsg.includes('Failed to fetch') ||
                              errorStack.includes('fetch.umd.js') ||
                              errorStack.includes('Network request failed');
          if (isNetworkErr) {
            throw new Error('Network connection failed. Please check your internet connection and try again.');
          }
          throw error;
        }

        if (data) {
          // Handle case where data might be a stringified JSON (Supabase usually returns parsed object)
          let parsedData = data;
          if (typeof data === 'string') {
            try {
              parsedData = JSON.parse(data);
              console.log('Parsed stringified response data');
            } catch (parseError) {
              console.error('Failed to parse stringified data:', parseError);
              // If parsing fails, try to extract error from string
              // Don't hardcode LOW WALLET BALANCE - let the replacement logic handle it
              if (data.includes('error')) {
                // Extract error message from string or use generic message
                const errorMatch = data.match(/"error"\s*:\s*"([^"]+)"/);
                const extractedError = errorMatch ? errorMatch[1] : 'Purchase failed';
                parsedData = { success: false, error: extractedError };
              } else {
                throw new Error('Invalid response format from server');
              }
            }
          }
          
          console.log('Supabase invoke success, response data:', {
            success: parsedData?.success,
            error: parsedData?.error,
            message: parsedData?.message,
            hasData: !!parsedData?.data,
            dataType: typeof data,
            parsedDataType: typeof parsedData,
            fullData: parsedData
          });
          
          // If response has success: false or error, handle it as error (simplified like other purchases)
          if (parsedData?.success === false || parsedData?.error) {
            // Use the error message from the backend (it already handles error code 018 appropriately)
            const errorMsg = parsedData?.error || parsedData?.message || parsedData?.details?.error || 'Purchase failed';
            // Create error object to preserve details
            const error = new Error(errorMsg);
            (error as any).details = parsedData?.details;
            (error as any).errorCode = parsedData?.details?.code;
            throw error;
          }
          
          responseData = parsedData;
        } else {
          console.warn('Supabase invoke returned no data');
          throw new Error('No response data from server');
        }
      } catch (invokeError: any) {
        console.log('Supabase invoke failed, trying direct fetch:', invokeError);
        
        // Check if it's a network error
        const errorMessage = invokeError?.message || String(invokeError);
        const errorStack = invokeError?.stack || '';
        const isNetworkError = errorMessage.includes('Network request failed') ||
                              errorMessage.includes('Failed to fetch') ||
                              errorMessage.includes('ERR_INTERNET_DISCONNECTED') ||
                              errorMessage.includes('ERR_NETWORK_CHANGED') ||
                              errorMessage.includes('TypeError') ||
                              errorStack.includes('fetch.umd.js') ||
                              errorStack.includes('Network request failed') ||
                              invokeError?.name === 'TypeError';
        
        if (isNetworkError) {
          throw new Error('Network connection failed. Please check your internet connection and try again.');
        }

        // Refresh session before direct fetch to ensure we have a valid token
        const { data: { session: refreshedSession }, error: refreshError } = await supabase.auth.getSession();
        
        if (refreshError || !refreshedSession) {
          throw new Error('Please sign in to continue');
        }

        // Fallback to direct fetch
        const supabaseUrl = process.env.EXPO_PUBLIC_SUPABASE_URL || 
                           (supabase as any).supabaseUrl ||
                           'https://rekkdwpkzkhgnejgzhac.supabase.co';

        try {
        const response = await fetch(`${supabaseUrl}/functions/v1/purchase-electricity`, {
          method: 'POST',
          headers: {
            'Authorization': `Bearer ${refreshedSession.access_token}`,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            meter_number: sanitizedMeter,
            provider: selectedProvider,
            meter_type: meterType,
            amount: purchaseAmount,
            customer_name: verifiedName || undefined,
            customer_address: verifiedAddress || undefined,
            minimum_vend: meterInfo?.minimum_vend || undefined,
          }),
        });

        const responseText = await response.text();
        
        console.log('Electricity purchase raw response:', {
          status: response.status,
          statusText: response.statusText,
          responseLength: responseText?.length,
          responsePreview: responseText?.substring(0, 500)
        });
        
        if (!responseText || responseText.trim().length === 0) {
          console.error('Empty response from purchase-electricity');
          throw new Error('No response from server. Please try again.');
        }
        
        try {
          responseData = JSON.parse(responseText);
          console.log('Electricity purchase parsed response:', {
            success: responseData?.success,
            error: responseData?.error,
            message: responseData?.message,
            details: responseData?.details
          });
        } catch (parseError) {
          console.error('Failed to parse purchase response:', parseError, 'Response:', responseText);
          if (response.status >= 500) {
            throw new Error('Server error. Please try again later.');
          }
          throw new Error(`Invalid response from server: ${responseText.substring(0, 200)}`);
        }

        // Handle HTTP errors (non-200 status codes)
        if (!response.ok) {
          // Handle 401 Unauthorized specifically
          if (response.status === 401) {
            throw new Error('Session expired. Please sign in again.');
          }
          const errorMsg = responseData?.error || responseData?.message || `HTTP ${response.status}: ${response.statusText}`;
          const errorDetails = responseData?.details || {};
          
          // Check if it's a duplicate order error (409 status code)
          const isDuplicateOrder = 
            response.status === 409 ||
            errorMsg.toLowerCase().includes('duplicate order') ||
            errorMsg.toLowerCase().includes('duplicate_order') ||
            errorDetails?.code === 'duplicate_order' ||
            responseData?.code === 'duplicate_order';
          
          if (isDuplicateOrder) {
            const error = new Error(errorMsg);
            (error as any).code = 'duplicate_order';
            (error as any).details = errorDetails;
            throw error;
          }
          
          // Check if it's an invalid meter error
          const detailsText = typeof errorDetails === 'string' 
            ? errorDetails 
            : (errorDetails?.message || errorDetails?.error || errorDetails?.response_description || JSON.stringify(errorDetails) || '');
          const fullErrorText = `${errorMsg} ${detailsText}`.toLowerCase();
          
          const isInvalidMeter = 
            fullErrorText.includes('invalid meter') ||
            fullErrorText.includes('invalid meter number') ||
            fullErrorText.includes('meter number') ||
            fullErrorText.includes('meter not found') ||
            fullErrorText.includes('customer not found') ||
            fullErrorText.includes('invalid customer') ||
            fullErrorText.includes('invalid customer_id') ||
            fullErrorText.includes('wrong meter') ||
            fullErrorText.includes('incorrect meter') ||
            fullErrorText.includes('cannot be found') ||
            fullErrorText.includes('data you are looking for') ||
            errorDetails?.code === '018' ||
            errorDetails?.code === 'invalid_customer_id' ||
            errorDetails?.errorCode === '018' ||
            errorDetails?.errorCode === 'invalid_customer_id' ||
            responseData?.details?.code === 'invalid_customer_id' ||
            responseData?.errorCode === 'invalid_customer_id';
          
          if (isInvalidMeter) {
            const error = new Error(errorMsg);
            (error as any).details = errorDetails;
            (error as any).errorCode = errorDetails?.code || errorDetails?.errorCode || '018';
            throw error;
          }
          
          throw new Error(errorMsg);
        }
        
        // If HTTP is OK but response indicates failure, we'll handle it in the success check below
        } catch (fetchError: any) {
          // Handle network errors in fetch fallback
          const fetchErrorMessage = fetchError?.message || String(fetchError);
          const fetchErrorStack = fetchError?.stack || '';
          const isFetchNetworkError = fetchErrorMessage.includes('Network request failed') ||
                                    fetchErrorMessage.includes('Failed to fetch') ||
                                    fetchErrorMessage.includes('ERR_INTERNET_DISCONNECTED') ||
                                    fetchErrorMessage.includes('ERR_NETWORK_CHANGED') ||
                                    fetchErrorStack.includes('fetch.umd.js') ||
                                    fetchErrorStack.includes('Network request failed') ||
                                    fetchError?.name === 'TypeError';
          
          if (isFetchNetworkError) {
            throw new Error('Network connection failed. Please check your internet connection and try again.');
          }
          throw fetchError;
        }
      }

      if (!responseData) {
        console.error('No responseData after invoke/fetch');
        throw new Error('No data received from server');
      }

      console.log('Final responseData check:', {
        success: responseData?.success,
        hasData: !!responseData?.data,
        message: responseData?.message,
        error: responseData?.error,
        responseType: typeof responseData,
        isSuccess: responseData?.success === true
      });

      // Check if response indicates success
      // Accept both success=true and processing status as valid
      const hasExplicitSuccess = responseData?.success === true || responseData?.success === 'true';
      const hasExplicitFailure = responseData?.success === false || responseData?.success === 'false';
      const hasError = responseData?.error !== undefined && responseData?.error !== null && responseData?.error !== '';
      const hasData = responseData?.data !== undefined && responseData?.data !== null;
      
      // Log detailed response analysis for debugging
      console.log('Response analysis:', {
        hasExplicitSuccess,
        hasExplicitFailure,
        hasError,
        hasData,
        successValue: responseData?.success,
        successType: typeof responseData?.success,
        errorValue: responseData?.error,
        errorType: typeof responseData?.error,
        hasDataField: !!responseData?.data,
        dataKeys: responseData?.data ? Object.keys(responseData.data) : [],
        fullResponse: JSON.stringify(responseData, null, 2)
      });
      
      // Simplified success detection: 
      // 1. Explicit success = success
      // 2. Has data AND no explicit failure AND no error = success (most permissive)
      // 3. Only fail if explicit failure OR has error field
      let isSuccess = false;
      
      if (hasExplicitSuccess) {
        isSuccess = true;
        console.log('Success: Explicit success flag is true');
      } else if (hasExplicitFailure) {
        isSuccess = false;
        console.log('Failure: Explicit failure flag is true');
      } else if (hasError) {
        isSuccess = false;
        console.log('Failure: Error field is present:', responseData?.error);
      } else if (hasData) {
        // If we have data and no explicit failure/error, treat as success
        isSuccess = true;
        console.log('Success: Has data field and no explicit failure/error');
      } else {
        // No data, no success flag, no error - unknown state
        isSuccess = false;
        console.log('Failure: No data, no success flag, no error - unknown response format');
      }
      
      if (isSuccess) {
        // Success - continue with processing
        console.log('Purchase successful, proceeding with success flow');
      } else if (hasExplicitFailure || hasError) {
        // Extract error message from multiple possible locations
        // Handle case where responseData might be a stringified JSON
        let errorDetails = responseData;
        const responseDataString = typeof responseData === 'string' ? responseData : JSON.stringify(responseData);
        
        if (typeof responseData === 'string') {
          try {
            errorDetails = JSON.parse(responseData);
          } catch (e) {
            // If it's a string but not JSON, try to extract error from string
            // Don't hardcode LOW WALLET BALANCE - let the replacement logic handle it
            const errorMatch = responseData.match(/"error"\s*:\s*"([^"]+)"/);
            if (errorMatch) {
              errorDetails = { error: errorMatch[1], details: { response_description: errorMatch[1] } };
            } else if (responseData.includes('error')) {
              // If error is mentioned but can't extract, use generic message
              errorDetails = { error: 'Purchase failed', details: {} };
            }
          }
        }
        
        // Extract error message from backend - backend already handles error appropriately
        // Prioritize the top-level error field first (backend replaces LOW WALLET BALANCE here)
        // Only fall back to details if top-level error is not available
        let errorMsg = 
          errorDetails?.error ||  // Backend replaces LOW WALLET BALANCE in this field
          errorDetails?.message ||
          errorDetails?.details?.error ||
          errorDetails?.details?.message ||
          errorDetails?.details?.response_description ||
          errorDetails?.response_description ||
          (errorDetails?.details?.code && errorDetails?.details?.code !== '000' 
            ? `Error code: ${errorDetails.details.code}` 
            : null) ||
          'Purchase failed';
        
        // Frontend fallback: If backend didn't replace "LOW WALLET BALANCE", do it here
        // This is a safety net in case the backend replacement logic doesn't catch it
        // ALWAYS check and replace "LOW WALLET BALANCE" regardless of case
        const upperErrorMsg = String(errorMsg || '').toUpperCase();
        const errorCode = errorDetails?.details?.code || errorDetails?.code;
        
        // Check if error message contains LOW WALLET BALANCE (case-insensitive) or error code 018
        const isLowWalletBalance = upperErrorMsg.includes('LOW WALLET BALANCE') || errorCode === '018';
        
        // Check if already replaced
        const isAlreadyReplaced = upperErrorMsg.includes('SERVICE TEMPORARILY UNAVAILABLE') || 
                                  upperErrorMsg.includes('NOT RELATED TO YOUR WALLET');
        
        if (isLowWalletBalance && !isAlreadyReplaced) {
          const originalErrorMsg = errorMsg;
          errorMsg = 'Service temporarily unavailable. This is not related to your wallet balance. Please try again later or contact support.';
          console.log('Frontend: Replaced LOW WALLET BALANCE error with user-friendly message', {
            originalError: errorDetails?.error,
            originalErrorMsg: originalErrorMsg,
            errorCode,
            replacedMessage: errorMsg
          });
        }
        
        console.error('Electricity purchase error details:', {
          success: responseData?.success,
          error: responseData?.error,
          message: responseData?.message,
          details: responseData?.details,
          fullResponse: responseData
        });
        
        throw new Error(errorMsg);
      } else {
        // Unknown response format - this should not happen with the logic above, but handle it anyway
        // Last resort: if we have ANY data, treat as success
        console.warn('Unknown response format - checking for data as last resort:', {
          responseData,
          success: responseData?.success,
          successType: typeof responseData?.success,
          error: responseData?.error,
          hasData: !!responseData?.data,
          dataKeys: responseData?.data ? Object.keys(responseData.data) : [],
          allKeys: Object.keys(responseData || {}),
          fullResponse: JSON.stringify(responseData, null, 2)
        });
        
        // Last resort: if we have data field, assume success
        if (responseData?.data) {
          console.warn('Unknown format but has data - treating as success (last resort)');
          responseData.success = true;
          isSuccess = true;
        } else {
          // No data, no success flag, no error - truly unknown
          throw new Error('Unexpected response format from server. Please try again or contact support.');
        }
      }

      // Only process success data if we determined it's a success
      if (!isSuccess) {
        throw new Error('Purchase failed: Invalid response from server');
      }

      const purchaseData = responseData.data || {};
      const reference = purchaseData.reference || responseData.reference || '';
      const transactionId = purchaseData.trans_id ? String(purchaseData.trans_id) : (purchaseData.transaction_id || reference);
      const purchaseToken = purchaseData.token || purchaseData.energyToken || purchaseData.token_value || responseData.token || '';
      const customerName = purchaseData.customer_name || verifiedName || '';
      const customerAddress = purchaseData.customer_address || verifiedAddress || '';
      const mobileNigReference = purchaseData.mobile_nig_reference || '';
      const receiptNumber = purchaseData.receipt_number || '';
      const serviceName = purchaseData.service_name || '';
      const walletBalance = purchaseData.wallet_balance || '';

      setToken(purchaseToken || null);
      setVerifiedName(customerName || null);
      setVerifiedAddress(customerAddress || '');
      setShowConfirmModal(false);
      
      try {
        await fetchBalance();
      } catch (balanceError) {
        console.error('Failed to fetch balance, but continuing with success flow:', balanceError);
      }

      router.push({
        pathname: '/payment-success',
        params: {
          amount: purchaseAmount.toString(),
          network: serviceName || providerName,
          recipient: sanitizedMeter,
          token: purchaseToken || '',
          meterType,
          customerName: customerName,
          reference,
          serviceType: `Electricity • ${meterType.toUpperCase()}`,
          mobileNigReference: mobileNigReference,
          receiptNumber: receiptNumber,
          transactionId: transactionId,
          walletBalance: walletBalance,
        },
      });
      
      setTransactionReference(transactionId);
      setTransactionStatus('Approved');
    } catch (purchaseError: any) {
      console.error('Electricity purchase failed:', purchaseError);
      console.error('Error details:', {
        message: purchaseError?.message,
        error: purchaseError?.error,
        details: purchaseError?.details,
        context: purchaseError?.context,
        name: purchaseError?.name,
        code: purchaseError?.code,
        stack: purchaseError?.stack,
        fullError: JSON.stringify(purchaseError, Object.getOwnPropertyNames(purchaseError), 2)
      });
      
      let message = 'Unable to complete electricity purchase. Please try again.';

      // Check for network errors
      const errorMessage = purchaseError?.message || String(purchaseError);
      const errorName = purchaseError?.name || purchaseError?.constructor?.name || '';
      const errorStack = purchaseError?.stack || '';
      const isNetworkError = errorMessage.includes('Network request failed') ||
                            errorMessage.includes('Failed to send a request to the Edge Function') ||
                            errorMessage.includes('Failed to fetch') ||
                            errorMessage.includes('ERR_INTERNET_DISCONNECTED') ||
                            errorMessage.includes('ERR_NETWORK_CHANGED') ||
                            errorMessage.includes('TypeError') ||
                            errorStack.includes('fetch.umd.js') ||
                            errorStack.includes('Network request failed') ||
                            errorName === 'FunctionsFetchError' ||
                            errorName === 'TypeError' ||
                            purchaseError?.code === 'NETWORK_ERROR';
      
      if (isNetworkError) {
        Alert.alert(
          'Connection Error',
          'Network connection failed. Please check your internet connection and try again.',
          [{ text: 'OK' }]
        );
        setShowConfirmModal(false);
        setTransactionStatus('Failed');
        return;
      }

      // Extract error message from various sources - try to get the most specific one
      if (purchaseError instanceof Error) {
        message = purchaseError.message || message;
      } else if (purchaseError?.error) {
        message = purchaseError.error;
      } else if (purchaseError?.message) {
        message = purchaseError.message;
      } else if (purchaseError?.details?.error) {
        message = purchaseError.details.error;
      } else if (purchaseError?.details?.message) {
        message = purchaseError.details.message;
      } else if (purchaseError?.details?.response_description) {
        message = purchaseError.details.response_description;
      } else if (purchaseError?.context?.body) {
        // Try to extract from context body if available
        try {
          const contextBody = typeof purchaseError.context.body === 'string' 
            ? JSON.parse(purchaseError.context.body) 
            : purchaseError.context.body;
          message = contextBody?.error || contextBody?.message || message;
        } catch (e) {
          // Ignore parse errors
        }
      }

      // Try to extract more detailed error from various sources
      const errorObj = purchaseError as any;
      const context = errorObj?.context;
      
      if (context?.body) {
        try {
          const body = typeof context.body === 'string' ? JSON.parse(context.body) : context.body;
          const bodyMessage =
            body?.error ||
            body?.message ||
            body?.details?.error ||
            body?.details?.message ||
            body?.response_description;
          if (bodyMessage) {
            message = bodyMessage;
          }
        } catch (_err) {
          console.error('Error parsing error body:', _err);
        }
      }
      
      // Also check if there's a data property with error info
      if (errorObj?.data) {
        const dataMessage = 
          errorObj.data?.error ||
          errorObj.data?.message ||
          errorObj.data?.details?.error ||
          errorObj.data?.details?.message ||
          errorObj.data?.response_description;
        if (dataMessage) {
          message = dataMessage;
        }
      }

      // Ensure we have a message - if not, use a default
      if (!message || message.trim() === '') {
        message = 'Unable to complete electricity purchase. Please try again.';
      }

      console.error('Final error message:', message);
      
      // Check if this is a duplicate order error
      const isDuplicateOrder = 
        message.toLowerCase().includes('duplicate order') ||
        message.toLowerCase().includes('duplicate_order') ||
        (purchaseError as any)?.code === 'duplicate_order' ||
        errorObj?.code === 'duplicate_order' ||
        errorObj?.details?.code === 'duplicate_order' ||
        purchaseError?.code === 'duplicate_order';

      // Check if this is an invalid meter number error
      const errorDetails = purchaseError?.details || errorObj?.details || {};
      const detailsText = typeof errorDetails === 'string' 
        ? errorDetails 
        : (errorDetails?.message || errorDetails?.error || errorDetails?.response_description || JSON.stringify(errorDetails) || '');
      const fullErrorText = `${message} ${detailsText}`.toLowerCase();
      
      const isInvalidMeter = 
        fullErrorText.includes('invalid meter') ||
        fullErrorText.includes('invalid meter number') ||
        fullErrorText.includes('meter number') ||
        fullErrorText.includes('meter not found') ||
        fullErrorText.includes('customer not found') ||
        fullErrorText.includes('wrong meter') ||
        fullErrorText.includes('incorrect meter') ||
        fullErrorText.includes('invalid customer') ||
        fullErrorText.includes('invalid customer_id') ||
        fullErrorText.includes('customer id') ||
        fullErrorText.includes('invalid service id') ||
        fullErrorText.includes('cannot be found') ||
        fullErrorText.includes('data you are looking for') ||
        message.toLowerCase().includes('invalid meter') ||
        message.toLowerCase().includes('invalid meter number') ||
        message.toLowerCase().includes('meter number') ||
        message.toLowerCase().includes('meter not found') ||
        message.toLowerCase().includes('customer not found') ||
        message.toLowerCase().includes('invalid customer') ||
        message.toLowerCase().includes('invalid customer_id') ||
        errorDetails?.code === '018' || // MobileNig error code for invalid meter
        errorDetails?.code === 'invalid_customer_id' || // eBills error code
        errorDetails?.errorCode === '018' ||
        errorDetails?.errorCode === 'invalid_customer_id' ||
        errorObj?.errorCode === '018' ||
        errorObj?.errorCode === 'invalid_customer_id' ||
        purchaseError?.errorCode === '018' ||
        purchaseError?.errorCode === 'invalid_customer_id' ||
        (typeof responseData !== 'undefined' && responseData && responseData.details?.code === 'invalid_customer_id') ||
        (typeof responseData !== 'undefined' && responseData && responseData.errorCode === 'invalid_customer_id');
      
      // Check if this is a user wallet balance error from our system
      // Note: "LOW WALLET BALANCE" from MobileNig API is ambiguous - it could mean:
      // 1. User's balance is insufficient (from our system check - but we already check this)
      // 2. MobileNig's internal balance/wallet issue
      // Since we already check balance before purchase, "LOW WALLET BALANCE" from MobileNig 
      // is more likely a service provider issue, not a user balance issue
      const upperMessage = message.toUpperCase();
      const isUserLowBalanceError = 
        (upperMessage.includes('INSUFFICIENT BALANCE') ||
         upperMessage.includes('INSUFFICIENT FUNDS')) &&
        !upperMessage.includes('LOW WALLET BALANCE'); // Exclude LOW WALLET BALANCE from MobileNig
      
      setShowConfirmModal(false); // Always close the confirmation modal on error
      
      if (isDuplicateOrder) {
        // Show duplicate order error
        Alert.alert(
          'Duplicate Order',
          'You have recently placed an order for the same amount to this meter number. Please wait 3 minutes before placing another order.',
          [{ text: 'OK' }]
        );
      } else if (isInvalidMeter) {
        // Show invalid meter modal
        setInvalidMeterMessage('Wrong meter number. Please check the meter number and try again.');
        setShowInvalidMeterModal(true);
      } else if (isUserLowBalanceError) {
        // This is from our system's balance check
        const formattedBalance = `₦${Number(balance).toLocaleString('en-NG', {
          minimumFractionDigits: 2,
          maximumFractionDigits: 2,
        })}`;
        setInsufficientFundsMessage(`Your wallet balance is ${formattedBalance}. Please fund your wallet to continue.`);
        setShowInsufficientFundsModal(true);
      } else {
        // Show the actual error message from MobileNig API
        // This could be a service provider issue, not a user balance issue
        Alert.alert(
          'Electricity Purchase Failed',
          message,
          [{ text: 'OK' }]
        );
      }
      
      setTransactionStatus('Failed');
    }
  }, [amount, fetchBalance, meterNumber, meterType, phoneNumber, providers, router, selectedProvider, verifiedName, verifiedAddress]);

  const getProviderLogo = (providerId: string | null) => {
    if (!providerId) return null;
    const provider = providers.find(p => p.id === providerId);
    return provider?.logo;
  };

  const getProviderName = (providerId: string | null) => {
    if (!providerId) return '';
    const provider = providers.find(p => p.id === providerId);
    return provider?.name || '';
  };

  const selectedProviderEntry = useMemo(
    () => providers.find((p) => p.id === selectedProvider),
    [providers, selectedProvider]
  );
  const selectedProviderLogo = selectedProviderEntry?.logo || getProviderLogo(selectedProvider);
  const selectedProviderName = selectedProviderEntry?.name || getProviderName(selectedProvider);
  const availableBalance = balance ?? 0;
  const meterTypeOptions = selectedProvider
    ? providers.find((p) => p.id === selectedProvider)?.meterTypes || ['prepaid', 'postpaid']
    : ['prepaid', 'postpaid'];
  const planLimits = useMemo(() => {
    if (!selectedProvider || !meterType) return null;
    const match = plans.find((plan) => plan.provider === selectedProvider && plan.meterType === meterType);
    return match || null;
  }, [plans, selectedProvider, meterType]);

  const planDetailsSummary = useMemo(() => {
    const parts = [
      meterType ? `${meterType.toUpperCase()} meter` : null,
      phoneNumber ? `Phone ${phoneNumber}` : null,
      verifiedName ? verifiedName : null,
      verifiedAddress ? verifiedAddress : null,
    ].filter(Boolean);
    return parts.join(' • ');
  }, [meterType, phoneNumber, selectedProviderEntry, verifiedName, verifiedAddress]);

  return (
    <ThemedView style={styles.container}>
      <KeyboardAvoidingView
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
        style={styles.keyboardView}>
        <View style={styles.header}>
          <TouchableOpacity onPress={() => router.back()} style={styles.backButton}>
            <MaterialIcons name="arrow-back" size={24} color="#000" />
          </TouchableOpacity>
          <ThemedText style={styles.headerTitle}>Electricity</ThemedText>
          <View style={styles.placeholder} />
        </View>

        <ScrollView
          style={styles.scrollView}
          contentContainerStyle={[styles.scrollContent, { paddingBottom: insets.bottom + 40 }]}
          showsVerticalScrollIndicator
          bounces>
          {/* Available Balance Card */}
          <View style={styles.balanceCard}>
            <ThemedText style={styles.balanceLabel}>Available Balance</ThemedText>
            <View style={styles.balanceAmountContainer}>
              {balanceLoading ? (
                <ActivityIndicator color="#fff" />
              ) : (
                <ThemedText style={styles.balanceAmount}>₦{availableBalance.toFixed(2)}</ThemedText>
              )}
            </View>
          </View>

          {/* Demo Numbers Banner */}
          {isDemoUser && <DemoNumbersBanner type="electricity" />}

          {/* Demo Meter Number Display - Prominent for Apple Reviewers */}
          {isDemoUser && (
            <View style={styles.demoMeterCard}>
              <View style={styles.demoMeterHeader}>
                <MaterialIcons name="info" size={24} color="#FF7F00" />
                <ThemedText style={styles.demoMeterTitle}>Test Meter Number for Apple Review</ThemedText>
              </View>
              <View style={styles.demoMeterNumberBox}>
                <ThemedText style={styles.demoMeterLabel}>Use this meter number:</ThemedText>
                <View style={styles.demoMeterValueContainer}>
                  <ThemedText style={styles.demoMeterValue}>12345678901</ThemedText>
                  <TouchableOpacity
                    style={styles.demoMeterCopyButton}
                    onPress={async () => {
                      await Clipboard.setStringAsync('12345678901');
                      Alert.alert('Copied!', 'Meter number copied to clipboard');
                      setMeterNumber('12345678901');
                    }}
                    activeOpacity={0.7}>
                    <MaterialIcons name="content-copy" size={20} color="#FF7F00" />
                  </TouchableOpacity>
                </View>
                <ThemedText style={styles.demoMeterNote}>
                  This test number works for all electricity providers (EKEDC, PHEDC, IKEDC, AEDC, KAEDC, JED)
                </ThemedText>
              </View>
            </View>
          )}

          {/* Select Service Provider */}
          <View style={styles.section}>
            <ThemedText style={styles.inputLabel}>Select Service Provider</ThemedText>
            <Dropdown
              options={providers.map(provider => ({ id: provider.id, name: provider.name, logo: provider.logo }))}
              selectedId={selectedProvider}
              onSelect={setSelectedProvider}
              placeholder="Select an electricity provider"
            />
          </View>

          {/* Meter Type */}
          <View style={styles.section}>
            <ThemedText style={styles.inputLabel}>Meter Type</ThemedText>
            <View style={styles.meterTypeRow}>
              {meterTypeOptions.map((type) => (
                <TouchableOpacity
                  key={type}
                  style={[styles.meterTypeChip, meterType === type && styles.meterTypeChipActive]}
                  onPress={() => {
                    setMeterType(type);
                    setVerifiedName(null);
                    setVerifiedAddress(null);
                    setMeterInfo(null);
                    setToken(null);
                  }}
                >
                  <ThemedText style={[styles.meterTypeText, meterType === type && styles.meterTypeTextActive]}>
                    {type.charAt(0).toUpperCase() + type.slice(1)}
                  </ThemedText>
                </TouchableOpacity>
              ))}
            </View>
          </View>

          {/* Meter Number Input */}
          <View style={styles.section}>
            <ThemedText style={styles.inputLabel}>Meter Number</ThemedText>
            <View style={styles.inputRow}>
              <TextInput
                style={styles.input}
                placeholder="Enter meter number"
                placeholderTextColor="#999"
                value={meterNumber}
                onChangeText={setMeterNumber}
                keyboardType="numeric"
              />
              {!isDemoUser && (
                <TouchableOpacity style={styles.verifyButton} onPress={handleVerifyMeter}>
                  {verificationLoading ? (
                    <ActivityIndicator size="small" color="#FF7F00" />
                  ) : (
                    <ThemedText style={styles.verifyButtonText}>Verify</ThemedText>
                  )}
                </TouchableOpacity>
              )}
            </View>
            {!isDemoUser && !meterInfo && !verifiedName && meterNumber.trim().length >= 10 && (
              <View style={styles.verificationWarning}>
                <MaterialIcons name="info-outline" size={16} color="#FF7F00" />
                <ThemedText style={styles.verificationWarningText}>
                  Please verify your meter number before purchasing
                </ThemedText>
              </View>
            )}
            {meterInfo ? (
              <View style={styles.meterDetailsCard}>
                <View style={styles.meterDetailsHeader}>
                  <MaterialIcons name="check-circle" size={20} color="#4CAF50" />
                  <ThemedText style={styles.meterDetailsTitle}>Meter Verified</ThemedText>
                </View>
                <View style={styles.meterDetailsContent}>
                  <View style={styles.meterDetailRow}>
                    <ThemedText style={styles.meterDetailLabel}>Customer Name:</ThemedText>
                    <ThemedText style={styles.meterDetailValue}>{meterInfo?.customer_name || verifiedName || 'N/A'}</ThemedText>
                  </View>
                  <View style={styles.meterDetailRow}>
                    <ThemedText style={styles.meterDetailLabel}>Meter Number:</ThemedText>
                    <ThemedText style={[styles.meterDetailValue, { fontFamily: 'monospace' }]}>{meterInfo?.meter_number || meterNumber || 'N/A'}</ThemedText>
                  </View>
                  {(meterInfo?.address && meterInfo.address.trim()) && (
                    <View style={styles.meterDetailRow}>
                      <ThemedText style={styles.meterDetailLabel}>Address:</ThemedText>
                      <ThemedText style={styles.meterDetailValue}>{meterInfo.address}</ThemedText>
                    </View>
                  )}
                  <View style={styles.meterDetailsGrid}>
                    {(meterInfo?.tariff && meterInfo.tariff.trim()) && (
                      <View style={styles.meterDetailItem}>
                        <ThemedText style={styles.meterDetailLabel}>Tariff</ThemedText>
                        <ThemedText style={styles.meterDetailValue}>{meterInfo.tariff}</ThemedText>
                      </View>
                    )}
                    <View style={styles.meterDetailItem}>
                      <ThemedText style={styles.meterDetailLabel}>Meter Type</ThemedText>
                      <ThemedText style={styles.meterDetailValue}>{(meterInfo?.meter_type || meterType || '').toUpperCase()}</ThemedText>
                    </View>
                    {(meterInfo?.minimum_vend !== undefined && meterInfo.minimum_vend !== null) && (
                      <View style={styles.meterDetailItem}>
                        <ThemedText style={styles.meterDetailLabel}>Min Purchase</ThemedText>
                        <ThemedText style={[styles.meterDetailValue, { fontWeight: 'bold' }]}>
                          ₦{Number(meterInfo.minimum_vend).toLocaleString('en-NG', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                        </ThemedText>
                      </View>
                    )}
                    {(meterInfo?.outstanding_amount !== undefined && meterInfo.outstanding_amount !== null && Number(meterInfo.outstanding_amount) > 0) && (
                      <View style={styles.meterDetailItem}>
                        <ThemedText style={styles.meterDetailLabel}>Outstanding</ThemedText>
                        <ThemedText style={[styles.meterDetailValue, { fontWeight: 'bold', color: '#FF6B35' }]}>
                          ₦{Number(meterInfo.outstanding_amount).toLocaleString('en-NG', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                        </ThemedText>
                      </View>
                    )}
                    {(meterInfo?.customer_category && meterInfo.customer_category.trim()) && (
                      <View style={styles.meterDetailItem}>
                        <ThemedText style={styles.meterDetailLabel}>Category</ThemedText>
                        <ThemedText style={styles.meterDetailValue}>{meterInfo.customer_category}</ThemedText>
                      </View>
                    )}
                    {(meterInfo?.business_unit && meterInfo.business_unit.trim()) && (
                      <View style={styles.meterDetailItem}>
                        <ThemedText style={styles.meterDetailLabel}>Business Unit</ThemedText>
                        <ThemedText style={styles.meterDetailValue}>{meterInfo.business_unit}</ThemedText>
                      </View>
                    )}
                  </View>
                </View>
              </View>
            ) : verifiedName ? (
              <View style={styles.verifiedBanner}>
                <MaterialIcons name="check-circle" size={16} color="#4CAF50" />
                <ThemedText style={styles.verifiedText}>
                  {verifiedName} ({meterType.toUpperCase()})
                  {verifiedAddress ? ` • ${verifiedAddress}` : ''}
                </ThemedText>
              </View>
            ) : null}
          </View>

          {/* Phone Number Input - Hidden for demo users */}
          {!isDemoUser && (
            <View style={styles.section}>
              <ThemedText style={styles.inputLabel}>Phone Number</ThemedText>
              <View style={styles.inputContainer}>
                <TextInput
                  style={styles.input}
                  placeholder="Enter phone number"
                  placeholderTextColor="#999"
                  value={phoneNumber}
                  onChangeText={setPhoneNumber}
                  keyboardType="phone-pad"
                />
              </View>
            </View>
          )}

          {/* Amount Input */}
          <View style={styles.section}>
            <ThemedText style={styles.inputLabel}>Amount (N)</ThemedText>
            <View style={styles.inputContainer}>
              <TextInput
                style={styles.input}
                placeholder="Enter amount"
                placeholderTextColor="#999"
                value={amount}
                onChangeText={setAmount}
                keyboardType="numeric"
              />
            </View>
            {planLimits ? (
              <ThemedText style={styles.helperText}>
                Min ₦{planLimits.minAmount.toLocaleString()} {planLimits.maxAmount ? `• Max ₦${planLimits.maxAmount.toLocaleString()}` : ''}
              </ThemedText>
            ) : null}
            {/* Service IDs are managed internally; no longer shown to users */}
          </View>
        </ScrollView>

        {/* Continue Button */}
        <View style={styles.buttonContainer}>
          <TouchableOpacity style={styles.continueButton} onPress={handleContinue}>
            <ThemedText style={styles.continueButtonText}>Continue</ThemedText>
          </TouchableOpacity>

          {transactionStatus ? (
            <View style={styles.statusBanner}>
              <MaterialIcons
                name={
                  transactionStatus.toLowerCase() === 'approved'
                    ? 'check-circle'
                    : transactionStatus.toLowerCase() === 'pending'
                    ? 'hourglass-bottom'
                    : 'error-outline'
                }
                size={20}
                color={
                  transactionStatus.toLowerCase() === 'approved'
                    ? '#2E7D32'
                    : transactionStatus.toLowerCase() === 'pending'
                    ? '#FF9800'
                    : '#B3261E'
                }
              />
              <ThemedText style={styles.statusBannerText}>
                Status: {transactionStatus}
                {transactionReference ? ` • Ref ${transactionReference}` : ''}
              </ThemedText>
            </View>
          ) : null}
        </View>
      </KeyboardAvoidingView>

      {/* Confirm Payment Modal */}
      {selectedProviderLogo && (() => {
        const purchaseAmount = parseFloat(amount || '0');
        // Calculate 10% charge fee for electricity
        const CHARGE_FEE_RATE = 0.1;
        const chargeFee = purchaseAmount > 0 ? Math.round(purchaseAmount * CHARGE_FEE_RATE * 100) / 100 : 0;
        return (
          <ConfirmPaymentModal
            visible={showConfirmModal}
            onClose={() => setShowConfirmModal(false)}
            onConfirm={handleConfirmPayment}
            amount={purchaseAmount}
            charges={chargeFee}
            network={selectedProviderName}
            networkLogo={selectedProviderLogo}
            recipient={meterNumber}
            serviceType={`Electricity • ${meterType.toUpperCase()}`}
            planDetails={planDetailsSummary}
          />
        );
      })()}

      {/* Invalid Meter Number Modal */}
      <Modal
        visible={showInvalidMeterModal}
        transparent={true}
        animationType="fade"
        onRequestClose={() => {
          setShowInvalidMeterModal(false);
          setMeterNumber('');
        }}
      >
        <View style={styles.modalOverlay}>
          <View style={styles.modalContent}>
            <View style={styles.modalIconContainer}>
              <MaterialIcons name="bolt" size={64} color="#FF7F00" />
            </View>
            <ThemedText style={styles.modalTitle}>Wrong Meter Number</ThemedText>
            <ThemedText style={styles.modalMessage}>
              {invalidMeterMessage || 'The meter number you entered is incorrect. Please check the number and try again.'}
            </ThemedText>
            <View style={styles.modalTipsContainer}>
              <ThemedText style={styles.modalTipsTitle}>Tips:</ThemedText>
              <ThemedText style={styles.modalTip}>• Ensure you entered the correct meter number</ThemedText>
              <ThemedText style={styles.modalTip}>• Check that the meter type (Prepaid/Postpaid) matches</ThemedText>
              <ThemedText style={styles.modalTip}>• Verify the electricity provider is correct</ThemedText>
            </View>
            <View style={styles.modalActions}>
              <TouchableOpacity
                style={styles.modalButton}
                onPress={() => {
                  setShowInvalidMeterModal(false);
                  setMeterNumber('');
                }}
                activeOpacity={0.8}
              >
                <ThemedText style={styles.modalButtonText}>Try Again</ThemedText>
              </TouchableOpacity>
              <TouchableOpacity
                style={styles.modalSecondaryButton}
                onPress={() => {
                  setShowInvalidMeterModal(false);
                  setMeterNumber('');
                }}
                activeOpacity={0.8}
              >
                <ThemedText style={styles.modalSecondaryButtonText}>OK</ThemedText>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>

      <Modal
        animationType="slide"
        transparent
        visible={showVerificationErrorModal}
        onRequestClose={() => setShowVerificationErrorModal(false)}>
        <View style={styles.modalOverlay}>
          <View style={styles.errorModal}>
            <View style={styles.errorIconContainer}>
              <MaterialIcons name="error-outline" size={36} color="#FF4D4F" />
            </View>
            <ThemedText style={styles.errorTitle}>Verification Failed</ThemedText>
            <ThemedText style={styles.errorMessage}>
              {verificationError || 'We could not validate this meter number. Please check the number and try again.'}
            </ThemedText>
            <TouchableOpacity
              style={styles.errorButton}
              onPress={() => setShowVerificationErrorModal(false)}>
              <ThemedText style={styles.errorButtonText}>Try Again</ThemedText>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>

      <Modal
        animationType="slide"
        transparent
        visible={showInsufficientFundsModal}
        onRequestClose={() => setShowInsufficientFundsModal(false)}>
        <View style={styles.modalOverlay}>
          <View style={styles.errorModal}>
            <View style={styles.errorIconContainer}>
              <MaterialIcons name="account-balance-wallet" size={36} color="#FF7F00" />
            </View>
            <ThemedText style={styles.errorTitle}>Insufficient Balance</ThemedText>
            <ThemedText style={styles.errorMessage}>
              {insufficientFundsMessage ||
                'Your wallet balance is insufficient for this transaction. Please fund your wallet to continue.'}
            </ThemedText>
            <View style={styles.modalActions}>
              <TouchableOpacity
                style={styles.errorButton}
                onPress={() => {
                  setShowInsufficientFundsModal(false);
                  router.push('/add-money');
                }}>
                <ThemedText style={styles.errorButtonText}>Fund Wallet</ThemedText>
              </TouchableOpacity>
              <TouchableOpacity
                style={styles.errorSecondaryButton}
                onPress={() => setShowInsufficientFundsModal(false)}>
                <ThemedText style={styles.errorSecondaryButtonText}>Close</ThemedText>
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
    minWidth: 80,
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
    width: '100%',
  },
  continueButtonText: {
    fontSize: 18,
    fontWeight: 'bold',
    color: '#fff',
  },
  statusBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    backgroundColor: '#F5F5F5',
    borderRadius: 12,
    paddingVertical: 10,
    paddingHorizontal: 14,
  },
  statusBannerText: {
    fontSize: 14,
    color: '#444',
    fontWeight: '600',
  },
  meterTypeRow: {
    flexDirection: 'row',
    gap: 12,
  },
  meterTypeChip: {
    paddingVertical: 10,
    paddingHorizontal: 20,
    borderRadius: 20,
    borderWidth: 1,
    borderColor: '#E0E0E0',
  },
  meterTypeChipActive: {
    backgroundColor: '#FF7F00',
    borderColor: '#FF7F00',
  },
  meterTypeText: {
    fontSize: 14,
    color: '#333',
    fontWeight: '500',
  },
  meterTypeTextActive: {
    color: '#fff',
  },
  meterDetailsCard: {
    backgroundColor: '#E8F5E9',
    borderRadius: 12,
    padding: 16,
    marginTop: 12,
    borderWidth: 1,
    borderColor: '#4CAF50',
  },
  meterDetailsHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 12,
    gap: 8,
  },
  meterDetailsTitle: {
    fontSize: 16,
    fontWeight: 'bold',
    color: '#2E7D32',
  },
  meterDetailsContent: {
    gap: 12,
  },
  meterDetailRow: {
    marginBottom: 8,
  },
  meterDetailLabel: {
    fontSize: 12,
    color: '#4CAF50',
    fontWeight: '600',
    marginBottom: 4,
  },
  meterDetailValue: {
    fontSize: 14,
    color: '#1B5E20',
  },
  meterDetailsGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 12,
    marginTop: 8,
    paddingTop: 12,
    borderTopWidth: 1,
    borderTopColor: '#A5D6A7',
  },
  meterDetailItem: {
    flex: 1,
    minWidth: '45%',
  },
  verifiedBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    marginTop: 8,
  },
  verifiedText: {
    fontSize: 14,
    color: '#4CAF50',
    fontWeight: '600',
  },
  verificationWarning: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    backgroundColor: '#FFF8E1',
    borderRadius: 8,
    padding: 12,
    marginTop: 8,
    borderWidth: 1,
    borderColor: '#FFE082',
  },
  verificationWarningText: {
    fontSize: 13,
    color: '#E65100',
    fontWeight: '500',
    flex: 1,
  },
  helperText: {
    marginTop: 8,
    fontSize: 12,
    color: '#666',
  },
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.5)',
    justifyContent: 'center',
    alignItems: 'center',
    padding: 24,
  },
  errorModal: {
    backgroundColor: '#fff',
    borderRadius: 24,
    padding: 24,
    width: '100%',
    maxWidth: 360,
    alignItems: 'center',
  },
  errorIconContainer: {
    width: 64,
    height: 64,
    borderRadius: 32,
    backgroundColor: 'rgba(255, 77, 79, 0.1)',
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 16,
  },
  errorTitle: {
    fontSize: 20,
    fontWeight: '600',
    color: '#1A1A1A',
    marginBottom: 12,
    textAlign: 'center',
  },
  errorMessage: {
    fontSize: 15,
    color: '#4A4A4A',
    textAlign: 'center',
    lineHeight: 22,
    marginBottom: 24,
  },
  errorButton: {
    backgroundColor: '#FF7F00',
    borderRadius: 24,
    paddingVertical: 12,
    paddingHorizontal: 32,
  },
  errorButtonText: {
    color: '#fff',
    fontSize: 16,
    fontWeight: '600',
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
    alignItems: 'center',
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
    marginBottom: 20,
    lineHeight: 22,
  },
  modalTipsContainer: {
    width: '100%',
    backgroundColor: '#FFF5E6',
    borderRadius: 12,
    padding: 16,
    marginBottom: 20,
    borderWidth: 1,
    borderColor: '#FFE0B2',
  },
  modalTipsTitle: {
    fontSize: 14,
    fontWeight: '600',
    color: '#FF7F00',
    marginBottom: 8,
  },
  modalTip: {
    fontSize: 13,
    color: '#666',
    marginBottom: 4,
    lineHeight: 18,
  },
  modalButton: {
    backgroundColor: '#FF7F00',
    borderRadius: 12,
    paddingVertical: 14,
    paddingHorizontal: 32,
    width: '100%',
    alignItems: 'center',
    marginBottom: 12,
  },
  modalButtonText: {
    color: '#fff',
    fontSize: 16,
    fontWeight: '600',
  },
  modalSecondaryButton: {
    backgroundColor: 'transparent',
    borderRadius: 12,
    paddingVertical: 12,
    paddingHorizontal: 32,
    width: '100%',
    alignItems: 'center',
    borderWidth: 1,
    borderColor: '#E0E0E0',
  },
  modalSecondaryButtonText: {
    color: '#666',
    fontSize: 16,
    fontWeight: '500',
  },
  modalActions: {
    width: '100%',
    gap: 12,
  },
  errorSecondaryButton: {
    backgroundColor: 'rgba(255, 127, 0, 0.12)',
    borderRadius: 24,
    paddingVertical: 12,
    paddingHorizontal: 32,
  },
  errorSecondaryButtonText: {
    color: '#FF7F00',
    fontSize: 16,
    fontWeight: '600',
    textAlign: 'center',
  },
  demoMeterCard: {
    backgroundColor: '#FFF8E1',
    borderRadius: 16,
    marginHorizontal: 16,
    marginVertical: 12,
    padding: 16,
    borderWidth: 2,
    borderColor: '#FF7F00',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 4,
    elevation: 4,
  },
  demoMeterHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginBottom: 12,
  },
  demoMeterTitle: {
    fontSize: 16,
    fontWeight: '700',
    color: '#E65100',
    flex: 1,
  },
  demoMeterNumberBox: {
    backgroundColor: '#FFFFFF',
    borderRadius: 12,
    padding: 16,
    borderWidth: 1,
    borderColor: '#FFE082',
  },
  demoMeterLabel: {
    fontSize: 14,
    fontWeight: '600',
    color: '#666',
    marginBottom: 8,
  },
  demoMeterValueContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#F5F5F5',
    borderRadius: 8,
    padding: 12,
    marginBottom: 8,
    gap: 12,
  },
  demoMeterValue: {
    fontSize: 20,
    fontWeight: '700',
    color: '#000',
    fontFamily: 'monospace',
    flex: 1,
    letterSpacing: 1,
  },
  demoMeterCopyButton: {
    padding: 8,
    borderRadius: 6,
    backgroundColor: '#FFF8E1',
  },
  demoMeterNote: {
    fontSize: 12,
    color: '#666',
    fontStyle: 'italic',
    lineHeight: 16,
  },
});

