import { useState, useCallback, useEffect, useRef } from 'react';
import { StyleSheet, View, ScrollView, TouchableOpacity, Alert, Platform, TextInput, ActivityIndicator, RefreshControl } from 'react-native';
import { ThemedView } from '@/components/themed-view';
import { ThemedText } from '@/components/themed-text';
import { MaterialIcons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import { useFocusEffect } from '@react-navigation/native';
import * as Clipboard from 'expo-clipboard';
import { supabase } from '@/lib/supabase';

const PAYVESSEL_BUSINESS_ID = '5EE89DA992424C6DA0234577E7E4ECAA';
const DEFAULT_BANK_CODE = '999991';
const DEFAULT_BANK_NAME = 'PalmPay';
const ALTERNATE_BANK_CODE = '120001';
const ALTERNATE_BANK_NAME = '9 Payment Service Bank';

interface VirtualAccount {
  account_number: string;
  bank_name: string;
  account_name: string;
  bank_code: string;
  tracking_reference?: string | null;
}

export default function AddMoneyScreen() {
  const router = useRouter();
  const [virtualAccount, setVirtualAccount] = useState<VirtualAccount | null>(null);
  const [selectedBank, setSelectedBank] = useState<typeof DEFAULT_BANK_CODE | typeof ALTERNATE_BANK_CODE>(DEFAULT_BANK_CODE);
  const [nin, setNin] = useState('');
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [creating, setCreating] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [showCreateForm, setShowCreateForm] = useState(false);
  const isMounted = useRef(true);

  useEffect(() => {
    isMounted.current = true;
    return () => {
      isMounted.current = false;
    };
  }, []);

  const fetchVirtualAccount = useCallback(async (isRefresh = false) => {
    try {
      if (isMounted.current) {
        setError(null);
        if (isRefresh) {
          setRefreshing(true);
        } else {
          setLoading(true);
        }
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
        .eq('bank_code', selectedBank)
        .maybeSingle();

      if (accountError && accountError.code !== 'PGRST116') {
        throw accountError;
      }

      if (isMounted.current) {
        if (accountData) {
          setVirtualAccount(accountData as VirtualAccount);
          setShowCreateForm(false);
        } else {
          setVirtualAccount(null);
          setShowCreateForm(true);
        }
      }
    } catch (err) {
      console.error('Failed to load virtual account:', err);
      if (isMounted.current) {
        setError(err instanceof Error ? err.message : 'Failed to load account information.');
        setVirtualAccount(null);
        setShowCreateForm(true);
      }
    } finally {
      if (isMounted.current) {
        setLoading(false);
        setRefreshing(false);
      }
    }
  }, [router, selectedBank]);

  useFocusEffect(
    useCallback(() => {
      fetchVirtualAccount();
    }, [fetchVirtualAccount])
  );

  useEffect(() => {
    fetchVirtualAccount();
  }, [fetchVirtualAccount]);

  const handleRefresh = useCallback(() => {
    fetchVirtualAccount(true);
  }, [fetchVirtualAccount]);

  const handleSelectBank = (bankCode: typeof DEFAULT_BANK_CODE | typeof ALTERNATE_BANK_CODE) => {
    if (bankCode === selectedBank) return;
    setSelectedBank(bankCode);
  };

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
    } catch (err) {
      console.error('Copy error:', err);
      Alert.alert('Error', 'Failed to copy to clipboard');
    }
  };

  const handleCreateVirtualAccount = async () => {
    if (nin.trim().length !== 11) {
      Alert.alert('NIN Required', 'Please enter your 11-digit NIN to create a virtual account.');
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

      const { data, error: invokeError } = await supabase.functions.invoke('get-virtual-account', {
        body: {
          email: emailAddress,
          name: fullName,
          phoneNumber,
          bankcode: [selectedBank],
          account_type: 'STATIC',
          nin: nin.trim(),
        },
      });

      if (invokeError) throw invokeError;

      if (data?.success && data.data) {
        const account = data.data;
        const bankName = account.bank_name || (selectedBank === DEFAULT_BANK_CODE ? DEFAULT_BANK_NAME : ALTERNATE_BANK_NAME);

        const { error: upsertError } = await supabase
          .from('virtual_accounts')
          .upsert(
            {
              user_id: userId,
              business_id: PAYVESSEL_BUSINESS_ID,
              bank_code: selectedBank,
              bank_name: bankName,
              account_number: account.account_number,
              account_name: account.account_name,
              tracking_reference: account.trackingReference || account.tracking_reference || null,
            },
            { onConflict: 'user_id,bank_code' }
          );

        if (upsertError) {
          throw upsertError;
        }

        if (isMounted.current) {
          setVirtualAccount({
            account_number: account.account_number,
            account_name: account.account_name,
            bank_name: bankName,
            bank_code: selectedBank,
            tracking_reference: account.trackingReference || account.tracking_reference || null,
          });
          setShowCreateForm(false);
          setNin('');
        }

        Alert.alert('Success', 'Virtual account created successfully.');
      } else {
        const message = data?.error || 'Failed to create virtual account. Please try again later.';
        if (isMounted.current) {
          setError(message);
        }
        Alert.alert('Creation Failed', message);
      }
    } catch (err) {
      console.error('Create virtual account error:', err);
      const message = err instanceof Error ? err.message : 'Failed to create virtual account. Please try again later.';
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

  const bankDisplayName = selectedBank === DEFAULT_BANK_CODE ? DEFAULT_BANK_NAME : ALTERNATE_BANK_NAME;

  return (
    <ThemedView style={styles.container}>
      <View style={styles.header}>
        <TouchableOpacity onPress={() => router.back()} style={styles.backButton}>
          <MaterialIcons name="arrow-back" size={24} color="#000" />
        </TouchableOpacity>
        <ThemedText style={styles.headerTitle}>Account Details</ThemedText>
        <TouchableOpacity
          onPress={handleRefresh}
          style={styles.headerAction}
          disabled={loading || refreshing || creating}
        >
          <MaterialIcons
            name={loading || refreshing ? 'refresh' : 'refresh'}
            size={24}
            color={loading || refreshing || creating ? '#999' : '#000'}
          />
        </TouchableOpacity>
      </View>

      <ScrollView
        style={styles.scrollView}
        showsVerticalScrollIndicator={false}
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={handleRefresh}
            tintColor="#FF7F00"
            colors={["#FF7F00"]}
          />
        }
      >
        <View style={styles.bankToggleRow}>
          <TouchableOpacity
            style={[styles.bankToggleButton, selectedBank === DEFAULT_BANK_CODE && styles.bankToggleButtonActive]}
            onPress={() => handleSelectBank(DEFAULT_BANK_CODE)}
            activeOpacity={0.8}
            disabled={creating || loading}
          >
            <ThemedText style={[styles.bankToggleText, selectedBank === DEFAULT_BANK_CODE && styles.bankToggleTextActive]}>
              PalmPay
            </ThemedText>
          </TouchableOpacity>
          <TouchableOpacity
            style={[styles.bankToggleButton, selectedBank === ALTERNATE_BANK_CODE && styles.bankToggleButtonActive]}
            onPress={() => handleSelectBank(ALTERNATE_BANK_CODE)}
            activeOpacity={0.8}
            disabled={creating || loading}
          >
            <ThemedText style={[styles.bankToggleText, selectedBank === ALTERNATE_BANK_CODE && styles.bankToggleTextActive]}>
              9PSB
            </ThemedText>
          </TouchableOpacity>
        </View>

        <View style={styles.infoBanner}>
          <View style={styles.infoIconContainer}>
            <ThemedText style={styles.infoIcon}>i</ThemedText>
          </View>
          <ThemedText style={styles.infoText}>
            {virtualAccount
              ? 'Transfer to the virtual account number below to fund your wallet.'
              : 'Create your dedicated virtual account to receive instant wallet credits.'}
          </ThemedText>
        </View>

        {/* Funding Fee Notice */}
        {virtualAccount && (
          <View style={styles.feeNoticeBanner}>
            <MaterialIcons name="info" size={20} color="#FF9800" style={styles.feeNoticeIcon} />
            <View style={styles.feeNoticeContent}>
              <ThemedText style={styles.feeNoticeTitle}>Funding Fee Notice</ThemedText>
              <ThemedText style={styles.feeNoticeText}>
                A 5% processing fee (minimum ₦10) will be deducted from your transfer amount. 
                For example, if you transfer ₦1,000, ₦50 will be charged as fee and ₦950 will be credited to your wallet.
              </ThemedText>
            </View>
          </View>
        )}

        {error && !loading && (
          <View style={styles.errorBanner}>
            <MaterialIcons name="error-outline" size={20} color="#d32f2f" style={styles.errorIcon} />
            <ThemedText style={styles.errorText}>{error}</ThemedText>
          </View>
        )}

        {loading && !refreshing && !virtualAccount && !showCreateForm ? (
          <View style={styles.loadingContainer}>
            <ActivityIndicator size="large" color="#FF7F00" />
          </View>
        ) : null}

        {virtualAccount && (
          <>
            <View style={styles.accountCard}>
              <View style={styles.accountIconContainer}>
                <MaterialIcons name="list-alt" size={24} color="#FF7F00" />
              </View>
              <View style={styles.accountInfo}>
                <ThemedText style={styles.accountLabel}>{bankDisplayName} Account Number</ThemedText>
                <ThemedText style={styles.accountValue}>{virtualAccount.account_number}</ThemedText>
              </View>
              <TouchableOpacity
                style={styles.copyButton}
                onPress={() => handleCopy(virtualAccount.account_number, 'Account number')}
              >
                <MaterialIcons name="content-copy" size={18} color="#FF7F00" />
                <ThemedText style={styles.copyButtonText}>Copy</ThemedText>
              </TouchableOpacity>
            </View>

            <View style={styles.accountCard}>
              <View style={styles.accountIconContainer}>
                <MaterialIcons name="account-balance" size={24} color="#FF7F00" />
              </View>
              <View style={styles.accountInfo}>
                <ThemedText style={styles.accountLabel}>Bank Name</ThemedText>
                <ThemedText style={styles.accountValue}>{virtualAccount.bank_name || bankDisplayName}</ThemedText>
              </View>
              <View style={styles.recommendedTag}>
                <MaterialIcons name="check-circle" size={16} color="#4CAF50" />
                <ThemedText style={styles.recommendedText}>Recommended</ThemedText>
              </View>
            </View>

            <View style={styles.accountCard}>
              <View style={styles.accountIconContainer}>
                <MaterialIcons name="person" size={24} color="#FF7F00" />
              </View>
              <View style={styles.accountInfo}>
                <ThemedText style={styles.accountLabel}>Account Name</ThemedText>
                <ThemedText style={styles.accountValue}>{virtualAccount.account_name}</ThemedText>
              </View>
            </View>

            {virtualAccount.tracking_reference && (
              <View style={styles.accountCard}>
                <View style={styles.accountIconContainer}>
                  <MaterialIcons name="tag" size={24} color="#FF7F00" />
                </View>
                <View style={styles.accountInfo}>
                  <ThemedText style={styles.accountLabel}>Tracking Reference</ThemedText>
                  <ThemedText style={styles.accountValue} numberOfLines={1}>
                    {virtualAccount.tracking_reference}
                  </ThemedText>
                </View>
                <TouchableOpacity
                  style={styles.copyButton}
                  onPress={() => handleCopy(virtualAccount.tracking_reference || '', 'Tracking reference')}
                >
                  <MaterialIcons name="content-copy" size={18} color="#FF7F00" />
                  <ThemedText style={styles.copyButtonText}>Copy</ThemedText>
                </TouchableOpacity>
              </View>
            )}

            <View style={styles.instructionsCard}>
              <ThemedText style={styles.instructionsTitle}>How to add money:</ThemedText>
              <View style={styles.instructionItem}>
                <ThemedText style={styles.instructionNumber}>1.</ThemedText>
                <ThemedText style={styles.instructionText}>Copy the account number above</ThemedText>
              </View>
              <View style={styles.instructionItem}>
                <ThemedText style={styles.instructionNumber}>2.</ThemedText>
                <ThemedText style={styles.instructionText}>Open your bank app and make a transfer</ThemedText>
              </View>
              <View style={styles.instructionItem}>
                <ThemedText style={styles.instructionNumber}>3.</ThemedText>
                <ThemedText style={styles.instructionText}>Your wallet will be credited automatically</ThemedText>
              </View>
            </View>

            <View style={styles.noteBanner}>
              <ThemedText style={styles.noteText}>
                Note: This is your dedicated virtual account. All transfers to this account will be automatically credited to your wallet.
              </ThemedText>
            </View>
          </>
        )}

        {showCreateForm && (
          <View style={styles.createCard}>
            <ThemedText style={styles.createTitle}>Create Virtual Account</ThemedText>
            <ThemedText style={styles.createDescription}>
              Enter your 11-digit NIN to generate a permanent virtual account with {bankDisplayName}.
            </ThemedText>

            <View style={styles.inputGroup}>
              <ThemedText style={styles.inputLabel}>NIN (National Identity Number)</ThemedText>
              <View style={styles.inputRow}>
                <MaterialIcons name="badge" size={20} color="#666" style={styles.inputIcon} />
                <TextInput
                  style={styles.input}
                  placeholder="Enter 11-digit NIN"
                  placeholderTextColor="#999"
                  value={nin}
                  onChangeText={(value) => setNin(value.replace(/\D/g, '').slice(0, 11))}
                  keyboardType="numeric"
                  maxLength={11}
                />
              </View>
              <ThemedText style={styles.helperText}>Required for account verification</ThemedText>
            </View>

            <TouchableOpacity
              style={[styles.createButton, (creating || nin.length !== 11) && styles.createButtonDisabled]}
              onPress={handleCreateVirtualAccount}
              disabled={creating || nin.length !== 11}
              activeOpacity={0.8}
            >
              {creating ? (
                <ActivityIndicator color="#fff" />
              ) : (
                <ThemedText style={styles.createButtonText}>Create Virtual Account</ThemedText>
              )}
            </TouchableOpacity>

            <View style={styles.securityNote}>
              <MaterialIcons name="shield" size={20} color="#4CAF50" style={styles.securityIcon} />
              <ThemedText style={styles.securityText}>
                Your NIN is encrypted and only used once for account verification.
              </ThemedText>
            </View>
          </View>
        )}
      </ScrollView>

      <View style={styles.buttonContainer}>
        <TouchableOpacity style={styles.dashboardButton} onPress={() => router.push('/')}>
          <ThemedText style={styles.dashboardButtonText}>I have added the money</ThemedText>
        </TouchableOpacity>
      </View>
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
    fontSize: 20,
    fontWeight: 'bold',
    color: '#000',
  },
  headerAction: {
    width: 40,
    height: 40,
    justifyContent: 'center',
    alignItems: 'flex-end',
  },
  scrollView: {
    flex: 1,
  },
  bankToggleRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    paddingHorizontal: 20,
    marginBottom: 16,
  },
  bankToggleButton: {
    flex: 0.48,
    borderWidth: 1,
    borderColor: '#FF7F00',
    borderRadius: 10,
    paddingVertical: 12,
    alignItems: 'center',
    backgroundColor: '#fff',
  },
  bankToggleButtonActive: {
    backgroundColor: '#FF7F00',
  },
  bankToggleText: {
    fontSize: 14,
    fontWeight: '600',
    color: '#FF7F00',
  },
  bankToggleTextActive: {
    color: '#fff',
  },
  infoBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#F5E6D3',
    paddingHorizontal: 16,
    paddingVertical: 12,
    marginHorizontal: 20,
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
    fontSize: 16,
    fontWeight: 'bold',
    color: '#fff',
  },
  infoText: {
    flex: 1,
    fontSize: 14,
    color: '#333',
  },
  feeNoticeBanner: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    backgroundColor: '#FFF3E0',
    borderWidth: 1,
    borderColor: '#FFB74D',
    paddingHorizontal: 16,
    paddingVertical: 12,
    marginHorizontal: 20,
    marginBottom: 20,
    borderRadius: 8,
  },
  feeNoticeIcon: {
    marginRight: 12,
    marginTop: 2,
  },
  feeNoticeContent: {
    flex: 1,
  },
  feeNoticeTitle: {
    fontSize: 14,
    fontWeight: '600',
    color: '#E65100',
    marginBottom: 4,
  },
  feeNoticeText: {
    fontSize: 12,
    color: '#BF360C',
    lineHeight: 18,
  },
  accountCard: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#fff',
    borderRadius: 12,
    padding: 16,
    marginHorizontal: 20,
    marginBottom: 16,
    borderWidth: 1,
    borderColor: '#E0E0E0',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.1,
    shadowRadius: 2,
    elevation: 2,
  },
  accountIconContainer: {
    width: 48,
    height: 48,
    borderRadius: 24,
    backgroundColor: '#FFF3E0',
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: 16,
  },
  accountInfo: {
    flex: 1,
  },
  accountLabel: {
    fontSize: 14,
    color: '#666',
    marginBottom: 4,
  },
  accountValue: {
    fontSize: 20,
    fontWeight: 'bold',
    color: '#000',
  },
  copyButton: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#FFF3E0',
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 8,
  },
  copyButtonText: {
    marginLeft: 6,
    fontSize: 14,
    fontWeight: '600',
    color: '#FF7F00',
  },
  recommendedTag: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#E8F5E9',
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 12,
  },
  recommendedText: {
    marginLeft: 4,
    fontSize: 12,
    fontWeight: '600',
    color: '#4CAF50',
  },
  instructionsCard: {
    backgroundColor: '#FF7F00',
    borderRadius: 12,
    padding: 20,
    marginHorizontal: 20,
    marginBottom: 20,
  },
  instructionsTitle: {
    fontSize: 18,
    fontWeight: 'bold',
    color: '#fff',
    marginBottom: 16,
  },
  instructionItem: {
    flexDirection: 'row',
    marginBottom: 12,
  },
  instructionNumber: {
    fontSize: 16,
    fontWeight: 'bold',
    color: '#fff',
    marginRight: 12,
    width: 20,
  },
  instructionText: {
    flex: 1,
    fontSize: 16,
    color: '#fff',
    lineHeight: 24,
  },
  noteBanner: {
    backgroundColor: '#F5E6D3',
    borderRadius: 8,
    padding: 16,
    marginHorizontal: 20,
    marginBottom: 20,
  },
  noteText: {
    fontSize: 14,
    color: '#333',
    lineHeight: 20,
  },
  errorBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#fdecea',
    marginHorizontal: 20,
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
  loadingContainer: {
    marginHorizontal: 20,
    marginVertical: 40,
    alignItems: 'center',
    justifyContent: 'center',
  },
  createCard: {
    backgroundColor: '#fff',
    borderRadius: 12,
    padding: 20,
    marginHorizontal: 20,
    marginBottom: 24,
    borderWidth: 1,
    borderColor: '#E0E0E0',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.08,
    shadowRadius: 4,
    elevation: 3,
  },
  createTitle: {
    fontSize: 18,
    fontWeight: '700',
    color: '#000',
    marginBottom: 8,
  },
  createDescription: {
    fontSize: 14,
    color: '#555',
    marginBottom: 16,
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
  input: {
    flex: 1,
    fontSize: 16,
    color: '#333',
    paddingVertical: 12,
  },
  helperText: {
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
    fontSize: 16,
    fontWeight: '600',
    color: '#fff',
  },
  securityNote: {
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
  securityText: {
    flex: 1,
    fontSize: 13,
    color: '#2E7D32',
    lineHeight: 18,
  },
  buttonContainer: {
    paddingHorizontal: 20,
    paddingBottom: 30,
    paddingTop: 10,
  },
  dashboardButton: {
    backgroundColor: '#FF7F00',
    borderRadius: 12,
    paddingVertical: 16,
    alignItems: 'center',
  },
  dashboardButtonText: {
    fontSize: 16,
    fontWeight: '600',
    color: '#fff',
  },
});

