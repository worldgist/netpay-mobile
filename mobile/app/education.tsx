import { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import { StyleSheet, View, TextInput, TouchableOpacity, ScrollView, KeyboardAvoidingView, Platform, Alert, ActivityIndicator } from 'react-native';
import { ThemedView } from '@/components/themed-view';
import { ThemedText } from '@/components/themed-text';
import { MaterialIcons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import { Image } from 'expo-image';
import { ConfirmPaymentModal } from '@/components/confirm-payment-modal';
import { InsufficientBalanceModal } from '@/components/insufficient-balance-modal';
import { supabase } from '@/lib/supabase';
import { useFocusEffect } from '@react-navigation/native';

type EducationService = {
  id: string;
  examType: string;
  name: string;
  price: number;
  apiCode: string | null;
  serviceId: string;
  vtpassCode?: string | null;
  vendingProvider?: string | null;
  logo: any;
  logoUrl?: string | null;
};

const SERVICE_LOGOS: Record<string, any> = {
  WAEC: require('@/assets/images/waec.png'),
  JAMB: require('@/assets/images/jamb.png'),
};

const SERVICE_ID_MAP: Record<string, string> = {
  WAEC: 'AJA',
  JAMB: 'AJB',
};

const FALLBACK_SERVICES: EducationService[] = [
  { id: 'waec-fallback', examType: 'WAEC', name: 'WAEC Registration', price: 3900, apiCode: 'WAEC', serviceId: SERVICE_ID_MAP.WAEC, logo: SERVICE_LOGOS.WAEC },
  { id: 'jamb-fallback', examType: 'JAMB', name: 'JAMB Registration', price: 6500, apiCode: 'JAMB', serviceId: SERVICE_ID_MAP.JAMB, logo: SERVICE_LOGOS.JAMB },
];

const formatCurrency = (amount: number) => `₦${Number(amount).toLocaleString('en-NG', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

export default function EducationScreen() {
  const router = useRouter();
  const [services, setServices] = useState<EducationService[]>(FALLBACK_SERVICES);
  const [selectedServiceId, setSelectedServiceId] = useState<string | null>(FALLBACK_SERVICES[0]?.id ?? null);
  const [referenceNumber, setReferenceNumber] = useState('');
  const [phoneNumber, setPhoneNumber] = useState('');
  const [showConfirmModal, setShowConfirmModal] = useState(false);
  const [showInsufficientBalance, setShowInsufficientBalance] = useState(false);
  const [balance, setBalance] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [isProcessing, setIsProcessing] = useState(false);
  const isMounted = useRef(true);

  useEffect(() => {
    isMounted.current = true;
    return () => {
      isMounted.current = false;
    };
  }, []);

  const fetchEducationServices = useCallback(async () => {
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

      const [profileRes, servicesRes] = await Promise.allSettled([
        supabase
          .from('profiles')
          .select('balance')
          .eq('id', userId)
          .maybeSingle(),
        supabase
          .from('education_services')
          .select('id, exam_type, service_name, price, custom_price, original_price, api_code, service_id, vtpass_code, vending_provider, is_active, logo_url, metadata')
          .eq('is_active', true)
          .order('exam_type', { ascending: true }),
      ]);

      let balanceValue = 0;
      if (profileRes.status === 'fulfilled' && profileRes.value.data) {
        balanceValue = Number(profileRes.value.data.balance) || 0;
      } else if (profileRes.status === 'rejected' && profileRes.reason?.code !== 'PGRST116') {
        throw profileRes.reason;
      }

      let mappedServices: EducationService[] = [];

      const collectPriceCandidates = (source: unknown, depth = 0): Array<number | string> => {
        if (!source || depth > 3) return [];
        if (typeof source === 'number' && Number.isFinite(source)) {
          return [source];
        }
        if (typeof source === 'string') {
          return [source];
        }
        if (Array.isArray(source)) {
          return source.flatMap((item) => collectPriceCandidates(item, depth + 1));
        }
        if (typeof source === 'object') {
          const obj = source as Record<string, unknown>;
          const priceKeys = [
            'price',
            'amount',
            'unit_price',
            'unitPrice',
            'total',
            'value',
            'unitAmount',
            'unit_amount',
          ];
          const directMatches = priceKeys
            .filter((key) => key in obj)
            .flatMap((key) => collectPriceCandidates(obj[key], depth + 1));
          const nestedMatches = Object.values(obj)
            .flatMap((value) => collectPriceCandidates(value, depth + 1));
          return [...directMatches, ...nestedMatches];
        }
        return [];
      };

      const parsePrice = (...values: (number | string | null | undefined)[]) => {
        for (const value of values) {
          if (value == null) continue;
          const numeric =
            typeof value === 'number'
              ? value
              : typeof value === 'string'
              ? Number(
                  value
                    .toString()
                    .trim()
                    .replace(/[^\d.-]/g, '')
                )
              : Array.isArray(value)
              ? parsePrice(...value)
              : typeof value === 'object'
              ? parsePrice(...collectPriceCandidates(value))
              : NaN;
          if (!Number.isNaN(numeric) && Number.isFinite(numeric) && numeric > 0) {
            return numeric;
          }
        }
        return 0;
      };

      if (servicesRes.status === 'fulfilled' && servicesRes.value.data) {
        mappedServices = servicesRes.value.data
          .map((service) => {
            const examTypeRaw = service.exam_type || service.service_name || service.id;
            const examType = examTypeRaw ? String(examTypeRaw).toUpperCase().trim() : 'EDUCATION';
            // Prioritize price field (user-facing price) over custom_price and original_price
            // This matches the web app behavior
            const price = parsePrice(
              service.price,
              service.custom_price,
              service.original_price,
              collectPriceCandidates(service.metadata)
            );
            const logoUrl = service.logo_url ? String(service.logo_url).trim() : null;
            const localLogo = SERVICE_LOGOS[examType] || SERVICE_LOGOS.WAEC;
            const providerServiceId =
              (service.service_id && String(service.service_id).trim()) ||
              (service.api_code && String(service.api_code).trim()) ||
              SERVICE_ID_MAP[examType] ||
              service.id;

            const fallback = FALLBACK_SERVICES.find((s) => s.examType === examType);
            
            // Include vtpass_code and vending_provider for purchase
            const vtpassCode = service.vtpass_code ? String(service.vtpass_code).trim() : null;
            const vendingProvider = service.vending_provider ? String(service.vending_provider).trim() : null;
            
            // Only return valid service objects
            if (!service.id) {
              return null; // Skip invalid services
            }
            
            // Use parsed price if valid, otherwise use fallback
            // Use the parsed price directly - don't fallback to hardcoded prices
            // This ensures we use the actual database price, matching web app behavior
            const finalPrice = price > 0 ? price : 0;
            
            return {
              id: service.id,
              examType,
              name: service.service_name || examTypeRaw || fallback?.name || 'Education Service',
              price: finalPrice,
              apiCode: service.api_code,
              serviceId: providerServiceId.toUpperCase(),
              vtpassCode,
              vendingProvider,
              logo: localLogo,
              logoUrl,
            } as EducationService;
          })
          .filter((service): service is EducationService => {
            // Only include valid services with a valid price from database
            return service !== null && 
                   service !== undefined && 
                   service.id && 
                   service.price > 0;
          });
      } else if (servicesRes.status === 'rejected') {
        const err = servicesRes.reason;
        if (err?.code !== 'PGRST205') {
          throw err;
        }
        setError('Education services unavailable. Showing default providers.');
      }

      const preferredOrder = ['WAEC', 'JAMB'];
      const preferredMap = new Map<string, EducationService>();

      // Sort services by price (ascending) to prefer cheaper services, matching web app behavior
      const sortedMappedServices = [...mappedServices].sort((a, b) => a.price - b.price);
      
      sortedMappedServices.forEach((service) => {
        const matchExam = preferredOrder.find((exam) => {
          const upperName = service.name.toUpperCase();
          return service.examType.includes(exam) || upperName.includes(exam);
        });

        // Select the first (cheapest) service for each exam type
        if (matchExam && !preferredMap.has(matchExam)) {
          preferredMap.set(matchExam, {
            ...service,
            examType: matchExam,
            name: `${matchExam} Registration`,
            logo: SERVICE_LOGOS[matchExam] || service.logo,
          });
        }
      });

      const finalServices = preferredOrder
        .map((exam) => {
          const remote = preferredMap.get(exam);
          if (remote) {
            return remote;
          }
          return FALLBACK_SERVICES.find((service) => service.examType === exam);
        })
        .filter((service): service is EducationService => service !== undefined && service !== null);

      const validSelection = finalServices.some((service) => service.id === selectedServiceId);

      if (isMounted.current) {
        setServices(finalServices);
        setBalance(balanceValue);
        setSelectedServiceId(validSelection ? selectedServiceId : finalServices[0]?.id ?? null);
      }
    } catch (err) {
      console.error('Failed to load education services:', err);
      if (isMounted.current) {
        setError(err instanceof Error ? err.message : 'Unable to load education services.');
        setServices(FALLBACK_SERVICES);
        setSelectedServiceId(FALLBACK_SERVICES[0]?.id ?? null);
      }
    } finally {
      if (isMounted.current) {
        setLoading(false);
      }
    }
  }, [router, selectedServiceId]);

  useFocusEffect(
    useCallback(() => {
      fetchEducationServices();
    }, [fetchEducationServices])
  );

  const selectedService = useMemo(() => {
    return selectedServiceId ? services.find((service) => service.id === selectedServiceId) : undefined;
  }, [services, selectedServiceId]);

  const amountValue = selectedService?.price ?? 0;
  const amountDisplay = amountValue ? formatCurrency(amountValue) : 'N/A';
  const selectedServiceName = selectedService?.name || selectedService?.examType || 'Education Service';
  const selectedServiceLogo = selectedService?.logoUrl
    ? { uri: selectedService.logoUrl }
    : selectedService?.logo;

  const handleContinue = () => {
    if (!selectedService) {
      Alert.alert('Error', 'Please select an education provider');
      return;
    }
    const exam = selectedService.examType;
    if (exam === 'JAMB') {
      if (!referenceNumber.trim()) {
        Alert.alert('Error', 'Please enter your JAMB Profile ID');
        return;
      }
    }
    // Phone number is optional for WAEC/NECO - the function handles it automatically

    const purchaseAmount = selectedService.price;
    if (!purchaseAmount || purchaseAmount <= 0) {
      Alert.alert('Error', 'Please enter a valid amount');
      return;
    }
    if (purchaseAmount > balance) {
      setShowInsufficientBalance(true);
      return;
    }

    setShowConfirmModal(true);
  };

  const handleConfirmPayment = async () => {
    if (!selectedService) return;

    setIsProcessing(true);
    setShowConfirmModal(false);

    try {
      const { data: sessionData, error: sessionError } = await supabase.auth.getSession();
      if (sessionError) throw sessionError;

      const session = sessionData.session;
      if (!session) {
        Alert.alert('Error', 'Session expired. Please login again.');
        router.replace('/auth/login');
        return;
      }

      const accessToken = session.access_token;

      // Prepare request body - function will extract variation_code from service row if not provided
      const requestBody: any = {
        exam_type: selectedService.examType,
        education_service_id: selectedService.id,
        amount: selectedService.price,
        quantity: 1,
      };

      // Pass variation_code if available (function will use vtpass_code from DB if not provided)
      // For VTpass services, variation_code should be lowercase (e.g., "utme-mock", "utme-no-mock")
      if (selectedService.vtpassCode) {
        requestBody.variation_code = selectedService.vtpassCode.toLowerCase();
      } else if (selectedService.apiCode) {
        // Also pass api_code as fallback (function will convert to lowercase for VTpass if needed)
        requestBody.api_code = selectedService.apiCode;
      }
      
      // Service ID is optional - function will get it from service row
      if (selectedService.serviceId) {
        requestBody.service_id = selectedService.serviceId;
      }

      // For JAMB, include Profile ID (billers_code)
      // For WAEC/NECO, phone number is optional - function will handle it
      if (selectedService.examType === 'JAMB') {
        requestBody.billers_code = referenceNumber.trim();
        requestBody.phone_number = phoneNumber || ''; // Optional for JAMB
      } else if (phoneNumber && phoneNumber.trim()) {
        // Include phone number if provided (optional for WAEC/NECO)
        requestBody.phone_number = phoneNumber.trim();
      }

      // Call purchase-education edge function
      const { data, error } = await supabase.functions.invoke('purchase-education', {
        body: requestBody,
        headers: {
          Authorization: `Bearer ${accessToken}`,
        },
      });

      if (error) throw error;

      if (!data?.success) {
        throw new Error(data?.error || 'Purchase failed');
      }

      // Refresh balance
      const { data: profileData } = await supabase
        .from('profiles')
        .select('balance')
        .eq('id', session.user.id)
        .maybeSingle();

      if (profileData) {
        setBalance(profileData.balance || 0);
      }

      // Extract PIN details from response
      const pins = data?.data?.pins || [];
      const reference = data?.data?.reference || '';
      
      // Navigate to success screen with PIN details
      router.push({
        pathname: '/payment-success',
        params: {
          amount: selectedService.price.toString(),
          network: selectedServiceName,
          recipient: selectedService.examType === 'JAMB' ? referenceNumber : phoneNumber,
          serviceType: `Education • ${selectedService.examType ?? ''}`,
          reference,
          pins: JSON.stringify(pins),
        },
      });
    } catch (purchaseError: any) {
      console.error('Education purchase failed:', purchaseError);
      let message = 'Unable to complete education service purchase. Please try again.';

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
      }

      Alert.alert('Education Purchase Failed', message);
    } finally {
      setIsProcessing(false);
    }
  };

  return (
    <ThemedView style={styles.container}>
      <KeyboardAvoidingView
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
        style={styles.keyboardView}>
        <View style={styles.header}>
          <TouchableOpacity onPress={() => router.back()} style={styles.backButton}>
            <MaterialIcons name="arrow-back" size={24} color="#000" />
          </TouchableOpacity>
          <ThemedText style={styles.headerTitle}>Education</ThemedText>
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

          {/* Coming Soon Card */}
          <View style={styles.comingSoonCard}>
            <View style={styles.comingSoonIconContainer}>
              <MaterialIcons name="schedule" size={48} color="#FF7F00" />
            </View>
            <ThemedText style={styles.comingSoonTitle}>Coming Soon</ThemedText>
            <ThemedText style={styles.comingSoonMessage}>
              Education services are currently under development. We're working hard to bring you WAEC, NECO, and JAMB result checker PINs.
            </ThemedText>
            <ThemedText style={styles.comingSoonSubtext}>
              Stay tuned for updates!
            </ThemedText>
          </View>
        </ScrollView>
      </KeyboardAvoidingView>

      {/* Confirm Payment Modal */}
      {selectedService && selectedServiceLogo && (
        <ConfirmPaymentModal
          visible={showConfirmModal}
          onClose={() => setShowConfirmModal(false)}
          onConfirm={handleConfirmPayment}
          amount={amountValue}
          network={selectedServiceName}
          networkLogo={selectedServiceLogo}
          recipient={selectedService.examType === 'JAMB' ? referenceNumber : phoneNumber}
          serviceType={`Education • ${selectedService.examType}`}
        />
      )}

      {/* Insufficient Balance Modal */}
      <InsufficientBalanceModal
        visible={showInsufficientBalance}
        onClose={() => setShowInsufficientBalance(false)}
        currentBalance={balance}
        requiredAmount={selectedService?.price}
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
  networkHint: {
    fontSize: 12,
    color: '#777',
    marginTop: 4,
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
  readOnlyContainer: {
    justifyContent: 'center',
  },
  readOnlyAmount: {
    fontSize: 18,
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
    gap: 8,
    backgroundColor: '#FFE2E2',
    borderRadius: 12,
    padding: 12,
    marginHorizontal: 20,
    marginBottom: 16,
  },
  errorText: {
    flex: 1,
    fontSize: 14,
    color: '#8B1D1D',
  },
  helpText: {
    fontSize: 12,
    color: '#777',
    marginTop: 6,
    fontStyle: 'italic',
  },
  continueButtonDisabled: {
    opacity: 0.6,
  },
  comingSoonCard: {
    backgroundColor: '#FFF5E6',
    borderRadius: 16,
    padding: 24,
    marginHorizontal: 20,
    marginTop: 24,
    alignItems: 'center',
    borderWidth: 2,
    borderColor: '#FFE0B2',
    borderStyle: 'dashed',
  },
  comingSoonIconContainer: {
    width: 80,
    height: 80,
    borderRadius: 40,
    backgroundColor: '#FFF',
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 16,
  },
  comingSoonTitle: {
    fontSize: 24,
    fontWeight: 'bold',
    color: '#FF7F00',
    marginBottom: 12,
    textAlign: 'center',
  },
  comingSoonMessage: {
    fontSize: 15,
    color: '#666',
    textAlign: 'center',
    lineHeight: 22,
    marginBottom: 8,
  },
  comingSoonSubtext: {
    fontSize: 13,
    color: '#999',
    textAlign: 'center',
    fontStyle: 'italic',
  },
});



