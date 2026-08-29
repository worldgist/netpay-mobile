import { useState, useCallback } from 'react';
import {
  StyleSheet,
  View,
  ScrollView,
  TouchableOpacity,
  Alert,
  TextInput,
  KeyboardAvoidingView,
  Platform,
} from 'react-native';
import * as Linking from 'expo-linking';
import * as WebBrowser from 'expo-web-browser';
import { NetpayLoadingAnimation } from '@/components/netpay-loading-animation';
import { ThemedView } from '@/components/themed-view';
import { ThemedText } from '@/components/themed-text';
import { MaterialIcons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import { useFocusEffect } from '@react-navigation/native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { supabase } from '@/lib/supabase';
import { readCachedWalletBalance, writeCachedWalletBalance } from '@/utils/wallet-balance-cache';
import {
  buildFundingCallbackParams,
  shouldHandleFundingCallback,
} from '@/utils/funding-callback-guard';
import { returnToAppAfterFunding } from '@/utils/verify-flutterwave-funding';

WebBrowser.maybeCompleteAuthSession();

const MIN_AMOUNT = 100;
const MAX_AMOUNT = 500_000;
const QUICK_AMOUNTS = [500, 1000, 2000, 5000, 10000];
const FUNDING_FEE_PERCENTAGE = 0.05;
const MIN_FUNDING_FEE = 10;

function parseAmount(value: string) {
  const digits = value.replace(/\D/g, '');
  return digits ? Number(digits) : 0;
}

function formatCurrency(value: number) {
  return `₦${value.toLocaleString('en-NG', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })}`;
}

function calculateFundingFee(amount: number) {
  const percentageFee = amount * FUNDING_FEE_PERCENTAGE;
  return Math.max(MIN_FUNDING_FEE, Math.round(percentageFee * 100) / 100);
}

export default function AddMoneyScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const [amountInput, setAmountInput] = useState('');
  const [walletBalance, setWalletBalance] = useState<number>(0);
  const [balanceVisible, setBalanceVisible] = useState(true);
  const [loadingBalance, setLoadingBalance] = useState(false);
  const [paying, setPaying] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const amount = parseAmount(amountInput);
  const fundingFee = amount >= MIN_AMOUNT ? calculateFundingFee(amount) : 0;
  const netCredit = amount >= MIN_AMOUNT ? amount - fundingFee : 0;
  const canPay = amount >= MIN_AMOUNT && amount <= MAX_AMOUNT && !paying;

  const fetchWalletBalance = useCallback(async () => {
    try {
      const { data: sessionData, error: sessionError } = await supabase.auth.getSession();
      if (sessionError) throw sessionError;

      const session = sessionData.session;
      if (!session) {
        router.replace('/auth/login');
        return;
      }

      const { data: profile, error: profileError } = await supabase
        .from('profiles')
        .select('balance')
        .eq('id', session.user.id)
        .single();

      if (profileError) throw profileError;
      const balance = Number(profile?.balance) || 0;
      setWalletBalance(balance);
      await writeCachedWalletBalance(session.user.id, balance);
    } catch (err) {
      console.error('Failed to load wallet balance:', err);
    } finally {
      setLoadingBalance(false);
    }
  }, [router]);

  useFocusEffect(
    useCallback(() => {
      void (async () => {
        const { data: sessionData } = await supabase.auth.getSession();
        const userId = sessionData.session?.user.id;
        if (userId) {
          const cachedBalance = await readCachedWalletBalance(userId);
          if (cachedBalance !== null) {
            setWalletBalance(cachedBalance);
          }
        }
        void fetchWalletBalance();
      })();
    }, [fetchWalletBalance]),
  );

  const projectedBalance = amount >= MIN_AMOUNT ? walletBalance + netCredit : null;

  const handlePay = async () => {
    if (!canPay) {
      Alert.alert(
        'Invalid Amount',
        `Enter an amount between ${formatCurrency(MIN_AMOUNT)} and ${formatCurrency(MAX_AMOUNT)}.`,
      );
      return;
    }

    try {
      setPaying(true);
      setError(null);

      const redirectUrl = Linking.createURL('add-money-callback');

      const { data, error: initError } = await supabase.functions.invoke('initialize-flutterwave-checkout', {
        body: {
          amount,
          redirectUrl,
        },
      });

      if (initError) throw initError;
      if (!data?.success || !data.data?.paymentLink) {
        throw new Error(data?.error || 'Failed to start checkout');
      }

      const paymentLink = data.data.paymentLink as string;
      const result = await WebBrowser.openAuthSessionAsync(paymentLink, redirectUrl);

      if (result.type === 'success' && result.url) {
        const callbackParams = buildFundingCallbackParams(result.url);
        if (callbackParams && (await shouldHandleFundingCallback(callbackParams.tx_ref))) {
          returnToAppAfterFunding(callbackParams.tx_ref, callbackParams.status);
        }
        return;
      }

      if (result.type === 'cancel' || result.type === 'dismiss') {
        Alert.alert('Payment Cancelled', 'You closed the checkout before completing payment.');
      }
    } catch (err) {
      console.error('Checkout error:', err);
      const message = err instanceof Error ? err.message : 'Failed to start payment';
      setError(message);
      Alert.alert('Payment Error', message);
    } finally {
      setPaying(false);
    }
  };

  return (
    <ThemedView style={styles.container}>
      <View style={styles.header}>
        <TouchableOpacity onPress={() => router.back()} style={styles.backButton}>
          <MaterialIcons name="arrow-back" size={24} color="#000" />
        </TouchableOpacity>
        <ThemedText style={styles.headerTitle}>Fund Wallet</ThemedText>
        <View style={styles.headerAction} />
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
          automaticallyAdjustKeyboardInsets>
          <View style={styles.balanceCard}>
            <View style={styles.balanceCardPattern} />
            <View style={styles.balanceHeader}>
              <View style={styles.balanceHeaderLeft}>
                <View style={styles.balanceIconWrap}>
                  <MaterialIcons name="account-balance-wallet" size={20} color="#FF7F00" />
                </View>
                <ThemedText style={styles.balanceLabel}>Available Balance</ThemedText>
              </View>
              <TouchableOpacity
                onPress={() => setBalanceVisible((visible) => !visible)}
                style={styles.eyeButton}
                activeOpacity={0.8}>
                <MaterialIcons
                  name={balanceVisible ? 'visibility' : 'visibility-off'}
                  size={22}
                  color="#fff"
                />
              </TouchableOpacity>
            </View>

            <View style={styles.balanceAmountContainer}>
              {loadingBalance ? (
                <NetpayLoadingAnimation size={36} variant="onBrand" strokeWidth={2.5} />
              ) : (
                <ThemedText style={styles.balanceValue}>
                  {balanceVisible ? formatCurrency(walletBalance) : '₦ ••••••'}
                </ThemedText>
              )}
            </View>

            {balanceVisible && projectedBalance !== null ? (
              <View style={styles.projectedBalanceRow}>
                <MaterialIcons name="trending-up" size={16} color="#fff" />
                <ThemedText style={styles.projectedBalanceText}>
                  After funding: {formatCurrency(projectedBalance)}
                </ThemedText>
              </View>
            ) : null}
          </View>

          <View style={styles.infoBanner}>
            <View style={styles.infoIconContainer}>
              <ThemedText style={styles.infoIcon}>i</ThemedText>
            </View>
            <ThemedText style={styles.infoText}>
              Fund your wallet securely with card, bank transfer, or USSD via Flutterwave. Your balance updates
              after successful payment.
            </ThemedText>
          </View>

          <View style={styles.section}>
            <ThemedText style={styles.sectionLabel}>Enter Amount</ThemedText>
            <View style={styles.amountRow}>
              <ThemedText style={styles.currencyPrefix}>₦</ThemedText>
              <TextInput
                style={styles.amountInput}
                placeholder="0"
                placeholderTextColor="#999"
                value={amountInput}
                onChangeText={(value) => setAmountInput(value.replace(/\D/g, ''))}
                keyboardType="numeric"
                maxLength={7}
              />
            </View>
            <ThemedText style={styles.helperText}>
              Min {formatCurrency(MIN_AMOUNT)} · Max {formatCurrency(MAX_AMOUNT)}
            </ThemedText>
          </View>

          <View style={styles.quickAmountRow}>
            {QUICK_AMOUNTS.map((quickAmount) => (
              <TouchableOpacity
                key={quickAmount}
                style={[styles.quickAmountButton, amount === quickAmount && styles.quickAmountButtonActive]}
                onPress={() => setAmountInput(String(quickAmount))}
                activeOpacity={0.85}
                disabled={paying}>
                <ThemedText
                  style={[styles.quickAmountText, amount === quickAmount && styles.quickAmountTextActive]}>
                  {formatCurrency(quickAmount)}
                </ThemedText>
              </TouchableOpacity>
            ))}
          </View>

          {amount >= MIN_AMOUNT ? (
            <View style={styles.summaryCard}>
              <View style={styles.summaryRow}>
                <ThemedText style={styles.summaryLabel}>You pay</ThemedText>
                <ThemedText style={styles.summaryValue}>{formatCurrency(amount)}</ThemedText>
              </View>
              <View style={styles.summaryRow}>
                <ThemedText style={styles.summaryLabel}>Processing fee (5%, min ₦10)</ThemedText>
                <ThemedText style={styles.summaryValue}>-{formatCurrency(fundingFee)}</ThemedText>
              </View>
              <View style={[styles.summaryRow, styles.summaryRowTotal]}>
                <ThemedText style={styles.summaryTotalLabel}>Wallet credit</ThemedText>
                <ThemedText style={styles.summaryTotalValue}>{formatCurrency(netCredit)}</ThemedText>
              </View>
            </View>
          ) : null}

          {error ? (
            <View style={styles.errorBanner}>
              <MaterialIcons name="error-outline" size={20} color="#d32f2f" style={styles.errorIcon} />
              <ThemedText style={styles.errorText}>{error}</ThemedText>
            </View>
          ) : null}

          <TouchableOpacity
            style={[styles.payButton, !canPay && styles.payButtonDisabled]}
            onPress={handlePay}
            disabled={!canPay}
            activeOpacity={0.85}>
            {paying ? (
              <NetpayLoadingAnimation size={40} variant="onBrand" strokeWidth={2.5} />
            ) : (
              <>
                <MaterialIcons name="account-balance-wallet" size={18} color="#fff" style={styles.payButtonIcon} />
                <ThemedText style={styles.payButtonText}>Pay with Flutterwave</ThemedText>
              </>
            )}
          </TouchableOpacity>

          <View style={styles.securityNote}>
            <MaterialIcons name="shield" size={20} color="#4CAF50" style={styles.securityIcon} />
            <ThemedText style={styles.securityText}>
              Payments are processed securely by Flutterwave. You will be redirected to complete checkout.
            </ThemedText>
          </View>
        </ScrollView>
      </KeyboardAvoidingView>
    </ThemedView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#fff',
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 20,
    paddingTop: 60,
    paddingBottom: 20,
  },
  backButton: {
    width: 40,
    height: 40,
    justifyContent: 'center',
    alignItems: 'flex-start',
  },
  headerTitle: {
    fontSize: 18,
    fontWeight: 'bold',
    color: '#000',
  },
  headerAction: {
    width: 40,
    height: 40,
  },
  keyboardView: {
    flex: 1,
  },
  scrollView: {
    flex: 1,
  },
  scrollContent: {
    paddingHorizontal: 20,
    flexGrow: 1,
  },
  balanceCard: {
    backgroundColor: '#FF7F00',
    borderRadius: 20,
    padding: 22,
    marginBottom: 20,
    overflow: 'hidden',
  },
  balanceCardPattern: {
    position: 'absolute',
    right: -30,
    top: -20,
    width: 160,
    height: 160,
    borderRadius: 80,
    backgroundColor: 'rgba(255, 255, 255, 0.08)',
  },
  balanceHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 14,
  },
  balanceHeaderLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  balanceIconWrap: {
    width: 34,
    height: 34,
    borderRadius: 17,
    backgroundColor: '#fff',
    alignItems: 'center',
    justifyContent: 'center',
  },
  balanceLabel: {
    fontSize: 14,
    color: '#fff',
    fontWeight: '600',
    opacity: 0.95,
  },
  eyeButton: {
    padding: 4,
  },
  balanceAmountContainer: {
    minHeight: 48,
    justifyContent: 'center',
    marginBottom: 4,
  },
  balanceValue: {
    fontSize: 34,
    fontWeight: '700',
    color: '#fff',
    lineHeight: 42,
    letterSpacing: 0.3,
  },
  projectedBalanceRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    marginTop: 8,
    paddingTop: 12,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: 'rgba(255, 255, 255, 0.35)',
  },
  projectedBalanceText: {
    fontSize: 13,
    color: '#fff',
    fontWeight: '600',
    opacity: 0.95,
  },
  infoBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#F5E6D3',
    paddingHorizontal: 16,
    paddingVertical: 12,
    marginBottom: 20,
    borderRadius: 8,
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
  section: {
    marginBottom: 16,
  },
  sectionLabel: {
    fontSize: 13,
    fontWeight: '600',
    color: '#666',
    marginBottom: 8,
  },
  amountRow: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#F5F5F5',
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#E0E0E0',
    paddingHorizontal: 16,
    minHeight: 58,
  },
  currencyPrefix: {
    fontSize: 22,
    fontWeight: '700',
    color: '#FF7F00',
    marginRight: 8,
  },
  amountInput: {
    flex: 1,
    fontSize: 28,
    fontWeight: '700',
    color: '#111827',
    paddingVertical: 8,
  },
  helperText: {
    marginTop: 8,
    fontSize: 12,
    color: '#777',
  },
  quickAmountRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 10,
    marginBottom: 20,
  },
  quickAmountButton: {
    paddingHorizontal: 14,
    paddingVertical: 10,
    borderRadius: 20,
    borderWidth: 1,
    borderColor: '#FF7F00',
    backgroundColor: '#fff',
  },
  quickAmountButtonActive: {
    backgroundColor: '#FF7F00',
  },
  quickAmountText: {
    fontSize: 12,
    fontWeight: '600',
    color: '#FF7F00',
  },
  quickAmountTextActive: {
    color: '#fff',
  },
  summaryCard: {
    backgroundColor: '#fff',
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#E0E0E0',
    padding: 16,
    marginBottom: 20,
  },
  summaryRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 10,
  },
  summaryRowTotal: {
    marginTop: 4,
    paddingTop: 12,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: '#E0E0E0',
    marginBottom: 0,
  },
  summaryLabel: {
    fontSize: 13,
    color: '#666',
    flex: 1,
    paddingRight: 12,
  },
  summaryValue: {
    fontSize: 14,
    fontWeight: '600',
    color: '#111827',
  },
  summaryTotalLabel: {
    fontSize: 14,
    fontWeight: '700',
    color: '#111827',
  },
  summaryTotalValue: {
    fontSize: 16,
    fontWeight: '700',
    color: '#FF7F00',
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
  payButton: {
    backgroundColor: '#FF7F00',
    borderRadius: 12,
    paddingVertical: 16,
    alignItems: 'center',
    justifyContent: 'center',
    flexDirection: 'row',
    marginBottom: 16,
  },
  payButtonDisabled: {
    opacity: 0.6,
  },
  payButtonIcon: {
    marginRight: 8,
  },
  payButtonText: {
    fontSize: 15,
    fontWeight: '700',
    color: '#fff',
  },
  securityNote: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#E8F5E9',
    borderRadius: 8,
    padding: 12,
    marginBottom: 32,
  },
  securityIcon: {
    marginRight: 8,
  },
  securityText: {
    flex: 1,
    fontSize: 12,
    color: '#2E7D32',
    lineHeight: 18,
  },
});
