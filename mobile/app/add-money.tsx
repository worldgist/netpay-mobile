import { useState, useCallback, useEffect, useRef } from 'react';
import {
  StyleSheet,
  View,
  ScrollView,
  TouchableOpacity,
  Alert,
  TextInput,
  KeyboardAvoidingView,
  Platform,
  RefreshControl,
  ActivityIndicator,
  Text,
} from 'react-native';
import * as Clipboard from 'expo-clipboard';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { ThemedView } from '@/components/themed-view';
import { ThemedText } from '@/components/themed-text';
import { MaterialIcons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import { useFocusEffect } from '@react-navigation/native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { supabase } from '@/lib/supabase';
import { useTransactions } from '@/contexts/transactions-context';
import { useWalletBalance } from '@/hooks/use-wallet-balance';
import { syncFlutterwaveFunding } from '@/utils/sync-flutterwave-funding';

const FLUTTERWAVE_BANK_CODE = 'FLW';
const FLUTTERWAVE_PROVIDER = 'flutterwave';
const VA_CACHE_PREFIX = '@netpay_flw_va_';
const FUNDING_SYNC_INTERVAL_MS = 5_000;
const BALANCE_POLL_INTERVAL_MS = 5_000;

interface VirtualAccount {
  account_number: string;
  bank_name: string;
  account_name: string;
  bank_code: string;
  tracking_reference?: string | null;
}

function formatAccountNumber(value: string) {
  const digits = value.replace(/\s/g, '');
  return digits.replace(/(\d{4})(?=\d)/g, '$1 ').trim();
}

function getBankInitials(bankName: string) {
  const words = bankName.trim().split(/\s+/).filter(Boolean);
  if (words.length === 0) return 'BK';
  if (words.length === 1) return words[0].slice(0, 2).toUpperCase();
  return `${words[0][0] || ''}${words[1][0] || ''}`.toUpperCase();
}

async function readCachedVirtualAccount(userId: string): Promise<VirtualAccount | null> {
  try {
    const raw = await AsyncStorage.getItem(`${VA_CACHE_PREFIX}${userId}`);
    return raw ? (JSON.parse(raw) as VirtualAccount) : null;
  } catch {
    return null;
  }
}

async function writeCachedVirtualAccount(userId: string, account: VirtualAccount | null) {
  try {
    const key = `${VA_CACHE_PREFIX}${userId}`;
    if (account) {
      await AsyncStorage.setItem(key, JSON.stringify(account));
    } else {
      await AsyncStorage.removeItem(key);
    }
  } catch {
    // Non-critical cache write
  }
}

export default function AddMoneyScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const isMounted = useRef(true);
  const syncInFlightRef = useRef(false);
  const fundingHandledRef = useRef(false);
  const { refresh: refreshTransactions } = useTransactions();

  const handleFundingConfirmed = useCallback(async () => {
    if (fundingHandledRef.current) return;
    fundingHandledRef.current = true;
    await refreshTransactions();
    router.replace('/(tabs)');
  }, [refreshTransactions, router]);

  const { balance: walletBalance, refreshBalance } = useWalletBalance({
    refreshOnFocus: true,
    pollIntervalMs: BALANCE_POLL_INTERVAL_MS,
    onBalanceIncrease: () => {
      void handleFundingConfirmed();
    },
  });

  const [error, setError] = useState<string | null>(null);

  const [virtualAccount, setVirtualAccount] = useState<VirtualAccount | null>(null);
  const [nin, setNin] = useState('');
  const [savedNin, setSavedNin] = useState<string | null>(null);
  const [refreshing, setRefreshing] = useState(false);
  const [creating, setCreating] = useState(false);
  const [isCheckingBalance, setIsCheckingBalance] = useState(false);
  const [isAutoChecking, setIsAutoChecking] = useState(false);

  const effectiveNin = nin.trim() || savedNin || '';
  const maskedSavedNin = savedNin ? `********${savedNin.slice(-3)}` : null;

  useEffect(() => {
    isMounted.current = true;
    return () => {
      isMounted.current = false;
      fundingHandledRef.current = false;
    };
  }, []);

  const runFundingSync = useCallback(
    async (options?: { manual?: boolean }) => {
      if (syncInFlightRef.current || fundingHandledRef.current) {
        return { synced: 0 };
      }

      syncInFlightRef.current = true;
      if (options?.manual) {
        setIsCheckingBalance(true);
      } else if (isMounted.current) {
        setIsAutoChecking(true);
      }

      try {
        const beforeBalance = walletBalance;
        const result = await syncFlutterwaveFunding();

        if (!result.success && options?.manual) {
          throw new Error(result.error || 'Failed to sync your transfer.');
        }

        if (!result.success) {
          console.warn('Flutterwave funding auto-sync failed:', result.error);
          return { synced: 0 };
        }

        await refreshBalance();

        const syncedCount = Number(result.synced ?? 0);
        const creditedBalance = Number(result.balance);
        const balanceIncreased =
          Number.isFinite(creditedBalance) && creditedBalance > beforeBalance;

        if (syncedCount > 0 || balanceIncreased) {
          await handleFundingConfirmed();
          return { synced: syncedCount || 1 };
        }

        return { synced: 0 };
      } catch (err) {
        if (options?.manual) {
          console.warn('Flutterwave funding sync error:', err);
        } else {
          console.warn('Flutterwave funding auto-sync error:', err);
        }
        return { synced: 0 };
      } finally {
        syncInFlightRef.current = false;
        if (isMounted.current) {
          setIsCheckingBalance(false);
          setIsAutoChecking(false);
        }
      }
    },
    [handleFundingConfirmed, refreshBalance, walletBalance],
  );

  const fetchVirtualAccount = useCallback(
    async (isRefresh = false) => {
      try {
        if (isMounted.current && isRefresh) {
          setRefreshing(true);
        }

        const { data: sessionData, error: sessionError } = await supabase.auth.getSession();
        if (sessionError) throw sessionError;

        const session = sessionData.session;
        if (!session) {
          router.replace('/auth/login');
          return;
        }

        const { data: accountData, error: accountError } = await supabase
          .from('virtual_accounts')
          .select('account_number, bank_name, account_name, bank_code, tracking_reference')
          .eq('user_id', session.user.id)
          .eq('provider', FLUTTERWAVE_PROVIDER)
          .eq('bank_code', FLUTTERWAVE_BANK_CODE)
          .maybeSingle();

        const { data: ninData } = await supabase
          .from('user_nin')
          .select('nin')
          .eq('user_id', session.user.id)
          .maybeSingle();

        if (accountError && accountError.code !== 'PGRST116') {
          throw accountError;
        }

        if (isMounted.current) {
          setSavedNin(ninData?.nin || null);
          if (accountData) {
            const account = accountData as VirtualAccount;
            setVirtualAccount(account);
            await writeCachedVirtualAccount(session.user.id, account);
          } else {
            setVirtualAccount(null);
            await writeCachedVirtualAccount(session.user.id, null);
          }
        }
      } catch (err) {
        console.error('Failed to load virtual account:', err);
      } finally {
        if (isMounted.current) {
          setRefreshing(false);
        }
      }
    },
    [router],
  );

  useFocusEffect(
    useCallback(() => {
      fundingHandledRef.current = false;

      void (async () => {
        const { data: sessionData } = await supabase.auth.getSession();
        const userId = sessionData.session?.user.id;

        if (userId) {
          const cachedAccount = await readCachedVirtualAccount(userId);
          if (cachedAccount) {
            setVirtualAccount(cachedAccount);
          }
        }

        void refreshBalance();
        void fetchVirtualAccount();
      })();

      return () => {
        fundingHandledRef.current = false;
      };
    }, [fetchVirtualAccount, refreshBalance]),
  );

  useFocusEffect(
    useCallback(() => {
      if (!virtualAccount) {
        return;
      }

      void runFundingSync();

      const intervalId = setInterval(() => {
        void runFundingSync();
      }, FUNDING_SYNC_INTERVAL_MS);

      return () => {
        clearInterval(intervalId);
      };
    }, [runFundingSync, virtualAccount]),
  );

  const handleRefresh = useCallback(() => {
    void refreshBalance();
    void fetchVirtualAccount(true);
    void runFundingSync();
  }, [fetchVirtualAccount, refreshBalance, runFundingSync]);

  const handleCopy = async (text: string, label: string) => {
    try {
      if (!text) {
        Alert.alert('Unavailable', `No ${label.toLowerCase()} to copy yet.`);
        return;
      }
      if (Platform.OS === 'web') {
        await navigator.clipboard.writeText(text);
      } else {
        await Clipboard.setStringAsync(text);
      }
      Alert.alert('Copied', `${label} copied to clipboard`);
    } catch {
      Alert.alert('Error', 'Failed to copy to clipboard');
    }
  };

  const handleCreateVirtualAccount = async () => {
    if (effectiveNin.length !== 11) {
      Alert.alert('NIN Required', 'Please enter your 11-digit NIN to create your account number.');
      return;
    }

    try {
      setCreating(true);
      setError(null);

      const { data: sessionData, error: sessionError } = await supabase.auth.getSession();
      if (sessionError) throw sessionError;

      const session = sessionData.session;
      if (!session) {
        router.replace('/auth/login');
        return;
      }

      const userId = session.user.id;
      const { data: profileData } = await supabase
        .from('profiles')
        .select('full_name, phone, email')
        .eq('id', userId)
        .maybeSingle();

      const fullName = profileData?.full_name || session.user.email?.split('@')[0] || 'User';
      const phoneNumber = profileData?.phone || '07067398399';
      const emailAddress = profileData?.email || session.user.email || '';

      const { data, error: invokeError } = await supabase.functions.invoke('get-flutterwave-virtual-account', {
        body: {
          email: emailAddress,
          name: fullName,
          phoneNumber,
          identityType: 'nin',
          identityNumber: effectiveNin,
          nin: effectiveNin,
        },
      });

      if (invokeError) throw invokeError;

      if (!data?.success || !data.data) {
        throw new Error(data?.error || 'Failed to create your account number. Please try again later.');
      }

      const account = data.data;

      if (isMounted.current) {
        const accountDetails = {
          account_number: account.account_number,
          account_name: account.account_name,
          bank_name: account.bank_name || 'Flutterwave',
          bank_code: account.bank_code || FLUTTERWAVE_BANK_CODE,
          tracking_reference: account.tracking_reference || null,
        };
        setVirtualAccount(accountDetails);
        await writeCachedVirtualAccount(userId, accountDetails);
        setNin('');
        setSavedNin(effectiveNin);
      }
    } catch (err) {
      console.error('Create account number error:', err);
      const message = err instanceof Error ? err.message : 'Failed to create your account number.';
      if (isMounted.current) {
        setError(message);
      }
      Alert.alert('Error', message);
    } finally {
      if (isMounted.current) {
        setCreating(false);
      }
    }
  };

  const handleCheckBalance = async () => {
    if (syncInFlightRef.current) {
      router.replace('/(tabs)');
      return;
    }

    setIsCheckingBalance(true);
    try {
      try {
        await syncFlutterwaveFunding();
      } catch (err) {
        console.warn('Flutterwave funding sync failed:', err);
      }
      await refreshBalance();
      await refreshTransactions();
    } finally {
      if (isMounted.current) {
        setIsCheckingBalance(false);
      }
      router.replace('/(tabs)');
    }
  };

  const renderVirtualAccountCard = () => {
    if (!virtualAccount) return null;

    const bankName = virtualAccount.bank_name || 'Flutterwave';

    return (
      <View style={styles.vaHeroCard}>
        <View style={styles.vaHeroPatternTop} />
        <View style={styles.vaHeroPatternBottom} />

        <View style={styles.vaHeroTopRow}>
          <View style={styles.vaHeroTopLeft}>
            <View style={styles.vaHeroIconWrap}>
              <MaterialIcons name="account-balance" size={22} color="#FF7F00" />
            </View>
            <View style={styles.vaActiveBadge}>
              <View style={styles.vaActiveDot} />
              <ThemedText style={styles.vaActiveText}>Active</ThemedText>
            </View>
          </View>
        </View>

        <View style={styles.vaHeroBankRow}>
          <View style={styles.vaBankLogo}>
            <ThemedText style={styles.vaBankLogoText}>{getBankInitials(bankName)}</ThemedText>
          </View>
          <View style={styles.vaHeroField}>
            <ThemedText style={styles.vaHeroFieldLabel}>Bank</ThemedText>
            <ThemedText style={styles.vaHeroFieldValue}>{bankName}</ThemedText>
          </View>
        </View>

        <View style={styles.vaHeroDivider} />

        <View style={styles.vaHeroDetailRow}>
          <View style={styles.vaHeroField}>
            <ThemedText style={styles.vaHeroFieldLabel}>Account Number</ThemedText>
            <ThemedText style={styles.vaHeroAccountNumber}>
              {formatAccountNumber(virtualAccount.account_number)}
            </ThemedText>
          </View>
          <TouchableOpacity
            style={styles.vaHeroCopyIcon}
            onPress={() => handleCopy(virtualAccount.account_number, 'Account number')}
            activeOpacity={0.85}>
            <MaterialIcons name="content-copy" size={18} color="#fff" />
          </TouchableOpacity>
        </View>

        <View style={styles.vaHeroDivider} />

        <View style={styles.vaHeroDetailRow}>
          <View style={styles.vaHeroField}>
            <ThemedText style={styles.vaHeroFieldLabel}>Account Name</ThemedText>
            <ThemedText style={styles.vaHeroFieldValue}>{virtualAccount.account_name}</ThemedText>
          </View>
          <TouchableOpacity
            style={styles.vaHeroCopyIcon}
            onPress={() => handleCopy(virtualAccount.account_name, 'Account name')}
            activeOpacity={0.85}>
            <MaterialIcons name="content-copy" size={18} color="#fff" />
          </TouchableOpacity>
        </View>
      </View>
    );
  };

  const renderCreateVirtualAccountSection = () => (
    <View style={styles.createCard}>
      <ThemedText style={styles.createTitle}>Create Your Account Number</ThemedText>
      <ThemedText style={styles.createDescription}>
        {savedNin
          ? 'Your NIN is already saved. Create your account number to receive bank transfers into your wallet.'
          : 'Enter your 11-digit NIN to generate your permanent account number for bank transfers.'}
      </ThemedText>

      {savedNin ? (
        <View style={styles.savedNinBanner}>
          <MaterialIcons name="verified-user" size={20} color="#2E7D32" />
          <ThemedText style={styles.savedNinText}>NIN on file: {maskedSavedNin}</ThemedText>
        </View>
      ) : (
        <View style={styles.inputGroup}>
          <ThemedText style={styles.inputLabel}>NIN (11 digits)</ThemedText>
          <View style={styles.inputRow}>
            <MaterialIcons name="badge" size={20} color="#666" style={styles.inputIcon} />
            <TextInput
              style={styles.ninInput}
              placeholder="Enter 11-digit NIN"
              placeholderTextColor="#999"
              value={nin}
              onChangeText={(value) => setNin(value.replace(/\D/g, '').slice(0, 11))}
              keyboardType="numeric"
              maxLength={11}
            />
          </View>
          <ThemedText style={styles.ninHelperText}>Required for account verification</ThemedText>
        </View>
      )}

      <TouchableOpacity
        style={[styles.createButton, (creating || effectiveNin.length !== 11) && styles.createButtonDisabled]}
        onPress={handleCreateVirtualAccount}
        disabled={creating || effectiveNin.length !== 11}
        activeOpacity={0.85}>
        {creating ? (
          <ActivityIndicator color="#fff" />
        ) : (
          <ThemedText style={styles.createButtonText}>Create Account Number</ThemedText>
        )}
      </TouchableOpacity>

      <View style={styles.ninSecurityNote}>
        <MaterialIcons name="shield" size={20} color="#2E7D32" style={styles.securityIcon} />
        <ThemedText style={styles.ninSecurityText}>
          Your NIN is encrypted and only used for account verification.
        </ThemedText>
      </View>
    </View>
  );

  const renderHowItWorks = () => (
    <View style={styles.howItWorksCard}>
      <ThemedText style={styles.howItWorksTitle} lightColor="#1A2B4A">
        How it works
      </ThemedText>
      <View style={styles.howItWorksSteps}>
        <View style={styles.howItWorksStep}>
          <View style={styles.howItWorksIconWrap}>
            <MaterialIcons name="account-balance" size={22} color="#FF7F00" />
            <View style={styles.howItWorksBadge}>
              <Text style={styles.howItWorksBadgeText}>1</Text>
            </View>
          </View>
          <ThemedText style={styles.howItWorksStepTitle} lightColor="#1A2B4A">
            Transfer
          </ThemedText>
          <ThemedText style={styles.howItWorksStepDesc} lightColor="#667085">
            Transfer any amount to your virtual account
          </ThemedText>
        </View>

        <MaterialIcons name="arrow-forward" size={18} color="#D0D5DD" style={styles.howItWorksArrow} />

        <View style={styles.howItWorksStep}>
          <View style={styles.howItWorksIconWrap}>
            <MaterialIcons name="account-balance-wallet" size={22} color="#FF7F00" />
            <View style={styles.howItWorksBadge}>
              <Text style={styles.howItWorksBadgeText}>2</Text>
            </View>
          </View>
          <ThemedText style={styles.howItWorksStepTitle} lightColor="#1A2B4A">
            Funds Reflect
          </ThemedText>
          <ThemedText style={styles.howItWorksStepDesc} lightColor="#667085">
            Funds are reflected in your NetPay wallet instantly
          </ThemedText>
        </View>

        <MaterialIcons name="arrow-forward" size={18} color="#D0D5DD" style={styles.howItWorksArrow} />

        <View style={styles.howItWorksStep}>
          <View style={styles.howItWorksIconWrap}>
            <MaterialIcons name="check-circle" size={22} color="#FF7F00" />
            <View style={styles.howItWorksBadge}>
              <Text style={styles.howItWorksBadgeText}>3</Text>
            </View>
          </View>
          <ThemedText style={styles.howItWorksStepTitle} lightColor="#1A2B4A">
            Start Using
          </ThemedText>
          <ThemedText style={styles.howItWorksStepDesc} lightColor="#667085">
            Use your balance to pay bills, buy airtime, data and more
          </ThemedText>
        </View>
      </View>
    </View>
  );

  const renderVirtualAccountScreen = () => (
    <>
      {virtualAccount ? (
        <>
          {renderVirtualAccountCard()}

          <View style={styles.infoBanner}>
            <View style={styles.infoIconContainer}>
              <ThemedText style={styles.infoIcon}>i</ThemedText>
            </View>
            <ThemedText style={styles.infoText}>
              Transfer funds from any bank app or visit the bank to fund this account. Your balance
              updates automatically as soon as the transfer is confirmed.
            </ThemedText>
          </View>

          {isAutoChecking ? (
            <View style={styles.autoCheckRow}>
              <ActivityIndicator size="small" color="#FF7F00" />
              <ThemedText style={styles.autoCheckText}>Checking for your transfer…</ThemedText>
            </View>
          ) : null}

          <TouchableOpacity
            style={[styles.checkBalanceButton, isCheckingBalance && styles.checkBalanceButtonDisabled]}
            onPress={handleCheckBalance}
            disabled={isCheckingBalance}
            activeOpacity={0.85}>
            {isCheckingBalance ? (
              <ActivityIndicator color="#fff" />
            ) : (
              <ThemedText style={styles.checkBalanceButtonText}>I have added the money</ThemedText>
            )}
          </TouchableOpacity>
        </>
      ) : (
        renderCreateVirtualAccountSection()
      )}

      {renderHowItWorks()}
    </>
  );

  return (
    <ThemedView style={styles.container}>
      <View style={[styles.header, { paddingTop: insets.top + 12 }]}>
        <TouchableOpacity onPress={() => router.back()} style={styles.backButton}>
          <MaterialIcons name="arrow-back" size={24} color="#1A2B4A" />
        </TouchableOpacity>
        <ThemedText style={styles.headerTitle}>
          {virtualAccount ? 'Virtual Account' : 'Fund Wallet'}
        </ThemedText>
        <TouchableOpacity
          onPress={() => router.push('/contact-us')}
          style={styles.headerAction}
          activeOpacity={0.85}>
          <MaterialIcons name="help-outline" size={24} color="#1A2B4A" />
        </TouchableOpacity>
      </View>

      <KeyboardAvoidingView
        style={styles.keyboardView}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
        <ScrollView
          style={styles.scrollView}
          contentContainerStyle={[styles.scrollContent, { paddingBottom: insets.bottom + 32 }]}
          showsVerticalScrollIndicator={false}
          keyboardShouldPersistTaps="handled"
          keyboardDismissMode="on-drag"
          automaticallyAdjustKeyboardInsets
          refreshControl={
            <RefreshControl refreshing={refreshing} onRefresh={handleRefresh} tintColor="#FF7F00" colors={['#FF7F00']} />
          }>
          <ThemedText style={styles.pageSubtitle} lightColor="#667085">
            {virtualAccount
              ? 'Use this account to fund your wallet'
              : 'Set up your virtual account to fund your wallet'}
          </ThemedText>

          {error ? (
            <View style={styles.errorBanner}>
              <MaterialIcons name="error-outline" size={20} color="#d32f2f" style={styles.errorIcon} />
              <ThemedText style={styles.errorText}>{error}</ThemedText>
            </View>
          ) : null}

          {renderVirtualAccountScreen()}
        </ScrollView>
      </KeyboardAvoidingView>
    </ThemedView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#F5F7FA',
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 20,
    paddingBottom: 16,
    backgroundColor: '#fff',
  },
  backButton: {
    width: 40,
    height: 40,
    justifyContent: 'center',
    alignItems: 'flex-start',
  },
  headerTitle: {
    fontSize: 18,
    fontWeight: '700',
    color: '#1A2B4A',
  },
  headerAction: {
    width: 40,
    height: 40,
    justifyContent: 'center',
    alignItems: 'flex-end',
  },
  keyboardView: {
    flex: 1,
  },
  scrollView: {
    flex: 1,
  },
  scrollContent: {
    paddingHorizontal: 20,
    paddingTop: 8,
    flexGrow: 1,
  },
  pageSubtitle: {
    fontSize: 14,
    color: '#667085',
    marginBottom: 18,
    textAlign: 'center',
  },
  vaHeroCard: {
    backgroundColor: '#FF7F00',
    borderRadius: 20,
    padding: 20,
    marginBottom: 16,
    overflow: 'hidden',
  },
  vaHeroPatternTop: {
    position: 'absolute',
    right: -20,
    top: -30,
    width: 140,
    height: 140,
    borderRadius: 70,
    backgroundColor: 'rgba(255, 255, 255, 0.1)',
  },
  vaHeroPatternBottom: {
    position: 'absolute',
    left: -40,
    bottom: -50,
    width: 160,
    height: 160,
    borderRadius: 80,
    backgroundColor: 'rgba(255, 255, 255, 0.06)',
  },
  vaHeroTopRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    justifyContent: 'space-between',
    marginBottom: 18,
  },
  vaHeroTopLeft: {
    flex: 1,
    flexDirection: 'row',
    flexWrap: 'wrap',
    alignItems: 'center',
    gap: 8,
    paddingRight: 8,
  },
  vaHeroIconWrap: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: '#fff',
    alignItems: 'center',
    justifyContent: 'center',
  },
  vaActiveBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#fff',
    borderRadius: 999,
    paddingHorizontal: 10,
    paddingVertical: 4,
    gap: 6,
  },
  vaActiveDot: {
    width: 7,
    height: 7,
    borderRadius: 4,
    backgroundColor: '#2E7D32',
  },
  vaActiveText: {
    fontSize: 11,
    fontWeight: '700',
    color: '#1A2B4A',
  },
  vaHeroBankRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    marginBottom: 4,
  },
  vaBankLogo: {
    width: 42,
    height: 42,
    borderRadius: 10,
    backgroundColor: '#fff',
    alignItems: 'center',
    justifyContent: 'center',
  },
  vaBankLogoText: {
    fontSize: 13,
    fontWeight: '800',
    color: '#FF7F00',
  },
  vaHeroField: {
    flex: 1,
    minWidth: 0,
  },
  vaHeroFieldLabel: {
    fontSize: 12,
    color: 'rgba(255, 255, 255, 0.8)',
    marginBottom: 4,
  },
  vaHeroFieldValue: {
    fontSize: 16,
    fontWeight: '700',
    color: '#fff',
  },
  vaHeroAccountNumber: {
    fontSize: 24,
    fontWeight: '800',
    color: '#fff',
    letterSpacing: 0.8,
  },
  vaHeroDivider: {
    height: 1,
    backgroundColor: 'rgba(255, 255, 255, 0.22)',
    marginVertical: 14,
  },
  vaHeroDetailRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 12,
  },
  vaHeroCopyIcon: {
    padding: 4,
  },
  howItWorksCard: {
    backgroundColor: '#F9FAFB',
    borderRadius: 16,
    padding: 16,
    paddingTop: 18,
    marginBottom: 8,
    overflow: 'visible',
  },
  howItWorksTitle: {
    fontSize: 18,
    fontWeight: '700',
    color: '#1A2B4A',
    marginBottom: 16,
  },
  howItWorksSteps: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    justifyContent: 'space-between',
    paddingTop: 4,
  },
  howItWorksStep: {
    flex: 1,
    alignItems: 'center',
    paddingHorizontal: 2,
    overflow: 'visible',
  },
  howItWorksIconWrap: {
    width: 56,
    height: 56,
    borderRadius: 28,
    backgroundColor: '#FFF3E8',
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 10,
    position: 'relative',
    overflow: 'visible',
  },
  howItWorksBadge: {
    position: 'absolute',
    top: -6,
    right: -8,
    minWidth: 24,
    height: 24,
    borderRadius: 12,
    backgroundColor: '#FF7F00',
    borderWidth: 2,
    borderColor: '#fff',
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 4,
    zIndex: 2,
    elevation: 3,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.15,
    shadowRadius: 2,
  },
  howItWorksBadgeText: {
    fontSize: 13,
    fontWeight: '800',
    color: '#fff',
    lineHeight: 16,
    textAlign: 'center',
    includeFontPadding: false,
  },
  howItWorksStepTitle: {
    fontSize: 12,
    fontWeight: '700',
    color: '#1A2B4A',
    marginBottom: 4,
    textAlign: 'center',
  },
  howItWorksStepDesc: {
    fontSize: 10,
    color: '#667085',
    lineHeight: 14,
    textAlign: 'center',
  },
  howItWorksArrow: {
    marginTop: 18,
    marginHorizontal: 2,
  },
  infoBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#FFF3E8',
    paddingHorizontal: 16,
    paddingVertical: 12,
    marginBottom: 16,
    borderRadius: 12,
  },
  infoIconContainer: {
    width: 24,
    height: 24,
    borderRadius: 12,
    backgroundColor: '#FF7F00',
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: 12,
  },
  infoIcon: {
    fontSize: 14,
    fontWeight: 'bold',
    color: '#fff',
  },
  infoText: {
    flex: 1,
    fontSize: 12,
    color: '#333',
    lineHeight: 18,
  },
  checkBalanceButton: {
    backgroundColor: '#FF7F00',
    borderRadius: 12,
    paddingVertical: 16,
    alignItems: 'center',
    marginBottom: 16,
  },
  autoCheckRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    marginBottom: 12,
  },
  autoCheckText: {
    fontSize: 13,
    color: '#667085',
  },
  checkBalanceButtonDisabled: {
    opacity: 0.6,
  },
  checkBalanceButtonText: {
    fontSize: 15,
    fontWeight: '700',
    color: '#fff',
  },
  createCard: {
    backgroundColor: '#fff',
    borderRadius: 12,
    padding: 20,
    marginBottom: 16,
    borderWidth: 1,
    borderColor: '#E0E0E0',
  },
  createTitle: {
    fontSize: 18,
    fontWeight: '700',
    color: '#1A2B4A',
    marginBottom: 8,
  },
  createDescription: {
    fontSize: 14,
    color: '#666',
    marginBottom: 16,
    lineHeight: 20,
  },
  savedNinBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    backgroundColor: '#E8F5E9',
    borderRadius: 10,
    paddingHorizontal: 14,
    paddingVertical: 12,
    marginBottom: 16,
  },
  savedNinText: {
    flex: 1,
    fontSize: 14,
    fontWeight: '600',
    color: '#2E7D32',
  },
  inputGroup: {
    marginBottom: 16,
  },
  inputLabel: {
    fontSize: 14,
    fontWeight: '600',
    color: '#333',
    marginBottom: 8,
  },
  inputRow: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#F5F5F5',
    borderRadius: 8,
    paddingHorizontal: 12,
    borderWidth: 1,
    borderColor: '#E0E0E0',
    minHeight: 50,
  },
  inputIcon: {
    marginRight: 8,
  },
  ninInput: {
    flex: 1,
    fontSize: 16,
    color: '#333',
    paddingVertical: 12,
  },
  ninHelperText: {
    marginTop: 6,
    fontSize: 12,
    color: '#777',
  },
  createButton: {
    backgroundColor: '#FF7F00',
    borderRadius: 12,
    paddingVertical: 16,
    alignItems: 'center',
  },
  createButtonDisabled: {
    opacity: 0.6,
  },
  createButtonText: {
    fontSize: 15,
    fontWeight: '700',
    color: '#fff',
  },
  ninSecurityNote: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#E8F5E9',
    borderRadius: 8,
    padding: 12,
    marginTop: 16,
  },
  securityIcon: {
    marginRight: 8,
  },
  ninSecurityText: {
    flex: 1,
    fontSize: 13,
    color: '#2E7D32',
    lineHeight: 18,
  },
  errorBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#fdecea',
    marginBottom: 16,
    borderRadius: 8,
    paddingHorizontal: 14,
    paddingVertical: 12,
  },
  errorIcon: {
    marginRight: 8,
  },
  errorText: {
    flex: 1,
    fontSize: 13,
    color: '#d32f2f',
  },
});
