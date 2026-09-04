import { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import { StyleSheet, View, TextInput, TouchableOpacity, ScrollView, KeyboardAvoidingView, Platform, Alert } from 'react-native';
import { NetpayLoadingAnimation } from '@/components/netpay-loading-animation';
import * as Clipboard from 'expo-clipboard';
import { ThemedView } from '@/components/themed-view';
import { ThemedText } from '@/components/themed-text';
import { MaterialIcons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import { buildRouteHref } from '@/utils/router-href';
import { Image } from 'expo-image';
import { ConfirmPaymentModal } from '@/components/confirm-payment-modal';
import { InsufficientBalanceModal } from '@/components/insufficient-balance-modal';
import { DemoNumbersBanner } from '@/components/demo-numbers-banner';
import { supabase } from '@/lib/supabase';
import { useFocusEffect } from 'expo-router/react-navigation';
import { useWalletBalance } from '@/hooks/use-wallet-balance';
import { useServiceLogos } from '@/contexts/service-logos-context';

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

const LOCAL_SERVICE_LOGOS: Record<string, any> = {
  WAEC: require('@/assets/images/waec.png'),
  NECO: require('@/assets/images/neco.png'),
  JAMB: require('@/assets/images/jamb.png'),
};

const SERVICE_ID_MAP: Record<string, string> = {
  WAEC: 'AJA',
  NECO: 'AJC',
  JAMB: 'AJB',
};

const FALLBACK_SERVICES: EducationService[] = [
  { id: 'waec-fallback', examType: 'WAEC', name: 'WAEC Result Checker PIN', price: 3900, apiCode: 'WAEC', serviceId: SERVICE_ID_MAP.WAEC, logo: LOCAL_SERVICE_LOGOS.WAEC },
  { id: 'neco-fallback', examType: 'NECO', name: 'NECO Result Checker PIN', price: 3900, apiCode: 'NECO', serviceId: SERVICE_ID_MAP.NECO, logo: LOCAL_SERVICE_LOGOS.NECO },
  { id: 'jamb-fallback', examType: 'JAMB', name: 'JAMB Registration', price: 6500, apiCode: 'JAMB', serviceId: SERVICE_ID_MAP.JAMB, logo: LOCAL_SERVICE_LOGOS.JAMB },
];

const formatCurrency = (amount: number) => `₦${Number(amount).toLocaleString('en-NG', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

export default function EducationScreen() {
  const router = useRouter();
  const { getLogoUrl, getLogoSource } = useServiceLogos();
  const [services, setServices] = useState<EducationService[]>(FALLBACK_SERVICES);
  const [selectedServiceId, setSelectedServiceId] = useState<string | null>(FALLBACK_SERVICES[0]?.id ?? null);
  const [referenceNumber, setReferenceNumber] = useState('');
  const [phoneNumber, setPhoneNumber] = useState('');
  const [quantity, setQuantity] = useState(1);
  const [jambServiceType, setJambServiceType] = useState<'UTME' | 'DE'>('UTME'); // JAMB service type: UTME or DE
  const [verifyingProfile, setVerifyingProfile] = useState(false); // Loading state for profile verification
  const [verifiedCandidateDetails, setVerifiedCandidateDetails] = useState<{
    firstName?: string;
    lastName?: string;
    middleName?: string;
    gsmNo?: string;
  } | null>(null); // Store verified candidate details
  const [showConfirmModal, setShowConfirmModal] = useState(false);
  const [showInsufficientBalance, setShowInsufficientBalance] = useState(false);
  const { balance, setBalance, refreshBalance } = useWalletBalance();
  const [error, setError] = useState<string | null>(null);
  const [isProcessing, setIsProcessing] = useState(false);
  const [fetchingPrice, setFetchingPrice] = useState(false);
  const [fetchedPrices, setFetchedPrices] = useState<Record<string, number>>({});
  const [fetchedChargeFees, setFetchedChargeFees] = useState<Record<string, number>>({});
  const [fetchedTotalAmounts, setFetchedTotalAmounts] = useState<Record<string, number>>({}); // Store exact total_amount from API
  const [, setServiceAvailability] = useState<{
    WAEC: boolean;
    NECO: boolean;
    JAMB: boolean;
  }>({
    WAEC: true,
    NECO: true,
    JAMB: true,
  });
  const [isDemoUser, setIsDemoUser] = useState(false);
  const isMounted = useRef(true);
  
  // Education charge fee is 7%
  const EDUCATION_CHARGE_FEE_RATE = 0.07;

  useEffect(() => {
    isMounted.current = true;
    return () => {
      isMounted.current = false;
    };
  }, []);

  // Auto-fill demo profile code when JAMB is selected for demo users
  useEffect(() => {
    const currentSelectedService = selectedServiceId 
      ? services.find((service) => service.id === selectedServiceId) 
      : undefined;
    if (isDemoUser && currentSelectedService && currentSelectedService.examType === 'JAMB' && !referenceNumber.trim()) {
      setReferenceNumber('DEMO123456');
    }
  }, [isDemoUser, selectedServiceId, services, referenceNumber]);

  // Function to fetch real-time price from MobileNig
  const fetchServicePrice = useCallback(async (examType: string) => {
    try {
      setFetchingPrice(true);
      const { data: sessionData } = await supabase.auth.getSession();
      if (!sessionData.session) {
        console.warn('No session available for price fetch');
        return;
      }

      console.log('Fetching education price for:', examType);
      const { data, error } = await supabase.functions.invoke('fetch-education-prices', {
        body: { exam_type: examType },
        headers: {
          Authorization: `Bearer ${sessionData.session.access_token}`,
        },
      });

      if (error) {
        console.error('Error fetching price:', error);
        console.error('Error details:', {
          message: error.message,
          status: error.status,
          name: error.name,
        });
        return;
      }

      console.log('Price fetch response:', {
        success: data?.success,
        exam_type: data?.exam_type,
        pricesCount: data?.prices?.length,
        prices: data?.prices,
      });

      if (data?.success && data?.prices && data.prices.length > 0) {
        // Use the first price (or find the matching service)
        const priceData = data.prices[0];
        // price is the base purchase amount (without fee)
        // total_amount is price + charge_fee (exact amount from API)
        const basePrice = priceData?.price || 0;
        const chargeFee = priceData?.charge_fee || 0;
        const totalAmount = priceData?.total_amount || 0; // Exact total amount from API
        
        console.log('Fetched price data:', {
          examType,
          basePrice,
          chargeFee,
          totalAmount,
          fullData: priceData,
        });
        
        if (basePrice > 0) {
          // Store base price (purchase amount without fee)
          setFetchedPrices((prev) => ({
            ...prev,
            [examType]: basePrice,
          }));
          
          // Store charge fee
          if (chargeFee > 0) {
            setFetchedChargeFees((prev) => ({
              ...prev,
              [examType]: chargeFee,
            }));
          } else {
            // Calculate charge fee if not provided by API
            const calculatedFee = Math.round(basePrice * EDUCATION_CHARGE_FEE_RATE * 100) / 100;
            setFetchedChargeFees((prev) => ({
              ...prev,
              [examType]: calculatedFee,
            }));
          }
          
          // Store exact total amount from API (this is what user should see)
          if (totalAmount > 0) {
            setFetchedTotalAmounts((prev) => ({
              ...prev,
              [examType]: totalAmount,
            }));
          } else {
            // Fallback: calculate if API didn't provide total_amount
            const calculatedTotal = basePrice + (chargeFee > 0 ? chargeFee : Math.round(basePrice * EDUCATION_CHARGE_FEE_RATE * 100) / 100);
            setFetchedTotalAmounts((prev) => ({
              ...prev,
              [examType]: calculatedTotal,
            }));
          }
        } else {
          console.warn('Invalid price data received:', priceData);
        }
      } else {
        console.warn('No price data in response:', data);
      }
    } catch (err) {
      console.error('Failed to fetch service price:', err);
    } finally {
      setFetchingPrice(false);
    }
  }, []);

  const fetchEducationServices = useCallback(async () => {
    try {
      if (isMounted.current) {
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

      const [servicesRes] = await Promise.allSettled([
        supabase
          .from('education_services')
          .select('id, exam_type, service_name, price, custom_price, original_price, api_code, service_id, vtpass_code, vending_provider, is_active, logo_url, metadata')
          .eq('is_active', true)
          .order('exam_type', { ascending: true }),
      ]);

      let mappedServices: EducationService[] = [];

      const collectPriceCandidates = (source: unknown, depth = 0): (number | string)[] => {
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

      const parsePrice = (...values: (number | string | null | undefined)[]): number => {
        for (const value of values) {
          if (value == null) continue;
          const numeric: number =
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
              ? parsePrice(...(value as (number | string | null | undefined)[]))
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
              ...collectPriceCandidates(service.metadata)
            );
            const logoUrl =
              (service.logo_url ? String(service.logo_url).trim() : null) ||
              getLogoUrl('education', examType);
            const localLogo = getLogoSource(
              'education',
              examType,
              LOCAL_SERVICE_LOGOS[examType] || LOCAL_SERVICE_LOGOS.WAEC,
            );
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
                   Boolean(service.id) && 
                   service.price > 0;
          });
      } else if (servicesRes.status === 'rejected') {
        const err = servicesRes.reason;
        if (err?.code !== 'PGRST205') {
          throw err;
        }
        setError('Education services unavailable. Showing default providers.');
      }

      const preferredOrder = ['WAEC', 'NECO', 'JAMB'];
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
            logo: getLogoSource(
              'education',
              matchExam,
              LOCAL_SERVICE_LOGOS[matchExam] || service.logo,
            ),
          });
        }
      });

      // Fetch service availability settings
      let availabilitySettings = { WAEC: true, NECO: true, JAMB: true };
      try {
        const { data: availabilityData } = await supabase
          .from('app_settings')
          .select('setting_value')
          .eq('setting_key', 'education_service_availability')
          .maybeSingle();
        
        if (availabilityData?.setting_value) {
          const value = availabilityData.setting_value as any;
          // Helper function to parse boolean values correctly
          const parseBoolean = (val: any): boolean => {
            if (typeof val === 'boolean') return val;
            if (typeof val === 'string') {
              const lower = val.toLowerCase();
              if (lower === 'true') return true;
              if (lower === 'false') return false;
              // Default to true for any other string
              return true;
            }
            if (typeof val === 'number') return val === 1;
            // Default to true for undefined, null, or any other type
            return true;
          };
          
          // Parse availability settings - explicitly handle all cases
          availabilitySettings = {
            WAEC: value.hasOwnProperty('WAEC') ? parseBoolean(value.WAEC) : true,
            NECO: value.hasOwnProperty('NECO') ? parseBoolean(value.NECO) : true,
            JAMB: value.hasOwnProperty('JAMB') ? parseBoolean(value.JAMB) : true,
          };
          if (isMounted.current) {
            setServiceAvailability(availabilitySettings);
          }
          console.log('Fetched availability settings:', availabilitySettings);
        } else {
          // If no setting exists, all services are available by default
          availabilitySettings = { WAEC: true, NECO: true, JAMB: true };
          console.log('No availability settings found, using defaults:', availabilitySettings);
        }
      } catch (err) {
        console.warn('Failed to fetch service availability:', err);
      }

      const finalServices = preferredOrder
        .map((exam) => {
          // Check if service is available - use explicit boolean check
          const examKey = exam as keyof typeof availabilitySettings;
          const isAvailable = availabilitySettings[examKey] === true;
          
          // If service is not available, don't include it in the list
          if (!isAvailable) {
            console.log(`Service ${exam} is disabled (availability: ${availabilitySettings[examKey]}), filtering out`);
            return null;
          }
          
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
        setSelectedServiceId(validSelection ? selectedServiceId : finalServices[0]?.id ?? null);
      }
    } catch (err) {
      console.error('Failed to load education services:', err);
      if (isMounted.current) {
        setError(err instanceof Error ? err.message : 'Unable to load education services.');
        setServices(FALLBACK_SERVICES);
        setSelectedServiceId(FALLBACK_SERVICES[0]?.id ?? null);
      }
    }
  }, [router, selectedServiceId, getLogoUrl, getLogoSource]);

  useFocusEffect(
    useCallback(() => {
      fetchEducationServices();
    }, [fetchEducationServices])
  );

  // Fetch prices for all services after they're loaded
  useEffect(() => {
    if (services.length > 0) {
      // Fetch prices for all available services (only if not already fetched)
      services.forEach((service) => {
        if (service.examType && !fetchedPrices[service.examType]) {
          fetchServicePrice(service.examType);
        }
      });
    }
  }, [services, fetchedPrices, fetchServicePrice]);

  // Fetch price when service is selected - always fetch to get latest price
  useEffect(() => {
    const selectedService = selectedServiceId 
      ? services.find((service) => service.id === selectedServiceId) 
      : undefined;
    
    if (selectedService?.examType) {
      // Always fetch to get real-time price, even if we have a cached value
      console.log('Fetching real-time price for:', selectedService.examType);
      fetchServicePrice(selectedService.examType);
    }
  }, [selectedServiceId, services, fetchServicePrice]);

  const selectedService = useMemo(() => {
    return selectedServiceId ? services.find((service) => service.id === selectedServiceId) : undefined;
  }, [services, selectedServiceId]);

  // Calculate purchase amount (base price without fee)
  const purchaseAmount = useMemo(() => {
    if (!selectedService) return 0;
    const fetchedPrice = fetchedPrices[selectedService.examType];
    return fetchedPrice ?? selectedService.price ?? 0;
  }, [selectedService, fetchedPrices]);
  
  // Calculate charge fee (7% of purchase amount)
  const chargeFee = useMemo(() => {
    if (!selectedService || purchaseAmount <= 0) return 0;
    const fetchedFee = fetchedChargeFees[selectedService.examType];
    if (fetchedFee) return fetchedFee;
    return Math.round(purchaseAmount * EDUCATION_CHARGE_FEE_RATE * 100) / 100;
  }, [selectedService, purchaseAmount, fetchedChargeFees]);
  
  // Calculate total amount - prefer exact API total_amount, otherwise calculate
  // Multiply by quantity for multiple PINs (WAEC/NECO only, not JAMB)
  const totalAmount = useMemo(() => {
    if (!selectedService) return 0;
    // JAMB doesn't use quantity, always 1
    const qty = selectedService.examType === 'JAMB' ? 1 : (quantity || 1);
    // Use exact total amount from API if available (highest priority)
    const exactTotal = fetchedTotalAmounts[selectedService.examType];
    if (exactTotal && exactTotal > 0) {
      return exactTotal * qty;
    }
    // Fallback: calculate from purchase amount + charge fee
    return (purchaseAmount + chargeFee) * qty;
  }, [selectedService, purchaseAmount, chargeFee, fetchedTotalAmounts, quantity]);
  
  const selectedServiceName = selectedService 
    ? (selectedService.examType === "WAEC" 
        ? "WAEC Result Checker PIN" 
        : selectedService.examType === "NECO"
        ? "NECO Result Checker PIN"
        : selectedService.name || selectedService.examType || 'Education Service')
    : 'Education Service';
  const selectedServiceLogo = selectedService?.logoUrl
    ? { uri: selectedService.logoUrl }
    : selectedService?.logo;

  // Function to verify JAMB profile code
  const verifyJambProfile = useCallback(async () => {
    if (!selectedService || selectedService.examType !== 'JAMB') {
      return;
    }

    if (!referenceNumber.trim()) {
      Alert.alert('Error', 'Please enter your JAMB Profile Code');
      return;
    }

    setVerifyingProfile(true);
    setVerifiedCandidateDetails(null); // Clear previous verification

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

      // Call validate-jamb-profile edge function
      const { data, error } = await supabase.functions.invoke('validate-jamb-profile', {
        body: {
          confirmation_code: referenceNumber.trim(),
          service_type: jambServiceType,
        },
        headers: {
          Authorization: `Bearer ${accessToken}`,
        },
      });

      if (error) {
        console.error('Profile verification error:', error);
        throw new Error(error.message || 'Failed to verify profile');
      }

      if (!data?.success) {
        const errorMessage = data?.error || 'Profile verification failed';
        Alert.alert('Verification Failed', errorMessage);
        setVerifiedCandidateDetails(null);
        return;
      }

      // Profile verified successfully
      const candidateDetails = data.data;
      setVerifiedCandidateDetails(candidateDetails);
      
      // Optionally auto-fill phone number if available and not already set
      if (candidateDetails.gsmNo && !phoneNumber.trim()) {
        setPhoneNumber(candidateDetails.gsmNo);
      }

      Alert.alert(
        'Verification Successful',
        `Name: ${candidateDetails.firstName} ${candidateDetails.middleName || ''} ${candidateDetails.lastName}\nPhone: ${candidateDetails.gsmNo || 'N/A'}`,
        [{ text: 'OK' }]
      );
    } catch (err: any) {
      console.error('Error verifying JAMB profile:', err);
      Alert.alert('Error', err.message || 'Failed to verify JAMB profile. Please try again.');
      setVerifiedCandidateDetails(null);
    } finally {
      setVerifyingProfile(false);
    }
  }, [selectedService, referenceNumber, jambServiceType, phoneNumber, router]);

  const handleContinue = () => {
    if (!selectedService) {
      Alert.alert('Error', 'Please select an education provider');
      return;
    }
    const exam = selectedService.examType;
    if (exam === 'JAMB') {
      // For demo users, auto-fill if empty
      if (isDemoUser && !referenceNumber.trim()) {
        setReferenceNumber('DEMO123456');
      } else if (!isDemoUser && !referenceNumber.trim()) {
        Alert.alert('Error', 'Please enter your JAMB Profile Code');
        return;
      }
    }
    // Phone number is optional for WAEC/NECO - the function handles it automatically

    // Calculate charge fee (7% of purchase amount) - per unit
    const calculatedChargeFee = fetchedChargeFees[selectedService.examType] ?? 
      Math.round(purchaseAmount * EDUCATION_CHARGE_FEE_RATE * 100) / 100;
    // Multiply by quantity for total amount (WAEC/NECO only, not JAMB)
    const qty = exam === 'JAMB' ? 1 : (quantity || 1);
    const totalBaseAmount = purchaseAmount * qty;
    const totalChargeFee = calculatedChargeFee * qty;
    const totalAmountWithFee = totalBaseAmount + totalChargeFee;
    
    if (!purchaseAmount || purchaseAmount <= 0) {
      Alert.alert('Error', 'Please enter a valid amount');
      return;
    }
    // Quantity validation only for WAEC/NECO, not JAMB
    if (exam !== 'JAMB' && (!quantity || quantity < 1 || quantity > 10)) {
      Alert.alert('Error', 'Quantity must be between 1 and 10');
      return;
    }
    if (totalAmountWithFee > balance) {
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

      // Prepare request body - pass purchase_amount (base price without fee)
      // The backend will calculate and add the charge fee
      const requestBody: any = {
        exam_type: selectedService.examType,
        education_service_id: selectedService.id,
        amount: purchaseAmount, // Pass base purchase amount, backend adds charge fee
        quantity: selectedService.examType === 'JAMB' ? 1 : (quantity || 1), // JAMB always uses quantity 1
      };

      // For JAMB, pass the service type (UTME or DE) as api_code
      if (selectedService.examType === 'JAMB') {
        requestBody.api_code = jambServiceType; // 'UTME' or 'DE'
      } else if (selectedService.vtpassCode) {
        // Pass variation_code if available (function will use vtpass_code from DB if not provided)
        // For VTpass services, variation_code should be lowercase (e.g., "utme-mock", "utme-no-mock")
        requestBody.variation_code = selectedService.vtpassCode.toLowerCase();
      } else if (selectedService.apiCode) {
        // Also pass api_code as fallback (function will convert to lowercase for VTpass if needed)
        requestBody.api_code = selectedService.apiCode;
      }
      
      // Service ID is optional - function will get it from service row
      if (selectedService.serviceId) {
        requestBody.service_id = selectedService.serviceId;
      }

      // For JAMB, include Profile Code (billers_code/confirmationCode) and phone number
      if (selectedService.examType === 'JAMB') {
        // For demo users, auto-fill DEMO123456 if not set
        const profileCode = isDemoUser && !referenceNumber.trim() ? 'DEMO123456' : referenceNumber.trim();
        requestBody.billers_code = profileCode;
        
        // Phone number is optional for demo users, required for real users
        if (isDemoUser) {
          // For demo users, phone number is optional - use provided or empty string
          requestBody.phone_number = phoneNumber.trim() || '';
        } else {
          // For real users, phone number should come from verification
          const jambPhoneNumber = verifiedCandidateDetails?.gsmNo || phoneNumber || '';
          if (!jambPhoneNumber.trim()) {
            Alert.alert('Error', 'Phone number is required for JAMB purchase. Please verify your profile code first.');
            setIsProcessing(false);
            return;
          }
          requestBody.phone_number = jambPhoneNumber.trim();
        }
      }

      // Call purchase-education edge function
      let data, error;
      let responseData: any = null;
      
      try {
        const result = await supabase.functions.invoke('purchase-education', {
        body: requestBody,
        headers: {
          Authorization: `Bearer ${accessToken}`,
        },
      });
        data = result.data;
        error = result.error;
        
        if (data) {
          responseData = data;
        }
        
        // If there's an error (like FunctionsHttpError), use direct fetch to get actual error message
        if (error && (error.name === 'FunctionsHttpError' || error.message?.includes('non-2xx'))) {
          console.log('Supabase invoke returned HTTP error, trying direct fetch to get error details:', error);
          // Set error to null so we don't throw immediately, let the fallback fetch handle it
          error = null;
          // Trigger fallback by throwing (we'll catch it below)
          throw new Error('HTTP_ERROR_FALLBACK');
        }
      } catch (invokeError: any) {
        // Check if this is our intentional fallback trigger
        if (invokeError.message === 'HTTP_ERROR_FALLBACK') {
          // Continue to fallback fetch
        } else {
          console.log('Supabase invoke threw exception, trying direct fetch to get error details:', invokeError);
        }
        
        // Fallback to direct fetch to get the actual error message from response body
        const supabaseUrl = process.env.EXPO_PUBLIC_SUPABASE_URL || 
                           (supabase as any).supabaseUrl ||
                           'https://xrpuvnhmdmpgelfxpdcx.supabase.co';

        try {
          const response = await fetch(`${supabaseUrl}/functions/v1/purchase-education`, {
            method: 'POST',
            headers: {
              'Authorization': `Bearer ${accessToken}`,
              'Content-Type': 'application/json',
            },
            body: JSON.stringify(requestBody),
          });

          const responseText = await response.text();
          
          console.log('Education purchase raw response:', {
            status: response.status,
            statusText: response.statusText,
            responseLength: responseText?.length,
            responsePreview: responseText?.substring(0, 500)
          });
          
          if (!responseText || responseText.trim().length === 0) {
            throw new Error('No response from server. Please try again.');
          }
          
          try {
            responseData = JSON.parse(responseText);
            console.log('Education purchase parsed response:', {
              success: responseData?.success,
              error: responseData?.error,
              message: responseData?.message,
            });
          } catch (parseError) {
            console.error('Failed to parse purchase response:', parseError);
            if (response.status >= 500) {
              throw new Error('Server error. Please try again later.');
            }
            throw new Error('Invalid response from server. Please try again.');
          }

          // Handle HTTP errors (non-200 status codes)
          if (!response.ok) {
            if (response.status === 401) {
              throw new Error('Session expired. Please sign in again.');
            }
            const errorMsg = responseData?.error || responseData?.message || `HTTP ${response.status}: ${response.statusText}`;
            throw new Error(errorMsg);
          }
          
          // Success - use responseData
          data = responseData;
        } catch (fetchError: any) {
          const fetchErrorMessage = fetchError?.message || String(fetchError);
          if (fetchErrorMessage.includes('Network') || fetchErrorMessage.includes('fetch')) {
            throw new Error('Network connection failed. Please check your internet connection and try again.');
          }
          throw fetchError;
        }
      }

      // Handle error from invoke (when invoke succeeds but returns error that's not HTTP error)
      // HTTP errors are handled by fallback fetch above
      if (error && error.name !== 'FunctionsHttpError') {
        console.error('Education purchase error:', error);
        const errorMessage = error.message || 'Purchase failed';
        throw new Error(errorMessage);
      }

      // Check if response indicates success
      if (!responseData && !data) {
        throw new Error('No response from server. Please try again.');
      }

      const finalData = responseData || data;
      if (!finalData?.success) {
        const errorMessage = finalData?.error || finalData?.message || 'Purchase failed';
        console.error('Education purchase failed:', errorMessage);
        throw new Error(errorMessage);
      }
      
      // Use finalData as data
      data = finalData;

      // Refresh balance
      await refreshBalance();

      // Extract PIN details from response
      const pins = data?.data?.pins || [];
      const reference = data?.data?.reference || '';
      
      // Navigate to success screen with PIN details
      // Show total amount (purchase amount + charge fee) in success screen
      router.push(buildRouteHref('/payment-success', {
        amount: totalAmount.toString(),
        network: selectedServiceName,
        recipient: selectedService.examType === 'JAMB' ? referenceNumber : '',
        serviceType: `Education • ${selectedService.examType ?? ''}`,
        reference,
        pins: JSON.stringify(pins),
      }));
    } catch (purchaseError: any) {
      console.error('Education purchase failed:', purchaseError);
      let message = 'Unable to complete education service purchase. Please try again.';

      // Check for network/HTTP errors
      const errorMessage = purchaseError?.message || String(purchaseError);
      const errorName = purchaseError?.name || purchaseError?.constructor?.name || '';
      
      // Handle FunctionsHttpError (when edge function returns non-2xx status)
      if (errorName === 'FunctionsHttpError' || errorMessage.includes('non-2xx status')) {
        console.error('Edge function returned error status:', {
          status: purchaseError?.status,
          context: purchaseError?.context,
        });
        
        // Try to extract error message from response
        try {
          // The error might have context with the actual error message
          if (purchaseError?.context) {
            const errorData = typeof purchaseError.context === 'string' 
              ? JSON.parse(purchaseError.context) 
              : purchaseError.context;
            if (errorData?.error || errorData?.message) {
              message = errorData.error || errorData.message;
            }
          }
        } catch (e) {
          console.error('Failed to parse error context:', e);
        }
        
        Alert.alert('Education Purchase Failed', message || 'Purchase failed. Please try again or contact support.');
        return;
      }
      
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
            <MaterialIcons name="arrow-back" size={22} color="#000" />
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
              <ThemedText style={styles.balanceAmount}>{formatCurrency(balance)}</ThemedText>
            </View>
          </View>

          {/* Demo Numbers Banner */}
          {isDemoUser && <DemoNumbersBanner type="education" />}

          {/* Demo JAMB Profile Code - Always visible for demo users */}
          {isDemoUser && (
            <View style={styles.demoCard}>
              <View style={styles.demoCardHeader}>
                <MaterialIcons name="info" size={24} color="#FF7F00" />
                <ThemedText style={styles.demoCardTitle}>Demo JAMB Profile Code</ThemedText>
              </View>
              <View style={styles.demoCardContent}>
                <ThemedText style={styles.demoCardLabel}>Use this profile code for JAMB testing:</ThemedText>
                <TouchableOpacity
                  style={styles.demoCardValueContainer}
                  onPress={async () => {
                    await Clipboard.setStringAsync('DEMO123456');
                    Alert.alert('Copied!', 'Demo JAMB Profile Code copied to clipboard');
                    setReferenceNumber('DEMO123456');
                  }}
                  activeOpacity={0.7}>
                  <ThemedText style={styles.demoCardValue}>DEMO123456</ThemedText>
                  <MaterialIcons name="content-copy" size={20} color="#FF7F00" />
                </TouchableOpacity>
                <ThemedText style={styles.demoCardNote}>
                  This demo profile code works for all JAMB service types (UTME and DE). Select JAMB service below to use it.
                </ThemedText>
              </View>
            </View>
          )}

          {/* Service Selection */}
          <View style={styles.section}>
            <ThemedText style={styles.sectionTitle}>Select Exam Type</ThemedText>
            {error ? (
              <View style={{ padding: 20, backgroundColor: '#FFE2E2', borderRadius: 12, marginTop: 12 }}>
                <ThemedText style={{ color: '#8B1D1D', textAlign: 'center' }}>{error}</ThemedText>
              </View>
            ) : (
              <View style={styles.networksOuterContainer}>
                <View style={styles.networkContainer}>
                  {services.map((service) => {
                    return (
                    <TouchableOpacity
                      key={service.id}
                      style={[
                        styles.networkItem,
                        selectedServiceId === service.id && styles.networkItemActive,
                      ]}
                      onPress={() => {
                        setSelectedServiceId(service.id);
                      }}
                    >
                      <View style={[
                        styles.networkLogoContainer,
                        selectedServiceId === service.id && styles.networkLogoContainerActive
                      ]}>
                        {service.logoUrl ? (
                          <Image
                            source={{ uri: service.logoUrl }}
                            style={styles.networkLogoImage}
                            contentFit="contain"
                          />
                        ) : service.logo ? (
                          <Image
                            source={service.logo}
                            style={styles.networkLogoImage}
                            contentFit="contain"
                          />
                        ) : (
                          <MaterialIcons name="school" size={26} color={selectedServiceId === service.id ? "#FF7F00" : "#666"} />
                        )}
                      </View>
                      <ThemedText style={[
                        styles.networkName,
                        selectedServiceId === service.id && styles.networkNameActive,
                      ]}>
                        {service.examType === "WAEC" 
                          ? "WAEC Result Checker PIN" 
                          : service.examType === "NECO"
                          ? "NECO Result Checker PIN"
                          : service.name
                        }
              </ThemedText>
                        <ThemedText style={styles.networkHint}>
                          {(() => {
                            // Show exact total amount from API (highest priority)
                            const exactTotalAmount = fetchedTotalAmounts[service.examType];
                            if (exactTotalAmount && exactTotalAmount > 0) {
                              return formatCurrency(exactTotalAmount);
                            }
                            
                            // Fallback: Calculate from fetched price and fee
                            const fetchedPrice = fetchedPrices[service.examType];
                            const fetchedFee = fetchedChargeFees[service.examType];
                            if (fetchedPrice && fetchedPrice > 0) {
                              const calculatedTotal = fetchedPrice + (fetchedFee || Math.round(fetchedPrice * EDUCATION_CHARGE_FEE_RATE * 100) / 100);
                              return formatCurrency(calculatedTotal);
                            }
                            
                            // Show loading indicator if currently fetching
                            if (fetchingPrice && selectedServiceId === service.id) {
                              return 'Loading...';
                            }
                            
                            // Last fallback: Use service price from database
                            return formatCurrency(service.price);
                          })()}
                        </ThemedText>
                    </TouchableOpacity>
                    );
                  })}
                </View>
              </View>
            )}
          </View>

          {/* JAMB Service Type Selection (DE/UTME) */}
          {selectedService && selectedService.examType === 'JAMB' && (
            <View style={styles.section}>
              <ThemedText style={styles.inputLabel}>Service Type *</ThemedText>
              <View style={styles.serviceTypeContainer}>
                <TouchableOpacity
                  style={[
                    styles.serviceTypeButton,
                    jambServiceType === 'UTME' && styles.serviceTypeButtonActive
                  ]}
                  onPress={() => setJambServiceType('UTME')}
                >
                  <ThemedText style={[
                    styles.serviceTypeText,
                    jambServiceType === 'UTME' && styles.serviceTypeTextActive
                  ]}>
                    UTME
                  </ThemedText>
                </TouchableOpacity>
                <TouchableOpacity
                  style={[
                    styles.serviceTypeButton,
                    jambServiceType === 'DE' && styles.serviceTypeButtonActive
                  ]}
                  onPress={() => setJambServiceType('DE')}
                >
                  <ThemedText style={[
                    styles.serviceTypeText,
                    jambServiceType === 'DE' && styles.serviceTypeTextActive
                  ]}>
                    DE (Direct Entry)
                  </ThemedText>
                </TouchableOpacity>
              </View>
              <ThemedText style={styles.helpText}>
                Select your JAMB service type: UTME or DE (Direct Entry)
              </ThemedText>
            </View>
          )}

          {/* Quantity Input (WAEC/NECO only, not JAMB) */}
          {selectedService && selectedService.examType !== 'JAMB' && (
            <View style={styles.section}>
              <ThemedText style={styles.inputLabel}>Quantity</ThemedText>
              <View style={styles.inputContainer}>
                <View style={styles.quantityContainer}>
                  <TouchableOpacity
                    style={[styles.quantityButton, quantity <= 1 && styles.quantityButtonDisabled]}
                    onPress={() => {
                      if (quantity > 1) {
                        setQuantity(quantity - 1);
                      }
                    }}
                    disabled={quantity <= 1}
                  >
                    <MaterialIcons 
                      name="remove" 
                      size={20} 
                      color={quantity <= 1 ? "#ccc" : "#FF7F00"} 
                    />
                  </TouchableOpacity>
                  <View style={styles.quantityDisplay}>
                    <ThemedText style={styles.quantityText}>{quantity}</ThemedText>
                  </View>
                  <TouchableOpacity
                    style={[styles.quantityButton, quantity >= 10 && styles.quantityButtonDisabled]}
                    onPress={() => {
                      if (quantity < 10) {
                        setQuantity(quantity + 1);
                      }
                    }}
                    disabled={quantity >= 10}
                  >
                    <MaterialIcons 
                      name="add" 
                      size={20} 
                      color={quantity >= 10 ? "#ccc" : "#FF7F00"} 
                    />
                  </TouchableOpacity>
                </View>
              </View>
              <ThemedText style={styles.helpText}>
                Select the number of PINs you want to purchase (1-10)
              </ThemedText>
            </View>
          )}

          {/* JAMB Profile Code and Phone Number Input */}
          {selectedService && selectedService.examType === 'JAMB' && (
            <>
              <View style={styles.section}>
                <ThemedText style={styles.inputLabel}>JAMB Profile Code *</ThemedText>
                <View style={styles.inputRow}>
                  <View style={[styles.inputContainer, !isDemoUser && styles.inputWithButton]}>
                    <TextInput
                      style={styles.input}
                      placeholder={isDemoUser ? "DEMO123456 (auto-filled)" : "Enter your JAMB Profile Code"}
                      placeholderTextColor="#999"
                      value={referenceNumber}
                      onChangeText={(text) => {
                        setReferenceNumber(text);
                        setVerifiedCandidateDetails(null); // Clear verification when code changes
                      }}
                      autoCapitalize="characters"
                      editable={!verifyingProfile && !isDemoUser}
                    />
                  </View>
                  {!isDemoUser && (
                    <TouchableOpacity
                      style={[
                        styles.verifyButton,
                        (!referenceNumber.trim() || verifyingProfile) && styles.verifyButtonDisabled
                      ]}
                      onPress={verifyJambProfile}
                      disabled={!referenceNumber.trim() || verifyingProfile}
                    >
                      {verifyingProfile ? (
                        <NetpayLoadingAnimation size={24} variant="onBrand" strokeWidth={2} />
                      ) : verifiedCandidateDetails ? (
                        <MaterialIcons name="check-circle" size={20} color="#fff" />
                      ) : (
                        <ThemedText style={styles.verifyButtonText}>Verify</ThemedText>
                      )}
                    </TouchableOpacity>
                  )}
                </View>
                {!isDemoUser && verifiedCandidateDetails && (
                  <View style={styles.verifiedDetailsContainer}>
                    <View style={styles.verifiedDetailsRow}>
                      <MaterialIcons name="verified-user" size={16} color="#4CAF50" />
                      <ThemedText style={styles.verifiedDetailsText}>
                        {verifiedCandidateDetails.firstName} {verifiedCandidateDetails.middleName || ''} {verifiedCandidateDetails.lastName}
                      </ThemedText>
                    </View>
                    {verifiedCandidateDetails.gsmNo && (
                      <View style={styles.verifiedDetailsRow}>
                        <MaterialIcons name="phone" size={16} color="#4CAF50" />
                        <ThemedText style={styles.verifiedDetailsText}>
                          {verifiedCandidateDetails.gsmNo}
                        </ThemedText>
                      </View>
                    )}
                  </View>
                )}
                <ThemedText style={styles.helpText}>
                  {isDemoUser 
                    ? 'Demo profile code is pre-filled. You can proceed directly to purchase.'
                    : 'Your JAMB Profile Code is required for JAMB registration. Click Verify to confirm your details.'}
                </ThemedText>
              </View>
              <View style={styles.section}>
                <ThemedText style={styles.inputLabel}>
                  Phone Number {isDemoUser ? '(Optional)' : '(Optional)'}
                </ThemedText>
                <View style={styles.inputContainer}>
                  <TextInput
                    style={styles.input}
                    placeholder={isDemoUser ? "Enter phone number (optional for demo)" : "Enter phone number (optional)"}
                    placeholderTextColor="#999"
                    value={phoneNumber}
                    onChangeText={setPhoneNumber}
                    keyboardType="phone-pad"
                  />
                </View>
                <ThemedText style={styles.helpText}>
                  {isDemoUser 
                    ? 'Phone number is optional for demo users. You can proceed without it.'
                    : 'Phone number is optional for JAMB registration'}
                </ThemedText>
              </View>
            </>
          )}

        </ScrollView>

        {/* Continue Button */}
        {selectedService && (
          <View style={styles.buttonContainer}>
            <TouchableOpacity
              style={[
                styles.continueButton,
                (!selectedService || (selectedService.examType === 'JAMB' && !isDemoUser && !referenceNumber.trim())) && styles.continueButtonDisabled
              ]}
              onPress={handleContinue}
              disabled={!selectedService || (selectedService.examType === 'JAMB' && !isDemoUser && !referenceNumber.trim()) || isProcessing}
            >
              {isProcessing ? (
                <NetpayLoadingAnimation size={40} variant="onBrand" strokeWidth={2.5} />
              ) : (
                <ThemedText style={styles.continueButtonText}>Continue</ThemedText>
              )}
            </TouchableOpacity>
          </View>
        )}
      </KeyboardAvoidingView>

      {/* Confirm Payment Modal */}
      {selectedService && selectedServiceLogo && (
        <ConfirmPaymentModal
          visible={showConfirmModal}
          onClose={() => setShowConfirmModal(false)}
          onConfirm={handleConfirmPayment}
          amount={purchaseAmount}
          charges={chargeFee}
          quantity={selectedService.examType === 'JAMB' ? 1 : quantity}
          network={selectedServiceName}
          networkLogo={selectedServiceLogo}
          recipient={selectedService.examType === 'JAMB' ? referenceNumber : ''}
          serviceType={`Education • ${selectedService.examType}${selectedService.examType === 'JAMB' ? ` • ${jambServiceType}` : ''}`}
        />
      )}

      {/* Insufficient Balance Modal */}
      <InsufficientBalanceModal
        visible={showInsufficientBalance}
        onClose={() => setShowInsufficientBalance(false)}
        currentBalance={balance}
        requiredAmount={totalAmount || selectedService?.price || 0}
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
    fontSize: 20,
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
    fontSize: 14,
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
    fontSize: 28,
    fontWeight: 'bold',
    color: '#fff',
    lineHeight: 40,
  },
  section: {
    marginHorizontal: 20,
    marginBottom: 24,
  },
  sectionTitle: {
    fontSize: 16,
    fontWeight: 'bold',
    color: '#000',
    marginBottom: 16,
  },
  networksOuterContainer: {
    borderRadius: 18,
    borderWidth: 1.5,
    borderColor: '#E5E7EB',
    backgroundColor: '#FFFFFF',
    paddingVertical: 12,
    paddingHorizontal: 10,
  },
  networkContainer: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    justifyContent: 'space-between',
    gap: 12,
  },
  networkItem: {
    alignItems: 'center',
    width: '30%',
    minWidth: 100,
    padding: 10,
    borderRadius: 12,
    backgroundColor: '#F9FAFB',
    borderWidth: 1,
    borderColor: '#E5E7EB',
  },
  networkItemActive: {
    backgroundColor: '#FFF5E6',
    borderColor: '#FFB366',
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
    borderWidth: 2,
    borderColor: 'transparent',
  },
  networkLogoContainerActive: {
    borderColor: '#FF7F00',
  },
  networkLogoImage: {
    width: '100%',
    height: '100%',
  },
  networkName: {
    fontSize: 11,
    color: '#333',
    fontWeight: '500',
    textAlign: 'center',
    marginTop: 4,
  },
  networkNameActive: {
    color: '#FF7F00',
    fontWeight: '600',
  },
  networkHint: {
    fontSize: 11,
    color: '#777',
    marginTop: 4,
  },
  networkItemUnavailable: {
    opacity: 0.5,
  },
  networkNameUnavailable: {
    color: '#999',
    textDecorationLine: 'line-through',
  },
  unavailableLabel: {
    fontSize: 11,
    color: '#FF4444',
    fontWeight: '600',
    marginTop: 4,
    textAlign: 'center',
  },
  inputLabel: {
    fontSize: 14,
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
    fontSize: 14,
    color: '#333',
    paddingVertical: 12,
  },
  readOnlyContainer: {
    justifyContent: 'center',
  },
  readOnlyAmount: {
    fontSize: 16,
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
    fontSize: 16,
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
    fontSize: 12,
    color: '#8B1D1D',
  },
  quantityContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 20,
    paddingVertical: 10,
  },
  quantityButton: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: '#FFF5E6',
    borderWidth: 2,
    borderColor: '#FF7F00',
    justifyContent: 'center',
    alignItems: 'center',
  },
  quantityButtonDisabled: {
    backgroundColor: '#f5f5f5',
    borderColor: '#ccc',
  },
  quantityDisplay: {
    minWidth: 60,
    alignItems: 'center',
    justifyContent: 'center',
  },
  quantityText: {
    fontSize: 17,
    fontWeight: '600',
    color: '#333',
  },
  helpText: {
    fontSize: 12,
    color: '#777',
    marginTop: 6,
    fontStyle: 'italic',
  },
  serviceTypeContainer: {
    flexDirection: 'row',
    gap: 12,
    marginTop: 8,
  },
  serviceTypeButton: {
    flex: 1,
    paddingVertical: 14,
    paddingHorizontal: 16,
    borderRadius: 8,
    borderWidth: 2,
    borderColor: '#E0E0E0',
    backgroundColor: '#F5F5F5',
    alignItems: 'center',
    justifyContent: 'center',
  },
  serviceTypeButtonActive: {
    borderColor: '#FF7F00',
    backgroundColor: '#FFF5E6',
  },
  serviceTypeText: {
    fontSize: 14,
    fontWeight: '500',
    color: '#666',
  },
  serviceTypeTextActive: {
    color: '#FF7F00',
    fontWeight: '600',
  },
  inputRow: {
    flexDirection: 'row',
    gap: 12,
    alignItems: 'flex-start',
  },
  inputWithButton: {
    flex: 1,
  },
  verifyButton: {
    backgroundColor: '#FF7F00',
    borderRadius: 8,
    paddingHorizontal: 20,
    paddingVertical: 12,
    justifyContent: 'center',
    alignItems: 'center',
    minWidth: 80,
    height: 50,
  },
  verifyButtonDisabled: {
    backgroundColor: '#ccc',
    opacity: 0.6,
  },
  verifyButtonText: {
    color: '#fff',
    fontSize: 12,
    fontWeight: '600',
  },
  demoCard: {
    backgroundColor: '#FFF8E1',
    borderRadius: 12,
    marginHorizontal: 20,
    marginVertical: 12,
    borderWidth: 1,
    borderColor: '#FFE082',
    overflow: 'hidden',
  },
  demoCardHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    padding: 12,
    borderBottomWidth: 1,
    borderBottomColor: '#FFE082',
  },
  demoCardTitle: {
    fontSize: 14,
    fontWeight: '600',
    color: '#E65100',
  },
  demoCardContent: {
    padding: 12,
    gap: 8,
  },
  demoCardLabel: {
    fontSize: 12,
    fontWeight: '500',
    color: '#666',
  },
  demoCardValueContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#FFFFFF',
    borderRadius: 8,
    padding: 12,
    borderWidth: 1,
    borderColor: '#FFE082',
    gap: 8,
  },
  demoCardValue: {
    fontSize: 13,
    fontWeight: '600',
    color: '#000',
    flex: 1,
    fontFamily: 'monospace',
  },
  demoCardNote: {
    fontSize: 12,
    color: '#666',
    fontStyle: 'italic',
  },
  verifiedDetailsContainer: {
    marginTop: 12,
    padding: 12,
    backgroundColor: '#E8F5E9',
    borderRadius: 8,
    borderWidth: 1,
    borderColor: '#4CAF50',
  },
  verifiedDetailsRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginBottom: 4,
  },
  verifiedDetailsText: {
    fontSize: 12,
    color: '#2E7D32',
    fontWeight: '500',
  },
  continueButtonDisabled: {
    opacity: 0.6,
  },
});



