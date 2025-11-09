import {
  StyleSheet,
  View,
  ScrollView,
  TouchableOpacity,
  RefreshControl,
  ActivityIndicator,
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
] as const;

const formatCurrency = (value?: number | null) => {
  if (value === null || value === undefined || Number.isNaN(value)) {
    return '₦--';
  }
  return `₦${Number(value).toLocaleString('en-NG', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })}`;
};

const formatDate = (value?: string | null) => {
  if (!value) return '--';
  try {
    return new Date(value).toLocaleString('en-NG', {
      month: 'short',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    });
  } catch (error) {
    return '--';
  }
};

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

export default function PayBillsScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const [services, setServices] = useState<ServiceStat[]>([]);
  const [loading, setLoading] = useState(true);
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

    return SERVICE_CONFIG.map((service) => {
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
          availableLabel: available > 0 ? `${available} provider${available === 1 ? '' : 's'} active` : 'No cable providers yet',
          comingSoon: available === 0,
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

      return {
        ...service,
        availableLabel: 'Service available',
      };
    });
  }, []);

  const fetchPayBillsData = useCallback(
    async (refresh = false) => {
      try {
        if (refresh) {
          setRefreshing(true);
        } else {
          setLoading(true);
        }
        setErrorMessage(null);

        const { data: sessionData, error: sessionError } = await supabase.auth.getSession();
        if (sessionError) throw sessionError;

        const session = sessionData.session;
        if (!session) {
          if (isMounted.current) {
            setLoading(false);
            setRefreshing(false);
          }
          router.replace('/auth/login');
          return;
        }

        const userId = session.user.id;

        const [
          airtimeProvidersRes,
          dataPlansRes,
          cablePlansRes,
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
            .from('cable_tv_plans')
            .select('id, provider, package_name, price')
            .eq('is_active', true),
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

        if ([airtimeProvidersRes.error, dataPlansRes.error, cablePlansRes.error].some(Boolean)) {
          const errors = [airtimeProvidersRes.error, dataPlansRes.error, cablePlansRes.error]
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
          setLoading(false);
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
    router.push(service.route);
  };

  return (
    <ThemedView style={styles.container}>
      {loading && !refreshing ? (
        <View style={styles.loadingOverlay}>
          <ActivityIndicator size="large" color="#FF7F00" />
        </View>
      ) : null}

      <ScrollView
        style={styles.scrollView}
        contentContainerStyle={styles.scrollContent}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor="#FF7F00" />}
        showsVerticalScrollIndicator>
        <View style={[styles.header, { paddingTop: Math.max(insets.top + 16, 64) }]}>
          <ThemedText style={styles.pageTitle}>Pay Bills</ThemedText>
          <ThemedText style={styles.pageSubtitle}>Select a service to continue</ThemedText>
        </View>

        {errorMessage ? (
          <View style={styles.errorBanner}>
            <MaterialIcons name="error-outline" size={20} color="#d32f2f" />
            <ThemedText style={styles.errorText}>{errorMessage}</ThemedText>
          </View>
        ) : null}

        <View style={styles.servicesGrid}>
          {(services.length ? services : SERVICE_CONFIG).map((service) => (
            <TouchableOpacity
              key={service.id}
              style={styles.serviceCard}
              onPress={() => handleServicePress(service)}
              activeOpacity={0.7}
            >
              <View style={styles.iconCircle}>
                <MaterialIcons
                  name={service.icon}
                  size={28}
                  color="#FF7F00"
                />
              </View>
              <ThemedText style={styles.serviceName} numberOfLines={1}>
                {formatServiceName(service.name)}
              </ThemedText>
            </TouchableOpacity>
          ))}
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
    shadowColor: '#000000',
    shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 0.05,
    shadowRadius: 8,
    elevation: 3,
    marginBottom: 20,
  },
  pageTitle: {
    fontSize: 34,
    fontWeight: '800',
    color: '#1E2533',
    letterSpacing: 0.4,
  },
  pageSubtitle: {
    fontSize: 17,
    color: '#4E5A6D',
    letterSpacing: 0.2,
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
  servicesGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    paddingHorizontal: 20,
    justifyContent: 'space-between',
    gap: 14,
  },
  serviceCard: {
    width: '47%',
    aspectRatio: 1,
    backgroundColor: '#FFFFFF',
    borderRadius: 20,
    borderWidth: 1,
    borderColor: '#F0F2F5',
    justifyContent: 'center',
    alignItems: 'center',
    paddingVertical: 18,
    gap: 14,
    shadowColor: '#152238',
    shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 0.06,
    shadowRadius: 12,
    elevation: 3,
  },
  iconCircle: {
    width: 72,
    height: 72,
    borderRadius: 36,
    backgroundColor: '#FFF5E9',
    justifyContent: 'center',
    alignItems: 'center',
  },
  serviceName: {
    fontSize: 16,
    fontWeight: '600',
    color: '#152238',
    textAlign: 'center',
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
  loadingOverlay: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(255,255,255,0.7)',
    justifyContent: 'center',
    alignItems: 'center',
    zIndex: 10,
  },
});

