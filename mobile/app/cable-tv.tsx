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
import { supabase } from '@/lib/supabase';

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

        const { data, error } = await supabase
          .from('cable_tv_plans')
          .select('id, provider, package_name, price, custom_price, is_active')
          .eq('is_active', true)
          .order('provider', { ascending: true })
          .order('package_name', { ascending: true });

        if (error) throw error;

        if (!data) {
          if (isMounted.current) {
            setPlansByProvider({});
            setProviders([]);
            setSelectedProvider(null);
          }
        } else {
          const grouped: Record<string, CablePlan[]> = {};
          data.forEach((plan) => {
            const providerName = (plan.provider || 'Unknown').trim();
            if (!grouped[providerName]) grouped[providerName] = [];
            grouped[providerName].push({
              id: plan.id,
              packageName: plan.package_name,
              price: plan.custom_price ?? plan.price ?? 0,
            });
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
      } catch (error) {
        console.error('Failed to load cable plans:', error);
        if (isMounted.current) {
          setFetchError(error instanceof Error ? error.message : 'Unable to fetch cable TV plans');
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
        setShowServiceUnavailableModal(true);
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
    } catch (error) {
      console.error('Smart card verification failed:', error);
      setVerifiedName(null);
      setShowServiceUnavailableModal(true);
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
                <TouchableOpacity style={styles.verifyButton} onPress={handleVerifySmartCard}>
                  {verifying ? (
                    <ActivityIndicator size="small" color="#FF7F00" />
                  ) : (
                    <ThemedText style={styles.verifyButtonText}>Verify</ThemedText>
                  )}
                </TouchableOpacity>
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
});

