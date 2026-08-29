import { useCallback, useEffect, useRef, useState } from 'react';
import { useFocusEffect } from '@react-navigation/native';
import { supabase } from '@/lib/supabase';
import {
  readCachedWalletBalance,
  writeCachedWalletBalance,
  clearCachedWalletBalance,
} from '@/utils/wallet-balance-cache';

type UseWalletBalanceOptions = {
  refreshOnFocus?: boolean;
};

export function useWalletBalance(options: UseWalletBalanceOptions = {}) {
  const { refreshOnFocus = true } = options;
  const [balance, setBalanceState] = useState(0);
  const userIdRef = useRef<string | null>(null);
  const fetchInFlightRef = useRef<Promise<void> | null>(null);
  const isMountedRef = useRef(true);

  useEffect(() => {
    isMountedRef.current = true;
    return () => {
      isMountedRef.current = false;
    };
  }, []);

  const setBalance = useCallback((value: number) => {
    const normalized = Number.isFinite(value) ? value : 0;
    if (isMountedRef.current) {
      setBalanceState(normalized);
    }
    if (userIdRef.current) {
      void writeCachedWalletBalance(userIdRef.current, normalized);
    }
  }, []);

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
          userIdRef.current = null;
          if (isMountedRef.current) setBalanceState(0);
          await clearCachedWalletBalance();
          return;
        }

        const userId = session.user.id;
        userIdRef.current = userId;

        const cached = await readCachedWalletBalance(userId);
        if (cached !== null && isMountedRef.current) {
          setBalanceState(cached);
        }

        const { data: profile, error: profileError } = await supabase
          .from('profiles')
          .select('balance')
          .eq('id', userId)
          .maybeSingle();

        if (profileError && profileError.code !== 'PGRST116') {
          throw profileError;
        }

        const nextBalance = Number(profile?.balance) || 0;
        if (isMountedRef.current) {
          setBalanceState(nextBalance);
        }
        await writeCachedWalletBalance(userId, nextBalance);
      } catch (error) {
        console.warn('Failed to refresh wallet balance:', error);
      } finally {
        fetchInFlightRef.current = null;
      }
    })();

    fetchInFlightRef.current = run;
    return run;
  }, []);

  useEffect(() => {
    void refreshBalance();
  }, [refreshBalance]);

  useFocusEffect(
    useCallback(() => {
      if (!refreshOnFocus) return;
      void refreshBalance();
    }, [refreshBalance, refreshOnFocus])
  );

  return { balance, setBalance, refreshBalance };
}
