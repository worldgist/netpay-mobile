import { useState, useRef, useEffect } from 'react';
import {
  StyleSheet,
  View,
  TextInput,
  TouchableOpacity,
  KeyboardAvoidingView,
  Platform,
  ScrollView,
  Modal,
  Alert,
} from 'react-native';
import { NetpayLoadingAnimation } from '@/components/netpay-loading-animation';
import { ThemedView } from '@/components/themed-view';
import { ThemedText } from '@/components/themed-text';
import { Image } from 'expo-image';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { supabase } from '@/lib/supabase';

import {
  EMAIL_VERIFICATION_CODE_LENGTH,
  completeEmailVerificationFromLink,
  sendVerificationCode,
  verifyEmailCode,
} from '@/utils/email-verification';

const CODE_LENGTH = EMAIL_VERIFICATION_CODE_LENGTH;

type ResendModalState = 'confirm' | 'loading' | 'success' | 'error';

export default function EmailVerificationScreen() {
  const router = useRouter();
  const params = useLocalSearchParams<{
    email?: string;
    sent?: string;
    access_token?: string;
    refresh_token?: string;
    token_hash?: string;
    type?: string;
    code?: string;
  }>();
  const [token, setToken] = useState(Array(CODE_LENGTH).fill(''));
  const [showSuccessModal, setShowSuccessModal] = useState(false);
  const [showResendModal, setShowResendModal] = useState(false);
  const [resendModalState, setResendModalState] = useState<ResendModalState>('confirm');
  const [resendModalMessage, setResendModalMessage] = useState('');
  const [verifying, setVerifying] = useState(false);
  const [resending, setResending] = useState(false);
  const [linkVerifying, setLinkVerifying] = useState(false);
  const [deliveryMessage, setDeliveryMessage] = useState<string | null>(null);
  const inputRefs = useRef<(TextInput | null)[]>([]);

  const email = typeof params.email === 'string' ? params.email : undefined;

  useEffect(() => {
    inputRefs.current[0]?.focus();
  }, []);

  useEffect(() => {
    const accessToken = typeof params.access_token === 'string' ? params.access_token : undefined;
    const refreshToken = typeof params.refresh_token === 'string' ? params.refresh_token : undefined;
    const tokenHash = typeof params.token_hash === 'string' ? params.token_hash : undefined;
    const linkType = typeof params.type === 'string' ? params.type : undefined;
    const authCode = typeof params.code === 'string' ? params.code : undefined;

    if (!accessToken && !refreshToken && !tokenHash && !authCode) {
      return;
    }

    void (async () => {
      setLinkVerifying(true);
      const { data, error } = await completeEmailVerificationFromLink({
        accessToken,
        refreshToken,
        tokenHash,
        type: linkType,
        code: authCode,
      });
      setLinkVerifying(false);

      if (!error && data.session) {
        setShowSuccessModal(true);
        return;
      }

      if (error) {
        setDeliveryMessage(error.message || 'Could not complete verification from the email link.');
      }
    })();
  }, [params.access_token, params.refresh_token, params.token_hash, params.type, params.code]);

  useEffect(() => {
    if (!email) {
      return;
    }

    if (params.sent === '1') {
      setDeliveryMessage(
        `A ${CODE_LENGTH}-digit code and verify link were sent to your email during signup. Enter the code below or tap the link in the same email.`,
      );
      return;
    }

    if (params.sent === '0') {
      setDeliveryMessage('We could not deliver the verification email during signup. Tap Resend Code to try again.');
      return;
    }

    void (async () => {
      const result = await sendVerificationCode(email);
      if (result.sent) {
        setDeliveryMessage(`A ${CODE_LENGTH}-digit verification code was sent. Check your inbox and spam folder.`);
      } else if (result.error) {
        setDeliveryMessage(result.error);
      }
    })();
  }, [email, params.sent]);

  useEffect(() => {
    const { data: { subscription } } = supabase.auth.onAuthStateChange((event, session) => {
      if (event === 'SIGNED_IN' && session?.user?.email_confirmed_at) {
        setShowSuccessModal(true);
      }
    });

    void supabase.auth.getSession().then(({ data: { session } }) => {
      if (session?.user?.email_confirmed_at) {
        setShowSuccessModal(true);
      }
    });

    return () => subscription.unsubscribe();
  }, []);

  const handleTokenChange = (value: string, index: number) => {
    const digits = value.replace(/\D/g, '');

    if (digits.length > 1) {
      const pasted = digits.slice(0, CODE_LENGTH).split('');
      const updatedToken = Array(CODE_LENGTH).fill('');
      pasted.forEach((digit, pastedIndex) => {
        updatedToken[pastedIndex] = digit;
      });
      setToken(updatedToken);
      const focusIndex = Math.min(pasted.length, CODE_LENGTH - 1);
      inputRefs.current[focusIndex]?.focus();
      return;
    }

    if (value && !/^\d$/.test(value)) return;

    const updatedToken = [...token];
    updatedToken[index] = value;
    setToken(updatedToken);

    if (value && index < CODE_LENGTH - 1) {
      inputRefs.current[index + 1]?.focus();
    }
  };

  const handleBackspace = (index: number) => {
    const updatedToken = [...token];

    if (updatedToken[index]) {
      updatedToken[index] = '';
      setToken(updatedToken);
      return;
    }

    if (index > 0) {
      updatedToken[index - 1] = '';
      setToken(updatedToken);
      inputRefs.current[index - 1]?.focus();
    }
  };

  const handleVerify = async () => {
    if (!email) {
      Alert.alert('Verification', 'Missing email context. Please return to the signup screen and try again.');
      return;
    }

    if (!token.every((digit) => digit)) {
      Alert.alert('Verification', `Enter the ${CODE_LENGTH}-digit code sent to your email.`);
      return;
    }

    try {
      setVerifying(true);
      const otpToken = token.join('');
      const { data, error } = await verifyEmailCode(email, otpToken);

      setVerifying(false);

      if (error) {
        Alert.alert('Verification Failed', error.message || 'Invalid verification code. Please try again.');
        return;
      }

      if (!data.session) {
        Alert.alert('Verification', 'Your email was verified. Please sign in to continue.');
        router.replace('/auth/login');
        return;
      }

      setShowSuccessModal(true);
    } catch (err) {
      setVerifying(false);
      Alert.alert('Verification Error', err instanceof Error ? err.message : 'An unexpected error occurred.');
    }
  };

  const handleOpenResendModal = () => {
    if (!email) {
      Alert.alert('Verification', 'Missing email context. Please return to the signup screen and try again.');
      return;
    }

    setResendModalState('confirm');
    setResendModalMessage('');
    setShowResendModal(true);
  };

  const handleCloseResendModal = () => {
    if (resending) return;
    setShowResendModal(false);
    setResendModalState('confirm');
    setResendModalMessage('');
  };

  const handleConfirmResendCode = async () => {
    if (!email) {
      Alert.alert('Verification', 'Missing email context. Please return to the signup screen and try again.');
      handleCloseResendModal();
      return;
    }

    try {
      setResending(true);
      setResendModalState('loading');
      const result = await sendVerificationCode(email);
      setResending(false);

      if (!result.sent) {
        setResendModalState('error');
        setResendModalMessage(result.error || 'Unable to resend the verification email.');
        setDeliveryMessage(result.error || 'Unable to resend the verification email.');
        return;
      }

      setResendModalState('success');
      setResendModalMessage(`A new ${CODE_LENGTH}-digit verification code was sent to ${email}. Check your inbox and spam folder.`);
      setDeliveryMessage(`A new ${CODE_LENGTH}-digit code was sent. Check your inbox and spam folder.`);
      setToken(Array(CODE_LENGTH).fill(''));
      inputRefs.current[0]?.focus();
    } catch (err) {
      setResending(false);
      setResendModalState('error');
      const message = err instanceof Error ? err.message : 'An unexpected error occurred.';
      setResendModalMessage(message);
      setDeliveryMessage(message);
    }
  };

  const handleCloseModal = () => {
    setShowSuccessModal(false);
    router.replace('/setup-pin');
  };

  return (
    <KeyboardAvoidingView
      style={styles.container}
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
      <ScrollView contentContainerStyle={styles.scrollContent} showsVerticalScrollIndicator={false}>
        <ThemedView style={styles.card}>
          <View style={styles.header}>
            <Image
              source={require('@/assets/images/logo.png')}
              style={styles.logo}
              contentFit="contain"
            />
            <ThemedText style={styles.title}>
              Verify Your Email
            </ThemedText>
            <ThemedText style={styles.subtitle}>
              {email
                ? `Enter the ${CODE_LENGTH}-digit code we sent to ${email}, or tap the verify link in the same email.`
                : `Enter the ${CODE_LENGTH}-digit code we sent to your email, or tap the verify link in the same email.`}
            </ThemedText>
          </View>

          {linkVerifying ? (
            <ThemedText style={styles.deliveryMessage}>
              Verifying from your email link...
            </ThemedText>
          ) : null}

          {deliveryMessage ? (
            <ThemedText style={styles.deliveryMessage}>{deliveryMessage}</ThemedText>
          ) : null}

          <View style={styles.codeContainer}>
            {token.map((digit, index) => (
              <View key={index} style={[styles.codeInputWrapper, index === token.length - 1 && styles.lastInputWrapper]}>
                <TextInput
                  ref={(ref) => {
                    inputRefs.current[index] = ref;
                  }}
                  style={styles.codeInput}
                  value={digit}
                  onChangeText={(value) => handleTokenChange(value, index)}
                  onKeyPress={({ nativeEvent }) => {
                    if (nativeEvent.key === 'Backspace') {
                      handleBackspace(index);
                    }
                  }}
                  keyboardType="number-pad"
                  maxLength={1}
                  returnKeyType="next"
                  textContentType="oneTimeCode"
                  selectTextOnFocus
                />
              </View>
            ))}
          </View>

          <TouchableOpacity
            style={[styles.verifyButton, (verifying || linkVerifying) && { opacity: 0.7 }]}
            onPress={handleVerify}
            disabled={verifying || linkVerifying}>
            {verifying || linkVerifying ? (
              <NetpayLoadingAnimation size={40} variant="onBrand" strokeWidth={2.5} />
            ) : (
              <ThemedText style={styles.verifyButtonText}>Verify Email</ThemedText>
            )}
          </TouchableOpacity>

          <TouchableOpacity
            style={styles.resendButton}
            onPress={handleOpenResendModal}
            disabled={resending}>
            <ThemedText style={styles.resendButtonText}>Resend Code</ThemedText>
          </TouchableOpacity>
        </ThemedView>
      </ScrollView>

      <Modal visible={showSuccessModal} transparent animationType="fade" onRequestClose={handleCloseModal}>
        <View style={styles.modalOverlay}>
          <View style={styles.modalContent}>
            <View style={styles.iconCircleSuccess}>
              <ThemedText style={styles.iconTick}>✓</ThemedText>
            </View>
            <ThemedText style={styles.modalTitle}>Email Verified</ThemedText>
            <ThemedText style={styles.modalMessage}>
              Great! Your email address has been verified successfully.
            </ThemedText>
            <TouchableOpacity style={[styles.modalButton, styles.modalButtonFull]} onPress={handleCloseModal}>
              <ThemedText style={styles.modalButtonText}>Continue</ThemedText>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>

      <Modal
        visible={showResendModal}
        transparent
        animationType="fade"
        onRequestClose={handleCloseResendModal}>
        <View style={styles.modalOverlay}>
          <View style={styles.modalContent}>
            {resendModalState === 'loading' ? (
              <>
                <NetpayLoadingAnimation size={56} strokeWidth={3} />
                <ThemedText style={styles.modalTitle}>Sending Code</ThemedText>
                <ThemedText style={styles.modalMessage}>
                  Please wait while we send a new verification code{email ? ` to ${email}` : ''}.
                </ThemedText>
              </>
            ) : resendModalState === 'success' ? (
              <>
                <View style={styles.iconCircleSuccess}>
                  <ThemedText style={styles.iconTick}>✓</ThemedText>
                </View>
                <ThemedText style={styles.modalTitle}>Code Sent</ThemedText>
                <ThemedText style={styles.modalMessage}>{resendModalMessage}</ThemedText>
                <TouchableOpacity style={[styles.modalButton, styles.modalButtonFull]} onPress={handleCloseResendModal}>
                  <ThemedText style={styles.modalButtonText}>OK</ThemedText>
                </TouchableOpacity>
              </>
            ) : resendModalState === 'error' ? (
              <>
                <View style={styles.iconCircleError}>
                  <ThemedText style={styles.iconError}>!</ThemedText>
                </View>
                <ThemedText style={styles.modalTitle}>Resend Failed</ThemedText>
                <ThemedText style={styles.modalMessage}>{resendModalMessage}</ThemedText>
                <TouchableOpacity style={[styles.modalButton, styles.modalButtonFull]} onPress={handleCloseResendModal}>
                  <ThemedText style={styles.modalButtonText}>Close</ThemedText>
                </TouchableOpacity>
              </>
            ) : (
              <>
                <Image
                  source={require('@/assets/images/logo.png')}
                  style={styles.modalLogo}
                  contentFit="contain"
                />
                <ThemedText style={styles.modalTitle}>Resend Verification Code</ThemedText>
                <ThemedText style={styles.modalMessage}>
                  {email
                    ? `Send a new ${CODE_LENGTH}-digit code to ${email}?`
                    : `Send a new ${CODE_LENGTH}-digit verification code to your email?`}
                </ThemedText>
                <View style={styles.modalActions}>
                  <TouchableOpacity style={styles.modalSecondaryButton} onPress={handleCloseResendModal}>
                    <ThemedText style={styles.modalSecondaryButtonText}>Cancel</ThemedText>
                  </TouchableOpacity>
                  <TouchableOpacity style={styles.modalButton} onPress={handleConfirmResendCode}>
                    <ThemedText style={styles.modalButtonText}>Send Code</ThemedText>
                  </TouchableOpacity>
                </View>
              </>
            )}
          </View>
        </View>
      </Modal>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#F8F9FC',
  },
  scrollContent: {
    flexGrow: 1,
    paddingHorizontal: 20,
    paddingVertical: 32,
    justifyContent: 'center',
  },
  card: {
    width: '100%',
    maxWidth: 420,
    alignSelf: 'center',
    paddingHorizontal: Platform.OS === 'ios' ? 20 : 32,
    paddingTop: Platform.OS === 'ios' ? 56 : 48,
    paddingBottom: 48,
    backgroundColor: '#fff',
    borderRadius: 20,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 0.08,
    shadowRadius: 12,
    elevation: 6,
  },
  header: {
    alignItems: 'center',
    marginBottom: 28,
    paddingHorizontal: 4,
    width: '100%',
  },
  logo: {
    width: 120,
    height: 48,
    marginBottom: 20,
  },
  title: {
    fontSize: Platform.OS === 'ios' ? 27 : 28,
    fontWeight: 'bold',
    color: '#333',
    marginBottom: 12,
    textAlign: 'center',
    includeFontPadding: true,
    width: '100%',
    flexShrink: 1,
    paddingHorizontal: 4,
    lineHeight: Platform.OS === 'ios' ? 34 : 36,
  },
  subtitle: {
    fontSize: 15,
    color: '#666',
    textAlign: 'center',
    lineHeight: 21,
    width: '100%',
    flexShrink: 1,
    alignSelf: 'stretch',
    paddingHorizontal: 4,
  },
  deliveryMessage: {
    fontSize: 13,
    color: '#555',
    textAlign: 'center',
    lineHeight: 19,
    marginBottom: 16,
    paddingHorizontal: 8,
  },
  codeContainer: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginBottom: 32,
    paddingHorizontal: 0,
    width: '100%',
    flexWrap: 'nowrap',
    alignItems: 'center',
  },
  codeInputWrapper: {
    flex: 1,
    minWidth: 0,
    marginRight: Platform.OS === 'ios' ? 3 : 6,
  },
  lastInputWrapper: {
    marginRight: 0,
  },
  codeInput: {
    width: '100%',
    height: 56,
    borderRadius: 12,
    backgroundColor: '#F5F5F5',
    borderWidth: 1,
    borderColor: '#E0E0E0',
    textAlign: 'center',
    fontSize: Platform.OS === 'ios' ? 18 : 20,
    fontWeight: '600',
    color: '#333',
    includeFontPadding: false,
    textAlignVertical: 'center',
    paddingVertical: 0,
    paddingHorizontal: 0,
  },
  verifyButton: {
    backgroundColor: '#FF7F00',
    borderRadius: 12,
    height: 54,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 16,
  },
  verifyButtonText: {
    fontSize: 16,
    color: '#fff',
    fontWeight: '600',
  },
  resendButton: {
    alignItems: 'center',
  },
  resendButtonText: {
    fontSize: 16,
    color: '#FF7F00',
    fontWeight: '600',
  },
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.5)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  modalContent: {
    backgroundColor: '#fff',
    borderRadius: 20,
    paddingHorizontal: 32,
    paddingVertical: 40,
    width: '80%',
    maxWidth: 360,
    alignItems: 'center',
  },
  modalLogo: {
    width: 110,
    height: 44,
    marginBottom: 20,
  },
  modalActions: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    width: '100%',
  },
  modalSecondaryButton: {
    flex: 1,
    borderRadius: 12,
    paddingVertical: 14,
    paddingHorizontal: 16,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: '#E0E0E0',
    backgroundColor: '#fff',
  },
  modalSecondaryButtonText: {
    fontSize: 16,
    fontWeight: '600',
    color: '#666',
  },
  iconCircleError: {
    width: 80,
    height: 80,
    borderRadius: 40,
    backgroundColor: '#F44336',
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 24,
  },
  iconError: {
    fontSize: 42,
    color: '#fff',
    fontWeight: 'bold',
  },
  iconCircleSuccess: {
    width: 80,
    height: 80,
    borderRadius: 40,
    backgroundColor: '#4CAF50',
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 24,
    paddingTop: Platform.OS === 'ios' ? 4 : 0,
    paddingBottom: Platform.OS === 'ios' ? 4 : 0,
  },
  iconTick: {
    fontSize: 42,
    color: '#fff',
    fontWeight: 'bold',
    includeFontPadding: false,
    textAlignVertical: 'center',
    lineHeight: Platform.OS === 'ios' ? 50 : 42,
  },
  modalTitle: {
    fontSize: 22,
    fontWeight: 'bold',
    color: '#333',
    marginBottom: 12,
    textAlign: 'center',
  },
  modalMessage: {
    fontSize: 16,
    color: '#666',
    textAlign: 'center',
    marginBottom: 28,
    lineHeight: 22,
  },
  modalButton: {
    flex: 1,
    backgroundColor: '#FF7F00',
    borderRadius: 12,
    paddingVertical: 14,
    paddingHorizontal: 24,
    alignItems: 'center',
  },
  modalButtonFull: {
    alignSelf: 'stretch',
    flex: 0,
  },
  modalButtonText: {
    fontSize: 16,
    fontWeight: '600',
    color: '#fff',
  },
});
