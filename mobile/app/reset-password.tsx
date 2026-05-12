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
import { MaterialIcons } from '@expo/vector-icons';
import { supabase } from '@/lib/supabase';
import { disableBiometricLoginForCurrentUser } from '@/utils/disable-biometric-after-password-change';
import { markPendingBiometricReenrollment } from '@/utils/pending-biometric-reenrollment';
import {
  getPasswordResetEmailUserMessage,
  isPasswordResetNetworkError,
} from '@/utils/auth-password-reset-errors';

const sleep = (ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms));

const CODE_LENGTH = 8;

export default function ResetPasswordScreen() {
  const router = useRouter();
  const params = useLocalSearchParams<{ email?: string; mode?: string }>();
  const isAuthenticatedPasswordUpdate = params.mode === 'authenticated';
  const [email, setEmail] = useState(typeof params.email === 'string' ? params.email : '');
  const [token, setToken] = useState(Array(CODE_LENGTH).fill(''));
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [oldPassword, setOldPassword] = useState('');
  const [showOldPassword, setShowOldPassword] = useState(false);
  const [showPassword, setShowPassword] = useState(false);
  const [showConfirmPassword, setShowConfirmPassword] = useState(false);
  const [showSuccessModal, setShowSuccessModal] = useState(false);
  const [showWrongCodeModal, setShowWrongCodeModal] = useState(false);
  const [verifying, setVerifying] = useState(false);
  const [resending, setResending] = useState(false);
  const [resetting, setResetting] = useState(false);
  const [codeVerified, setCodeVerified] = useState(isAuthenticatedPasswordUpdate);
  const inputRefs = useRef<Array<TextInput | null>>([]);

  useEffect(() => {
    if (!codeVerified) {
      inputRefs.current[0]?.focus();
    }
  }, [codeVerified]);

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

  const handleVerifyCode = async () => {
    if (!email) {
      Alert.alert('Reset Password', 'Missing email. Please return to the forgot password screen.');
      return;
    }

    if (!token.every((digit) => digit)) {
      Alert.alert('Reset Password', `Enter the ${CODE_LENGTH}-digit code sent to your email.`);
      return;
    }

    try {
      setVerifying(true);
      const otpToken = token.join('');
      
      // Try recovery type first (for password reset)
      console.log('Verifying OTP with recovery type for email:', email);
      let { data, error } = await supabase.auth.verifyOtp({
        email,
        token: otpToken,
        type: 'recovery',
      });

      // If recovery fails, try email type (some Supabase configs use this)
      if (error) {
        console.log('Recovery type failed, trying email type. Error:', error.message);
        const emailResult = await supabase.auth.verifyOtp({
          email,
          token: otpToken,
          type: 'email',
        });
        
        if (!emailResult.error) {
          console.log('Email type verification succeeded');
          data = emailResult.data;
          error = null;
        } else {
          console.log('Email type also failed:', emailResult.error.message);
          error = emailResult.error;
        }
      } else {
        console.log('Recovery type verification succeeded');
      }

      setVerifying(false);

      if (error) {
        console.error('OTP verification error:', error);
        setShowWrongCodeModal(true);
        setToken(Array(CODE_LENGTH).fill(''));
        return;
      }

      if (!data?.session) {
        Alert.alert('Reset Password', 'Code verified but no session found. Please try again.');
        return;
      }

      setCodeVerified(true);
    } catch (err) {
      setVerifying(false);
      console.error('Verification error:', err);
      Alert.alert('Verification Error', err instanceof Error ? err.message : 'An unexpected error occurred.');
    }
  };

  const handleResendCode = async () => {
    if (!email) {
      Alert.alert('Reset Password', 'Missing email. Please return to the forgot password screen.');
      return;
    }

    try {
      setResending(true);
      const redirectTo = 'netpay://reset-password';
      let { error } = await supabase.auth.resetPasswordForEmail(email, { redirectTo });

      if (error && isPasswordResetNetworkError(error)) {
        await sleep(2000);
        const retry = await supabase.auth.resetPasswordForEmail(email, { redirectTo });
        error = retry.error;
      }

      setResending(false);

      if (error) {
        console.warn('Resend reset email failed:', error);
        const { title, message } = getPasswordResetEmailUserMessage(error);
        Alert.alert(title, message);
        return;
      }

      console.log('Password reset email sent successfully');
      Alert.alert('Reset Password', `A new ${CODE_LENGTH}-digit verification code has been sent to your email.`);
      setToken(Array(CODE_LENGTH).fill(''));
      inputRefs.current[0]?.focus();
    } catch (err) {
      setResending(false);
      Alert.alert('Resend Error', err instanceof Error ? err.message : 'An unexpected error occurred.');
    }
  };

  const handleResetPassword = async () => {
    if (isAuthenticatedPasswordUpdate && !oldPassword) {
      Alert.alert('Reset Password', 'Please enter your current password.');
      return;
    }

    if (!password || !confirmPassword) {
      Alert.alert('Reset Password', 'Please complete both password fields.');
      return;
    }

    if (password.length < 6) {
      Alert.alert('Reset Password', 'Password must be at least 6 characters long.');
      return;
    }

    if (password !== confirmPassword) {
      Alert.alert('Reset Password', 'Passwords do not match.');
      return;
    }

    // Verify we have a valid session
    const { data: { session } } = await supabase.auth.getSession();
    if (!session) {
      Alert.alert(
        'Reset Password',
        'Your reset session has expired. Please request a new password reset.',
        [
          {
            text: 'OK',
            onPress: () => router.replace('/forget-password'),
          },
        ]
      );
      return;
    }

    try {
      setResetting(true);

      if (isAuthenticatedPasswordUpdate) {
        const currentUserEmail = session.user.email?.trim().toLowerCase();
        if (!currentUserEmail) {
          setResetting(false);
          Alert.alert('Reset Password', 'Unable to verify current password. Please sign in again.');
          return;
        }

        const { error: verifyOldPasswordError } = await supabase.auth.signInWithPassword({
          email: currentUserEmail,
          password: oldPassword,
        });

        if (verifyOldPasswordError) {
          setResetting(false);
          Alert.alert('Reset Password', 'Current password is incorrect.');
          return;
        }
      }

      // Use Supabase's built-in updateUser to change password
      const { error } = await supabase.auth.updateUser({
        password: password.trim(),
      });

      setResetting(false);

      if (error) {
        console.error('Error resetting password:', error);
        Alert.alert('Reset Password', error.message || 'Failed to reset password. Please try again.');
        return;
      }

      const bio = await disableBiometricLoginForCurrentUser();
      if (!bio.ok) {
        console.warn('Could not disable biometric on profile after password reset:', bio.error);
        Alert.alert(
          'Biometric login',
          'Your password was reset, but biometric could not be turned off automatically. Please sign in with your new password, then open Profile and turn biometric login off and on again.',
        );
      } else {
        await markPendingBiometricReenrollment();
      }

      // Sign out after password reset for security
      await supabase.auth.signOut();
      setShowSuccessModal(true);
    } catch (err) {
      setResetting(false);
      console.error('Error in handleResetPassword:', err);
      Alert.alert('Reset Password', err instanceof Error ? err.message : 'An unexpected error occurred.');
    }
  };

  const handleCloseModal = () => {
    setShowSuccessModal(false);
    router.replace('/auth/login');
  };

  return (
    <KeyboardAvoidingView
      style={styles.container}
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
      <View style={styles.pageHeader}>
        <TouchableOpacity style={styles.pageHeaderBackButton} onPress={() => router.back()}>
          <MaterialIcons name="arrow-back" size={24} color="#000" />
        </TouchableOpacity>
        <ThemedText style={styles.pageHeaderTitle}>
          {codeVerified ? 'Create New Password' : 'Reset Password'}
        </ThemedText>
        <View style={styles.pageHeaderSpacer} />
      </View>

      <ScrollView contentContainerStyle={styles.scrollContent} showsVerticalScrollIndicator={false}>
        <ThemedView style={styles.card}>
          <View style={styles.header}>
            <ThemedText style={styles.subtitle}>
              {codeVerified
                ? 'Choose a new password that is different from the previous one.'
                : email
                ? `Enter the ${CODE_LENGTH}-digit code sent to ${email} to verify your identity.`
                : `Enter the ${CODE_LENGTH}-digit code sent to your email.`}
            </ThemedText>
          </View>

          {!codeVerified ? (
            <>
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
                      editable={!verifying}
                    />
                  </View>
                ))}
              </View>

              <TouchableOpacity
                style={[styles.verifyButton, verifying && { opacity: 0.7 }]}
                onPress={handleVerifyCode}
                disabled={verifying}>
                {verifying ? (
                  <NetpayLoadingAnimation size={40} variant="onBrand" strokeWidth={2.5} />
                ) : (
                  <ThemedText style={styles.verifyButtonText}>Verify Code</ThemedText>
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
            </>
          ) : (
            <>
              {isAuthenticatedPasswordUpdate ? (
                <View style={styles.inputContainer}>
                  <MaterialIcons name="lock" size={20} color="#666" style={styles.inputIcon} />
                  <TextInput
                    style={styles.input}
                    placeholder="Current password"
                    placeholderTextColor="#999"
                    value={oldPassword}
                    onChangeText={setOldPassword}
                    secureTextEntry={!showOldPassword}
                    autoCapitalize="none"
                    editable={!resetting}
                  />
                  <TouchableOpacity onPress={() => setShowOldPassword(!showOldPassword)} style={styles.eyeIcon}>
                    <MaterialIcons name={showOldPassword ? 'visibility' : 'visibility-off'} size={20} color="#666" />
                  </TouchableOpacity>
                </View>
              ) : null}

              <View style={styles.inputContainer}>
                <MaterialIcons name="lock" size={20} color="#666" style={styles.inputIcon} />
                <TextInput
                  style={styles.input}
                  placeholder="New password"
                  placeholderTextColor="#999"
                  value={password}
                  onChangeText={setPassword}
                  secureTextEntry={!showPassword}
                  autoCapitalize="none"
                  editable={!resetting}
                />
                <TouchableOpacity onPress={() => setShowPassword(!showPassword)} style={styles.eyeIcon}>
                  <MaterialIcons name={showPassword ? 'visibility' : 'visibility-off'} size={20} color="#666" />
                </TouchableOpacity>
              </View>

              <View style={styles.inputContainer}>
                <MaterialIcons name="lock" size={20} color="#666" style={styles.inputIcon} />
                <TextInput
                  style={styles.input}
                  placeholder="Confirm password"
                  placeholderTextColor="#999"
                  value={confirmPassword}
                  onChangeText={setConfirmPassword}
                  secureTextEntry={!showConfirmPassword}
                  autoCapitalize="none"
                  editable={!resetting}
                />
                <TouchableOpacity onPress={() => setShowConfirmPassword(!showConfirmPassword)} style={styles.eyeIcon}>
                  <MaterialIcons name={showConfirmPassword ? 'visibility' : 'visibility-off'} size={20} color="#666" />
                </TouchableOpacity>
              </View>

              <TouchableOpacity
                style={[styles.resetButton, resetting && { opacity: 0.7 }]}
                onPress={handleResetPassword}
                disabled={resetting}>
                {resetting ? (
                  <NetpayLoadingAnimation size={40} variant="onBrand" strokeWidth={2.5} />
                ) : (
                  <ThemedText style={styles.resetButtonText}>Reset Password</ThemedText>
                )}
              </TouchableOpacity>
            </>
          )}

          {!isAuthenticatedPasswordUpdate ? (
            <TouchableOpacity style={styles.backToLoginButton} onPress={() => router.replace('/auth/login')}>
              <ThemedText style={styles.backToLoginText}>Back to Login</ThemedText>
            </TouchableOpacity>
          ) : null}
        </ThemedView>
      </ScrollView>

      <Modal visible={showSuccessModal} transparent animationType="fade" onRequestClose={handleCloseModal}>
        <View style={styles.modalOverlay}>
          <View style={styles.modalContent}>
            <View style={styles.modalIconCircle}>
              <MaterialIcons name="check-circle" size={36} color="#fff" />
            </View>
            <ThemedText style={styles.modalTitle}>Password Reset</ThemedText>
            <ThemedText style={styles.modalMessage}>
              Your password has been updated successfully. You can now log in with your new password.
            </ThemedText>
            <TouchableOpacity style={styles.modalButton} onPress={handleCloseModal}>
              <ThemedText style={styles.modalButtonText}>Go to Login</ThemedText>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>

      <Modal visible={showWrongCodeModal} transparent animationType="fade" onRequestClose={() => setShowWrongCodeModal(false)}>
        <View style={styles.modalOverlay}>
          <View style={styles.modalContent}>
            <View style={styles.modalIconCircleError}>
              <MaterialIcons name="error-outline" size={36} color="#fff" />
            </View>
            <ThemedText style={styles.modalTitle}>Incorrect Code</ThemedText>
            <ThemedText style={styles.modalMessage}>
              The code you entered is incorrect or has expired. Please check your email and try again, or request a new code.
            </ThemedText>
            <TouchableOpacity 
              style={styles.modalButton} 
              onPress={() => {
                setShowWrongCodeModal(false);
                setToken(Array(CODE_LENGTH).fill(''));
                inputRefs.current[0]?.focus();
              }}>
              <ThemedText style={styles.modalButtonText}>Try Again</ThemedText>
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
    paddingTop: 20,
    paddingBottom: 32,
    justifyContent: 'center',
  },
  pageHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 20,
    paddingTop: Platform.OS === 'ios' ? 60 : 40,
    paddingBottom: 14,
    borderBottomWidth: 1,
    borderBottomColor: '#E0E0E0',
    backgroundColor: '#F8F9FC',
  },
  pageHeaderBackButton: {
    padding: 8,
    marginLeft: -8,
  },
  pageHeaderTitle: {
    fontSize: 20,
    fontWeight: 'bold',
    color: '#000',
  },
  pageHeaderSpacer: {
    width: 40,
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
    alignItems: 'stretch',
    marginBottom: 28,
    paddingHorizontal: 4,
    width: '100%',
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
    marginBottom: 16,
  },
  resendButtonText: {
    fontSize: 16,
    color: '#FF7F00',
    fontWeight: '600',
  },
  inputContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#F5F5F5',
    borderRadius: 12,
    paddingHorizontal: 16,
    borderWidth: 1,
    borderColor: '#E0E0E0',
    height: 56,
    marginBottom: 16,
  },
  inputIcon: {
    marginRight: 12,
  },
  input: {
    flex: 1,
    fontSize: 16,
    color: '#333',
  },
  eyeIcon: {
    padding: 4,
  },
  resetButton: {
    backgroundColor: '#FF7F00',
    borderRadius: 12,
    height: 54,
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: 8,
    marginBottom: 16,
  },
  resetButtonText: {
    fontSize: 16,
    fontWeight: '600',
    color: '#fff',
  },
  backToLoginButton: {
    alignItems: 'center',
  },
  backToLoginText: {
    fontSize: 15,
    fontWeight: '600',
    color: '#666',
    textDecorationLine: 'underline',
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
    paddingHorizontal: 28,
    paddingVertical: 40,
    width: '80%',
    maxWidth: 360,
    alignItems: 'center',
  },
  modalIconCircle: {
    width: 80,
    height: 80,
    borderRadius: 40,
    backgroundColor: '#4CAF50',
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 24,
  },
  modalIconCircleError: {
    width: 80,
    height: 80,
    borderRadius: 40,
    backgroundColor: '#F44336',
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 24,
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
