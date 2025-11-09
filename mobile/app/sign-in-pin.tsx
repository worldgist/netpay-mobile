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
  ActivityIndicator,
} from 'react-native';
import { ThemedView } from '@/components/themed-view';
import { ThemedText } from '@/components/themed-text';
import { useRouter } from 'expo-router';
import * as SecureStore from 'expo-secure-store';
import * as Crypto from 'expo-crypto';
import { supabase } from '@/lib/supabase';

const PIN_LENGTH = 4;
const PIN_STORAGE_KEY = 'supabase_pin_hash';
const SESSION_KEY = 'supabase_session';
const EMAIL_KEY = 'supabase_email';

export default function SignInPinScreen() {
  const router = useRouter();
  const [email, setEmail] = useState('');
  const [pin, setPin] = useState(Array(PIN_LENGTH).fill(''));
  const [showSuccessModal, setShowSuccessModal] = useState(false);
  const [loading, setLoading] = useState(false);
  const inputRefs = useRef<Array<TextInput | null>>([]);
  const emailInputRef = useRef<TextInput | null>(null);

  useEffect(() => {
    let isMounted = true;

    const hydrateEmail = async () => {
      try {
        const storedEmail = await SecureStore.getItemAsync(EMAIL_KEY);
        if (storedEmail && isMounted) {
          setEmail(storedEmail);
        }
      } catch (error) {
        console.warn('Failed to load stored email for PIN login:', error);
      }
    };

    hydrateEmail();

    const focusTimeout = setTimeout(() => {
      if (emailInputRef.current) {
        emailInputRef.current.focus();
      } else {
        inputRefs.current[0]?.focus();
      }
    }, 150);

    return () => {
      isMounted = false;
      clearTimeout(focusTimeout);
    };
  }, []);

  const handlePinChange = (value: string, index: number) => {
    if (value && !/^\d$/.test(value)) return;

    const updated = [...pin];
    updated[index] = value;
    setPin(updated);

    if (value && index < PIN_LENGTH - 1) {
      inputRefs.current[index + 1]?.focus();
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

  const handleSignIn = async () => {
    const trimmedEmail = email.trim().toLowerCase();

    if (!trimmedEmail || !trimmedEmail.includes('@')) {
      Alert.alert('PIN Login', 'Enter the email associated with your account.');
      emailInputRef.current?.focus();
      return;
    }

    if (!pin.every((digit) => digit)) {
      Alert.alert('PIN Login', 'Enter your 4-digit PIN to continue.');
      return;
    }

    const enteredPin = pin.join('');

    try {
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
        setPin(Array(PIN_LENGTH).fill(''));
        Alert.alert('PIN Login', data?.error || 'Unable to verify your PIN. Please try again.');
        return;
      }

      const token: string | undefined = data?.token;
      const otpType: 'email' | 'magiclink' = data?.otpType === 'magiclink' ? 'magiclink' : 'email';

      if (!token) {
        setLoading(false);
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
        Alert.alert('PIN Login', verifyError?.message || 'Unable to sign you in with PIN. Please try again.');
        return;
      }

      await SecureStore.setItemAsync(PIN_STORAGE_KEY, enteredHash);
      await SecureStore.setItemAsync(EMAIL_KEY, trimmedEmail);

      setLoading(false);

      setPin(Array(PIN_LENGTH).fill(''));
      setShowSuccessModal(true);
    } catch (invokeError) {
      console.error('PIN login failed:', invokeError);
      setLoading(false);

      if (invokeError instanceof Error) {
        Alert.alert('PIN Login', invokeError.message || 'Unable to verify your PIN. Please try again.');
      } else {
        Alert.alert('PIN Login', 'Unable to verify your PIN. Please try again.');
      }
    }
  };

  const handleCloseSuccess = () => {
    setShowSuccessModal(false);
    router.replace('/(tabs)');
  };

  const handleBackToPassword = () => {
    router.replace('/auth/login');
  };

  return (
    <KeyboardAvoidingView
      style={styles.container}
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
      <ScrollView contentContainerStyle={styles.scrollContent} showsVerticalScrollIndicator={false}>
        <ThemedView style={styles.card}>
          <TouchableOpacity style={styles.backButton} onPress={handleBackToPassword}>
            <ThemedText style={styles.backButtonText}>Back to password login</ThemedText>
          </TouchableOpacity>

          <View style={styles.header}>
            <ThemedText style={styles.title}>Sign in with PIN</ThemedText>
            <ThemedText style={styles.subtitle}>
              Enter the 4-digit PIN you created to quickly access your account.
            </ThemedText>
          </View>

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
              onSubmitEditing={() => inputRefs.current[0]?.focus()}
            />
          </View>

          <View style={styles.pinRow}>
            {pin.map((digit, index) => (
              <TextInput
                key={index}
                ref={(ref) => (inputRefs.current[index] = ref)}
                style={styles.pinInput}
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
              />
            ))}
          </View>

          <TouchableOpacity
            style={[styles.signInButton, loading && { opacity: 0.7 }]}
            onPress={handleSignIn}
            disabled={loading}>
            {loading ? (
              <ActivityIndicator color="#fff" />
            ) : (
              <ThemedText style={styles.signInButtonText}>Sign In</ThemedText>
            )}
          </TouchableOpacity>
        </ThemedView>
      </ScrollView>

      <Modal
        visible={showSuccessModal}
        transparent
        animationType="fade"
        onRequestClose={handleCloseSuccess}>
        <View style={styles.modalOverlay}>
          <View style={styles.modalContent}>
            <View style={[styles.modalIconCircle, { backgroundColor: '#4CAF50' }]}>    
              <ThemedText style={styles.modalIconTick}>✓</ThemedText>
            </View>
            <ThemedText style={styles.modalTitle}>Welcome Back</ThemedText>
            <ThemedText style={styles.modalMessage}>
              You have successfully signed in using your PIN.
            </ThemedText>
            <TouchableOpacity style={styles.modalPrimaryButton} onPress={handleCloseSuccess}>
              <ThemedText style={styles.modalPrimaryButtonText}>Continue</ThemedText>
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
    paddingHorizontal: 28,
    paddingVertical: 40,
    backgroundColor: '#fff',
    borderRadius: 20,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 0.08,
    shadowRadius: 12,
    elevation: 6,
  },
  backButton: {
    alignItems: 'flex-start',
    marginBottom: 24,
  },
  backButtonText: {
    fontSize: 15,
    fontWeight: '600',
    color: '#666',
    textDecorationLine: 'underline',
  },
  header: {
    alignItems: 'center',
    marginBottom: 32,
  },
  title: {
    fontSize: 28,
    fontWeight: 'bold',
    color: '#333',
    marginBottom: 12,
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
    height: 54,
    borderRadius: 12,
    backgroundColor: '#F5F5F5',
    borderWidth: 1,
    borderColor: '#E0E0E0',
    paddingHorizontal: 16,
    fontSize: 16,
    color: '#333',
  },
  pinRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginBottom: 32,
  },
  pinInput: {
    width: 56,
    height: 60,
    borderRadius: 12,
    backgroundColor: '#F5F5F5',
    borderWidth: 1,
    borderColor: '#E0E0E0',
    textAlign: 'center',
    fontSize: 22,
    fontWeight: '600',
    color: '#333',
  },
  signInButton: {
    backgroundColor: '#FF7F00',
    borderRadius: 12,
    height: 56,
    alignItems: 'center',
    justifyContent: 'center',
  },
  signInButtonText: {
    fontSize: 16,
    fontWeight: '600',
    color: '#fff',
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
    maxWidth: 340,
    alignItems: 'center',
  },
  modalIconCircle: {
    width: 72,
    height: 72,
    borderRadius: 36,
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 20,
  },
  modalIconTick: {
    fontSize: 36,
    color: '#fff',
    fontWeight: 'bold',
  },
  modalTitle: {
    fontSize: 22,
    fontWeight: 'bold',
    color: '#333',
    marginBottom: 12,
    textAlign: 'center',
  },
  modalMessage: {
    fontSize: 15,
    color: '#666',
    textAlign: 'center',
    marginBottom: 24,
    lineHeight: 22,
  },
  modalPrimaryButton: {
    backgroundColor: '#FF7F00',
    borderRadius: 12,
    paddingVertical: 14,
    paddingHorizontal: 48,
    alignItems: 'center',
  },
  modalPrimaryButtonText: {
    fontSize: 16,
    fontWeight: '600',
    color: '#fff',
  },
});
