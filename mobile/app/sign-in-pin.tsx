import { useState, useRef, useEffect, useCallback } from 'react';
import {
  StyleSheet,
  View,
  TextInput,
  TouchableOpacity,
  KeyboardAvoidingView,
  Platform,
  ScrollView,
  Alert,
} from 'react-native';
import { NetpayLoadingAnimation } from '@/components/netpay-loading-animation';
import { ThemedView } from '@/components/themed-view';
import { ThemedText } from '@/components/themed-text';
import { MaterialIcons } from '@expo/vector-icons';
import { useLocalSearchParams, useRouter } from 'expo-router';
import * as SecureStore from '@/utils/secure-store';
import * as Crypto from 'expo-crypto';
import { supabase } from '@/lib/supabase';
import { clearPendingBiometricReenrollment } from '@/utils/pending-biometric-reenrollment';
import { navigateAfterAuthenticatedSession, safeReturnToPath } from '@/utils/post-auth-navigation';
import { buildRouteHref } from '@/utils/router-href';

const PIN_LENGTH = 4;
const PIN_STORAGE_KEY = 'supabase_pin_hash';
const EMAIL_KEY = 'supabase_email';

export default function SignInPinScreen() {
  const router = useRouter();
  const params = useLocalSearchParams<{ returnTo?: string }>();
  const returnTo = safeReturnToPath(
    typeof params.returnTo === 'string'
      ? params.returnTo
      : Array.isArray(params.returnTo)
        ? params.returnTo[0]
        : null,
  );
  const [email, setEmail] = useState('');
  const [isReturningUser, setIsReturningUser] = useState(false);
  const [pin, setPin] = useState(Array(PIN_LENGTH).fill(''));
  const [loading, setLoading] = useState(false);
  const [hydrated, setHydrated] = useState(false);
  const inputRefs = useRef<(TextInput | null)[]>([]);
  const emailInputRef = useRef<TextInput | null>(null);
  const submittingRef = useRef(false);

  useEffect(() => {
    let isMounted = true;

    const hydrateEmail = async () => {
      try {
        const storedEmail = (await SecureStore.getItemAsync(EMAIL_KEY))?.trim().toLowerCase() || '';
        if (!isMounted) return;
        if (storedEmail.includes('@')) {
          setEmail(storedEmail);
          setIsReturningUser(true);
        }
      } catch (error) {
        console.warn('Failed to load stored email for PIN login:', error);
      } finally {
        if (isMounted) setHydrated(true);
      }
    };

    void hydrateEmail();

    return () => {
      isMounted = false;
    };
  }, []);

  useEffect(() => {
    if (!hydrated) return;
    const focusTimeout = setTimeout(() => {
      if (isReturningUser) {
        inputRefs.current[0]?.focus();
      } else if (emailInputRef.current) {
        emailInputRef.current.focus();
      } else {
        inputRefs.current[0]?.focus();
      }
    }, 150);
    return () => clearTimeout(focusTimeout);
  }, [hydrated, isReturningUser]);

  const handleSignIn = useCallback(async (pinDigits?: string[]) => {
    if (submittingRef.current) return;

    const trimmedEmail = email.trim().toLowerCase();
    const pinValues = pinDigits || pin;

    if (!trimmedEmail || !trimmedEmail.includes('@')) {
      Alert.alert('PIN Login', 'Enter the email associated with your account.');
      emailInputRef.current?.focus();
      return;
    }

    if (!pinValues.every((digit) => digit)) {
      Alert.alert('PIN Login', 'Enter your 4-digit PIN to continue.');
      return;
    }

    const enteredPin = pinValues.join('');

    try {
      submittingRef.current = true;
      setLoading(true);
      const enteredHash = await Crypto.digestStringAsync(Crypto.CryptoDigestAlgorithm.SHA256, enteredPin);

      const { data, error } = await supabase.functions.invoke('sign-in-with-pin', {
        body: {
          email: trimmedEmail,
          pin: enteredPin,
        },
      });

      if (error) {
        throw error;
      }

      if (!data?.success) {
        setLoading(false);
        submittingRef.current = false;
        setPin(Array(PIN_LENGTH).fill(''));
        Alert.alert('PIN Login', data?.error || 'Unable to verify your PIN. Please try again.');
        requestAnimationFrame(() => inputRefs.current[0]?.focus());
        return;
      }

      const token: string | undefined = data?.token;
      const otpType: 'email' | 'magiclink' = data?.otpType === 'magiclink' ? 'magiclink' : 'email';

      if (!token) {
        setLoading(false);
        submittingRef.current = false;
        Alert.alert('PIN Login', 'Invalid response from authentication service. Please try again.');
        return;
      }

      const { data: verifyData, error: verifyError } = await supabase.auth.verifyOtp({
        email: trimmedEmail,
        token,
        type: otpType,
      });

      if (verifyError || !verifyData?.session) {
        setLoading(false);
        submittingRef.current = false;
        Alert.alert('PIN Login', verifyError?.message || 'Unable to sign you in with PIN. Please try again.');
        return;
      }

      await clearPendingBiometricReenrollment();
      await SecureStore.setItemAsync(PIN_STORAGE_KEY, enteredHash);
      await SecureStore.setItemAsync(EMAIL_KEY, trimmedEmail);

      setPin(Array(PIN_LENGTH).fill(''));
      // Existing users go straight to the dashboard after a valid PIN.
      await navigateAfterAuthenticatedSession(router, { returnTo });
    } catch (invokeError) {
      console.error('PIN login failed:', invokeError);
      setLoading(false);
      submittingRef.current = false;
      setPin(Array(PIN_LENGTH).fill(''));
      requestAnimationFrame(() => inputRefs.current[0]?.focus());

      if (invokeError instanceof Error) {
        Alert.alert('PIN Login', invokeError.message || 'Unable to verify your PIN. Please try again.');
      } else {
        Alert.alert('PIN Login', 'Unable to verify your PIN. Please try again.');
      }
    }
  }, [email, pin, returnTo, router]);

  const handlePinChange = (value: string, index: number) => {
    if (value && !/^\d$/.test(value)) return;

    const updated = [...pin];
    updated[index] = value;
    setPin(updated);

    if (value && index < PIN_LENGTH - 1) {
      inputRefs.current[index + 1]?.focus();
    }

    if (value && index === PIN_LENGTH - 1 && updated.every((digit) => digit)) {
      void handleSignIn(updated);
    }
  };

  const handleBackspace = (index: number) => {
    const updated = [...pin];

    if (updated[index]) {
      updated[index] = '';
      setPin(updated);
      return;
    }

    if (index > 0) {
      updated[index - 1] = '';
      setPin(updated);
      inputRefs.current[index - 1]?.focus();
    }
  };

  const handleUsePassword = () => {
    router.replace(
      buildRouteHref('/auth/login', {
        password: '1',
        ...(returnTo ? { returnTo } : {}),
      }),
    );
  };

  return (
    <KeyboardAvoidingView
      style={styles.container}
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
      <ScrollView contentContainerStyle={styles.scrollContent} showsVerticalScrollIndicator={false}>
        <ThemedView style={styles.card}>
          <View style={styles.lockIconCircle}>
            <MaterialIcons name="lock" size={32} color="#FF7F00" />
          </View>

          <View style={styles.header}>
            <ThemedText style={styles.title}>Enter PIN</ThemedText>
            <ThemedText style={styles.subtitle}>
              {isReturningUser
                ? 'Enter your 4-digit PIN to continue'
                : 'Enter your email and 4-digit PIN to continue.'}
            </ThemedText>
          </View>

          {!isReturningUser ? (
            <View style={styles.inputGroup}>
              <ThemedText style={styles.inputLabel}>Email Address</ThemedText>
              <TextInput
                ref={emailInputRef}
                style={styles.emailInput}
                value={email}
                onChangeText={setEmail}
                placeholder="your@email.com"
                placeholderTextColor="#999"
                autoCapitalize="none"
                autoCorrect={false}
                keyboardType="email-address"
                returnKeyType="next"
                editable={!loading}
                onSubmitEditing={() => inputRefs.current[0]?.focus()}
              />
            </View>
          ) : null}

          <View style={styles.pinRow}>
            {pin.map((digit, index) => (
              <TextInput
                key={index}
                ref={(ref) => {
                  inputRefs.current[index] = ref;
                }}
                style={[styles.pinInput, digit ? styles.pinInputFilled : null]}
                value={digit}
                onChangeText={(value) => handlePinChange(value, index)}
                onKeyPress={({ nativeEvent }) => {
                  if (nativeEvent.key === 'Backspace') {
                    handleBackspace(index);
                  }
                }}
                keyboardType="number-pad"
                secureTextEntry
                maxLength={1}
                selectTextOnFocus
                editable={!loading}
              />
            ))}
          </View>

          <TouchableOpacity
            style={[styles.signInButton, loading && { opacity: 0.7 }]}
            onPress={() => handleSignIn()}
            disabled={loading}>
            {loading ? (
              <NetpayLoadingAnimation size={40} variant="onBrand" strokeWidth={2.5} />
            ) : (
              <ThemedText style={styles.signInButtonText}>Continue</ThemedText>
            )}
          </TouchableOpacity>

          <TouchableOpacity
            style={styles.secondaryLink}
            onPress={handleUsePassword}
            disabled={loading}>
            <ThemedText style={styles.secondaryLinkText}>Use password instead</ThemedText>
          </TouchableOpacity>

          <TouchableOpacity
            style={styles.secondaryLink}
            onPress={() => router.push('/forgot-pin')}
            disabled={loading}>
            <ThemedText style={styles.forgotPinText}>Forgot PIN?</ThemedText>
          </TouchableOpacity>
        </ThemedView>
      </ScrollView>
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
    paddingHorizontal: 28,
    paddingVertical: 40,
    backgroundColor: '#fff',
    borderRadius: 20,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 0.08,
    shadowRadius: 12,
    elevation: 6,
    alignItems: 'center',
  },
  lockIconCircle: {
    width: 72,
    height: 72,
    borderRadius: 36,
    backgroundColor: '#FFF3E8',
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 20,
  },
  header: {
    alignItems: 'center',
    marginBottom: 28,
    width: '100%',
  },
  title: {
    fontSize: 28,
    fontWeight: 'bold',
    color: '#333',
    marginBottom: 12,
    textAlign: 'center',
  },
  subtitle: {
    fontSize: 16,
    color: '#666',
    textAlign: 'center',
    lineHeight: 22,
  },
  inputGroup: {
    width: '100%',
    marginBottom: 24,
  },
  inputLabel: {
    fontSize: 15,
    color: '#555',
    marginBottom: 8,
    fontWeight: '600',
  },
  emailInput: {
    width: '100%',
    height: Platform.OS === 'web' ? 64 : 54,
    borderRadius: 12,
    backgroundColor: '#F5F5F5',
    borderWidth: 1,
    borderColor: '#E0E0E0',
    paddingHorizontal: 16,
    fontSize: Platform.OS === 'web' ? 18 : 16,
    color: '#333',
  },
  pinRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginBottom: 28,
    width: '100%',
    gap: 10,
  },
  pinInput: {
    flex: 1,
    maxWidth: 64,
    height: Platform.OS === 'web' ? 68 : 60,
    borderRadius: 12,
    backgroundColor: '#F5F5F5',
    borderWidth: 1.5,
    borderColor: '#E0E0E0',
    textAlign: 'center',
    fontSize: 22,
    fontWeight: '600',
    color: '#333',
  },
  pinInputFilled: {
    borderColor: '#FF7F00',
    backgroundColor: '#FFF8F1',
  },
  signInButton: {
    backgroundColor: '#FF7F00',
    borderRadius: 12,
    height: Platform.OS === 'web' ? 64 : 56,
    alignItems: 'center',
    justifyContent: 'center',
    width: '100%',
  },
  signInButtonText: {
    fontSize: 16,
    fontWeight: '600',
    color: '#fff',
  },
  secondaryLink: {
    marginTop: 16,
    paddingVertical: 4,
  },
  secondaryLinkText: {
    fontSize: 15,
    fontWeight: '600',
    color: '#666',
    textDecorationLine: 'underline',
  },
  forgotPinText: {
    fontSize: 15,
    fontWeight: '600',
    color: '#FF7F00',
  },
});
