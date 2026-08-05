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
import { supabase } from '@/lib/supabase';
import {
  DEFAULT_VENDING_PROVIDERS,
  isVendingSettingKey,
  parseVendingProviders,
  patchVendingProviderFromSettingKey,
  type VendingProviders,
} from '@/lib/vending-settings';

type VendingSettingsContextValue = {
  providers: VendingProviders;
  loading: boolean;
  refresh: () => Promise<void>;
};

const VendingSettingsContext = createContext<VendingSettingsContextValue | null>(null);

async function fetchVendingProviders(): Promise<VendingProviders> {
  const { data: sessionData } = await supabase.auth.getSession();
  const accessToken = sessionData.session?.access_token;
  if (!accessToken) {
    return DEFAULT_VENDING_PROVIDERS;
  }

  const { data, error } = await supabase.functions.invoke('get-vending-settings', {
    headers: { Authorization: `Bearer ${accessToken}` },
  });

  if (error || !data?.success) {
    console.warn('Failed to fetch vending settings:', error || data?.error);
    return DEFAULT_VENDING_PROVIDERS;
  }

  return parseVendingProviders(data.providers);
}

export function VendingSettingsProvider({ children }: { children: ReactNode }) {
  const [providers, setProviders] = useState<VendingProviders>(DEFAULT_VENDING_PROVIDERS);
  const [loading, setLoading] = useState(true);
  const isMountedRef = useRef(true);
  const providersRef = useRef(providers);
  const channelRef = useRef<ReturnType<typeof supabase.channel> | null>(null);

  useEffect(() => {
    providersRef.current = providers;
  }, [providers]);

  const refresh = useCallback(async () => {
    try {
      const next = await fetchVendingProviders();
      if (isMountedRef.current) {
        setProviders(next);
      }
    } catch (error) {
      console.warn('Vending settings refresh failed:', error);
    } finally {
      if (isMountedRef.current) {
        setLoading(false);
      }
    }
  }, []);

  useEffect(() => {
    isMountedRef.current = true;
    void refresh();

    const { data: authListener } = supabase.auth.onAuthStateChange((event) => {
      if (event === 'SIGNED_IN' || event === 'TOKEN_REFRESHED') {
        void refresh();
      }
      if (event === 'SIGNED_OUT') {
        setProviders(DEFAULT_VENDING_PROVIDERS);
      }
    });

    return () => {
      isMountedRef.current = false;
      authListener.subscription.unsubscribe();
    };
  }, [refresh]);

  useEffect(() => {
    if (channelRef.current) {
      supabase.removeChannel(channelRef.current);
      channelRef.current = null;
    }

    const channel = supabase
      .channel('vending-settings')
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'app_settings',
        },
        (payload) => {
          const settingKey =
            (payload.new as { setting_key?: string } | null)?.setting_key ||
            (payload.old as { setting_key?: string } | null)?.setting_key;

          if (!settingKey || !isVendingSettingKey(settingKey)) {
            return;
          }

          const settingValue = (payload.new as { setting_value?: unknown } | null)?.setting_value;
          const patched = patchVendingProviderFromSettingKey(
            providersRef.current,
            settingKey,
            settingValue,
          );

          if (patched) {
            console.log('Vending provider updated via realtime:', settingKey, patched);
            setProviders(patched);
            return;
          }

          void refresh();
        },
      )
      .subscribe();

    channelRef.current = channel;

    return () => {
      if (channelRef.current) {
        supabase.removeChannel(channelRef.current);
        channelRef.current = null;
      }
    };
  }, [refresh]);

  const value = useMemo(
    () => ({
      providers,
      loading,
      refresh,
    }),
    [providers, loading, refresh],
  );

  return (
    <VendingSettingsContext.Provider value={value}>
      {children}
    </VendingSettingsContext.Provider>
  );
}

export function useVendingSettings(): VendingSettingsContextValue {
  const context = useContext(VendingSettingsContext);
  if (!context) {
    throw new Error('useVendingSettings must be used within VendingSettingsProvider');
  }
  return context;
}
