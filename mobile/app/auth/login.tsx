import { useState, useCallback, useRef } from 'react';
import {
  StyleSheet,
  View,
  TextInput,
  TouchableOpacity,
  ScrollView,
  KeyboardAvoidingView,
  Platform,
  Alert,
  Modal,
} from 'react-native';
import { NetpayLoadingAnimation } from '@/components/netpay-loading-animation';
import { useFocusEffect } from 'expo-router/react-navigation';
import { ThemedView } from '@/components/themed-view';
import { ThemedText } from '@/components/themed-text';
import { Image } from 'expo-image';
import { useRouter } from 'expo-router';
import { MaterialIcons } from '@expo/vector-icons';
import * as LocalAuthentication from 'expo-local-authentication';
import { supabase, isSupabaseInitialized, getSupabaseConfigStatus } from '@/lib/supabase';
import * as SecureStore from '@/utils/secure-store';
import {
  clearPendingBiometricReenrollment,
  isPendingBiometricReenrollment,
} from '@/utils/pending-biometric-reenrollment';
import { navigateAfterAuthenticatedSession } from '@/utils/post-auth-navigation';
import { buildRouteHref } from '@/utils/router-href';
import {
  isBiometricLoginEnabledLocally,
  setBiometricLoginEnabled,
} from '@/utils/biometric-login-preference';
import { showAlert } from '@/utils/show-alert';
import { hasCompletedOnboarding } from '@/utils/onboarding';

const BIOMETRIC_PROMPT = 'Sign in with Biometrics';
const SESSION_KEY = 'supabase_session';
const EMAIL_KEY = 'supabase_email';

const DEFAULT_BIOMETRIC_NOT_ENABLED_MESSAGE =
  'Biometric login is not enabled for this account yet. Sign in with your email and password, then open Profile and enable biometric login.';

const INVALID_CREDENTIALS_TITLE = 'Invalid email or password';
const INVALID_CREDENTIALS_MESSAGE =
  'The email or password you entered is incorrect. Please check your details and try again.';

function isInvalidCredentialsError(message: string): boolean {
  const normalized = message.toLowerCase();
  return (
    normalized.includes('invalid login credentials') ||
    normalized.includes('invalid email or password') ||
    normalized.includes('invalid credentials') ||
    normalized.includes('wrong password') ||
    normalized.includes('incorrect email or password')
  );
}

function isBiometricNotEnabledMessage(msg: string): boolean {
  const s = msg.toLowerCase();
  return (
    s.includes('biometric login is not enabled') ||
    s.includes('not enabled for this account') ||
    (s.includes('biometric') && s.includes('not enabled') && s.includes('profile'))
  );
}

function isAccountNotFoundMessage(msg: string): boolean {
  const s = msg.toLowerCase();
  return (
    s.includes('account not found') ||
    s.includes('no account found') ||
    s.includes('please sign up first')
  );
}

