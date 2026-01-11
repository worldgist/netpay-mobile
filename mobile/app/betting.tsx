import { useEffect, useState, useRef, useCallback } from 'react';
import { StyleSheet, View, TextInput, TouchableOpacity, ScrollView, KeyboardAvoidingView, Platform, Alert, ActivityIndicator } from 'react-native';
import { ThemedView } from '@/components/themed-view';
import { ThemedText } from '@/components/themed-text';
import { MaterialIcons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { supabase } from '@/lib/supabase';
import { useFocusEffect } from '@react-navigation/native';
import { Dropdown } from '@/components/dropdown';
import { ConfirmPaymentModal } from '@/components/confirm-payment-modal';
import { InvalidAccountModal } from '@/components/invalid-account-modal';

type BettingProvider = {
  id: string;
  name: string;
  logo: any;
  providerCode: string;
};

const BETTING_PROVIDERS: BettingProvider[] = [
  { id: 'bet9ja', name: 'Bet9ja', logo: require('@/assets/images/bet9ja.png'), providerCode: 'BET9JA' },
  { id: 'nairabet', name: 'Nairabet', logo: require('@/assets/images/nairabet.png'), providerCode: 'NAIRABET' },
  { id: '1xbet', name: '1xBet', logo: require('@/assets/images/1xbet.png'), providerCode: '1XBET' },
  { id: 'betking', name: 'BetKing', logo: require('@/assets/images/betking.png'), providerCode: 'BETKING' },
  { id: 'betway', name: 'Betway', logo: require('@/assets/images/betway.png'), providerCode: 'BETWAY' },
  { id: 'merrybet', name: 'MerryBet', logo: require('@/assets/images/merrybet.png'), providerCode: 'MERRYBET' },
  { id: 'bangbet', name: 'BangBet', logo: require('@/assets/images/logo.png'), providerCode: 'BANGBET' },
  { id: 'betland', name: 'BetLand', logo: require('@/assets/images/logo.png'), providerCode: 'BETLAND' },
  { id: 'betlion', name: 'BetLion', logo: require('@/assets/images/logo.png'), providerCode: 'BETLION' },
  { id: 'cloudbet', name: 'CloudBet', logo: require('@/assets/images/logo.png'), providerCode: 'CLOUDBET' },
  { id: 'livescorebet', name: 'LiveScoreBet', logo: require('@/assets/images/logo.png'), providerCode: 'LIVESCOREBET' },
  { id: 'naijabet', name: 'NaijaBet', logo: require('@/assets/images/logo.png'), providerCode: 'NAIJABET' },
  { id: 'supabet', name: 'SupaBet', logo: require('@/assets/images/logo.png'), providerCode: 'SUPABET' },
];

// eBills supported betting providers (from eBills API documentation)
const EBILLS_SUPPORTED_PROVIDERS = [
  '1XBET',
  'BANGBET',
  'BET9JA',
  'BETKING',
  'BETLAND',
  'BETLION',
  'BETWAY',
  'CLOUDBET',
  'LIVESCOREBET',
  'MERRYBET',
  'NAIJABET',
  'NAIRABET',
  'SUPABET',
];

export default function BettingScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const [selectedProvider, setSelectedProvider] = useState<string | null>(null);
  const [accountId, setAccountId] = useState('');
  const [amount, setAmount] = useState('');
  const [balance, setBalance] = useState<number>(0);
  const [balanceLoading, setBalanceLoading] = useState<boolean>(true);
  const [showConfirmModal, setShowConfirmModal] = useState(false);
  const [purchasing, setPurchasing] = useState(false);
  const [vendingProvider, setVendingProvider] = useState<'vtpass' | 'mobilenig' | 'smeplug' | 'ebills'>('ebills');
  const [customerName, setCustomerName] = useState<string>('');
  const [verifyingCustomer, setVerifyingCustomer] = useState(false);
  const [showInvalidAccountModal, setShowInvalidAccountModal] = useState(false);
  const [invalidAccountError, setInvalidAccountError] = useState<string>('');
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

  const fetchBettingProvider = useCallback(async () => {
    try {
      const { data, error } = await supabase
        .from('app_settings')
        .select('setting_value')
        .eq('setting_key', 'betting_provider')
        .maybeSingle();

      if (error) {
        console.error('Error fetching betting provider setting:', error);
        setVendingProvider('ebills');
        return;
      }

      if (data?.setting_value) {
        const provider = (data.setting_value as any)?.provider || 'ebills';
        const validProviders = ['vtpass', 'mobilenig', 'smeplug', 'ebills'];
        const selectedProvider = validProviders.includes(provider) 
          ? provider as 'vtpass' | 'mobilenig' | 'smeplug' | 'ebills'
          : 'ebills';
        setVendingProvider(selectedProvider);
      } else {
        // If no setting exists, default to ebills
        setVendingProvider('ebills');
      }
    } catch (error) {
      console.error('Error fetching betting provider setting:', error);
      setVendingProvider('ebills');
    }
  }, []);

  useFocusEffect(
    useCallback(() => {
      fetchBalance();
      fetchBettingProvider();
    }, [fetchBalance, fetchBettingProvider])
  );

  const handleContinue = async () => {
    if (!selectedProvider) {
      Alert.alert('Error', 'Please select a betting service provider');
      return;
    }
    if (!accountId.trim()) {
      Alert.alert('Error', 'Please enter your Account ID / User ID');
      return;
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
    
    // Check if provider is supported by eBills when using eBills
    if (vendingProvider === 'ebills') {
      const provider = BETTING_PROVIDERS.find((p) => p.id === selectedProvider);
      const providerCode = provider?.providerCode || selectedProvider.toUpperCase();
      
      if (!EBILLS_SUPPORTED_PROVIDERS.includes(providerCode)) {
        const providerName = provider?.name || selectedProvider;
        setInvalidAccountError(`${providerName} is not available on eBills. Supported providers: Bet9ja, BetKing, BetWay, 1xBet, NairaBet, MerryBet, and others. Please try another provider or contact support.`);
        setShowInvalidAccountModal(true);
        return;
      }
    }
    
    // Calculate charge fee (10% for betting)
    const CHARGE_FEE_RATE = 0.1;
    const chargeFee = Math.round(purchaseAmount * CHARGE_FEE_RATE * 100) / 100;
    const totalAmount = purchaseAmount + chargeFee;

    if (totalAmount > balance) {
      Alert.alert('Insufficient Balance', `Your wallet balance is ₦${balance.toFixed(2)}. Please fund your wallet to continue.`);
      return;
    }

    // Verify customer if using eBills
    if (vendingProvider === 'ebills') {
      try {
        setVerifyingCustomer(true);
        const provider = BETTING_PROVIDERS.find((p) => p.id === selectedProvider);
        const providerCode = provider?.providerCode || selectedProvider.toUpperCase();

        const { data: { session } } = await supabase.auth.getSession();
        if (!session) {
          Alert.alert('Error', 'Please sign in to continue');
          return;
        }

        const { data, error } = await supabase.functions.invoke('verify-ebills-betting-customer', {
          body: {
            customer_id: accountId.trim(),
            betting_provider: providerCode,
          },
        });

        if (error) {
          console.error('Customer verification error:', error);
          const errorMessage = error?.message || 'Unable to verify account. Please check your Account ID and try again.';
          setInvalidAccountError(errorMessage);
          setShowInvalidAccountModal(true);
          return;
        }

        if (data?.success === false || data?.error) {
          // Extract error message from various possible fields
          let errorMessage = data?.error || data?.message || 'Invalid Account ID. Please check and try again.';
          const errorType = data?.errorType || 'verification_error';
          
          // Try to parse JSON string if error message contains JSON
          try {
            if (typeof errorMessage === 'string' && errorMessage.includes('{') && errorMessage.includes('code')) {
              const jsonMatch = errorMessage.match(/\{[\s\S]*\}/);
              if (jsonMatch) {
                const parsedError = JSON.parse(jsonMatch[0]);
                if (parsedError.message) {
                  errorMessage = parsedError.message;
                } else if (parsedError.code) {
                  errorMessage = parsedError.code;
                }
              }
            }
          } catch (parseError) {
            // If parsing fails, use original error message
            console.warn('Failed to parse error JSON:', parseError);
          }
          
          // If error is in a nested structure (e.g., data.error or data.data.error)
          if (!errorMessage || errorMessage === 'Invalid Account ID. Please check and try again.') {
            if (data?.data?.error) errorMessage = data.data.error;
            if (data?.data?.message) errorMessage = data.data.message;
            if (data?.details?.error) errorMessage = data.details.error;
            if (data?.details?.message) errorMessage = data.details.message;
          }
          
          // Handle different error types
          const lowerMessage = errorMessage.toLowerCase();
          const bettingProvider = data?.details?.betting_provider || selectedProvider?.name || 'This provider';
          
          if (errorType === 'invalid_service_id' || 
              lowerMessage.includes('invalid field') ||
              lowerMessage.includes('invalid service_id') ||
              lowerMessage.includes('valid service_id')) {
            // SportyBet is not supported by eBills
            if (bettingProvider.toUpperCase() === 'SPORTYBET') {
              errorMessage = 'SportyBet is currently not available on eBills. Please try another betting provider or contact support for alternative options.';
            } else {
              errorMessage = `${bettingProvider} is not available on eBills at the moment. Please try another provider or contact support.`;
            }
            // Log as warning for invalid service ID
            console.warn('Invalid service ID (provider not supported on eBills):', {
              betting_provider: bettingProvider,
              service_id: data?.details?.service_id,
              errorType,
            });
          } else if (lowerMessage.includes('service currently not available') || 
              lowerMessage.includes('service not available') ||
              errorType === 'service_unavailable') {
            errorMessage = 'Betting service is currently unavailable. Please try again later or contact support.';
            // Log as warning instead of error for service unavailable
            console.warn('Service unavailable:', {
              betting_provider: bettingProvider,
              service_id: data?.details?.service_id,
              errorType,
            });
          } else {
            // Only log as error for actual verification failures
            console.error('Customer verification failed:', {
              error: errorMessage,
              errorType,
              details: data?.details,
            });
          }
          
          // Handle status codes in error messages
          if (data?.data?.status && typeof data.data.status === 'number') {
            const status = data.data.status;
            if (status === 400) {
              // Don't override if we already have a specific message
              if (!errorMessage || errorMessage.includes('Invalid Account ID')) {
                errorMessage = 'Invalid request. Please check your Account ID and try again.';
              }
            } else if (status === 404) {
              errorMessage = errorMessage || 'Account ID not found. Please verify your Account ID and try again.';
            }
          }
          
          setInvalidAccountError(errorMessage);
          setShowInvalidAccountModal(true);
          return;
        }

        // Extract customer name from response
        const verifiedName = data?.data?.customer_name || data?.customer_name || '';
        
        // If no customer name found, treat as invalid
        if (!verifiedName || verifiedName.trim() === '') {
          setInvalidAccountError('Account ID not found. Please verify your Account ID and try again.');
          setShowInvalidAccountModal(true);
          return;
        }

        setCustomerName(verifiedName);
        setShowConfirmModal(true);
      } catch (error: any) {
        console.error('Error verifying customer:', {
          error,
          message: error?.message,
          errorObj: error?.error,
          data: error?.data,
          details: error?.details,
        });
        
        // Extract error message from various possible sources
        let errorMessage = error?.message || 
                          error?.error || 
                          error?.data?.error ||
                          error?.data?.message ||
                          error?.details?.error ||
                          error?.details?.message ||
                          'Unable to verify account. Please check your Account ID and try again.';
        
        // Handle status codes
        if (error?.data?.status === 400) {
          errorMessage = errorMessage || 'Invalid request. Please check your Account ID and try again.';
        } else if (error?.data?.status === 404) {
          errorMessage = errorMessage || 'Account ID not found. Please verify your Account ID and try again.';
        }
        
        setInvalidAccountError(errorMessage);
        setShowInvalidAccountModal(true);
      } finally {
        setVerifyingCustomer(false);
      }
    } else {
      // For other providers, show modal without customer name
      setCustomerName('');
      setShowConfirmModal(true);
    }
  };

  const handleConfirmPayment = useCallback(async () => {
    if (!selectedProvider) return;

    const purchaseAmount = parseFloat(amount);
    if (!Number.isFinite(purchaseAmount) || purchaseAmount <= 0) {
      Alert.alert('Betting Purchase', 'Amount is required.');
      return;
    }

    const sanitizedAccountId = accountId.trim();
    const provider = BETTING_PROVIDERS.find((p) => p.id === selectedProvider);
    const providerName = provider?.name || selectedProvider;
    const providerCode = provider?.providerCode || selectedProvider.toUpperCase();

    try {
      // Set purchasing state first to show loading in modal
      setPurchasing(true);
      // Keep modal open during processing - don't close it yet

      const { data: { session } } = await supabase.auth.getSession();
      
      if (!session) {
        throw new Error('Please sign in to continue');
      }

      let responseData: any = null;

      // If using eBills, call the eBills betting purchase function
      if (vendingProvider === 'ebills') {
        try {
          // Generate unique request ID
          const requestId = `req_${Date.now()}_${session.user.id.substring(0, 8)}`;

          console.log('Calling purchase-ebills-betting with:', {
            customer_id: sanitizedAccountId,
            betting_provider: providerCode,
            amount: purchaseAmount,
            request_id: requestId,
          });

          const { data, error } = await supabase.functions.invoke('purchase-ebills-betting', {
            body: {
              customer_id: sanitizedAccountId,
              betting_provider: providerCode,
              amount: Number(purchaseAmount), // Ensure it's a number
              request_id: requestId,
            },
          });

          console.log('Supabase invoke response:', { data, error });

          if (error) {
            console.error('Supabase invoke error:', error);
            const errorMsg = error?.message || String(error);
            const errorStack = error?.stack || '';
            const isNetworkErr = errorMsg.includes('Network request failed') ||
                                errorMsg.includes('Failed to fetch') ||
                                errorStack.includes('fetch.umd.js') ||
                                errorStack.includes('Network request failed');
            if (isNetworkErr) {
              throw new Error('Network connection failed. Please check your internet connection and try again.');
            }
            // If error has a message, use it
            if (error.message) {
              throw new Error(error.message);
            }
            throw error;
          }

          if (data) {
            // Check if data contains an error response
            if (data.success === false || data.error) {
              const errorMsg = data.error || data.message || 'Betting purchase failed';
              console.error('Error in response data:', { errorMsg, data });
              throw new Error(errorMsg);
            }
            responseData = data;
            console.log('Response data received:', responseData);
          } else {
            throw new Error('No response data from server');
          }
        } catch (invokeError: any) {
          console.log('Supabase invoke failed, trying direct fetch:', invokeError);
          
          // Refresh session before direct fetch
          const { data: { session: refreshedSession }, error: refreshError } = await supabase.auth.getSession();
          
          if (refreshError || !refreshedSession) {
            throw new Error('Please sign in to continue');
          }

          // Fallback to direct fetch
          const supabaseUrl = process.env.EXPO_PUBLIC_SUPABASE_URL || 
                             (supabase as any).supabaseUrl ||
                             'https://rekkdwpkzkhgnejgzhac.supabase.co';

          const requestId = `req_${Date.now()}_${session.user.id.substring(0, 8)}`;

          console.log('Direct fetch to:', `${supabaseUrl}/functions/v1/purchase-ebills-betting`);

          const response = await fetch(`${supabaseUrl}/functions/v1/purchase-ebills-betting`, {
            method: 'POST',
            headers: {
              'Authorization': `Bearer ${refreshedSession.access_token}`,
              'Content-Type': 'application/json',
            },
            body: JSON.stringify({
              customer_id: sanitizedAccountId,
              betting_provider: providerCode,
              amount: Number(purchaseAmount), // Ensure it's a number
              request_id: requestId,
            }),
          });

          const responseText = await response.text();
          
          console.log('Direct fetch response:', {
            status: response.status,
            statusText: response.statusText,
            responseText: responseText.substring(0, 500),
          });
          
          if (!responseText || responseText.trim().length === 0) {
            throw new Error('No response from server. Please try again.');
          }
          
          try {
            responseData = JSON.parse(responseText);
            console.log('Parsed response data:', responseData);
          } catch (parseError) {
            console.error('Failed to parse betting purchase response:', parseError, 'Response:', responseText);
            if (response.status >= 500) {
              throw new Error('Server error. Please try again later.');
            }
            throw new Error(`Invalid response from server: ${responseText.substring(0, 200)}`);
          }

          // Check HTTP status first
          if (!response.ok) {
            if (response.status === 401) {
              throw new Error('Session expired. Please sign in again.');
            }
            // Extract error message from response
            const errorMsg = responseData?.error || responseData?.message || responseData?.details?.error || `HTTP ${response.status}: ${response.statusText}`;
            console.error('HTTP error response:', { status: response.status, errorMsg, responseData });
            throw new Error(errorMsg);
          }

          // Also check if response indicates failure even if HTTP status is OK
          if (responseData?.success === false || responseData?.error) {
            const errorMsg = responseData?.error || responseData?.message || 'Betting purchase failed';
            console.error('Purchase failed in response:', { errorMsg, responseData });
            throw new Error(errorMsg);
          }
        }

        if (!responseData) {
          console.error('No responseData after invoke/fetch');
          throw new Error('No data received from server');
        }

        console.log('Final responseData check:', {
          success: responseData?.success,
          hasError: !!responseData?.error,
          hasData: !!responseData?.data,
          message: responseData?.message,
        });

        // Check if response indicates success
        if (responseData?.success === false || responseData?.error) {
          const errorMsg = responseData?.error || responseData?.message || 'Betting purchase failed';
          console.error('Purchase failed:', { errorMsg, responseData });
          throw new Error(errorMsg);
        }

        // Extract data from response
        const purchaseData = responseData.data || responseData;
        const reference = purchaseData.reference || purchaseData.request_id || `BET-${Date.now()}-${Math.random().toString(36).substr(2, 9).toUpperCase()}`;
        const customerName = purchaseData.customer_name || '';
        const amountCharged = parseFloat(purchaseData.amount_charged || purchaseData.amount || purchaseAmount.toString());

        console.log('Purchase successful, navigating to success screen:', {
          reference,
          customerName,
          amountCharged,
        });

        // Refresh balance
        await fetchBalance();

        // Close modal before navigating to success screen
        setShowConfirmModal(false);
        setPurchasing(false);

        // Navigate to success screen
        router.push({
          pathname: '/payment-success',
          params: {
            amount: amountCharged.toString(),
            network: providerName,
            recipient: sanitizedAccountId,
            reference: reference,
            serviceType: `Betting • ${providerName}`,
            customerName: customerName,
          },
        });
      } else {
        // For other vending providers (vtpass, mobilenig, smeplug), use direct database insert
        // This is a fallback for providers that don't have dedicated functions yet
        // Calculate charge fee (10% for betting)
        const CHARGE_FEE_RATE = 0.1;
        const chargeFee = Math.round(purchaseAmount * CHARGE_FEE_RATE * 100) / 100;
        const totalAmount = purchaseAmount + chargeFee;

        // Get current balance
        const { data: profile, error: profileError } = await supabase
          .from('profiles')
          .select('balance')
          .eq('id', session.user.id)
          .maybeSingle();

        if (profileError) throw profileError;

        const balanceBefore = Number(profile?.balance) || 0;
        const balanceAfter = balanceBefore - totalAmount;

        if (balanceAfter < 0) {
          throw new Error('Insufficient balance');
        }

        // Generate reference
        const reference = `BET-${Date.now()}-${Math.random().toString(36).substr(2, 9).toUpperCase()}`;

        // Insert transaction
        const { error: transactionError } = await supabase
          .from('betting_transactions')
          .insert({
            user_id: session.user.id,
            amount: totalAmount,
            purchase_amount: purchaseAmount,
            charge_fee: chargeFee,
            balance_before: balanceBefore,
            balance_after: balanceAfter,
            betting_provider: providerCode,
            account_number: sanitizedAccountId,
            vending_provider: vendingProvider,
            status: 'completed',
            reference: reference,
            performed_by: session.user.id,
          });

        if (transactionError) throw transactionError;

        // Update user balance
        const { error: balanceError } = await supabase
          .from('profiles')
          .update({ balance: balanceAfter })
          .eq('id', session.user.id);

        if (balanceError) throw balanceError;

        // Create user transaction record
        await supabase
          .from('user_transactions')
          .insert({
            user_id: session.user.id,
            transaction_type: 'purchase',
            amount: totalAmount,
            balance_before: balanceBefore,
            balance_after: balanceAfter,
            description: `Betting purchase - ${providerName}`,
            reference: reference,
            performed_by: session.user.id,
          });

        // Refresh balance
        await fetchBalance();

        // Close modal before navigating to success screen
        setShowConfirmModal(false);
        setPurchasing(false);

        // Navigate to success screen
        router.push({
          pathname: '/payment-success',
          params: {
            amount: totalAmount.toString(),
            network: providerName,
            recipient: sanitizedAccountId,
            reference: reference,
            serviceType: `Betting • ${providerName}`,
          },
        });
      }
    } catch (purchaseError: any) {
      console.error('Betting purchase failed:', purchaseError);
      console.error('Error details:', {
        message: purchaseError?.message,
        error: purchaseError?.error,
        details: purchaseError?.details,
        name: purchaseError?.name,
        code: purchaseError?.code,
        stack: purchaseError?.stack,
        fullError: JSON.stringify(purchaseError, Object.getOwnPropertyNames(purchaseError), 2)
      });
      
      let message = 'Unable to complete betting purchase. Please try again.';
      
      // Handle network errors
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
        // Close modal and show error
        setShowConfirmModal(false);
        setPurchasing(false);
        Alert.alert(
          'Connection Error',
          'Network connection failed. Please check your internet connection and try again.',
          [{ text: 'OK' }]
        );
        return;
      }
      
      // Extract error message from various sources
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
      } else if (purchaseError?.data?.error) {
        message = purchaseError.data.error;
      } else if (purchaseError?.data?.message) {
        message = purchaseError.data.message;
      }

      // Close modal and show error
      setShowConfirmModal(false);
      setPurchasing(false);
      
      // Show detailed error to user
      Alert.alert(
        'Betting Purchase Failed',
        message,
        [{ text: 'OK' }]
      );
    } finally {
      // Ensure purchasing state is reset even if there's an unexpected error
      setPurchasing(false);
    }
  }, [amount, accountId, selectedProvider, vendingProvider, router, fetchBalance]);

  return (
    <ThemedView style={styles.container}>
      <KeyboardAvoidingView
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
        style={styles.keyboardView}>
        <View style={styles.header}>
          <TouchableOpacity onPress={() => router.back()} style={styles.backButton}>
            <MaterialIcons name="arrow-back" size={24} color="#000" />
          </TouchableOpacity>
          <ThemedText style={styles.headerTitle}>Betting</ThemedText>
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
                <ThemedText style={styles.balanceAmount}>₦{balance.toFixed(2)}</ThemedText>
              )}
            </View>
          </View>

          {/* Select Service Provider */}
          <View style={styles.section}>
            <ThemedText style={styles.inputLabel}>Select Service Provider</ThemedText>
            <Dropdown
              options={BETTING_PROVIDERS.map(provider => ({ 
                id: provider.id, 
                name: provider.name, 
                logo: provider.logo 
              }))}
              selectedId={selectedProvider}
              onSelect={setSelectedProvider}
              placeholder="Select a betting provider"
            />
          </View>

          {/* Account ID / User ID Input */}
          <View style={styles.section}>
            <ThemedText style={styles.inputLabel}>Account ID / User ID</ThemedText>
            <View style={styles.inputContainer}>
              <TextInput
                style={styles.input}
                placeholder="Enter your Account ID or User ID"
                placeholderTextColor="#999"
                value={accountId}
                onChangeText={setAccountId}
                keyboardType="default"
                autoCapitalize="none"
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
            <ThemedText style={styles.inputHint}>
              A 10% service charge will be applied
            </ThemedText>
          </View>
        </ScrollView>

        {/* Continue Button */}
        <View style={styles.buttonContainer}>
          <TouchableOpacity 
            style={[styles.continueButton, verifyingCustomer && styles.continueButtonDisabled]} 
            onPress={handleContinue}
            disabled={verifyingCustomer}>
            {verifyingCustomer ? (
              <ActivityIndicator color="#fff" />
            ) : (
              <ThemedText style={styles.continueButtonText}>Continue</ThemedText>
            )}
          </TouchableOpacity>
        </View>
      </KeyboardAvoidingView>

      {/* Confirm Payment Modal */}
      {selectedProvider && (() => {
        const purchaseAmount = parseFloat(amount || '0');
        const CHARGE_FEE_RATE = 0.1;
        const chargeFee = purchaseAmount > 0 ? Math.round(purchaseAmount * CHARGE_FEE_RATE * 100) / 100 : 0;
        const selectedProviderObj = BETTING_PROVIDERS.find((p) => p.id === selectedProvider);
        return (
          <ConfirmPaymentModal
            visible={showConfirmModal}
            onClose={() => {
              // Prevent closing during processing
              if (purchasing) return;
              setShowConfirmModal(false);
              setCustomerName('');
            }}
            onConfirm={handleConfirmPayment}
            amount={purchaseAmount}
            charges={chargeFee}
            network={selectedProviderObj?.name || selectedProvider}
            networkLogo={selectedProviderObj?.logo}
            recipient={accountId}
            serviceType={`Betting • ${selectedProviderObj?.name || selectedProvider}`}
            loading={purchasing}
            customerName={customerName}
          />
        );
      })()}

      {/* Invalid Account Modal */}
      {selectedProvider && (() => {
        const selectedProviderObj = BETTING_PROVIDERS.find((p) => p.id === selectedProvider);
        return (
          <InvalidAccountModal
            visible={showInvalidAccountModal}
            onClose={() => {
              setShowInvalidAccountModal(false);
              setInvalidAccountError('');
            }}
            accountId={accountId}
            providerName={selectedProviderObj?.name || selectedProvider}
            message={invalidAccountError}
          />
        );
      })()}
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
    flex: 1,
    fontSize: 16,
    color: '#333',
    paddingVertical: 12,
  },
  inputHint: {
    fontSize: 12,
    color: '#666',
    marginTop: 4,
    fontStyle: 'italic',
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
  continueButtonDisabled: {
    opacity: 0.6,
  },
  continueButtonText: {
    fontSize: 18,
    fontWeight: 'bold',
    color: '#fff',
  },
});
