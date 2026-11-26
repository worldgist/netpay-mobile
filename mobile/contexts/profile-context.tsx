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
import { isJwtClockSkewError, recoverFromJwtClockSkew } from '@/utils/supabase-auth-recovery';

export type UserProfile = {
  id: string;
  full_name: string;
  email: string;
  phone: string | null;
  biometric_enabled: boolean;
  pin_enabled: boolean;
};

type ProfileContextValue = {
  profile: UserProfile | null;
  /** True only on first load when no cached profile exists */
  loading: boolean;
  refreshing: boolean;
  refresh: () => Promise<void>;
  patchProfile: (updates: Partial<UserProfile>) => void;
};

const PROFILE_CACHE_KEY = '@netpay_profile_cache_v1';
const STALE_MS = 5 * 60 * 1000;

const ProfileContext = createContext<ProfileContextValue | null>(null);

async function readCachedProfile(): Promise<UserProfile | null> {
  try {
    const raw = await AsyncStorage.getItem(PROFILE_CACHE_KEY);
    if (!raw) return null;
    return JSON.parse(raw) as UserProfile;
  } catch {
    return null;
  }
}

async function writeCachedProfile(profile: UserProfile | null) {
  try {
    if (profile) {
      await AsyncStorage.setItem(PROFILE_CACHE_KEY, JSON.stringify(profile));
    } else {
      await AsyncStorage.removeItem(PROFILE_CACHE_KEY);
    }
  } catch (error) {
    console.warn('Failed to persist profile cache:', error);
  }
}

function profileFromRow(
  userId: string,
  sessionEmail: string,
  row: {
    full_name?: string | null;
    email?: string | null;
    phone?: string | null;
    biometric_enabled?: boolean | null;
    pin_enabled?: boolean | null;
  } | null
): UserProfile {
  const fallbackName = sessionEmail.split('@')[0] || 'User';
  return {
    id: userId,
    full_name: row?.full_name?.trim() || fallbackName,
    email: sessionEmail || row?.email || '',
    phone: row?.phone ?? null,
    biometric_enabled: Boolean(row?.biometric_enabled),
    pin_enabled: Boolean(row?.pin_enabled),
  };
}

export function ProfileProvider({ children }: { children: ReactNode }) {
  const [profile, setProfile] = useState<UserProfile | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const lastFetchedAtRef = useRef(0);
  const fetchInFlightRef = useRef<Promise<void> | null>(null);
  const isMountedRef = useRef(true);
  const profileRef = useRef<UserProfile | null>(null);

  useEffect(() => {
    profileRef.current = profile;
  }, [profile]);

  const applyProfile = useCallback((next: UserProfile | null) => {
    if (!isMountedRef.current) return;
    setProfile(next);
    void writeCachedProfile(next);
  }, []);

  const patchProfile = useCallback(
    (updates: Partial<UserProfile>) => {
      setProfile((current) => {
        if (!current) return current;
        const next = { ...current, ...updates };
        void writeCachedProfile(next);
        return next;
      });
    },
    []
  );

  const fetchProfile = useCallback(
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
        } else if (!profileRef.current) {
          if (isMountedRef.current) setLoading(true);
        }

        try {
          const { data: sessionData, error: sessionError } = await supabase.auth.getSession();
          if (sessionError) throw sessionError;

          const session = sessionData.session;
          if (!session?.user?.id) {
            applyProfile(null);
            lastFetchedAtRef.current = 0;
            return;
          }

          const userId = session.user.id;
          const sessionEmail = session.user.email || '';

          const loadProfileRow = () =>
            supabase
              .from('profiles')
              .select('full_name, email, phone, biometric_enabled, pin_enabled')
              .eq('id', userId)
              .maybeSingle();

          let { data: row, error: profileError } = await loadProfileRow();

          if (profileError && isJwtClockSkewError(profileError)) {
            const recovered = await recoverFromJwtClockSkew();
            if (recovered) {
              ({ data: row, error: profileError } = await loadProfileRow());
            }
          }

          if (profileError && profileError.code !== 'PGRST116') {
            throw profileError;
          }

          let nextProfile = profileFromRow(userId, sessionEmail, row);

          if (!row) {
            const fallbackName = sessionEmail.split('@')[0] || 'User';
            const { data: created, error: createError } = await supabase
              .from('profiles')
              .upsert(
                {
                  id: userId,
                  email: sessionEmail,
                  full_name: fallbackName,
                  balance: 0,
                  status: 'active',
                  biometric_enabled: false,
                  pin_enabled: false,
                },
                { onConflict: 'id' }
              )
              .select('full_name, email, phone, biometric_enabled, pin_enabled')
              .single();

            if (!createError && created) {
              nextProfile = profileFromRow(userId, sessionEmail, created);
            }
          } else if (sessionEmail && row.email !== sessionEmail) {
            void supabase
              .from('profiles')
              .update({ email: sessionEmail, updated_at: new Date().toISOString() })
              .eq('id', userId);
            nextProfile = { ...nextProfile, email: sessionEmail };
          }

          applyProfile(nextProfile);
          lastFetchedAtRef.current = Date.now();
        } catch (error) {
          if (isJwtClockSkewError(error)) {
            console.warn(
              'Session rejected due to clock skew. Sign in again and ensure your device date/time is set automatically.',
            );
          } else {
            console.error('Failed to load profile:', error);
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
    [applyProfile]
  );

  const refresh = useCallback(async () => {
    await fetchProfile({ isRefresh: true, force: true });
  }, [fetchProfile]);

  useEffect(() => {
    isMountedRef.current = true;

    (async () => {
      const cached = await readCachedProfile();
      if (cached && isMountedRef.current) {
        setProfile(cached);
        setLoading(false);
      }
      await fetchProfile({ force: true });
    })();

    const { data: authListener } = supabase.auth.onAuthStateChange((event, session) => {
      if (event === 'SIGNED_OUT') {
        applyProfile(null);
        lastFetchedAtRef.current = 0;
        return;
      }
      if (session?.user && event === 'SIGNED_IN') {
        void fetchProfile({ force: true });
      }
    });

    return () => {
      isMountedRef.current = false;
      authListener.subscription.unsubscribe();
    };
  }, [applyProfile, fetchProfile]);

  const value = useMemo(
    () => ({
      profile,
      loading,
      refreshing,
      refresh,
      patchProfile,
    }),
    [profile, loading, refreshing, refresh, patchProfile]
  );

  return <ProfileContext.Provider value={value}>{children}</ProfileContext.Provider>;
}

export function useProfile() {
  const context = useContext(ProfileContext);
  if (!context) {
    throw new Error('useProfile must be used within ProfileProvider');
  }
  return context;
}
