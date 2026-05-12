import { useState, useCallback, useMemo } from 'react';
import { StyleSheet, View, TextInput, TouchableOpacity, ScrollView, KeyboardAvoidingView, Platform, Alert, RefreshControl, Modal } from 'react-native';
import { ThemedView } from '@/components/themed-view';
import { ThemedText } from '@/components/themed-text';
import { MaterialIcons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import { useFocusEffect } from '@react-navigation/native';
import { ConfirmTransferModal } from '@/components/confirm-transfer-modal';
import { NetpayLoadingAnimation } from '@/components/netpay-loading-animation';
import { InsufficientBalanceModal } from '@/components/insufficient-balance-modal';
import { DemoNumbersBanner } from '@/components/demo-numbers-banner';
import { supabase } from '@/lib/supabase';
import * as Clipboard from 'expo-clipboard';

// Transfer fee configuration (must match backend)
const TRANSFER_FEE_PERCENTAGE = 0.05; // 5% fee (e.g., ₦50 for ₦1000 transfer)
const MIN_TRANSFER_FEE = 10; // Minimum fee of ₦10

// Calculate transfer fee based on amount
const calculateTransferFee = (amount: number): number => {
  const percentageFee = amount * TRANSFER_FEE_PERCENTAGE;
  return Math.max(MIN_TRANSFER_FEE, Math.round(percentageFee * 100) / 100);
};

export default function TransferScreen() {
  const router = useRouter();
  const [recipientEmail, setRecipientEmail] = useState('');
  const [amount, setAmount] = useState('');
  const [description, setDescription] = useState('');
  const [showConfirmModal, setShowConfirmModal] = useState(false);
  const [recipientDetails, setRecipientDetails] = useState<{ id?: string; full_name?: string | null; email: string } | null>(null);
  const [balance, setBalance] = useState(0);
  const [loadingBalance, setLoadingBalance] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [verifying, setVerifying] = useState(false);
  const [transferLoading, setTransferLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [currentUserEmail, setCurrentUserEmail] = useState('');
  const [verificationSuccess, setVerificationSuccess] = useState(false);
  const [showInsufficientBalance, setShowInsufficientBalance] = useState(false);
  const [isDemoUser, setIsDemoUser] = useState(false);

  const amountValue = useMemo(() => parseFloat(amount) || 0, [amount]);
  const transferFee = useMemo(() => calculateTransferFee(amountValue), [amountValue]);
  const totalAmount = useMemo(() => amountValue + transferFee, [amountValue, transferFee]);
  // For demo users, allow transfer if using demo email even without verification
  const canTransfer = (isDemoUser && recipientEmail.trim().toLowerCase() === 'demo-recipient@netpayy.ng' && amountValue > 0 && totalAmount <= balance && !transferLoading) ||
                      (!!recipientDetails && amountValue > 0 && totalAmount <= balance && !transferLoading);

  const fetchBalance = useCallback(async (isRefresh = false) => {
    try {
      if (isRefresh) {
        setRefreshing(true);
      } else {
        setLoadingBalance(true);
      }
      setError(null);

      const { data: sessionData, error: sessionError } = await supabase.auth.getSession();
      if (sessionError) throw sessionError;

      const session = sessionData.session;
      if (!session) {
        router.replace('/auth/login');
        return;
      }

      const userEmail = session.user.email || '';
      setCurrentUserEmail(userEmail);
      
      // Check if user is demo user
      setIsDemoUser(userEmail === 'demo@netpayy.ng');

      const { data: profileData, error: profileError } = await supabase
        .from('profiles')
        .select('balance')
        .eq('id', session.user.id)
        .single();

      if (profileError) {
        throw profileError;
      }

      setBalance(Number(profileData?.balance) || 0);
    } catch (err) {
      console.error('Failed to load balance:', err);
      const message = err instanceof Error ? err.message : 'Unable to load balance. Please try again later.';
      setError(message);
    } finally {
      setLoadingBalance(false);
      setRefreshing(false);
    }
  }, [router]);

  useFocusEffect(
    useCallback(() => {
      fetchBalance();
    }, [fetchBalance])
  );

  const handleRefresh = useCallback(() => {
    fetchBalance(true);
  }, [fetchBalance]);

  const handleVerify = async () => {
    const trimmedEmail = recipientEmail.trim().toLowerCase();

    if (!trimmedEmail || !trimmedEmail.includes('@')) {
      Alert.alert('Invalid Email', 'Please enter a valid recipient email address.');
      return;
    }

    if (trimmedEmail === currentUserEmail.toLowerCase()) {
      Alert.alert('Not Allowed', 'You cannot transfer to your own account.');
      return;
    }

    try {
      setVerifying(true);
      setError(null);

      const { data: sessionData, error: sessionError } = await supabase.auth.getSession();
      if (sessionError) throw sessionError;

      const session = sessionData.session;
      if (!session) {
        router.replace('/auth/login');
        return;
      }

      const accessToken = session.access_token;

      const { data: verifyResponse, error: verifyError } = await supabase.functions.invoke('verify-transfer-recipient', {
        body: {
          email: trimmedEmail,
        },
        headers: accessToken
          ? {
              Authorization: `Bearer ${accessToken}`,
            }
          : undefined,
      });

      if (verifyError) {
        throw verifyError;
      }

      if (!verifyResponse?.success) {
        Alert.alert('Verification Failed', verifyResponse?.error || 'No user found with the provided email address.');
        setRecipientDetails(null);
        return;
      }

      const recipientData = verifyResponse.data;

      setRecipientDetails({
        id: recipientData.id,
        full_name: recipientData.full_name,
        email: recipientData.email,
      });
      setVerificationSuccess(true);
    } catch (err) {
      console.error('Verify recipient error:', err);
      Alert.alert('Verification Failed', 'Unable to verify recipient. Please try again later.');
      setRecipientDetails(null);
      setVerificationSuccess(false);
    } finally {
      setVerifying(false);
    }
  };

  const handleTransfer = () => {
    // For demo users, allow transfer without verification if using demo recipient email
    if (!isDemoUser && !recipientDetails) {
      Alert.alert('Verification Required', 'Please verify the recipient before transferring.');
      return;
    }
    
    // Auto-set recipient details for demo users using demo email
    if (isDemoUser && !recipientDetails && recipientEmail.trim().toLowerCase() === 'demo-recipient@netpayy.ng') {
      setRecipientDetails({
        email: 'demo-recipient@netpayy.ng',
        full_name: 'Demo Recipient',
      });
    }

    if (amountValue <= 0) {
      Alert.alert('Invalid Amount', 'Please enter a valid transfer amount.');
      return;
    }

    if (totalAmount > balance) {
      setShowInsufficientBalance(true);
      return;
    }

    setShowConfirmModal(true);
  };

  const handleConfirmTransfer = async () => {
    // For demo users, use recipient email directly if not verified
    const finalRecipientEmail = isDemoUser && !recipientDetails && recipientEmail.trim().toLowerCase() === 'demo-recipient@netpayy.ng'
      ? recipientEmail.trim().toLowerCase()
      : recipientDetails?.email.toLowerCase();
    
    if (!finalRecipientEmail || transferLoading) return;

    try {
      setTransferLoading(true);

      const { data: sessionData, error: sessionError } = await supabase.auth.getSession();
      if (sessionError) throw sessionError;

      const session = sessionData.session;
      if (!session) {
        router.replace('/auth/login');
        return;
      }

      const accessToken = session.access_token;

      const { data, error: transferError } = await supabase.functions.invoke('transfer-funds', {
        body: {
          recipientEmail: finalRecipientEmail,
          amount: amountValue,
          description: description.trim() || undefined,
        },
        headers: accessToken
          ? {
              Authorization: `Bearer ${accessToken}`,
            }
          : undefined,
      });

      if (transferError) throw transferError;

      if (!data?.success) {
        const message = data?.error || 'Transfer failed. Please try again later.';
        Alert.alert('Transfer Failed', message);
        return;
      }

      const newBalance = data.data?.senderBalanceAfter ?? balance - amountValue;
      setBalance(Number(newBalance));

      setShowConfirmModal(false);
      const transferDescription = description.trim();

      setRecipientEmail('');
      setAmount('');
      setDescription('');
      setRecipientDetails(null);

      router.push({
        pathname: '/transfer-success',
        params: {
          amount: amountValue.toString(),
          recipientEmail: data.data?.recipientEmail || '',
          recipientName: data.data?.recipientName || '',
          reference: data.data?.reference || '',
          description: transferDescription,
          transferFee: data.data?.transferFee?.toString() || transferFee.toString(),
          totalAmount: data.data?.totalAmount?.toString() || totalAmount.toString(),
        },
      });
    } catch (err: any) {
      console.error('Transfer error:', err);
      const errorMessage = err instanceof Error ? err.message : String(err);
      
      // Check for network errors
      const errorName = err?.name || err?.constructor?.name || '';
      const isNetworkError = errorMessage.includes('Network request failed') ||
                            errorMessage.includes('Failed to send a request to the Edge Function') ||
                            errorMessage.includes('Failed to fetch') ||
                            errorMessage.includes('ERR_INTERNET_DISCONNECTED') ||
                            errorMessage.includes('ERR_NETWORK_CHANGED') ||
                            errorMessage.includes('TypeError') ||
                            errorName === 'FunctionsFetchError' ||
                            errorName === 'TypeError' ||
                            err?.code === 'NETWORK_ERROR';
      
      const message = isNetworkError
        ? 'Network connection failed. Please check your internet connection and try again.'
        : errorMessage || 'Transfer failed. Please try again later.';
      
      Alert.alert(isNetworkError ? 'Connection Error' : 'Transfer Failed', message);
    } finally {
      setTransferLoading(false);
    }
  };

  return (
    <ThemedView style={styles.container}>
      <KeyboardAvoidingView
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
        style={styles.keyboardView}
        keyboardVerticalOffset={Platform.OS === 'ios' ? 0 : 20}>
        <View style={styles.header}>
          <TouchableOpacity onPress={() => router.back()} style={styles.backButton}>
            <MaterialIcons name="arrow-back" size={24} color="#000" />
          </TouchableOpacity>
          <ThemedText style={styles.headerTitle}>Transfer Money</ThemedText>
          <View style={styles.placeholder} />
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
          {error && (
            <View style={styles.errorBanner}>
              <MaterialIcons name="error-outline" size={20} color="#d32f2f" style={styles.errorIcon} />
              <ThemedText style={styles.errorText}>{error}</ThemedText>
            </View>
          )}

          {/* Demo Numbers Banner */}
          {isDemoUser && <DemoNumbersBanner type="transfer" />}

          <View style={styles.balanceCard}>
            <ThemedText style={styles.balanceLabel}>Available Balance</ThemedText>
            <View style={styles.balanceAmountContainer}>
              {loadingBalance ? (
                <NetpayLoadingAnimation size={32} variant="onBrand" strokeWidth={2.5} />
              ) : (
                <ThemedText style={styles.balanceAmount}>
                  ₦{Number(balance).toLocaleString('en-NG', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                </ThemedText>
              )}
            </View>
          </View>

          {/* Demo Email Display - Prominent for Apple Reviewers */}
          {isDemoUser && (
            <View style={styles.demoEmailCard}>
              <View style={styles.demoEmailHeader}>
                <MaterialIcons name="info" size={24} color="#FF7F00" />
                <ThemedText style={styles.demoEmailTitle}>Test Recipient Email for Apple Review</ThemedText>
              </View>
              <View style={styles.demoEmailBox}>
                <ThemedText style={styles.demoEmailLabel}>Use this recipient email:</ThemedText>
                <View style={styles.demoEmailValueContainer}>
                  <ThemedText style={styles.demoEmailValue}>demo-recipient@netpayy.ng</ThemedText>
                  <TouchableOpacity
                    style={styles.demoEmailCopyButton}
                    onPress={async () => {
                      await Clipboard.setStringAsync('demo-recipient@netpayy.ng');
                      Alert.alert('Copied!', 'Recipient email copied to clipboard');
                      setRecipientEmail('demo-recipient@netpayy.ng');
                    }}
                    activeOpacity={0.7}>
                    <MaterialIcons name="content-copy" size={20} color="#FF7F00" />
                  </TouchableOpacity>
                </View>
                <ThemedText style={styles.demoEmailNote}>
                  This test email works for all money transfers. Click copy to auto-fill the email field.
                </ThemedText>
              </View>
            </View>
          )}

          <View style={styles.inputSection}>
            <View style={styles.inputGroup}>
              <ThemedText style={styles.inputLabel}>Recipient Email Address</ThemedText>
              <View style={styles.inputRow}>
                <MaterialIcons name="email" size={20} color="#666" style={styles.inputIcon} />
                <TextInput
                  style={styles.input}
                  placeholder="Enter recipient's email"
                  placeholderTextColor="#999"
                  value={recipientEmail}
                  onChangeText={(value) => {
                    setRecipientEmail(value);
                    setRecipientDetails(null);
                  }}
                  keyboardType="email-address"
                  autoCapitalize="none"
                  autoCorrect={false}
                />
                {!isDemoUser && (
                  <TouchableOpacity
                    style={[styles.verifyButton, verifying && styles.verifyButtonDisabled]}
                    onPress={handleVerify}
                    disabled={verifying || !recipientEmail.trim()}
                  >
                    {verifying ? (
                      <NetpayLoadingAnimation size={24} strokeWidth={2} />
                    ) : (
                      <ThemedText style={styles.verifyButtonText}>Verify</ThemedText>
                    )}
                  </TouchableOpacity>
                )}
              </View>
            </View>

            {recipientDetails && (
              <View style={styles.recipientCard}>
                <MaterialIcons name="verified" size={20} color="#4CAF50" style={styles.recipientIcon} />
                <View style={styles.recipientInfo}>
                  <ThemedText style={styles.recipientTitle}>Recipient Verified</ThemedText>
                  <ThemedText style={styles.recipientName} numberOfLines={1}>
                    {recipientDetails.full_name || 'NetPay User'}
                  </ThemedText>
                  <ThemedText style={styles.recipientEmail} numberOfLines={1}>
                    {recipientDetails.email}
                  </ThemedText>
                </View>
              </View>
            )}

            <View style={styles.inputGroup}>
              <ThemedText style={styles.inputLabel}>Amount</ThemedText>
              <View style={styles.inputRow}>
                <MaterialIcons name="payments" size={20} color="#666" style={styles.inputIcon} />
                <TextInput
                  style={styles.input}
                  placeholder="Enter amount"
                  placeholderTextColor="#999"
                  value={amount}
                  onChangeText={setAmount}
                  keyboardType="numeric"
                />
              </View>
              {amountValue > 0 && (
                <View style={styles.feeInfo}>
                  <ThemedText style={styles.feeInfoText}>
                    Transfer fee (5%): ₦{transferFee.toLocaleString('en-NG', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                  </ThemedText>
                  <ThemedText style={styles.feeInfoText}>
                    Total: ₦{totalAmount.toLocaleString('en-NG', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                  </ThemedText>
                </View>
              )}
              {totalAmount > balance && (
                <View style={styles.inlineError}>
                  <MaterialIcons name="error" size={16} color="#d32f2f" style={styles.inlineErrorIcon} />
                  <ThemedText style={styles.inlineErrorText}>
                    Insufficient balance (including ₦{transferFee.toLocaleString('en-NG', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} fee)
                  </ThemedText>
                </View>
              )}
            </View>

            <View style={styles.inputGroup}>
              <ThemedText style={styles.inputLabel}>Description (Optional)</ThemedText>
              <View style={styles.inputRow}>
                <TextInput
                  style={styles.input}
                  placeholder="What's this for?"
                  placeholderTextColor="#999"
                  value={description}
                  onChangeText={setDescription}
                  multiline
                />
              </View>
            </View>
          </View>

          <TouchableOpacity
            style={[styles.transferButton, (!canTransfer) && styles.transferButtonDisabled]}
            onPress={handleTransfer}
            disabled={!canTransfer}
          >
            {transferLoading ? (
              <NetpayLoadingAnimation size={44} variant="onBrand" strokeWidth={2.5} />
            ) : (
              <>
                <MaterialIcons name="send" size={20} color="#fff" style={styles.transferIcon} />
                <ThemedText style={styles.transferButtonText}>
                  Transfer ₦{amountValue > 0 ? amountValue.toLocaleString('en-NG', { minimumFractionDigits: 2, maximumFractionDigits: 2 }) : '0.00'}
                </ThemedText>
              </>
            )}
          </TouchableOpacity>

          <View style={styles.noteContainer}>
            <ThemedText style={styles.noteText}>
              <ThemedText style={styles.noteBold}>Note:</ThemedText> Transfers are instant and cannot be reversed. Please verify recipient details before confirming.
            </ThemedText>
          </View>
        </ScrollView>
      </KeyboardAvoidingView>

      <ConfirmTransferModal
        visible={showConfirmModal}
        onClose={() => {
          if (!transferLoading) {
            setShowConfirmModal(false);
          }
        }}
        onConfirm={handleConfirmTransfer}
        amount={amountValue}
        recipientEmail={recipientDetails?.email || recipientEmail}
        description={description.trim() || undefined}
        transferFee={transferFee}
        loading={transferLoading}
      />

      {/* Insufficient Balance Modal */}
      <InsufficientBalanceModal
        visible={showInsufficientBalance}
        onClose={() => setShowInsufficientBalance(false)}
        currentBalance={balance}
        requiredAmount={totalAmount}
      />

      <Modal
        visible={verificationSuccess}
        animationType="fade"
        transparent
        onRequestClose={() => setVerificationSuccess(false)}
      >
        <View style={styles.successOverlay}>
          <View style={styles.successCard}>
            <View style={styles.successIconCircle}>
              <MaterialIcons name="check-circle" size={36} color="#4CAF50" />
            </View>
            <ThemedText style={styles.successTitle}>Recipient Verified</ThemedText>
            <ThemedText style={styles.successMessage}>
              You can now proceed with the transfer to this recipient.
            </ThemedText>
            <TouchableOpacity
              style={styles.successButton}
              onPress={() => setVerificationSuccess(false)}
            >
              <ThemedText style={styles.successButtonText}>Continue</ThemedText>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>
    </ThemedView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#fff',
  },
  keyboardView: {
    flex: 1,
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
  placeholder: {
    width: 40,
  },
  scrollView: {
    flex: 1,
  },
  errorBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#fdecea',
    borderRadius: 10,
    marginHorizontal: 20,
    marginBottom: 16,
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
  balanceCard: {
    backgroundColor: '#FF7F00',
    borderRadius: 12,
    padding: 24,
    marginHorizontal: 20,
    marginBottom: 24,
    alignItems: 'center',
    minHeight: 100,
    justifyContent: 'center',
  },
  balanceLabel: {
    fontSize: 14,
    color: '#fff',
    marginBottom: 12,
    opacity: 0.95,
    fontWeight: '500',
  },
  balanceAmountContainer: {
    minHeight: 50,
    justifyContent: 'center',
  },
  balanceAmount: {
    fontSize: 30,
    fontWeight: 'bold',
    color: '#fff',
    lineHeight: 44,
  },
  inputSection: {
    backgroundColor: '#fff',
    borderRadius: 12,
    padding: 20,
    marginHorizontal: 20,
    marginBottom: 24,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.08,
    shadowRadius: 4,
    elevation: 3,
  },
  inputGroup: {
    marginBottom: 20,
  },
  inputLabel: {
    fontSize: 13,
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
    fontSize: 14,
    color: '#333',
    paddingVertical: 12,
  },
  verifyButton: {
    backgroundColor: '#E0E0E0',
    paddingHorizontal: 16,
    paddingVertical: 8,
    borderRadius: 8,
    marginLeft: 8,
    justifyContent: 'center',
    alignItems: 'center',
  },
  verifyButtonDisabled: {
    opacity: 0.6,
  },
  verifyButtonText: {
    fontSize: 12,
    fontWeight: '600',
    color: '#333',
  },
  recipientCard: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#E8F5E9',
    borderRadius: 10,
    padding: 12,
    marginBottom: 20,
  },
  recipientIcon: {
    marginRight: 12,
  },
  recipientInfo: {
    flex: 1,
  },
  recipientTitle: {
    fontSize: 12,
    fontWeight: '600',
    color: '#2E7D32',
    marginBottom: 4,
  },
  recipientName: {
    fontSize: 13,
    fontWeight: '600',
    color: '#1B5E20',
  },
  recipientEmail: {
    fontSize: 12,
    color: '#2E7D32',
  },
  feeInfo: {
    marginTop: 8,
    paddingVertical: 8,
    paddingHorizontal: 12,
    backgroundColor: '#F5F5F5',
    borderRadius: 8,
  },
  feeInfoText: {
    fontSize: 12,
    color: '#666',
    marginTop: 2,
  },
  inlineError: {
    flexDirection: 'row',
    alignItems: 'center',
    marginTop: 6,
  },
  inlineErrorIcon: {
    marginRight: 6,
  },
  inlineErrorText: {
    fontSize: 12,
    color: '#d32f2f',
  },
  transferButton: {
    backgroundColor: '#FF7F00',
    borderRadius: 12,
    paddingVertical: 16,
    flexDirection: 'row',
    justifyContent: 'center',
    alignItems: 'center',
    marginHorizontal: 20,
    marginBottom: 20,
  },
  transferButtonDisabled: {
    opacity: 0.6,
  },
  transferIcon: {
    marginRight: 8,
  },
  transferButtonText: {
    fontSize: 16,
    fontWeight: 'bold',
    color: '#fff',
  },
  noteContainer: {
    backgroundColor: '#E3F2FD',
    borderRadius: 8,
    padding: 16,
    marginHorizontal: 20,
    marginBottom: 20,
  },
  noteText: {
    fontSize: 12,
    color: '#555',
    lineHeight: 18,
  },
  noteBold: {
    fontWeight: 'bold',
  },
  successOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.45)',
    justifyContent: 'center',
    alignItems: 'center',
    padding: 24,
  },
  successCard: {
    backgroundColor: '#fff',
    borderRadius: 24,
    paddingVertical: 28,
    paddingHorizontal: 24,
    alignItems: 'center',
    width: '100%',
    maxWidth: 320,
    shadowColor: '#000',
    shadowOpacity: 0.2,
    shadowRadius: 18,
    shadowOffset: { width: 0, height: 12 },
    elevation: 12,
  },
  successIconCircle: {
    width: 72,
    height: 72,
    borderRadius: 36,
    backgroundColor: 'rgba(76, 175, 80, 0.15)',
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 18,
  },
  successTitle: {
    fontSize: 18,
    fontWeight: '700',
    color: '#1B5E20',
    marginBottom: 12,
    textAlign: 'center',
  },
  successMessage: {
    fontSize: 13,
    color: '#4A4A4A',
    textAlign: 'center',
    lineHeight: 22,
    marginBottom: 24,
  },
  successButton: {
    backgroundColor: '#FF7F00',
    borderRadius: 24,
    paddingVertical: 12,
    paddingHorizontal: 32,
  },
  successButtonText: {
    color: '#fff',
    fontSize: 14,
    fontWeight: '600',
  },
  demoEmailCard: {
    backgroundColor: '#FFF8E1',
    borderRadius: 16,
    marginHorizontal: 20,
    marginBottom: 16,
    padding: 16,
    borderWidth: 2,
    borderColor: '#FF7F00',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 4,
    elevation: 4,
  },
  demoEmailHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginBottom: 12,
  },
  demoEmailTitle: {
    fontSize: 14,
    fontWeight: '700',
    color: '#E65100',
    flex: 1,
  },
  demoEmailBox: {
    backgroundColor: '#FFFFFF',
    borderRadius: 12,
    padding: 16,
    borderWidth: 1,
    borderColor: '#FFE082',
  },
  demoEmailLabel: {
    fontSize: 12,
    fontWeight: '600',
    color: '#666',
    marginBottom: 8,
  },
  demoEmailValueContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#F5F5F5',
    borderRadius: 8,
    padding: 12,
    marginBottom: 8,
    gap: 12,
  },
  demoEmailValue: {
    fontSize: 15,
    fontWeight: '700',
    color: '#000',
    fontFamily: 'monospace',
    flex: 1,
  },
  demoEmailCopyButton: {
    padding: 8,
    borderRadius: 6,
    backgroundColor: '#FFF8E1',
  },
  demoEmailNote: {
    fontSize: 12,
    color: '#666',
    fontStyle: 'italic',
    lineHeight: 16,
  },
});

