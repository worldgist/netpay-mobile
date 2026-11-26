import { useEffect, useMemo, useRef, useState } from 'react';
import { StyleSheet, View, TextInput, TouchableOpacity, ScrollView, KeyboardAvoidingView, Platform, Alert, ActivityIndicator, Modal } from 'react-native';
import { ThemedView } from '@/components/themed-view';
import { ThemedText } from '@/components/themed-text';
import { MaterialIcons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import { Image, ImageSource } from 'expo-image';
import { Dropdown } from '@/components/dropdown';
import { ConfirmPaymentModal } from '@/components/confirm-payment-modal';
import { InsufficientBalanceModal } from '@/components/insufficient-balance-modal';
import { DemoNumbersBanner } from '@/components/demo-numbers-banner';
import { supabase } from '@/lib/supabase';
import * as Clipboard from 'expo-clipboard';

const PROVIDER_LOGOS: Record<string, ImageSource<any>> = {
  DSTV: require('@/assets/images/dstv.png'),
  GOTV: require('@/assets/images/gotv.png'),
  STARTIMES: require('@/assets/images/startimes.png'),
};

const fallbackLogo = require('@/assets/images/logo.png');

type CableProvider = {
  name: string;
  logo: ImageSource<any>;
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
  const [isDemoUser, setIsDemoUser] = useState(false);

  useEffect(() => {
    isMounted.current = true;
    return () => {
      isMounted.current = false;
    };
  }, []);

  useEffect(() => {
    const loadData = async () => {
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
        }

        // Get the active cable vending provider setting
        const { data: providerSetting } = await supabase
          .from('app_settings')
          .select('setting_value')
          .eq('setting_key', 'cable_provider')
          .maybeSingle();

        const vendingProvider = providerSetting?.setting_value?.provider || 'smeplug';
        console.log('Fetching cable plans for vending provider:', vendingProvider);

        // Fetch plans with vending_provider filter
        let query = supabase
          .from('cable_tv_plans')
          .select('id, provider, package_name, price, custom_price, is_active, vending_provider')
          .eq('is_active', true);

        // Try to filter by vending_provider if column exists
        try {
          query = query.eq('vending_provider', vendingProvider);
        } catch (e) {
          console.warn('Vending provider column may not exist, fetching all plans');
        }

        const { data, error } = await query
          .order('provider', { ascending: true })
          .order('package_name', { ascending: true });

        if (error) {
          // If error is about missing column, try without vending_provider filter
          if (error.code === '42703' || error.message?.includes('vending_provider')) {
            console.warn('Vending provider column not found, fetching all active plans');
            const { data: allData, error: allError } = await supabase
              .from('cable_tv_plans')
              .select('id, provider, package_name, price, custom_price, is_active, vending_provider')
              .eq('is_active', true)
              .order('provider', { ascending: true })
              .order('package_name', { ascending: true });

            if (allError) throw allError;

            // Filter by vending_provider in memory
            const filtered = (allData || []).filter((plan: any) => 
              !plan.vending_provider || plan.vending_provider === vendingProvider
            );

            if (!filtered || filtered.length === 0) {
              if (isMounted.current) {
                setPlansByProvider({});
                setProviders([]);
                setSelectedProvider(null);
              }
            } else {
              const grouped: Record<string, CablePlan[]> = {};
              const seenPackages: Record<string, Set<string>> = {};
              filtered.forEach((plan: any) => {
                const providerName = (plan.provider || 'Unknown').trim();
                const packageName = (plan.package_name || '').trim();
                
                if (!grouped[providerName]) {
                  grouped[providerName] = [];
                  seenPackages[providerName] = new Set();
                }
                
                // Check if this package name already exists for this provider
                if (!seenPackages[providerName].has(packageName.toLowerCase())) {
                  seenPackages[providerName].add(packageName.toLowerCase());
                  grouped[providerName].push({
                    id: plan.id,
                    packageName: packageName,
                    price: plan.custom_price ?? plan.price ?? 0,
                  });
                }
              });

              const providerList: CableProvider[] = Object.keys(grouped).map((name) => {
                const upper = name.toUpperCase();
                return {
                  name,
                  logo: PROVIDER_LOGOS[upper] || fallbackLogo,
                };
              });

              if (isMounted.current) {
                setPlansByProvider(grouped);
                setProviders(providerList);
                if (providerList.length > 0) {
                  setSelectedProvider((prev) => prev ?? providerList[0].name);
                }
              }
            }
            return;
          }
          throw error;
        }

        if (!data) {
          if (isMounted.current) {
            setPlansByProvider({});
            setProviders([]);
            setSelectedProvider(null);
          }
        } else {
          const grouped: Record<string, CablePlan[]> = {};
          const seenPackages: Record<string, Set<string>> = {};
          data.forEach((plan) => {
            const providerName = (plan.provider || 'Unknown').trim();
            const packageName = (plan.package_name || '').trim();
            
            if (!grouped[providerName]) {
              grouped[providerName] = [];
              seenPackages[providerName] = new Set();
            }
            
            // Check if this package name already exists for this provider
            if (!seenPackages[providerName].has(packageName.toLowerCase())) {
              seenPackages[providerName].add(packageName.toLowerCase());
              grouped[providerName].push({
                id: plan.id,
                packageName: packageName,
                price: plan.custom_price ?? plan.price ?? 0,
              });
            }
          });

          const providerList: CableProvider[] = Object.keys(grouped).map((name) => {
            const upper = name.toUpperCase();
            return {
              name,
              logo: PROVIDER_LOGOS[upper] || fallbackLogo,
            };
          });

          if (isMounted.current) {
            setPlansByProvider(grouped);
            setProviders(providerList);
            if (providerList.length > 0) {
              setSelectedProvider((prev) => prev ?? providerList[0].name);
            }
          }
        }
      } catch (error: any) {
        console.error('Failed to load cable plans:', error);
        if (isMounted.current) {
          const errorMessage = error instanceof Error ? error.message : String(error);
          
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
            : errorMessage || 'Unable to fetch cable TV plans'
          );
          setPlansByProvider({});
          setProviders([]);
          setSelectedProvider(null);
        }
      } finally {
        if (isMounted.current) {
          setLoading(false);
          setRefreshingPlans(false);
          setBalanceLoading(false);
        }
      }
    };

    loadData();
  }, [router]);

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
    if (selectedPlan.price > availableBalance) {
      setShowInsufficientBalance(true);
      return;
    }

    setShowConfirmModal(true);
  };

  const handleConfirmPayment = () => {
    if (!selectedPlan || !selectedProvider) return;
    setShowConfirmModal(false);

    router.push({
      pathname: '/payment-success',
      params: {
        amount: selectedPlan.price.toString(),
        network: selectedProvider,
        recipient: smartCardNumber,
        serviceType: 'Cable TV',
      },
    });
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
            <ActivityIndicator color="#FF7F00" size="large" />
            <ThemedText style={styles.loaderText}>Loading cable packages…</ThemedText>
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
                  <ActivityIndicator color="#fff" />
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
                  onPress={() => {
                    setRefreshingPlans(true);
                    setLoading(true);
                    setTimeout(() => {
                      setLoading(false);
                      setRefreshingPlans(false);
                    }, 300);
                  }}
                >
                  {refreshingPlans ? (
                    <ActivityIndicator size="small" color="#FF7F00" />
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
                      <ActivityIndicator size="small" color="#FF7F00" />
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
              <ThemedText style={styles.inputLabel}>Select Package Plan</ThemedText>
              <Dropdown
                options={currentPlans.map((plan) => ({
                  id: plan.id,
                  name: plan.packageName,
                  amount: plan.price,
                }))}
                selectedId={packagePlan}
                onSelect={setPackagePlan}
                placeholder={currentPlans.length ? 'Select a package plan' : 'No plans available'}
                disabled={currentPlans.length === 0}
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
          onClose={() => setShowConfirmModal(false)}
          onConfirm={handleConfirmPayment}
          amount={selectedPlan.price}
          network={selectedProvider}
          networkLogo={selectedProviderLogo}
          recipient={smartCardNumber}
          serviceType={`Cable TV • ${selectedPlan.packageName}`}
        />
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
              We're experiencing technical difficulties. Please try again later.
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
        onRequestClose={() => setShowInvalidCardModal(false)}
      >
        <View style={styles.modalOverlay}>
          <View style={styles.modalContent}>
            <View style={styles.modalIconContainer}>
              <MaterialIcons name="credit-card-off" size={64} color="#FF7F00" />
            </View>
            <ThemedText style={styles.modalTitle}>Wrong Card Number</ThemedText>
            <ThemedText style={styles.modalMessage}>
              {invalidCardMessage || 'The smart card number you entered is incorrect. Please check the number and try again.'}
            </ThemedText>
            <TouchableOpacity
              style={styles.modalButton}
              onPress={() => {
                setShowInvalidCardModal(false);
                setSmartCardNumber('');
              }}
              activeOpacity={0.8}
            >
              <ThemedText style={styles.modalButtonText}>OK</ThemedText>
            </TouchableOpacity>
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
  modalButton: {
    backgroundColor: '#FF7F00',
    borderRadius: 12,
    paddingVertical: 14,
    paddingHorizontal: 32,
    width: '100%',
    alignItems: 'center',
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
});

