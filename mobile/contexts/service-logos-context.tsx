import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from 'react';
import { AppState, type AppStateStatus, type ImageSourcePropType } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { supabase } from '@/lib/supabase';
import {
  buildLogoLookup,
  canonicalLogoCode,
  type ServiceLogo,
  type ServiceLogoCategory,
} from '@/lib/service-logos';

type LogoLookup = Record<ServiceLogoCategory, Record<string, ServiceLogo>>;

type ServiceLogosContextValue = {
  loading: boolean;
  refresh: () => Promise<void>;
  getLogoUrl: (category: ServiceLogoCategory, code?: string | null) => string | null;
  getLogoSource: (
    category: ServiceLogoCategory,
    code?: string | null,
    fallback?: ImageSourcePropType,
  ) => ImageSourcePropType | undefined;
};

const CACHE_KEY = '@netpay_service_logos_v1';

const EMPTY_LOOKUP: LogoLookup = {
  airtime: {},
  data: {},
  electricity: {},
  cable: {},
  education: {},
  betting: {},
};

const ServiceLogosContext = createContext<ServiceLogosContextValue | null>(null);

async function fetchLogoLookup(): Promise<LogoLookup> {
  const { data, error } = await supabase
    .from('service_logos')
    .select('category, code, name, logo_url, sort_order')
    .eq('is_active', true)
    .order('sort_order', { ascending: true });

  if (error) {
    throw error;
  }

  return buildLogoLookup(data || []);
}

export function ServiceLogosProvider({ children }: { children: ReactNode }) {
  const [lookup, setLookup] = useState<LogoLookup>(EMPTY_LOOKUP);
  const [loading, setLoading] = useState(true);
  const isMountedRef = useRef(true);
  const lookupRef = useRef(lookup);

  useEffect(() => {
    lookupRef.current = lookup;
  }, [lookup]);

  const applyLookup = useCallback((next: LogoLookup) => {
    if (!isMountedRef.current) return;
    setLookup(next);
    void AsyncStorage.setItem(CACHE_KEY, JSON.stringify(next)).catch(() => undefined);
  }, []);

  const refresh = useCallback(async () => {
    try {
      const next = await fetchLogoLookup();
      applyLookup(next);
    } catch (error) {
      console.warn('Failed to load service logos from database:', error);
    } finally {
      if (isMountedRef.current) {
        setLoading(false);
      }
    }
  }, [applyLookup]);

  useEffect(() => {
    isMountedRef.current = true;

    void (async () => {
      try {
        const cached = await AsyncStorage.getItem(CACHE_KEY);
        if (cached && isMountedRef.current) {
          setLookup(JSON.parse(cached) as LogoLookup);
          setLoading(false);
        }
      } catch {
        // ignore cache parse errors
      }
      await refresh();
    })();

    const channel = supabase
      .channel(`service-logos-${Math.random().toString(36).slice(2, 10)}`)
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'service_logos' },
        () => {
          void refresh();
        },
      )
      .subscribe();

    const onAppState = (state: AppStateStatus) => {
      if (state === 'active') void refresh();
    };
    const appSub = AppState.addEventListener('change', onAppState);

    return () => {
      isMountedRef.current = false;
      void supabase.removeChannel(channel);
      appSub.remove();
    };
  }, [refresh]);

  const getLogoUrl = useCallback((category: ServiceLogoCategory, code?: string | null) => {
    const canonical = canonicalLogoCode(category, code);
    if (!canonical) return null;

    const categoryMap = lookup[category] || {};
    if (categoryMap[canonical]?.logoUrl) return categoryMap[canonical].logoUrl;

    if (category === 'airtime' || category === 'data') {
      const other = category === 'airtime' ? lookup.data : lookup.airtime;
      if (other[canonical]?.logoUrl) return other[canonical].logoUrl;
      if (canonical === 'T2' && (categoryMap['9MOBILE']?.logoUrl || other['9MOBILE']?.logoUrl)) {
        return categoryMap['9MOBILE']?.logoUrl || other['9MOBILE']?.logoUrl || null;
      }
      if (canonical === '9MOBILE' && (categoryMap.T2?.logoUrl || other.T2?.logoUrl)) {
        return categoryMap.T2?.logoUrl || other.T2?.logoUrl || null;
      }
    }

    return null;
  }, [lookup]);

  const getLogoSource = useCallback(
    (
      category: ServiceLogoCategory,
      code?: string | null,
      fallback?: ImageSourcePropType,
    ): ImageSourcePropType | undefined => {
      const url = getLogoUrl(category, code);
      if (url) return { uri: url };
      return fallback;
    },
    [getLogoUrl],
  );

  const value = useMemo(
    () => ({
      loading,
      refresh,
      getLogoUrl,
      getLogoSource,
    }),
    [loading, refresh, getLogoUrl, getLogoSource],
  );

  return (
    <ServiceLogosContext.Provider value={value}>
      {children}
    </ServiceLogosContext.Provider>
  );
}

export function useServiceLogos(): ServiceLogosContextValue {
  const context = useContext(ServiceLogosContext);
  if (!context) {
    throw new Error('useServiceLogos must be used within ServiceLogosProvider');
  }
  return context;
}
