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
import { AppState, type AppStateStatus } from 'react-native';
import { supabase } from '@/lib/supabase';
import {
  DEFAULT_VENDING_PROVIDERS,
  VENDING_SETTING_KEYS,
  isVendingSettingKey,
  parseVendingProviders,
  patchVendingProviderFromSettingKey,
  providersFromAppSettingsRows,
  type VendingProviders,
} from '@/lib/vending-settings';

type VendingSettingsContextValue = {
  providers: VendingProviders;
  loading: boolean;
  refresh: () => Promise<void>;
};

const VendingSettingsContext = createContext<VendingSettingsContextValue | null>(null);

const POLL_INTERVAL_MS = 45_000;

function providersEqual(a: VendingProviders, b: VendingProviders): boolean {
  return (
    a.airtime === b.airtime &&
    a.data === b.data &&
    a.cable === b.cable &&
    a.electricity === b.electricity &&
    a.betting === b.betting
  );
}

/** signed_out | failed (keep current) | ok */
async function loadVendingProviders(): Promise<
  { status: 'signed_out' } | { status: 'failed' } | { status: 'ok'; providers: VendingProviders }
> {
  const { data: sessionData } = await supabase.auth.getSession();
  const accessToken = sessionData.session?.access_token;
  if (!accessToken) {
    return { status: 'signed_out' };
  }

  const { data: rows, error: tableError } = await supabase
    .from('app_settings')
    .select('setting_key, setting_value')
    .in('setting_key', [...VENDING_SETTING_KEYS]);

  if (!tableError && rows) {
    return { status: 'ok', providers: providersFromAppSettingsRows(rows) };
  }

  if (tableError) {
    console.warn('Direct vending settings read failed, falling back to edge function:', tableError.message);
  }

  const { data, error } = await supabase.functions.invoke('get-vending-settings', {
    headers: { Authorization: `Bearer ${accessToken}` },
  });

  if (error || !data?.success) {
    console.warn('Failed to fetch vending settings:', error || data?.error);
    return { status: 'failed' };
  }

  return { status: 'ok', providers: parseVendingProviders(data.providers) };
}

export function VendingSettingsProvider({ children }: { children: ReactNode }) {
  const [providers, setProviders] = useState<VendingProviders>(DEFAULT_VENDING_PROVIDERS);
  const [loading, setLoading] = useState(true);
  const [authUserId, setAuthUserId] = useState<string | null>(null);
  const isMountedRef = useRef(true);
  const providersRef = useRef(providers);
  const channelRef = useRef<ReturnType<typeof supabase.channel> | null>(null);
  const refreshInFlightRef = useRef<Promise<void> | null>(null);

  useEffect(() => {
    providersRef.current = providers;
  }, [providers]);

  const applyProviders = useCallback((next: VendingProviders) => {
    if (!isMountedRef.current) return;
    if (providersEqual(providersRef.current, next)) return;
    console.log('Vending providers updated:', next);
    setProviders(next);
  }, []);

  const refresh = useCallback(async () => {
    if (refreshInFlightRef.current) {
      return refreshInFlightRef.current;
    }

    const run = (async () => {
      try {
        const result = await loadVendingProviders();
        if (!isMountedRef.current) return;

        if (result.status === 'signed_out') {
          setProviders(DEFAULT_VENDING_PROVIDERS);
          return;
        }
        if (result.status === 'ok') {
          applyProviders(result.providers);
        }
        // On failed fetch, keep the last known providers (do not snap back to defaults).
      } catch (error) {
        console.warn('Vending settings refresh failed:', error);
      } finally {
        if (isMountedRef.current) {
          setLoading(false);
        }
        refreshInFlightRef.current = null;
      }
    })();

    refreshInFlightRef.current = run;
    return run;
  }, [applyProviders]);

  useEffect(() => {
    isMountedRef.current = true;
    void refresh();

    const { data: authListener } = supabase.auth.onAuthStateChange((event, session) => {
      const nextUserId = session?.user?.id ?? null;
      setAuthUserId(nextUserId);

      if (event === 'SIGNED_IN' || event === 'TOKEN_REFRESHED' || event === 'INITIAL_SESSION') {
        void refresh();
      }
      if (event === 'SIGNED_OUT') {
        setProviders(DEFAULT_VENDING_PROVIDERS);
      }
    });

    void supabase.auth.getSession().then(({ data }) => {
      setAuthUserId(data.session?.user?.id ?? null);
    });

    return () => {
      isMountedRef.current = false;
      authListener.subscription.unsubscribe();
    };
  }, [refresh]);

  // Pick up admin changes immediately when the app returns to the foreground.
  useEffect(() => {
    const onAppStateChange = (nextState: AppStateStatus) => {
      if (nextState === 'active') {
        void refresh();
      }
    };

    const subscription = AppState.addEventListener('change', onAppStateChange);
    return () => subscription.remove();
  }, [refresh]);

  // Safety-net poll while authenticated (covers missed realtime events).
  useEffect(() => {
    if (!authUserId) return;

    const intervalId = setInterval(() => {
      void refresh();
    }, POLL_INTERVAL_MS);

    return () => clearInterval(intervalId);
  }, [authUserId, refresh]);

  useEffect(() => {
    if (channelRef.current) {
      void supabase.removeChannel(channelRef.current);
      channelRef.current = null;
    }

    if (!authUserId) {
      return;
    }

    // Unique topic so remounts never hit "callbacks after subscribe".
    const topic = `vending-settings-${authUserId}-${Math.random().toString(36).slice(2, 10)}`;
    const channel = supabase
      .channel(topic)
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
            applyProviders(patched);
            return;
          }

          void refresh();
        },
      )
      .subscribe((status) => {
        if (status === 'SUBSCRIBED') {
          // Ensure we are in sync as soon as realtime is live.
          void refresh();
        } else if (status === 'CHANNEL_ERROR' || status === 'TIMED_OUT') {
          console.warn('Vending settings realtime channel status:', status);
          void refresh();
        }
      });

    channelRef.current = channel;

    return () => {
      void supabase.removeChannel(channel);
      if (channelRef.current === channel) {
        channelRef.current = null;
      }
    };
  }, [authUserId, applyProviders, refresh]);

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