export default function LoginScreen() {
  const router = useRouter();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [loading, setLoading] = useState(false);
  const [biometricLoading, setBiometricLoading] = useState(false);
  const [showBiometricLogin, setShowBiometricLogin] = useState(false);
  const [biometricNotEnabledModalVisible, setBiometricNotEnabledModalVisible] = useState(false);
  const [biometricNotEnabledModalMessage, setBiometricNotEnabledModalMessage] = useState('');
  const [invalidCredentialsModalVisible, setInvalidCredentialsModalVisible] = useState(false);
  const autoBiometricAttemptedRef = useRef(false);
  const handleBiometricRef = useRef<(options?: { silentCancel?: boolean }) => Promise<void>>(
    async () => {}
  );

  const openBiometricNotEnabledModal = (message: string) => {
    const trimmed = message.trim();
    setBiometricNotEnabledModalMessage(
      trimmed.length > 0 ? trimmed : DEFAULT_BIOMETRIC_NOT_ENABLED_MESSAGE
    );
    setBiometricNotEnabledModalVisible(true);
  };

  const closeBiometricNotEnabledModal = () => {
    setBiometricNotEnabledModalVisible(false);
    setBiometricNotEnabledModalMessage('');
  };

  const openInvalidCredentialsModal = () => {
    setInvalidCredentialsModalVisible(true);
  };

  const closeInvalidCredentialsModal = () => {
    setInvalidCredentialsModalVisible(false);
  };

  useFocusEffect(
    useCallback(() => {
      let active = true;
      (async () => {
        const completedOnboarding = await hasCompletedOnboarding();
        if (!active) return;
        if (!completedOnboarding) {
          router.replace('/onboarding');
          return;
        }

        const pending = await isPendingBiometricReenrollment();
        const storedEmailRaw = await SecureStore.getItemAsync(EMAIL_KEY);
        const storedEmail = storedEmailRaw?.trim().toLowerCase() || '';
        const biometricEnabledLocally = await isBiometricLoginEnabledLocally();

        if (!active) return;

        if (storedEmail) {
          setEmail(storedEmail);
        }

        // Biometrics are native-only; skip hardware checks on web (can hang).
        if (Platform.OS === 'web') {
          setShowBiometricLogin(false);
          return;
        }

        const hasHardware = await LocalAuthentication.hasHardwareAsync();
        const enrolled = hasHardware ? await LocalAuthentication.isEnrolledAsync() : false;

        if (!active) return;

        const canOfferBiometric = !pending && storedEmail.length > 0;
        setShowBiometricLogin(canOfferBiometric);

        const shouldAutoPrompt =
          canOfferBiometric && biometricEnabledLocally && enrolled && !autoBiometricAttemptedRef.current;

        if (shouldAutoPrompt) {
          autoBiometricAttemptedRef.current = true;
          requestAnimationFrame(() => {
            if (active) {
              void handleBiometricRef.current({ silentCancel: true });
            }
          });
        }
      })();
      return () => {
        active = false;
      };
    }, [router])
  );

  const handleSignIn = async () => {
    const trimmedEmail = email.trim().toLowerCase();

    if (!trimmedEmail || !password) {
      showAlert('Sign In', 'Please enter both email and password.');
      return;
    }

    // Check if Supabase is configured
    if (!isSupabaseInitialized()) {
      const configStatus = getSupabaseConfigStatus();
      showAlert(
        'Configuration Error',
        configStatus.message +
          '\n\nThis usually means the app was built without the required environment variables. Please contact support or rebuild the app with proper configuration.',
      );
      return;
    }

    try {
      setLoading(true);
      const { data, error } = await supabase.auth.signInWithPassword({
        email: trimmedEmail,
        password,
      });

      if (error) {
        const message = error.message || 'Unable to sign in. Please try again.';

        // Check for network/configuration errors
        const errorMessage = message.toLowerCase();
        if (
          errorMessage.includes('network') ||
          errorMessage.includes('fetch') ||
          errorMessage.includes('connection') ||
          errorMessage.includes('failed to send') ||
          errorMessage.includes('placeholder')
        ) {
          showAlert(
            'Connection Error',
            'Unable to connect to the server. This may be due to:\n\n• Missing app configuration\n• Network connectivity issues\n• Server maintenance\n\nPlease check your internet connection and try again. If the problem persists, contact support.',
          );
          return;
        }

        if (message.toLowerCase().includes('email not confirmed')) {
          showAlert(
            'Email Not Verified',
            'Please verify your email to continue. We will redirect you to the verification screen.',
          );
          router.push(buildRouteHref('/email-verification', { email: trimmedEmail }));
          return;
        }

        if (isInvalidCredentialsError(message)) {
          openInvalidCredentialsModal();
          return;
        }

        showAlert('Sign In Failed', message);
        return;
      }

      if (!data.session) {
        showAlert('Sign In', 'No active session was returned. Please verify your email and try again.');
        router.push(buildRouteHref('/email-verification', { email: trimmedEmail }));
        return;
      }

      await clearPendingBiometricReenrollment();

      const { data: profileRow } = await supabase
        .from('profiles')
        .select('biometric_enabled')
        .eq('id', data.session.user.id)
        .maybeSingle();

      const isDemoUser = data?.user?.email === 'demo@netppay.com';
      if (isDemoUser) {
        await supabase
          .from('profiles')
          .update({ biometric_enabled: true, updated_at: new Date().toISOString() })
          .eq('id', data.session.user.id);
      }

      await setBiometricLoginEnabled(isDemoUser || Boolean(profileRow?.biometric_enabled));

      try {
        await SecureStore.setItemAsync(
          SESSION_KEY,
          JSON.stringify({
            access_token: data.session.access_token,
            refresh_token: data.session.refresh_token,
          }),
        );
        await SecureStore.setItemAsync(EMAIL_KEY, trimmedEmail);
      } catch (storageError) {
        console.warn('Unable to persist Supabase session for biometrics:', storageError);
      }

      if (isDemoUser) {
        try {
          const { data: setupData, error: setupError } = await supabase.functions.invoke('setup-demo-user', {
            body: {},
          });
          if (setupError) {
            console.warn('Demo setup error (non-critical):', setupError);
          } else {
            console.log('Demo setup completed:', setupData);
            await new Promise((resolve) => setTimeout(resolve, 500));
          }
        } catch (demoError) {
          console.warn('Demo setup error (non-critical):', demoError);
        }
      }

      await navigateAfterAuthenticatedSession(router);
    } catch (err) {
      const message = err instanceof Error ? err.message : 'An unexpected error occurred.';
      if (isInvalidCredentialsError(message)) {
        openInvalidCredentialsModal();
        return;
      }
      showAlert('Sign In Error', message);
    } finally {
      setLoading(false);
    }
  };

  const handleBiometric = async (options?: { silentCancel?: boolean }) => {
    try {
      if (!isSupabaseInitialized()) {
        const configStatus = getSupabaseConfigStatus();
        Alert.alert(
          'Configuration Error',
          configStatus.message + '\n\nBiometric login requires a working Supabase connection. If you just added env vars, restart Expo and try again.',
          [{ text: 'OK' }]
        );
        return;
      }

      setBiometricLoading(true);
      const hasHardware = await LocalAuthentication.hasHardwareAsync();
      if (!hasHardware) {
        Alert.alert('Biometric Login', 'Biometric authentication is not available on this device.');
        setBiometricLoading(false);
        return;
      }

      const enrolled = await LocalAuthentication.isEnrolledAsync();
      if (!enrolled) {
        Alert.alert('Biometric Login', 'No biometric data found. Please register in your device settings.');
        setBiometricLoading(false);
        return;
      }

      const storedEmailRaw = await SecureStore.getItemAsync(EMAIL_KEY);
      const storedEmail = storedEmailRaw?.trim().toLowerCase();
      if (!storedEmail) {
        Alert.alert('Biometric Login', 'No saved email found. Please sign in with your email and password first.');
        setBiometricLoading(false);
        return;
      }

      const result = await LocalAuthentication.authenticateAsync({
        promptMessage: BIOMETRIC_PROMPT,
        cancelLabel: 'Cancel',
      });

      if (!result.success) {
        if (!options?.silentCancel) {
          Alert.alert('Biometric Login', result.error || 'Biometric authentication was cancelled.');
        }
        setBiometricLoading(false);
        return;
      }

      // Try using supabase.functions.invoke with better error handling
      let pinData: any = null;
      let errorMessage: string | null = null;
      
      try {
        console.log('Calling biometric sign-in function for email:', storedEmail);
        const response = await supabase.functions.invoke('sign-in-with-biometric', {
          body: {
            email: storedEmail,
          },
        });
        
        console.log('Biometric function response:', {
          hasData: !!response.data,
          hasError: !!response.error,
          dataKeys: response.data ? Object.keys(response.data) : [],
          errorType: response.error?.constructor?.name,
        });
        
        // Check if there's an error in the response
        if (response.error) {
          console.error('Biometric sign-in function error:', {
            error: response.error,
            errorType: response.error?.constructor?.name,
            errorMessage: (response.error as any)?.message,
            errorDetails: JSON.stringify(response.error, Object.getOwnPropertyNames(response.error)),
          });
          
          // Try to extract error message from error object
          const errorObj = response.error as any;
          errorMessage = errorObj?.message 
            || errorObj?.error 
            || errorObj?.context?.body?.error
            || (typeof errorObj === 'string' ? errorObj : null)
            || 'Authentication failed. Please check your biometric settings and try again.';
        } else if (response.data) {
          pinData = response.data;
          console.log('Biometric function returned data:', {
            success: pinData?.success,
            hasToken: !!pinData?.token,
            otpType: pinData?.otpType,
          });
        } else {
          errorMessage = 'No response from authentication service';
        }
      } catch (invokeError) {
        console.error('Biometric function invoke exception:', {
          error: invokeError,
          errorType: invokeError?.constructor?.name,
          errorMessage: invokeError instanceof Error ? invokeError.message : String(invokeError),
          errorStack: invokeError instanceof Error ? invokeError.stack : undefined,
        });
        
        // Try to extract error message from various error formats
        if (invokeError instanceof Error) {
          errorMessage = invokeError.message || 'Failed to connect to authentication service';
        } else if (typeof invokeError === 'object' && invokeError !== null) {
          const errorObj = invokeError as any;
          errorMessage = errorObj?.message 
            || errorObj?.error 
            || errorObj?.context?.body?.error
            || errorObj?.toString()
            || 'Failed to connect to authentication service';
        } else {
          errorMessage = 'Failed to connect to authentication service';
        }
      }

      if (errorMessage) {
        const normalizedError = errorMessage.toLowerCase();
        if (
          normalizedError.includes('failed to send a request to the edge function') ||
          normalizedError.includes('network request failed') ||
          normalizedError.includes('failed to fetch') ||
          normalizedError.includes('placeholder')
        ) {
          Alert.alert(
            'Connection Error',
            'Unable to reach the authentication service for biometric login. Check your internet connection and Supabase app configuration, then restart Expo and try again.'
          );
          setBiometricLoading(false);
          return;
        }

        if (isBiometricNotEnabledMessage(errorMessage)) {
          openBiometricNotEnabledModal(errorMessage);
          setBiometricLoading(false);
          return;
        }

        if (isAccountNotFoundMessage(errorMessage) || pinData?.code === 'account_not_found') {
          await setBiometricLoginEnabled(false);
          setShowBiometricLogin(false);
          Alert.alert(
            'Biometric Login',
            'No account found for the saved email. Please sign in with your email and password.',
          );
          setBiometricLoading(false);
          return;
        }

        Alert.alert('Biometric Login', errorMessage);
        setBiometricLoading(false);
        return;
      }

      if (!pinData?.success) {
        const errorMsg = typeof pinData?.error === 'string' && pinData.error.trim().length > 0
          ? pinData.error.trim()
          : 'Unable to authenticate with biometrics. Please sign in manually.';

        if (isBiometricNotEnabledMessage(errorMsg)) {
          openBiometricNotEnabledModal(errorMsg);
          setBiometricLoading(false);
          return;
        }

        if (isAccountNotFoundMessage(errorMsg) || pinData?.code === 'account_not_found') {
          await setBiometricLoginEnabled(false);
          setShowBiometricLogin(false);
          Alert.alert(
            'Biometric Login',
            'No account found for the saved email. Please sign in with your email and password.',
          );
          setBiometricLoading(false);
          return;
        }

        console.warn('Biometric sign-in function responded with error:', pinData);
        Alert.alert('Biometric Login', errorMsg);
        setBiometricLoading(false);
        return;
      }

      console.log('Biometric sign-in response:', pinData);

      const token: string | undefined = pinData?.token;
      const otpType: 'email' | 'magiclink' = pinData?.otpType === 'magiclink' ? 'magiclink' : 'email';

      if (!token) {
        Alert.alert('Biometric Login', 'Invalid response from authentication service. Please sign in manually.');
        setBiometricLoading(false);
        return;
      }

      const { data, error } = await supabase.auth.verifyOtp({
        email: storedEmail,
        token,
        type: otpType,
      });

      if (error || !data.session) {
        console.error('Biometric verifyOtp failed:', error);
        Alert.alert('Biometric Login', error?.message || 'Unable to restore session. Please sign in manually.');
        setBiometricLoading(false);
        return;
      }

      try {
        await SecureStore.setItemAsync(
          SESSION_KEY,
          JSON.stringify({
            access_token: data.session.access_token,
            refresh_token: data.session.refresh_token,
          })
        );
        await SecureStore.setItemAsync(EMAIL_KEY, storedEmail);
        await setBiometricLoginEnabled(true);
      } catch (storageError) {
        console.warn('Unable to persist session after biometric login:', storageError);
      }

      setBiometricLoading(false);
      await navigateAfterAuthenticatedSession(router);
    } catch (error) {
      console.error('Biometric login unexpected error:', error);
      setBiometricLoading(false);
      Alert.alert(
        'Biometric Login',
        error instanceof Error && error.message.trim().length > 0
          ? error.message
          : 'Unable to authenticate with biometrics.'
      );
    }
  };

  handleBiometricRef.current = handleBiometric;

  return (
    <KeyboardAvoidingView
      behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
      style={styles.container}>
      <ScrollView contentContainerStyle={styles.scrollContent}>
        <ThemedView style={styles.content}>
          {/* Logo */}
          <View style={styles.logoContainer}>
            <Image
              source={require('@/assets/images/logo.png')}
              style={styles.logoImage}
              contentFit="contain"
            />
          </View>

          {/* Welcome Section */}
          <View style={styles.welcomeSection}>
            <ThemedText style={styles.welcomeTitle}>Welcome Back</ThemedText>
            <ThemedText style={styles.welcomeSubtitle}>Sign in to your account</ThemedText>
          </View>

          {/* Email Input */}
          <View style={styles.inputContainer}>
            <MaterialIcons name="email" size={20} color="#666" style={styles.inputIcon} />
            <TextInput
              style={styles.input}
              placeholder="Email address"
              placeholderTextColor="#999"
              value={email}
              onChangeText={setEmail}
              keyboardType="email-address"
              autoCapitalize="none"
              autoCorrect={false}
            />
          </View>

          {/* Password Input */}
          <View style={styles.inputContainer}>
            <MaterialIcons name="lock" size={20} color="#666" style={styles.inputIcon} />
            <TextInput
              style={styles.input}
              placeholder="Password"
              placeholderTextColor="#999"
              value={password}
              onChangeText={setPassword}
              secureTextEntry={!showPassword}
              autoCapitalize="none"
            />
            <TouchableOpacity
              onPress={() => setShowPassword(!showPassword)}
              style={styles.eyeIcon}>
              <MaterialIcons
                name={showPassword ? 'visibility' : 'visibility-off'}
                size={20}
                color="#666"
              />
            </TouchableOpacity>
          </View>

          {/* Sign In Button */}
          <TouchableOpacity
            style={[styles.signInButton, loading && { opacity: 0.7 }]}
            onPress={handleSignIn}
            disabled={loading}>
            {loading ? (
              <NetpayLoadingAnimation size={40} variant="onBrand" strokeWidth={2.5} />
            ) : (
              <ThemedText style={styles.signInButtonText}>Sign In</ThemedText>
            )}
          </TouchableOpacity>

          {/* Biometric — shown for returning users; auto-prompts when enabled on this device */}
          {showBiometricLogin ? (
            <TouchableOpacity
              style={[styles.biometricButton, (loading || biometricLoading) && { opacity: 0.7 }]}
              onPress={() => handleBiometric()}
              disabled={loading || biometricLoading}>
              {biometricLoading ? (
                <View style={styles.biometricIcon}>
                  <NetpayLoadingAnimation size={22} strokeWidth={2} />
                </View>
              ) : (
                <MaterialIcons name="fingerprint" size={20} color="#FF7F00" style={styles.biometricIcon} />
              )}
              <ThemedText style={styles.biometricButtonText}>Sign in with Biometric</ThemedText>
            </TouchableOpacity>
          ) : null}

          {/* Links */}
          <TouchableOpacity style={styles.linkContainer} onPress={() => router.push('/forget-password')}>
            <ThemedText style={styles.linkText}>Forgot Password?</ThemedText>
          </TouchableOpacity>
        </ThemedView>
      </ScrollView>

      <Modal
        visible={biometricNotEnabledModalVisible}
        transparent
        animationType="fade"
        onRequestClose={closeBiometricNotEnabledModal}>
        <View style={styles.biometricModalOverlay}>
          <View style={styles.biometricModalCard}>
            <View style={styles.biometricModalIconCircle}>
              <MaterialIcons name="fingerprint" size={36} color="#FF7F00" />
            </View>
            <ThemedText style={styles.biometricModalTitle}>Biometric login isn&apos;t enabled</ThemedText>
            <ThemedText style={styles.biometricModalMessage}>{biometricNotEnabledModalMessage}</ThemedText>
            <TouchableOpacity
              style={styles.biometricModalButton}
              onPress={closeBiometricNotEnabledModal}
              activeOpacity={0.85}>
              <ThemedText style={styles.biometricModalButtonText}>OK</ThemedText>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>

      <Modal
        visible={invalidCredentialsModalVisible}
        transparent
        animationType="fade"
        onRequestClose={closeInvalidCredentialsModal}>
        <View style={styles.biometricModalOverlay}>
          <View style={styles.biometricModalCard}>
            <View style={styles.invalidCredentialsIconCircle}>
              <MaterialIcons name="lock-outline" size={36} color="#D32F2F" />
            </View>
            <ThemedText style={styles.biometricModalTitle}>{INVALID_CREDENTIALS_TITLE}</ThemedText>
            <ThemedText style={styles.biometricModalMessage}>{INVALID_CREDENTIALS_MESSAGE}</ThemedText>
            <TouchableOpacity
              style={styles.biometricModalButton}
              onPress={closeInvalidCredentialsModal}
              activeOpacity={0.85}>
              <ThemedText style={styles.biometricModalButtonText}>Try Again</ThemedText>
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
    paddingBottom: 48,
    justifyContent: 'flex-start',
  },
  content: {
    width: '100%',
    maxWidth: 420,
    alignSelf: 'center',
    paddingHorizontal: 28,
    paddingTop: 48,
    paddingBottom: 48,
    backgroundColor: '#fff',
    borderRadius: 20,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 0.08,
    shadowRadius: 12,
    elevation: 6,
    rowGap: 20,
  },
  logoContainer: {
    alignItems: 'center',
    marginBottom: 16,
  },
  logoImage: {
    width: 120,
    height: 120,
  },
  welcomeSection: {
    alignItems: 'center',
    marginBottom: 24,
    width: '100%',
    paddingHorizontal: 4,
  },
  welcomeTitle: {
    fontSize: Platform.OS === 'ios' ? 27 : 28,
    fontWeight: 'bold',
    color: '#333',
    marginBottom: 6,
    textAlign: 'center',
    lineHeight: Platform.OS === 'ios' ? 34 : 36,
    includeFontPadding: true,
    width: '100%',
    flexShrink: 1,
  },
  welcomeSubtitle: {
    fontSize: 15,
    color: '#666',
    textAlign: 'center',
    lineHeight: 21,
    width: '100%',
    flexShrink: 1,
    alignSelf: 'stretch',
  },
  inputContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#F5F5F5',
    borderRadius: 12,
    paddingHorizontal: 16,
    marginBottom: 16,
    borderWidth: 1,
    borderColor: '#E0E0E0',
    height: 56,
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
  signInButton: {
    backgroundColor: '#FF7F00',
    borderRadius: 12,
    height: 56,
    justifyContent: 'center',
    alignItems: 'center',
    marginTop: 8,
    marginBottom: 16,
  },
  signInButtonText: {
    color: '#fff',
    fontSize: 16,
    fontWeight: '600',
  },
  biometricButton: {
    flexDirection: 'row',
    backgroundColor: '#fff',
    borderRadius: 12,
    height: 56,
    justifyContent: 'center',
    alignItems: 'center',
    borderWidth: 1,
    borderColor: '#FF7F00',
    marginBottom: 24,
  },
  biometricIcon: {
    marginRight: 8,
  },
  biometricButtonText: {
    color: '#FF7F00',
    fontSize: 16,
    fontWeight: '600',
  },
  biometricModalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.45)',
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: 28,
  },
  biometricModalCard: {
    width: '100%',
    maxWidth: 400,
    backgroundColor: '#fff',
    borderRadius: 16,
    paddingVertical: 28,
    paddingHorizontal: 22,
    alignItems: 'center',
  },
  biometricModalIconCircle: {
    width: 72,
    height: 72,
    borderRadius: 36,
    backgroundColor: '#FFF3E6',
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 16,
  },
  invalidCredentialsIconCircle: {
    width: 72,
    height: 72,
    borderRadius: 36,
    backgroundColor: '#FFEBEE',
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 16,
  },
  biometricModalTitle: {
    fontSize: 18,
    fontWeight: '700',
    color: '#111',
    textAlign: 'center',
    marginBottom: 12,
  },
  biometricModalMessage: {
    fontSize: 15,
    lineHeight: 22,
    color: '#555',
    textAlign: 'center',
    marginBottom: 24,
  },
  biometricModalButton: {
    backgroundColor: '#FF7F00',
    borderRadius: 12,
    paddingVertical: 14,
    paddingHorizontal: 32,
    minWidth: 160,
    alignItems: 'center',
  },
  biometricModalButtonText: {
    color: '#fff',
    fontSize: 16,
    fontWeight: '700',
  },
  linkContainer: {
    marginBottom: 16,
    alignItems: 'center',
  },
  linkText: {
    color: '#FF7F00',
    fontSize: 16,
    textAlign: 'center',
  },
  secondaryLinkText: {
    color: '#333',
    fontSize: 16,
    textAlign: 'center',
  },
});

