import {
  StyleSheet,
  View,
  ScrollView,
  TouchableOpacity,
  RefreshControl,
} from 'react-native';
import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { MaterialIcons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import { useCallback, useEffect, useRef, useState } from 'react';
import { useFocusEffect } from '@react-navigation/native';
import { supabase } from '@/lib/supabase';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

const SERVICE_CONFIG = [
  { id: 'airtime', name: 'Airtime', icon: 'phone' as const, route: '/airtime-purchase' },
  { id: 'cable', name: 'Cable TV', icon: 'tv' as const, route: '/cable-tv' },
  { id: 'data', name: 'Data', icon: 'wifi' as const, route: '/data-purchase' },
  { id: 'education', name: 'Education', icon: 'school' as const, route: '/education' },
  { id: 'electricity', name: 'Electricity', icon: 'flash-on' as const, route: '/electricity' },
  { id: 'flight', name: 'Book Flights', icon: 'flight' as const, route: '/flight-booking' },
  { id: 'betting', name: 'Betting', icon: 'casino' as const, route: '/betting' },
] as const;

const formatServiceName = (value: string) =>
  value
    .replace(/_/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .replace(/\b\w/g, (char) => char.toUpperCase());

type ServiceStat = {
  id: string;
  name: string;
  icon: keyof typeof MaterialIcons.glyphMap;
  route: string;
  availableLabel: string;
  lastTransaction?: {
    amount: number;
    date: string;
    status?: string | null;
  };
  comingSoon?: boolean;
};

const DEFAULT_SERVICES: ServiceStat[] = SERVICE_CONFIG.map((service) => ({
  ...service,
  availableLabel: 'Service available',
}));

export default function PayBillsScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const [services, setServices] = useState<ServiceStat[]>(DEFAULT_SERVICES);
  const [refreshing, setRefreshing] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const isMounted = useRef(true);

  useEffect(() => {
    isMounted.current = true;
    return () => {
      isMounted.current = false;
    };
  }, []);

  const buildServiceStats = useCallback((data: {
    airtimeProviders: any[];
    dataPlans: any[];
    cablePlans: any[];
    educationServices: { error?: Error | null; data: any[] };
    transactions: {
      airtime: any[];
      data: any[];
      electricity: any[];
    };
  }): ServiceStat[] => {
    const airtimeNetworks = new Set(
      data.airtimeProviders
        .map((provider) => provider.network_name)
        .filter((name: string | null) => Boolean(name))
    );

    const dataNetworks = new Set(
      data.dataPlans
        .map((plan) => plan.network)
        .filter((network: string | null) => Boolean(network))
    );

    const cableProviders = new Set(
      data.cablePlans
        .map((plan) => plan.provider)
        .filter((provider: string | null) => Boolean(provider))
    );

    const educationExams = new Set<string>();
    data.educationServices.data.forEach((service: any) => {
      const raw = service?.exam_type || service?.service_name || service?.id;
      if (!raw) return;
      const normalized = String(raw).trim();
      if (normalized) {
        educationExams.add(normalized.toUpperCase());
      }
    });

    const airtimeLast = data.transactions.airtime[0];
    const dataLast = data.transactions.data[0];
    const electricityLast = data.transactions.electricity[0];

    return SERVICE_CONFIG.map((service): ServiceStat => {
      if (service.id === 'airtime') {
        const available = airtimeNetworks.size;
        return {
          ...service,
          availableLabel: available > 0 ? `${available} network${available === 1 ? '' : 's'} available` : 'No networks available',
          lastTransaction: airtimeLast
            ? {
                amount: Number(airtimeLast.amount),
                date: airtimeLast.created_at,
                status: airtimeLast.status,
              }
            : undefined,
        };
      }

      if (service.id === 'data') {
        const available = dataNetworks.size;
        return {
          ...service,
          availableLabel: available > 0 ? `${available} network${available === 1 ? '' : 's'} supported` : 'No data plans yet',
          lastTransaction: dataLast
            ? {
                amount: Number(dataLast.amount),
                date: dataLast.created_at,
                status: dataLast.status,
              }
            : undefined,
        };
      }

      if (service.id === 'cable') {
        const available = cableProviders.size;
        return {
          ...service,
          availableLabel: available > 0 
            ? `${available} provider${available === 1 ? '' : 's'} available` 
            : 'Cable TV available',
          comingSoon: false, // Always available - packages are fetched from API
        };
      }

      if (service.id === 'education') {
        const hasError = Boolean(data.educationServices.error);
        const available = educationExams.size;
        return {
          ...service,
          availableLabel: hasError
            ? 'Request access from support'
            : available > 0
            ? `${available} exam${available === 1 ? '' : 's'} available`
            : 'No education services yet',
        };
      }

      if (service.id === 'electricity') {
        return {
          ...service,
          availableLabel: 'Pay any provider via meter lookup',
          lastTransaction: electricityLast
            ? {
                amount: Number(electricityLast.amount),
                date: electricityLast.created_at,
                status: electricityLast.status,
              }
            : undefined,
        };
      }

      if (service.id === 'flight') {
        return {
          ...service,
          name: 'Book Flights',
          availableLabel: 'Search and book flights',
        };
      }

      return {
        id: service.id,
        name: service.name,
        icon: service.icon,
        route: service.route,
        availableLabel: 'Service available',
      };
    });
  }, []);

  const fetchPayBillsData = useCallback(
    async (refresh = false) => {
      try {
        if (refresh) {
          setRefreshing(true);
        }
        setErrorMessage(null);

        const { data: sessionData, error: sessionError } = await supabase.auth.getSession();
        if (sessionError) throw sessionError;

        const session = sessionData.session;
        if (!session) {
          if (isMounted.current) {
            setRefreshing(false);
          }
          router.replace('/auth/login');
          return;
        }

        const userId = session.user.id;

        // Fetch cable TV providers from transactions (cable_tv_plans table no longer exists)
        let cablePlansRes: { data: { provider: string }[]; error: null } = { data: [], error: null };
        try {
          const cableTxRes = await supabase
            .from('cable_tv_transactions')
            .select('id, provider')
            .eq('user_id', userId)
            .order('created_at', { ascending: false })
            .limit(100);
          
          if (!cableTxRes.error && cableTxRes.data) {
            // Extract unique providers from transactions
            const providers = new Set(
              cableTxRes.data.map((tx: any) => tx.provider).filter(Boolean)
            );
            cablePlansRes = {
              data: Array.from(providers).map((provider: string) => ({ provider })),
              error: null,
            };
          } else {
            console.warn('Cable TV transactions query failed:', cableTxRes.error?.message);
            cablePlansRes = { data: [], error: null };
          }
        } catch (err) {
          console.warn('Error fetching cable TV data:', err);
          cablePlansRes = { data: [], error: null };
        }

        const [
          airtimeProvidersRes,
          dataPlansRes,
          airtimeTransactionsRes,
          dataTransactionsRes,
          electricityTransactionsRes,
        ] = await Promise.all([
          supabase
            .from('airtime_providers')
            .select('id, network_name, min_amount, max_amount')
            .eq('is_active', true),
          supabase.from('data_plans').select('id, network, plan_name, price, validity'),
          supabase
            .from('airtime_transactions')
            .select('id, amount, created_at, network, status, phone_number')
            .eq('user_id', userId)
            .order('created_at', { ascending: false })
            .limit(5),
          supabase
            .from('data_transactions')
            .select('id, amount, created_at, network, plan_name, status')
            .eq('user_id', userId)
            .order('created_at', { ascending: false })
            .limit(5),
          supabase
            .from('electricity_transactions')
            .select('id, amount, created_at, provider, meter_number, status')
            .eq('user_id', userId)
            .order('created_at', { ascending: false })
            .limit(5),
        ]);

        // Only show errors for critical tables (airtime, data), not cable (which uses transactions now)
        if ([airtimeProvidersRes.error, dataPlansRes.error].some(Boolean)) {
          const errors = [airtimeProvidersRes.error, dataPlansRes.error]
            .filter(Boolean)
            .map((err) => err?.message)
            .join('\n');
          if (isMounted.current) {
            setErrorMessage(errors || 'Unable to load bill services. Please try again.');
          }
        }

        const serviceStats = buildServiceStats({
          airtimeProviders: airtimeProvidersRes.data || [],
          dataPlans: dataPlansRes.data || [],
          cablePlans: cablePlansRes.data || [],
          educationServices: {
            error: null,
            data: [],
          },
          transactions: {
            airtime: airtimeTransactionsRes.data || [],
            data: dataTransactionsRes.data || [],
            electricity: electricityTransactionsRes.data || [],
          },
        });

        if (isMounted.current) {
          setServices(serviceStats);
        }
      } catch (error) {
        console.error('Failed to load Pay Bills data:', error);
        if (isMounted.current) {
          setErrorMessage(error instanceof Error ? error.message : 'Failed to load Pay Bills info.');
          setServices([]);
        }
      } finally {
        if (isMounted.current) {
          setRefreshing(false);
        }
      }
    },
    [buildServiceStats, router]
  );

  useFocusEffect(
    useCallback(() => {
      fetchPayBillsData();
    }, [fetchPayBillsData])
  );

  const onRefresh = useCallback(() => {
    fetchPayBillsData(true);
  }, [fetchPayBillsData]);

  const handleServicePress = (service: ServiceStat) => {
    router.push(service.route as any);
  };

  return (
    <ThemedView style={styles.container}>
      <ScrollView
        contentInsetAdjustmentBehavior="never"
        style={styles.scrollView}
        contentContainerStyle={styles.scrollContent}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor="#FF7F00" />}
        showsVerticalScrollIndicator>
        <View style={[styles.header, { paddingTop: Math.max(insets.top + 24, 88) }]}>
          <ThemedText style={styles.pageTitle}>Pay Bills</ThemedText>
          <ThemedText style={styles.pageSubtitle}>Select a service to continue</ThemedText>
        </View>

        {errorMessage ? (
          <View style={styles.errorBanner}>
            <MaterialIcons name="error-outline" size={20} color="#d32f2f" />
            <ThemedText style={styles.errorText}>{errorMessage}</ThemedText>
          </View>
        ) : null}

        <View style={styles.servicesContainer}>
          <View style={styles.servicesGrid}>
            {services.map((service: ServiceStat) => (
              <TouchableOpacity
                key={service.id}
                style={styles.serviceCard}
                onPress={() => handleServicePress(service)}
                activeOpacity={0.7}
              >
                <View style={[styles.iconCircle, service.comingSoon && styles.iconCircleMuted]}>
                  <MaterialIcons
                    name={service.icon}
                    size={24}
                    color={service.comingSoon ? '#B0B8C4' : '#FF7F00'}
                  />
                </View>
                <ThemedText
                  style={[styles.serviceName, service.comingSoon && styles.serviceNameMuted]}
                  numberOfLines={1}>
                  {formatServiceName(service.name)}
                </ThemedText>
                {service.comingSoon ? (
                  <ThemedText style={styles.comingSoonLabel}>Coming soon</ThemedText>
                ) : null}
              </TouchableOpacity>
            ))}
          </View>
        </View>
      </ScrollView>
    </ThemedView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#fff',
  },
  scrollView: {
    flex: 1,
    width: '100%',
  },
  scrollContent: {
    paddingBottom: 48,
  },
  header: {
    paddingHorizontal: 24,
    paddingBottom: 24,
    gap: 8,
    backgroundColor: '#FFFFFF',
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: '#E5E7EB',
    marginBottom: 20,
  },
  pageTitle: {
    fontSize: 32,
    fontWeight: '800',
    color: '#1E2533',
    letterSpacing: 0.4,
    lineHeight: 40,
  },
  pageSubtitle: {
    fontSize: 16,
    color: '#4E5A6D',
    letterSpacing: 0.2,
    lineHeight: 22,
  },
  balanceCard: {
    marginHorizontal: 20,
    marginBottom: 24,
    backgroundColor: '#FF7F00',
    borderRadius: 18,
    padding: 20,
  },
  balanceLabel: {
    fontSize: 14,
    color: '#FFF3E0',
    marginBottom: 8,
    letterSpacing: 0.3,
  },
  balanceValue: {
    fontSize: 30,
    fontWeight: '700',
    color: '#fff',
  },
  servicesContainer: {
    marginHorizontal: 20,
    marginBottom: 8,
    paddingVertical: 14,
    paddingHorizontal: 12,
    borderRadius: 20,
    backgroundColor: '#FFFFFF',
    borderWidth: 1.5,
    borderColor: '#D1D5DB',
  },
  servicesGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    paddingHorizontal: 4,
    justifyContent: 'space-between',
    gap: 10,
  },
  serviceCard: {
    width: '47%',
    backgroundColor: 'transparent',
    borderRadius: 0,
    borderWidth: 0,
    justifyContent: 'flex-start',
    alignItems: 'center',
    paddingVertical: 4,
    gap: 8,
  },
  iconCircle: {
    width: 58,
    height: 58,
    borderRadius: 29,
    backgroundColor: '#FFF5E9',
    justifyContent: 'center',
    alignItems: 'center',
  },
  iconCircleMuted: {
    backgroundColor: '#F0F2F5',
  },
  serviceName: {
    fontSize: 14,
    fontWeight: '600',
    color: '#152238',
    textAlign: 'center',
  },
  serviceNameMuted: {
    color: '#7A8699',
  },
  comingSoonLabel: {
    fontSize: 11,
    fontWeight: '700',
    color: '#FF7F00',
    textTransform: 'uppercase',
    letterSpacing: 0.6,
    marginTop: 2,
  },
  transactionRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginHorizontal: 20,
    marginBottom: 14,
    padding: 16,
    borderRadius: 14,
    backgroundColor: '#F8F8F8',
  },
  transactionIconWrapper: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: '#FFE9D6',
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: 14,
  },
  transactionDetails: {
    flex: 1,
  },
  transactionType: {
    fontSize: 14,
    fontWeight: '700',
    color: '#333',
    marginBottom: 2,
  },
  transactionDescription: {
    fontSize: 13,
    color: '#666',
  },
  transactionDate: {
    fontSize: 12,
    color: '#999',
    marginTop: 4,
  },
  transactionAmountWrapper: {
    alignItems: 'flex-end',
    marginLeft: 10,
  },
  transactionAmount: {
    fontSize: 15,
    fontWeight: '700',
    color: '#1B4332',
  },
  transactionStatus: {
    fontSize: 11,
    fontWeight: '600',
    color: '#666',
  },
  emptyState: {
    alignItems: 'center',
    justifyContent: 'center',
    marginHorizontal: 20,
    paddingVertical: 32,
    gap: 12,
  },
  emptyStateText: {
    fontSize: 14,
    color: '#777',
    textAlign: 'center',
  },
  errorBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    borderRadius: 12,
    marginHorizontal: 20,
    marginBottom: 16,
    paddingVertical: 12,
    paddingHorizontal: 14,
    backgroundColor: '#fdecea',
  },
  errorText: {
    color: '#d32f2f',
    fontSize: 13,
    flex: 1,
  },
});

