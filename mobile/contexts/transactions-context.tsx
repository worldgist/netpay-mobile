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
import AsyncStorage from '@react-native-async-storage/async-storage';
import { supabase } from '@/lib/supabase';
import { loadMobileTransactions, type MobileTransaction } from '@/utils/load-mobile-transactions';

export type { MobileTransaction };

export const TRANSACTIONS_PAGE_SIZE = 10;

type CachedTransactionsPayload = {
  userId: string;
  transactions: MobileTransaction[];
};

type TransactionsContextValue = {
  transactions: MobileTransaction[];
  paginatedTransactions: MobileTransaction[];
  loading: boolean;
  refreshing: boolean;
  error: string | null;
  currentPage: number;
  totalPages: number;
  totalCount: number;
  rangeStart: number;
  rangeEnd: number;
  hasPreviousPage: boolean;
  hasNextPage: boolean;
  refresh: () => Promise<void>;
  goToNextPage: () => void;
  goToPreviousPage: () => void;
};

const TRANSACTIONS_CACHE_KEY = '@netpay_transactions_cache_v1';
const STALE_MS = 5 * 60 * 1000;

const TransactionsContext = createContext<TransactionsContextValue | null>(null);

async function readCachedTransactions(userId: string): Promise<MobileTransaction[] | null> {
  try {
    const raw = await AsyncStorage.getItem(TRANSACTIONS_CACHE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as CachedTransactionsPayload;
    if (parsed.userId !== userId) return null;
    return parsed.transactions;
  } catch {
    return null;
  }
}

async function writeCachedTransactions(userId: string, transactions: MobileTransaction[]) {
  try {
    const payload: CachedTransactionsPayload = { userId, transactions };
    await AsyncStorage.setItem(TRANSACTIONS_CACHE_KEY, JSON.stringify(payload));
  } catch (error) {
    console.warn('Failed to persist transactions cache:', error);
  }
}

async function clearCachedTransactions() {
  try {
    await AsyncStorage.removeItem(TRANSACTIONS_CACHE_KEY);
  } catch {
    // ignore
  }
}

export function TransactionsProvider({ children }: { children: ReactNode }) {
  const [transactions, setTransactions] = useState<MobileTransaction[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [currentPage, setCurrentPage] = useState(1);
  const [userId, setUserId] = useState<string | null>(null);

  const lastFetchedAtRef = useRef(0);
  const fetchInFlightRef = useRef<Promise<void> | null>(null);
  const isMountedRef = useRef(true);
  const transactionsRef = useRef<MobileTransaction[]>([]);
  const userIdRef = useRef<string | null>(null);

  useEffect(() => {
    transactionsRef.current = transactions;
  }, [transactions]);

  useEffect(() => {
    userIdRef.current = userId;
  }, [userId]);

  const applyTransactions = useCallback((next: MobileTransaction[], activeUserId: string) => {
    if (!isMountedRef.current) return;
    setTransactions(next);
    setUserId(activeUserId);
    setCurrentPage(1);
    void writeCachedTransactions(activeUserId, next);
  }, []);

  const fetchTransactions = useCallback(
    async ({ isRefresh = false, force = false }: { isRefresh?: boolean; force?: boolean } = {}) => {
      const now = Date.now();
      if (!force && !isRefresh && lastFetchedAtRef.current && now - lastFetchedAtRef.current < STALE_MS) {
        return;
      }

      if (fetchInFlightRef.current) {
        return fetchInFlightRef.current;
      }

      const run = (async () => {
        if (isRefresh) {
          if (isMountedRef.current) setRefreshing(true);
        } else if (transactionsRef.current.length === 0) {
          if (isMountedRef.current) setLoading(true);
        }

        if (isMountedRef.current) setError(null);

        try {
          const { data: sessionData, error: sessionError } = await supabase.auth.getSession();
          if (sessionError) throw sessionError;

          const session = sessionData.session;
          if (!session?.user?.id) {
            if (isMountedRef.current) {
              setTransactions([]);
              setUserId(null);
              setCurrentPage(1);
            }
            lastFetchedAtRef.current = 0;
            return;
          }

          const activeUserId = session.user.id;
          const loaded = await loadMobileTransactions(activeUserId);
          applyTransactions(loaded, activeUserId);
          lastFetchedAtRef.current = Date.now();
        } catch (err) {
          console.error('Failed to load transactions:', err);
          if (isMountedRef.current) {
            const message = err instanceof Error ? err.message : 'Unable to load transactions.';
            setError(message);
            if (transactionsRef.current.length === 0) {
              setTransactions([]);
            }
          }
        } finally {
          if (isMountedRef.current) {
            setLoading(false);
            setRefreshing(false);
          }
          fetchInFlightRef.current = null;
        }
      })();

      fetchInFlightRef.current = run;
      return run;
    },
    [applyTransactions]
  );

  const refresh = useCallback(async () => {
    await fetchTransactions({ isRefresh: true, force: true });
  }, [fetchTransactions]);

  const totalCount = transactions.length;
  const totalPages = Math.max(1, Math.ceil(totalCount / TRANSACTIONS_PAGE_SIZE));

  useEffect(() => {
    if (currentPage > totalPages) {
      setCurrentPage(totalPages);
    }
  }, [currentPage, totalPages]);

  const safePage = Math.min(currentPage, totalPages);
  const rangeStart = totalCount === 0 ? 0 : (safePage - 1) * TRANSACTIONS_PAGE_SIZE + 1;
  const rangeEnd = Math.min(safePage * TRANSACTIONS_PAGE_SIZE, totalCount);

  const paginatedTransactions = useMemo(() => {
    const start = (safePage - 1) * TRANSACTIONS_PAGE_SIZE;
    return transactions.slice(start, start + TRANSACTIONS_PAGE_SIZE);
  }, [transactions, safePage]);

  const goToNextPage = useCallback(() => {
    setCurrentPage((page) => Math.min(page + 1, totalPages));
  }, [totalPages]);

  const goToPreviousPage = useCallback(() => {
    setCurrentPage((page) => Math.max(page - 1, 1));
  }, []);

  useEffect(() => {
    isMountedRef.current = true;

    (async () => {
      const { data: sessionData } = await supabase.auth.getSession();
      const sessionUserId = sessionData.session?.user?.id;

      if (sessionUserId) {
        const cached = await readCachedTransactions(sessionUserId);
        if (cached && isMountedRef.current) {
          setTransactions(cached);
          setUserId(sessionUserId);
          setLoading(false);
        }
      }

      await fetchTransactions({ force: true });
    })();

    const { data: authListener } = supabase.auth.onAuthStateChange((event, session) => {
      if (event === 'SIGNED_OUT') {
        if (isMountedRef.current) {
          setTransactions([]);
          setUserId(null);
          setCurrentPage(1);
        }
        void clearCachedTransactions();
        lastFetchedAtRef.current = 0;
        return;
      }
      if (session?.user && event === 'SIGNED_IN') {
        void fetchTransactions({ force: true });
      }
    });

    return () => {
      isMountedRef.current = false;
      authListener.subscription.unsubscribe();
    };
  }, [applyTransactions, fetchTransactions]);

  const value = useMemo(
    () => ({
      transactions,
      paginatedTransactions,
      loading,
      refreshing,
      error,
      currentPage: safePage,
      totalPages,
      totalCount,
      rangeStart,
      rangeEnd,
      hasPreviousPage: safePage > 1,
      hasNextPage: safePage < totalPages,
      refresh,
      goToNextPage,
      goToPreviousPage,
    }),
    [
      transactions,
      paginatedTransactions,
      loading,
      refreshing,
      error,
      safePage,
      totalPages,
      totalCount,
      rangeStart,
      rangeEnd,
      refresh,
      goToNextPage,
      goToPreviousPage,
    ]
  );

  return <TransactionsContext.Provider value={value}>{children}</TransactionsContext.Provider>;
}

export function useTransactions() {
  const context = useContext(TransactionsContext);
  if (!context) {
    throw new Error('useTransactions must be used within TransactionsProvider');
  }
  return context;
}
