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
import { useLocalSearchParams, useRouter } from 'expo-router';
import { supabase } from '@/lib/supabase';

const CODE_LENGTH = 8;

export default function EmailVerificationScreen() {
  const router = useRouter();
  const params = useLocalSearchParams<{ email?: string }>();
  const [token, setToken] = useState(Array(CODE_LENGTH).fill(''));
  const [showSuccessModal, setShowSuccessModal] = useState(false);
  const [verifying, setVerifying] = useState(false);
  const [resending, setResending] = useState(false);
  const inputRefs = useRef<(TextInput | null)[]>([]);

  const email = typeof params.email === 'string' ? params.email : undefined;

  useEffect(() => {
    inputRefs.current[0]?.focus();
  }, []);

  const handleTokenChange = (value: string, index: number) => {
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
      const { data, error } = await supabase.auth.verifyOtp({
        email,
        token: otpToken,
        type: 'signup',
      });

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

  const handleResendCode = async () => {
    if (!email) {
      Alert.alert('Verification', 'Missing email context. Please return to the signup screen and try again.');
      return;
    }

    try {
      setResending(true);
      const { error } = await supabase.auth.resend({
        type: 'signup',
        email,
      });

      setResending(false);

      if (error) {
        Alert.alert('Resend Failed', error.message || 'Unable to resend the verification code.');
        return;
      }

      Alert.alert('Verification', `A new ${CODE_LENGTH}-digit verification code has been sent to your email.`);
      setToken(Array(CODE_LENGTH).fill(''));
      inputRefs.current[0]?.focus();
    } catch (err) {
      setResending(false);
      Alert.alert('Resend Error', err instanceof Error ? err.message : 'An unexpected error occurred.');
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
            <ThemedText style={styles.title}>
              Verify Your Email
            </ThemedText>
            <ThemedText style={styles.subtitle}>
              {email
                ? `Enter the ${CODE_LENGTH}-digit verification code we sent to ${email}.`
                : `Enter the ${CODE_LENGTH}-digit verification code we sent to your email address.`}
            </ThemedText>
          </View>

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
            style={[styles.verifyButton, verifying && { opacity: 0.7 }]}
            onPress={handleVerify}
            disabled={verifying}>
            {verifying ? (
              <NetpayLoadingAnimation size={40} variant="onBrand" strokeWidth={2.5} />
            ) : (
              <ThemedText style={styles.verifyButtonText}>Verify Email</ThemedText>
            )}
          </TouchableOpacity>

          <TouchableOpacity
            style={styles.resendButton}
            onPress={handleResendCode}
            disabled={resending}>
            {resending ? (
              <NetpayLoadingAnimation size={28} strokeWidth={2.5} />
            ) : (
              <ThemedText style={styles.resendButtonText}>Resend Code</ThemedText>
            )}
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
            <TouchableOpacity style={styles.modalButton} onPress={handleCloseModal}>
              <ThemedText style={styles.modalButtonText}>Continue</ThemedText>
            </TouchableOpacity>
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
    backgroundColor: '#FF7F00',
    borderRadius: 12,
    paddingVertical: 14,
    paddingHorizontal: 48,
    alignItems: 'center',
  },
  modalButtonText: {
    fontSize: 16,
    fontWeight: '600',
    color: '#fff',
  },
});
