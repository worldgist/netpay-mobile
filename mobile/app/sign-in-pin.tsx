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

export default function SignInPinScreen() {
  const router = useRouter();
  const [pin, setPin] = useState(Array(PIN_LENGTH).fill(''));
  const [showSuccessModal, setShowSuccessModal] = useState(false);
  const [showErrorModal, setShowErrorModal] = useState(false);
  const [loading, setLoading] = useState(false);
  const inputRefs = useRef<Array<TextInput | null>>([]);

  useEffect(() => {
    inputRefs.current[0]?.focus();
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
    if (!pin.every((digit) => digit)) {
      Alert.alert('PIN Login', 'Enter your 4-digit PIN to continue.');
      return;
    }

    const enteredPin = pin.join('');

    try {
      setLoading(true);
      const storedHash = await SecureStore.getItemAsync(PIN_STORAGE_KEY);

      if (!storedHash) {
        setLoading(false);
        Alert.alert('PIN Login', 'No saved PIN found. Please set up your PIN first.');
        return;
      }

      const enteredHash = await Crypto.digestStringAsync(Crypto.CryptoDigestAlgorithm.SHA256, enteredPin);

      if (enteredHash !== storedHash) {
        setLoading(false);
        setPin(Array(PIN_LENGTH).fill(''));
        setShowErrorModal(true);
        return;
      }

      const sessionPayload = await SecureStore.getItemAsync(SESSION_KEY);
      if (!sessionPayload) {
        setLoading(false);
        Alert.alert('PIN Login', 'No saved session found. Please sign in with your email and password first.');
        return;
      }

      let session;
      try {
        session = JSON.parse(sessionPayload);
      } catch (parseError) {
        setLoading(false);
        Alert.alert('PIN Login', 'Saved session is invalid. Please sign in again.');
        return;
      }

      const { data, error } = await supabase.auth.setSession(session);

      setLoading(false);

      if (error || !data.session) {
        Alert.alert('PIN Login', error?.message || 'Unable to restore your session. Please sign in manually.');
        return;
      }

      setShowSuccessModal(true);
    } catch (error) {
      setLoading(false);
      Alert.alert('PIN Login', 'Unable to verify your PIN. Please try again.');
    }
  };

  const handleCloseSuccess = () => {
    setShowSuccessModal(false);
    router.replace('/(tabs)');
  };

  const handleCloseError = () => {
    setShowErrorModal(false);
    inputRefs.current[0]?.focus();
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

      <Modal
        visible={showErrorModal}
        transparent
        animationType="fade"
        onRequestClose={handleCloseError}>
        <View style={styles.modalOverlay}>
          <View style={styles.modalContent}>
            <View style={[styles.modalIconCircle, { backgroundColor: '#F44336' }]}>    
              <ThemedText style={styles.modalIconTick}>!</ThemedText>
            </View>
            <ThemedText style={styles.modalTitle}>Incorrect PIN</ThemedText>
            <ThemedText style={styles.modalMessage}>
              The PIN you entered is incorrect. Please try again.
            </ThemedText>
            <TouchableOpacity style={styles.modalPrimaryButton} onPress={handleCloseError}>
              <ThemedText style={styles.modalPrimaryButtonText}>Try Again</ThemedText>
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
