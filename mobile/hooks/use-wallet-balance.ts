import { useCallback, useEffect, useRef, useState } from 'react';
import { useFocusEffect } from '@react-navigation/native';
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

    if (persist && userId) {
      void writeCachedWalletBalance(userId, normalized);
    }
  }, [userId]);

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
        supabase.removeChannel(balanceChannelRef.current);
        balanceChannelRef.current = null;
      }
      return;
    }

    if (balanceChannelRef.current) {
      supabase.removeChannel(balanceChannelRef.current);
      balanceChannelRef.current = null;
    }

    const channel = supabase
      .channel(`wallet-balance-${userId}`)
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
          applyBalance(nextBalance);
        },
      )
      .subscribe();

    balanceChannelRef.current = channel;

    return () => {
      if (balanceChannelRef.current) {
        supabase.removeChannel(balanceChannelRef.current);
        balanceChannelRef.current = null;
      }
    };
  }, [userId, applyBalance]);

  return { balance, setBalance, refreshBalance, userId };
}
