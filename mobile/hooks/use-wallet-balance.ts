import { useCallback, useEffect, useRef, useState } from 'react';
import { useFocusEffect } from 'expo-router/react-navigation';
import type { RealtimeChannel } from '@supabase/supabase-js';
import { supabase } from '@/lib/supabase';
import {
  readCachedWalletBalance,
  writeCachedWalletBalance,
  clearCachedWalletBalance,
} from '@/utils/wallet-balance-cache';

type UseWalletBalanceOptions = {
  refreshOnFocus?: boolean;
  /** Poll wallet balance on this interval (ms) while the screen is focused. */
  pollIntervalMs?: number;
  /** Called when balance increases (funding, refund, etc.). */
  onBalanceIncrease?: (nextBalance: number, previousBalance: number) => void;
};

export function useWalletBalance(options: UseWalletBalanceOptions = {}) {
  const { refreshOnFocus = true, pollIntervalMs, onBalanceIncrease } = options;
  const [balance, setBalanceState] = useState(0);
  const [userId, setUserId] = useState<string | null>(null);
  const fetchInFlightRef = useRef<Promise<void> | null>(null);
  const isMountedRef = useRef(true);
  const balanceRef = useRef(0);
  const onBalanceIncreaseRef = useRef(onBalanceIncrease);
  const balanceChannelRef = useRef<RealtimeChannel | null>(null);
  const hasHydratedRef = useRef(false);
  const applyBalanceRef = useRef<(value: number, options?: { persist?: boolean; hydrating?: boolean }) => void>(
    () => undefined,
  );
  const userIdRef = useRef<string | null>(null);

  useEffect(() => {
    onBalanceIncreaseRef.current = onBalanceIncrease;
  }, [onBalanceIncrease]);

  useEffect(() => {
    isMountedRef.current = true;
    return () => {
      isMountedRef.current = false;
      hasHydratedRef.current = false;
    };
  }, []);

  useEffect(() => {
    userIdRef.current = userId;
  }, [userId]);

  const applyBalance = useCallback((value: number, options?: { persist?: boolean; hydrating?: boolean }) => {
    const persist = options?.persist ?? true;
    const hydrating = options?.hydrating ?? false;
    const normalized = Number.isFinite(value) ? value : 0;
    const previous = balanceRef.current;

    balanceRef.current = normalized;
    if (isMountedRef.current) {
      setBalanceState(normalized);
    }

    if (hydrating) {
      hasHydratedRef.current = true;
    } else if (hasHydratedRef.current && normalized > previous) {
      onBalanceIncreaseRef.current?.(normalized, previous);
    }

    const activeUserId = userIdRef.current;
    if (persist && activeUserId) {
      void writeCachedWalletBalance(activeUserId, normalized);
    }
  }, []);

  useEffect(() => {
    applyBalanceRef.current = applyBalance;
  }, [applyBalance]);

  const setBalance = useCallback((value: number) => {
    applyBalance(value);
  }, [applyBalance]);

  const refreshBalance = useCallback(async () => {
    if (fetchInFlightRef.current) {
      return fetchInFlightRef.current;
    }

    const run = (async () => {
      try {
        const { data: sessionData, error: sessionError } = await supabase.auth.getSession();
        if (sessionError) throw sessionError;

        const session = sessionData.session;
        if (!session?.user?.id) {
          setUserId(null);
          balanceRef.current = 0;
          if (isMountedRef.current) setBalanceState(0);
          await clearCachedWalletBalance();
          return;
        }

        const nextUserId = session.user.id;
        setUserId(nextUserId);

        if (!hasHydratedRef.current) {
          const cached = await readCachedWalletBalance(nextUserId);
          if (cached !== null) {
            applyBalance(cached, { persist: false, hydrating: true });
          }
        }

        const { data: profile, error: profileError } = await supabase
          .from('profiles')
          .select('balance')
          .eq('id', nextUserId)
          .maybeSingle();

        if (profileError && profileError.code !== 'PGRST116') {
          throw profileError;
        }

        applyBalance(Number(profile?.balance) || 0, {
          hydrating: !hasHydratedRef.current,
        });
      } catch (error) {
        console.warn('Failed to refresh wallet balance:', error);
      } finally {
        fetchInFlightRef.current = null;
      }
    })();

    fetchInFlightRef.current = run;
    return run;
  }, [applyBalance]);

  useEffect(() => {
    void refreshBalance();
  }, [refreshBalance]);

  useFocusEffect(
    useCallback(() => {
      if (!refreshOnFocus) return;
      void refreshBalance();
    }, [refreshBalance, refreshOnFocus]),
  );

  useFocusEffect(
    useCallback(() => {
      if (!pollIntervalMs || pollIntervalMs <= 0) {
        return;
      }

      const intervalId = setInterval(() => {
        void refreshBalance();
      }, pollIntervalMs);

      return () => {
        clearInterval(intervalId);
      };
    }, [pollIntervalMs, refreshBalance]),
  );

  useEffect(() => {
    if (!userId) {
      if (balanceChannelRef.current) {
        void supabase.removeChannel(balanceChannelRef.current);
        balanceChannelRef.current = null;
      }
      return;
    }

    // Unique topic per hook instance so concurrent screens never reuse a
    // already-subscribed channel (Supabase rejects .on() after subscribe()).
    const topic = `wallet-balance-${userId}-${Math.random().toString(36).slice(2, 10)}`;
    const channel = supabase
      .channel(topic)
      .on(
        'postgres_changes',
        {
          event: 'UPDATE',
          schema: 'public',
          table: 'profiles',
          filter: `id=eq.${userId}`,
        },
        (payload) => {
          const nextBalance = Number((payload.new as { balance?: number })?.balance ?? 0);
          applyBalanceRef.current(nextBalance);
        },
      )
      .subscribe();

    balanceChannelRef.current = channel;

    return () => {
      void supabase.removeChannel(channel);
      if (balanceChannelRef.current === channel) {
        balanceChannelRef.current = null;
      }
    };
  }, [userId]);

  return { balance, setBalance, refreshBalance, userId };
}
