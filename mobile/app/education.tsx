import { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import { StyleSheet, View, TextInput, TouchableOpacity, ScrollView, KeyboardAvoidingView, Platform, Alert, ActivityIndicator } from 'react-native';
import { ThemedView } from '@/components/themed-view';
import { ThemedText } from '@/components/themed-text';
import { MaterialIcons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import { Image } from 'expo-image';
import { ConfirmPaymentModal } from '@/components/confirm-payment-modal';
import { supabase } from '@/lib/supabase';
import { useFocusEffect } from '@react-navigation/native';

type EducationService = {
  id: string;
  examType: string;
  name: string;
  price: number;
  apiCode: string;
  logo: any;
  logoUrl?: string | null;
};

const SERVICE_LOGOS: Record<string, any> = {
  WAEC: require('@/assets/images/waec.png'),
  NECO: require('@/assets/images/neco.png'),
  JAMB: require('@/assets/images/jamb.png'),
};

const FALLBACK_SERVICES: EducationService[] = [
  { id: 'waec-fallback', examType: 'WAEC', name: 'WAEC Registration', price: 4500, apiCode: 'WAEC', logo: SERVICE_LOGOS.WAEC },
  { id: 'neco-fallback', examType: 'NECO', name: 'NECO Registration', price: 4200, apiCode: 'NECO', logo: SERVICE_LOGOS.NECO },
  { id: 'jamb-fallback', examType: 'JAMB', name: 'JAMB Registration', price: 6500, apiCode: 'JAMB', logo: SERVICE_LOGOS.JAMB },
];

const formatCurrency = (amount: number) => `₦${Number(amount).toLocaleString('en-NG', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

export default function EducationScreen() {
  const router = useRouter();
  const [services, setServices] = useState<EducationService[]>(FALLBACK_SERVICES);
  const [selectedServiceId, setSelectedServiceId] = useState<string | null>(FALLBACK_SERVICES[0]?.id ?? null);
  const [referenceNumber, setReferenceNumber] = useState('');
  const [phoneNumber, setPhoneNumber] = useState('');
  const [showConfirmModal, setShowConfirmModal] = useState(false);
  const [balance, setBalance] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
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
          .select('id, exam_type, service_name, price, custom_price, original_price, api_code, is_active, logo_url')
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

      if (servicesRes.status === 'fulfilled' && servicesRes.value.data) {
        mappedServices = servicesRes.value.data
          .map((service) => {
            const examTypeRaw = service.exam_type || service.service_name || service.id;
            const examType = examTypeRaw ? String(examTypeRaw).toUpperCase().trim() : 'EDUCATION';
            const price = service.custom_price ?? service.price ?? service.original_price ?? 0;
            const logoUrl = service.logo_url ? String(service.logo_url).trim() : null;
            const localLogo = SERVICE_LOGOS[examType] || SERVICE_LOGOS.WAEC;

            return {
              id: service.id,
              examType,
              name: service.service_name || examTypeRaw || 'Education Service',
              price,
              apiCode: service.api_code,
              logo: localLogo,
              logoUrl,
            } as EducationService;
          })
          .filter((service) => service.price > 0);
      } else if (servicesRes.status === 'rejected') {
        const err = servicesRes.reason;
        if (err?.code !== 'PGRST205') {
          throw err;
        }
        setError('Education services unavailable. Showing default providers.');
      }

      const preferredOrder = ['WAEC', 'NECO', 'JAMB'];
      const preferredMap = new Map<string, EducationService>();

      mappedServices.forEach((service) => {
        const matchExam = preferredOrder.find((exam) => {
          const upperName = service.name.toUpperCase();
          return service.examType.includes(exam) || upperName.includes(exam);
        });

        if (matchExam && !preferredMap.has(matchExam)) {
          preferredMap.set(matchExam, {
            ...service,
            examType: matchExam,
            name: `${matchExam} Registration`,
            logo: SERVICE_LOGOS[matchExam] || service.logo,
          });
        }
      });

      const finalServices = preferredOrder.map((exam) => {
        const remote = preferredMap.get(exam);
        if (remote) {
          return remote;
        }
        return FALLBACK_SERVICES.find((service) => service.examType === exam)!;
      });

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
        Alert.alert('Error', 'Please enter your JAMB registration/reference number');
        return;
      }
    } else {
      if (!phoneNumber.trim()) {
        Alert.alert('Error', 'Please enter the phone number associated with this purchase');
        return;
      }
    }

    const purchaseAmount = selectedService.price;
    if (!purchaseAmount || purchaseAmount <= 0) {
      Alert.alert('Error', 'Please enter a valid amount');
      return;
    }
    if (purchaseAmount > balance) {
      Alert.alert('Insufficient Balance', `Your wallet balance is ${formatCurrency(balance)}. Please fund your wallet to continue.`);
      return;
    }

    setShowConfirmModal(true);
  };

  const handleConfirmPayment = () => {
    setShowConfirmModal(false);
    const purchaseAmount = selectedService?.price ?? 0;

    router.push({
      pathname: '/payment-success',
      params: {
        amount: purchaseAmount.toString(),
        network: selectedServiceName,
        recipient: selectedService?.examType === 'JAMB' ? referenceNumber : phoneNumber,
        serviceType: `Education • ${selectedService?.examType ?? ''}`,
      },
    });
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

          {error && !loading ? (
            <View style={styles.errorBanner}>
              <MaterialIcons name="error-outline" size={20} color="#B3261E" />
              <ThemedText style={styles.errorText}>{error}</ThemedText>
            </View>
          ) : null}

          {/* Select Service Provider */}
          <View style={styles.section}>
            <ThemedText style={styles.sectionTitle}>Select Service Provider</ThemedText>
            <View style={styles.networkContainer}>
              {services.map((service) => (
                <TouchableOpacity
                  key={service.id}
                  style={styles.networkItem}
                  onPress={() => setSelectedServiceId(service.id)}
                  activeOpacity={0.7}>
                  <View
                    style={[
                      styles.networkLogoContainer,
                      {
                        borderWidth: selectedServiceId === service.id ? 2.5 : 1,
                        borderColor: selectedServiceId === service.id ? '#FF7F00' : '#E0E0E0',
                      },
                    ]}>
                    <Image
                      source={service.logoUrl ? { uri: service.logoUrl } : service.logo}
                      style={styles.networkLogoImage}
                      contentFit="contain"
                    />
                  </View>
                  <ThemedText style={styles.networkName}>{service.examType}</ThemedText>
                  <ThemedText style={styles.networkHint}>{formatCurrency(service.price)}</ThemedText>
                </TouchableOpacity>
              ))}
            </View>
          </View>

          {selectedService?.examType === 'JAMB' ? (
            <View style={styles.section}>
              <ThemedText style={styles.inputLabel}>Reference Number</ThemedText>
              <View style={styles.inputContainer}>
                <TextInput
                  style={styles.input}
                  placeholder="Enter JAMB reference number"
                  placeholderTextColor="#999"
                  value={referenceNumber}
                  onChangeText={setReferenceNumber}
                />
              </View>
            </View>
          ) : (
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

          <View style={styles.section}>
            <ThemedText style={styles.inputLabel}>Amount</ThemedText>
            <View style={[styles.inputContainer, styles.readOnlyContainer]}>
              {loading ? (
                <ActivityIndicator color="#FF7F00" />
              ) : (
                <ThemedText style={styles.readOnlyAmount}>{amountDisplay}</ThemedText>
              )}
            </View>
          </View>
        </ScrollView>

        {/* Continue Button */}
        <View style={styles.buttonContainer}>
          <TouchableOpacity style={styles.continueButton} onPress={handleContinue}>
            <ThemedText style={styles.continueButtonText}>Continue</ThemedText>
          </TouchableOpacity>
        </View>
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
});



