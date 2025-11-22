import { useEffect, useMemo, useState, useRef, useCallback } from 'react';
import { StyleSheet, View, TextInput, TouchableOpacity, ScrollView, KeyboardAvoidingView, Platform, Alert, ActivityIndicator, Modal } from 'react-native';
import { ThemedView } from '@/components/themed-view';
import { ThemedText } from '@/components/themed-text';
import { MaterialIcons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import { Image } from 'expo-image';
import { ConfirmPaymentModal } from '@/components/confirm-payment-modal';
import { Dropdown } from '@/components/dropdown';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { supabase } from '@/lib/supabase';
import { useFocusEffect } from '@react-navigation/native';
import { validateNigerianPhoneNumber } from '@/utils/phone';

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
  const [meterType, setMeterType] = useState<'prepaid' | 'postpaid' | ''>('');
  const [meterNumber, setMeterNumber] = useState('');
  const [amount, setAmount] = useState('');
  const [phoneNumber, setPhoneNumber] = useState('');
  const [showConfirmModal, setShowConfirmModal] = useState(false);
  const [verificationLoading, setVerificationLoading] = useState(false);
  const [verifiedName, setVerifiedName] = useState<string | null>(null);
  const [verifiedAddress, setVerifiedAddress] = useState<string | null>(null);
  const [token, setToken] = useState<string | null>(null);
  const [transactionReference, setTransactionReference] = useState<string | null>(null);
  const [transactionStatus, setTransactionStatus] = useState<string | null>(null);
  const [statusChecking, setStatusChecking] = useState<boolean>(false);
  const [providerFilter, setProviderFilter] = useState('all');
  const [balance, setBalance] = useState<number>(0);
  const [balanceLoading, setBalanceLoading] = useState<boolean>(true);
  const [verificationError, setVerificationError] = useState<string | null>(null);
  const [showVerificationErrorModal, setShowVerificationErrorModal] = useState(false);
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
    }, [fetchBalance])
  );

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
      setMeterType(provider.meterTypes.includes(meterType) ? meterType : provider.meterTypes[0]);
    }
  }, [selectedProvider]);

  const setPackageConstraints = () => {
    setToken(null);
    setVerifiedName(null);
    setVerifiedAddress(null);
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
      setVerificationError(null);
      setShowVerificationErrorModal(false);
      const { data, error } = await supabase.functions.invoke('validate-meter-number', {
        body: {
          meter_number: meterNumber.trim(),
          provider: selectedProvider,
          meter_type: meterType,
          vending_provider: 'vtpass', // Call VTpass directly
        },
      });

      if (error) {
        throw error;
      }

      if (!data?.success) {
        const failedMessage = data?.error || data?.details?.message || 'Meter not found.';
        setVerificationError(failedMessage);
        setShowVerificationErrorModal(true);
        return;
      }

      setVerifiedName(data.data?.customer_name || 'Customer');
      setVerifiedAddress(data.data?.address || '');
      setToken(data.data?.token || null);
      Alert.alert('Verified', 'Meter details confirmed.');
    } catch (error) {
      console.error('Meter verification failed:', error);
      const message = error instanceof Error ? error.message : 'Unable to verify meter at the moment.';
      setVerificationError(message);
      setShowVerificationErrorModal(true);
      setVerifiedAddress(null);
    } finally {
      setVerificationLoading(false);
    }
  };

  const handleContinue = () => {
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
    const phoneValidation = validateNigerianPhoneNumber(phoneNumber);
    if (!phoneValidation.isMatch || phoneValidation.message) {
      Alert.alert('Invalid Phone Number', phoneValidation.message || 'Please enter a valid phone number');
      return;
    }
    const normalizedPhone = phoneValidation.normalized;
    if (normalizedPhone !== phoneNumber) {
      setPhoneNumber(normalizedPhone);
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
    if (purchaseAmount > balance) {
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

    const sanitizedMeter = meterNumber.trim();
    const sanitizedPhone = phoneNumber.replace(/\s+/g, '').trim();
    const providerEntry = providers.find((p) => p.id === selectedProvider);
    const providerName = providerEntry?.name || selectedProvider;

    // Declare hasToken and hasReference at function scope for error logging
    let hasToken = false;
    let hasReference = false;
    
    try {
      const { data: sessionData } = await supabase.auth.getSession();
      const accessToken = sessionData?.session?.access_token;

      const { data: initialData, error } = await supabase.functions.invoke('purchase-electricity', {
        body: {
          meter_number: sanitizedMeter,
          provider: selectedProvider,
          meter_type: meterType,
          amount: purchaseAmount,
          phone: sanitizedPhone,
          vending_provider: 'vtpass', // Call VTpass directly
          customer_name: verifiedName || undefined,
          customer_address: verifiedAddress || undefined,
        },
        headers: accessToken
          ? {
              Authorization: `Bearer ${accessToken}`,
            }
          : undefined,
      });
      
      // Use let instead of const to allow reassignment if needed
      let data = initialData;

      console.log('Electricity purchase response:', { 
        data, 
        error, 
        selectedProvider, 
        meterType, 
        amount: purchaseAmount,
        dataType: typeof data,
        dataDataType: typeof data?.data,
        dataDataIsString: typeof data?.data === 'string',
        errorMessage: error?.message,
        errorName: error?.name
      });

      // IMPORTANT: Even if there's an error from Supabase, check if the transaction actually succeeded
      // Sometimes the edge function returns an error status but the transaction was successful
      // We'll check the data first before throwing
      const hasData = data !== null && data !== undefined;
      
      // Check multiple ways the data might indicate success
      let dataHasSuccess = false;
      let parsedSuccessData = null;
      
      if (hasData) {
        // Check if data.data is a string with "success":true
        if (data?.data && typeof data.data === 'string' && data.data.trim().length > 0) {
          const hasSuccessInString = data.data.includes('"success":true') || data.data.includes('"success": true');
          const hasFailure = data.data.includes('"success":false');
          
          if (hasSuccessInString && !hasFailure) {
            console.log('✅ Found success in data.data string - will parse and proceed');
            dataHasSuccess = true;
            try {
              parsedSuccessData = JSON.parse(data.data);
              console.log('✅ Parsed success data:', { success: parsedSuccessData?.success, hasToken: !!parsedSuccessData?.data?.token });
            } catch (e) {
              console.log('Could not parse but treating as success');
            }
          }
        }
        
        // Check if data.success is true
        if (!dataHasSuccess && data?.success === true) {
          console.log('✅ Found data.success === true');
          dataHasSuccess = true;
          parsedSuccessData = data;
        }
        
        // Check if data.data is an object with success
        if (!dataHasSuccess && data?.data && typeof data.data === 'object' && data.data !== null && data.data?.success === true) {
          console.log('✅ Found data.data.success === true');
          dataHasSuccess = true;
          parsedSuccessData = data.data;
        }
      }
      
      console.log('Checking if we should proceed despite error:', {
        hasError: !!error,
        hasData,
        dataHasSuccess,
        willProceed: hasData && dataHasSuccess,
        errorName: error?.name,
        errorMessage: error?.message
      });

      // Only throw error if we don't have successful data
      if (error && !(hasData && dataHasSuccess)) {
        console.error('Electricity purchase error and no success data:', error);
        throw error;
      } else if (error && hasData && dataHasSuccess) {
        console.log('⚠️ Edge function returned error BUT transaction succeeded - proceeding with success flow');
        // If we parsed the success data, use it
        if (parsedSuccessData) {
          data = parsedSuccessData;
          console.log('✅ Using parsed success data as main data');
        }
      }

      // Handle case where data.data might be a JSON string (double-encoded response)
      // Sometimes Supabase wraps the response, making data.data a stringified JSON
      let responseData = data;
      
      console.log('Initial data structure:', {
        dataType: typeof data,
        hasData: !!data,
        dataKeys: data ? Object.keys(data) : [],
        dataDataType: typeof data?.data,
        dataDataIsString: typeof data?.data === 'string',
        dataDataLength: typeof data?.data === 'string' ? data.data.length : 0
      });
      
      // First, try to parse if data itself is a string
      if (typeof data === 'string') {
        try {
          console.log('data is a string, parsing...');
          responseData = JSON.parse(data);
          console.log('Parsed data string, success:', responseData?.success, 'keys:', Object.keys(responseData || {}));
        } catch (e) {
          console.error('Failed to parse data as string:', e);
        }
      }
      
      // Check if data.data or responseData.data is a string and needs parsing
      // Try multiple sources: responseData.data, data.data
      // Priority: check data.data first (the original response from Supabase)
      const dataToParse = data?.data;
      
      console.log('Checking dataToParse from data.data:', {
        hasDataToParse: !!dataToParse,
        dataToParseType: typeof dataToParse,
        isString: typeof dataToParse === 'string',
        length: typeof dataToParse === 'string' ? dataToParse.length : 0
      });
      
      // If data.data is a string, parse it - this is the most common case
      if (dataToParse && typeof dataToParse === 'string' && dataToParse.trim().length > 0) {
        try {
          const sample = dataToParse.length > 100 ? dataToParse.substring(0, 100) : dataToParse;
          console.log('Parsing data.data as JSON. Length:', dataToParse.length, 'Sample:', sample);
          const parsed = JSON.parse(dataToParse);
          console.log('✅ Successfully parsed data.data:', {
            hasSuccess: 'success' in parsed,
            successValue: parsed.success,
            successType: typeof parsed.success,
            hasData: 'data' in parsed,
            keys: Object.keys(parsed)
          });
          // IMPORTANT: Replace responseData with parsed result
          responseData = parsed;
          console.log('✅ responseData updated, success:', responseData?.success);
        } catch (e) {
          console.error('❌ Failed to parse data.data:', e);
          // If parsing fails, keep original responseData
        }
      } else if (responseData && responseData.success !== undefined) {
        // responseData is already the response object
        console.log('Using responseData directly, success:', responseData.success);
      } else {
        console.log('No parsing needed:', {
          hasResponseData: !!responseData,
          responseDataKeys: responseData ? Object.keys(responseData) : [],
          responseDataSuccess: responseData?.success
        });
      }
      
      // Final verification of responseData after all parsing
      console.log('Final responseData after parsing:', {
        hasResponseData: !!responseData,
        responseDataType: typeof responseData,
        success: responseData?.success,
        successType: typeof responseData?.success,
        keys: responseData ? Object.keys(responseData) : []
      });

      console.log('Final responseData check:', {
        hasResponseData: !!responseData,
        success: responseData?.success,
        successType: typeof responseData?.success,
        hasData: !!responseData?.data,
        dataType: typeof responseData?.data,
        keys: responseData ? Object.keys(responseData) : [],
        responseDataString: typeof responseData === 'string' ? responseData.substring(0, 100) : 'not a string'
      });

      // Determine success - check multiple sources with priority order
      let isSuccess = false;
      const successValue = responseData?.success;
      
      // PRIORITY 1: Check if data.data is a string containing "success":true
      // This is the most reliable check for double-encoded responses
      if (data?.data && typeof data.data === 'string' && data.data.trim().length > 0) {
        const hasSuccessInString = data.data.includes('"success":true') || data.data.includes('"success": true');
        const hasFailure = data.data.includes('"success":false');
        
        console.log('Checking data.data string for success:', {
          hasSuccessInString,
          hasFailure,
          sample: data.data.substring(0, 150)
        });
        
        if (hasSuccessInString && !hasFailure) {
          console.log('✅ SUCCESS: Found "success":true in data.data string');
          isSuccess = true;
          // Parse it to get the full responseData
          try {
            const stringParsed = JSON.parse(data.data);
            responseData = stringParsed;
            console.log('✅ Parsed data.data, got success:', responseData?.success, 'has token:', !!responseData?.data?.token);
          } catch (e) {
            console.log('Could not parse data.data but treating as success based on string check');
          }
        }
      }
      
      // PRIORITY 2: Check responseData.success directly
      if (!isSuccess) {
        if (successValue === true || successValue === 'true') {
          console.log('✅ SUCCESS: responseData.success === true');
          isSuccess = true;
        } else if (typeof successValue === 'boolean' && successValue) {
          console.log('✅ SUCCESS: responseData.success is truthy');
          isSuccess = true;
        } else if (responseData?.data && typeof responseData.data === 'object' && responseData.data !== null && responseData.data.success === true) {
          console.log('✅ SUCCESS: responseData.data.success === true');
          isSuccess = true;
        }
      }
      
      // PRIORITY 3: Check for token or reference as fallback
      if (!isSuccess) {
        hasToken = 
          (responseData?.data && typeof responseData.data === 'object' && responseData.data !== null && (responseData.data.token || responseData.data.energyToken)) ||                                                                                                                        
          responseData?.token ||
          false;
        
        hasReference = 
          (responseData?.data && typeof responseData.data === 'object' && responseData.data !== null && (responseData.data.reference || responseData.data.transaction_id)) ||                                                                                                                 
          responseData?.reference ||
          false;
        
        console.log('Fallback checks:', {
          hasToken,
          hasReference,
          responseDataSuccess: responseData?.success,
          hasError: !!responseData?.error
        });
        
        if (hasToken) {
          console.log('✅ SUCCESS: Token found in response');
          isSuccess = true;
        } else if (hasReference && !responseData?.error) {
          console.log('✅ SUCCESS: Reference found and no error');
          isSuccess = true;
        }
      }
      
      console.log('🎯 FINAL Success check result:', {
        isSuccess,
        successValue,
        successType: typeof successValue,
        hasResponseData: !!responseData,
        responseDataKeys: responseData ? Object.keys(responseData) : [],
        responseDataSuccess: responseData?.success,
        responseDataDataType: typeof responseData?.data,
        originalDataDataType: typeof data?.data,
        originalDataDataIsString: typeof data?.data === 'string'
      });
      
      if (!isSuccess) {
        console.error('❌ Transaction NOT detected as successful - will show error to user');
        // Extract error message from various possible response formats
        const errorMessage = 
          responseData?.error ||
          responseData?.message ||
          responseData?.details?.message ||
          responseData?.details?.error ||
          responseData?.response_description ||
          (typeof responseData?.details === 'string' ? responseData.details : null) ||
          'Unable to complete electricity purchase.';
        
        console.error('Electricity purchase failed - not successful:', {
          isSuccess,
          successValue: responseData?.success,
          successType: typeof responseData?.success,
          hasToken,
          hasReference,
          error: errorMessage,
          responseDataKeys: responseData ? Object.keys(responseData) : [],
          fullResponse: JSON.stringify(responseData, null, 2),
          originalData: JSON.stringify(data, null, 2),
          requestPayload: {
            provider: selectedProvider,
            meter_type: meterType,
            amount: purchaseAmount,
            meter_number: sanitizedMeter.substring(0, 5) + '...'
          }
        });
        
        throw new Error(errorMessage);
      }
      
      // Log that we're proceeding with success flow
      console.log('🎉 PROCEEDING WITH SUCCESS FLOW - Transaction was successful!');
      
      console.log('Electricity purchase successful!', {
        success: responseData?.success,
        hasData: !!responseData?.data,
        dataKeys: responseData?.data ? Object.keys(responseData.data) : [],
        isSuccess: isSuccess
      });

      // Extract data from response
      // After parsing, responseData should be {success: true, data: {...}}
      // Handle multiple possible response structures
      let responseDataData = responseData?.data || {};
      
      // If responseDataData is still a string, try parsing it
      if (typeof responseDataData === 'string') {
        try {
          console.log('responseDataData is a string, parsing...');
          responseDataData = JSON.parse(responseDataData);
          console.log('Parsed responseDataData:', Object.keys(responseDataData));
        } catch (e) {
          console.error('Failed to parse responseDataData:', e);
        }
      }
      
      // If we still don't have data, check if responseData itself has the fields we need
      if (!responseDataData || Object.keys(responseDataData).length === 0) {
        console.log('responseDataData is empty, checking responseData directly');
        // Check if responseData has the fields directly (not nested in data)
        if (responseData.reference || responseData.token || responseData.amount) {
          console.log('Using responseData directly as responseDataData');
          responseDataData = responseData;
        }
      }
      
      console.log('Extracted response data:', {
        hasData: !!responseDataData,
        hasResponseData: !!responseData,
        responseDataKeys: responseData ? Object.keys(responseData) : [],
        responseDataDataKeys: responseDataData ? Object.keys(responseDataData) : [],
        reference: responseDataData.reference,
        token: responseDataData.token?.substring(0, 30),
        units: responseDataData.units,
        amount: responseDataData.amount
      });
      
      const reference = responseDataData.reference || '';
      const transactionId = responseDataData.trans_id ? String(responseDataData.trans_id) : reference;
      const purchaseToken =
        responseDataData.token ||
        responseDataData.energyToken ||
        responseDataData.token_value ||
        '';
      const customerName = responseDataData.customer_name || verifiedName || '';
      const customerAddress = responseDataData.customer_address || verifiedAddress || '';

      console.log('Setting up success state and navigating...', {
        purchaseToken: purchaseToken?.substring(0, 30),
        reference,
        transactionId,
        customerName,
        amount: purchaseAmount
      });

      setToken(purchaseToken || null);
      setVerifiedName(customerName || null);
      setVerifiedAddress(customerAddress || '');
      setShowConfirmModal(false);
      
      try {
        await fetchBalance();
      } catch (balanceError) {
        console.error('Failed to fetch balance, but continuing with success flow:', balanceError);
      }

      console.log('Navigating to payment-success screen');
      router.push({
        pathname: '/payment-success',
        params: {
          amount: purchaseAmount.toString(),
          network: providerName,
          recipient: sanitizedMeter,
          token: purchaseToken || '',
          meterType,
          customerName: customerName,
          reference,
          serviceType: `Electricity • ${meterType.toUpperCase()}`,
        },
      });
      
      setTransactionReference(transactionId);
      setTransactionStatus('Approved');
      
      console.log('Success flow completed - transaction status set to Approved');
    } catch (purchaseError) {
      console.error('Electricity purchase failed:', purchaseError);
      let message = 'Unable to complete electricity purchase. Please try again.';

      if (purchaseError instanceof Error) {
        message = purchaseError.message || message;
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

      console.error('Final error message:', message);
      
      // Check if this is a low wallet balance error and show the insufficient funds modal
      const upperMessage = message.toUpperCase();
      const isLowBalanceError = 
        upperMessage.includes('LOW WALLET BALANCE') ||
        upperMessage.includes('INSUFFICIENT BALANCE') ||
        upperMessage.includes('INSUFFICIENT FUNDS') ||
        (upperMessage.includes('LOW') && upperMessage.includes('BALANCE'));
      
      if (isLowBalanceError) {
        const formattedBalance = `₦${Number(balance).toLocaleString('en-NG', {
          minimumFractionDigits: 2,
          maximumFractionDigits: 2,
        })}`;
        setInsufficientFundsMessage(`Your wallet balance is ${formattedBalance}. Please fund your wallet to continue.`);
        setShowInsufficientFundsModal(true);
        setShowConfirmModal(false); // Close the confirmation modal if open
      } else {
        Alert.alert('Electricity Purchase', message);
      }
      
      setTransactionStatus('Failed');
    }
  }, [amount, fetchBalance, meterNumber, meterType, phoneNumber, providers, router, selectedProvider, verifiedName, verifiedAddress]);

  const handleCheckStatus = useCallback(async () => {
    if (!transactionReference) {
      Alert.alert('Status', 'No transaction reference to query yet.');
      return;
    }

    try {
      setStatusChecking(true);
      const { data, error } = await supabase.functions.invoke('query-electricity-transaction', {
        body: { trans_id: transactionReference },
      });

      if (error) {
        throw error;
      }

      if (!data?.success) {
        const detailMessage =
          data?.details?.message ||
          data?.details?.error ||
          data?.error ||
          'Unable to query transaction status.';
        throw new Error(detailMessage);
      }

      const status = data?.data?.status || 'UNKNOWN';
      setTransactionStatus(status);

      const details = data?.data;
      if (details?.customer_name) {
        setVerifiedName(details.customer_name);
      }
      if (details?.customer_address) {
        setVerifiedAddress(details.customer_address);
      }
      if (details?.token) {
        setToken(String(details.token));
      }
      if (details?.trans_id) {
        setTransactionReference(String(details.trans_id));
      }

      Alert.alert(
        'Transaction Status',
        `Status: ${status}\nService: ${details?.service}\nCustomer Ref: ${details?.customerReference}\nToken: ${details?.token || 'N/A'}\nReceipt: ${details?.receiptNumber || 'N/A'}`,
      );
    } catch (statusError) {
      console.error('Electricity status check failed:', statusError);
      let message = 'Unable to query transaction status. Please try again.';

      if (statusError instanceof Error) {
        message = statusError.message || message;
      }

      const context = (statusError as any)?.context;
      if (context?.body) {
        try {
          const body = typeof context.body === 'string' ? JSON.parse(context.body) : context.body;
          const bodyMessage =
            body?.error ||
            body?.message ||
            body?.details?.error ||
            body?.details?.message;
          if (bodyMessage) {
            message = bodyMessage;
          }
        } catch (_err) {
          // ignore parse error
        }
      }

      Alert.alert('Status Check', message);
    } finally {
      setStatusChecking(false);
    }
  }, [transactionReference]);

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
              <TouchableOpacity style={styles.verifyButton} onPress={handleVerifyMeter}>
                {verificationLoading ? (
                  <ActivityIndicator size="small" color="#FF7F00" />
                ) : (
                  <ThemedText style={styles.verifyButtonText}>Verify</ThemedText>
                )}
              </TouchableOpacity>
            </View>
            {verifiedName ? (
              <View style={styles.verifiedBanner}>
                <MaterialIcons name="check-circle" size={16} color="#4CAF50" />
                <ThemedText style={styles.verifiedText}>
                  {verifiedName} ({meterType.toUpperCase()})
                  {verifiedAddress ? ` • ${verifiedAddress}` : ''}
                </ThemedText>
              </View>
            ) : null}
          </View>

          {/* Phone Number Input */}
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
        </ScrollView>

        {/* Continue Button */}
        <View style={styles.buttonContainer}>
          <View style={styles.primaryActionsRow}>
            <TouchableOpacity style={styles.continueButton} onPress={handleContinue}>
              <ThemedText style={styles.continueButtonText}>Continue</ThemedText>
            </TouchableOpacity>
            <TouchableOpacity
              style={[styles.statusButton, (!transactionReference || statusChecking) && styles.statusButtonDisabled]}
              onPress={handleCheckStatus}
              disabled={!transactionReference || statusChecking}>
              {statusChecking ? (
                <ActivityIndicator color="#FF7F00" />
              ) : (
                <ThemedText
                  style={[
                    styles.statusButtonText,
                    (!transactionReference || statusChecking) && styles.statusButtonTextDisabled,
                  ]}>
                  Check Status
                </ThemedText>
              )}
            </TouchableOpacity>
          </View>

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
      {selectedProviderLogo && (
        <ConfirmPaymentModal
          visible={showConfirmModal}
          onClose={() => setShowConfirmModal(false)}
          onConfirm={handleConfirmPayment}
          amount={parseFloat(amount || '0')}
          network={selectedProviderName}
          networkLogo={selectedProviderLogo}
          recipient={meterNumber}
          serviceType={`Electricity • ${meterType.toUpperCase()}`}
          planDetails={planDetailsSummary}
        />
      )}

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
  primaryActionsRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    marginBottom: 12,
  },
  continueButton: {
    backgroundColor: '#FF7F00',
    borderRadius: 12,
    paddingVertical: 16,
    alignItems: 'center',
    flex: 1,
  },
  continueButtonText: {
    fontSize: 18,
    fontWeight: 'bold',
    color: '#fff',
  },
  statusButton: {
    borderWidth: 1.5,
    borderColor: '#FF7F00',
    borderRadius: 12,
    paddingVertical: 14,
    paddingHorizontal: 18,
    alignItems: 'center',
    justifyContent: 'center',
  },
  statusButtonDisabled: {
    opacity: 0.6,
  },
  statusButtonText: {
    fontSize: 16,
    fontWeight: '600',
    color: '#FF7F00',
  },
  statusButtonTextDisabled: {
    color: '#B0B0B0',
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
});

