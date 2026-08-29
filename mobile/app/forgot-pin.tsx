import { useEffect, useRef, useState } from 'react';
import {
  Alert,
  KeyboardAvoidingView,
  Modal,
  Platform,
  ScrollView,
  StyleSheet,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';
import { NetpayLoadingAnimation } from '@/components/netpay-loading-animation';
import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { MaterialIcons } from '@expo/vector-icons';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { buildRouteHref } from '@/utils/router-href';
import * as Crypto from 'expo-crypto';
import * as SecureStore from 'expo-secure-store';
import { supabase } from '@/lib/supabase';

const PIN_LENGTH = 4;
const PIN_STORAGE_KEY = 'supabase_pin_hash';

type Step = 'password' | 'new' | 'confirm';

export default function ForgotPinScreen() {
  const router = useRouter();
  const { email: emailParam } = useLocalSearchParams<{ email?: string }>();
  const [step, setStep] = useState<Step>('password');
  const [email, setEmail] = useState('');
  const [needsEmail, setNeedsEmail] = useState(false);
  const [startedLoggedOut, setStartedLoggedOut] = useState(false);
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [newPin, setNewPin] = useState(Array(PIN_LENGTH).fill(''));
  const [confirmPin, setConfirmPin] = useState(Array(PIN_LENGTH).fill(''));
  const [userId, setUserId] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [showIncorrectPasswordModal, setShowIncorrectPasswordModal] = useState(false);
  const [showPinMismatchModal, setShowPinMismatchModal] = useState(false);
  const [showSuccessModal, setShowSuccessModal] = useState(false);

  const newPinRefs = [
    useRef<TextInput>(null),
    useRef<TextInput>(null),
    useRef<TextInput>(null),
    useRef<TextInput>(null),
  ];
  const confirmPinRefs = [
    useRef<TextInput>(null),
    useRef<TextInput>(null),
    useRef<TextInput>(null),
    useRef<TextInput>(null),
  ];

  useEffect(() => {
    const prefillEmail =
      typeof emailParam === 'string' && emailParam.trim()
        ? emailParam.trim().toLowerCase()
        : '';
    if (prefillEmail) {
      setEmail(prefillEmail);
    }
  }, [emailParam]);

  useEffect(() => {
    const loadSession = async () => {
      try {
        const { data: sessionData, error: sessionError } = await supabase.auth.getSession();
        if (sessionError) throw sessionError;

        const session = sessionData.session;
        if (!session) {
          setNeedsEmail(true);
          setStartedLoggedOut(true);
          setLoading(false);
          return;
        }

        setUserId(session.user.id);
        if (session.user.email) {
          setEmail(session.user.email.trim().toLowerCase());
        }

        const { data: profile, error: profileError } = await supabase
          .from('profiles')
          .select('pin_enabled')
          .eq('id', session.user.id)
          .maybeSingle();

        if (profileError) throw profileError;

        if (!profile?.pin_enabled) {
          Alert.alert(
            'Set Up PIN',
            'You do not have a PIN yet. Please create one first.',
            [{ text: 'OK', onPress: () => router.replace('/setup-pin') }],
          );
        }
      } catch (error) {
        console.error('Failed to load forgot PIN screen:', error);
        Alert.alert('Error', 'Unable to continue. Please try again.', [
          { text: 'OK', onPress: () => router.back() },
        ]);
      } finally {
        setLoading(false);
      }
    };

    loadSession();
  }, [router]);

  const handleVerifyPassword = async () => {
    const trimmedEmail = email.trim().toLowerCase();

    if (needsEmail && !trimmedEmail) {
      Alert.alert('Forgot PIN', 'Please enter your account email.');
      return;
    }

    if (!password.trim()) {
      Alert.alert('Forgot PIN', 'Please enter your account password.');
      return;
    }

    try {
      setSubmitting(true);

      let accountEmail = trimmedEmail;

      if (!needsEmail) {
        const {
          data: { session },
          error: sessionError,
        } = await supabase.auth.getSession();

        if (sessionError || !session?.user?.email) {
          Alert.alert('Forgot PIN', 'Your session has expired. Please log in again.');
          router.replace('/auth/login');
          return;
        }

        accountEmail = session.user.email.trim().toLowerCase();
      }

      const { data: signInData, error: verifyError } = await supabase.auth.signInWithPassword({
        email: accountEmail,
        password: password.trim(),
      });

      if (verifyError) {
        setShowIncorrectPasswordModal(true);
        return;
      }

      const signedInUser = signInData.user;
      if (!signedInUser) {
        Alert.alert('Forgot PIN', 'Unable to verify your account. Please try again.');
        return;
      }

      setUserId(signedInUser.id);
      setEmail(accountEmail);
      setNeedsEmail(false);

      const { data: profile, error: profileError } = await supabase
        .from('profiles')
        .select('pin_enabled')
        .eq('id', signedInUser.id)
        .maybeSingle();

      if (profileError) throw profileError;

      if (!profile?.pin_enabled) {
        Alert.alert(
          'Set Up PIN',
          'You do not have a transaction PIN yet. Set one up now.',
          [{ text: 'OK', onPress: () => router.replace('/setup-pin') }],
        );
        return;
      }

      setStep('new');
      setTimeout(() => newPinRefs[0].current?.focus(), 200);
    } catch (error) {
      Alert.alert('Forgot PIN', error instanceof Error ? error.message : 'An unexpected error occurred.');
    } finally {
      setSubmitting(false);
    }
  };

  const handlePinChange = (value: string, index: number, type: 'new' | 'confirm') => {
    if (value && !/^\d$/.test(value)) return;

    const pinArray = type === 'new' ? newPin : confirmPin;
    const setPin = type === 'new' ? setNewPin : setConfirmPin;
    const refs = type === 'new' ? newPinRefs : confirmPinRefs;

    const next = [...pinArray];
    next[index] = value;
    setPin(next);

    if (value && index < PIN_LENGTH - 1) {
      refs[index + 1].current?.focus();
    }

    if (type === 'new' && next.every((digit) => digit) && index === PIN_LENGTH - 1) {
      setTimeout(() => {
        setStep('confirm');
        confirmPinRefs[0].current?.focus();
      }, 200);
    }
  };

  const handleBackspace = (index: number, type: 'new' | 'confirm') => {
    const pinArray = type === 'new' ? newPin : confirmPin;
    const setPin = type === 'new' ? setNewPin : setConfirmPin;
    const refs = type === 'new' ? newPinRefs : confirmPinRefs;

    const next = [...pinArray];

    if (next[index]) {
      next[index] = '';
      setPin(next);
      return;
    }

    if (index > 0) {
      next[index - 1] = '';
      setPin(next);
      refs[index - 1].current?.focus();
    }
  };

  const handleResetPin = async () => {
    if (!userId || submitting) return;

    const newPinString = newPin.join('');
    const confirmPinString = confirmPin.join('');

    if (newPinString.length !== PIN_LENGTH) {
      Alert.alert('Forgot PIN', 'Please enter a new 4-digit PIN.');
      setStep('new');
      newPinRefs[0].current?.focus();
      return;
    }

    if (confirmPinString.length !== PIN_LENGTH) {
      Alert.alert('Forgot PIN', 'Please confirm your new PIN.');
      setStep('confirm');
      confirmPinRefs[0].current?.focus();
      return;
    }

    if (newPinString !== confirmPinString) {
      setShowPinMismatchModal(true);
      setConfirmPin(Array(PIN_LENGTH).fill(''));
      setStep('confirm');
      confirmPinRefs[0].current?.focus();
      return;
    }

    try {
      setSubmitting(true);

      const newHash = await Crypto.digestStringAsync(Crypto.CryptoDigestAlgorithm.SHA256, newPinString);

      const { error } = await supabase
        .from('profiles')
        .update({
          pin_hash: newHash,
          pin_enabled: true,
          updated_at: new Date().toISOString(),
        })
        .eq('id', userId);

      if (error) throw error;

      await SecureStore.setItemAsync(PIN_STORAGE_KEY, newHash);
      setShowSuccessModal(true);
    } catch (error) {
      console.error('Failed to reset PIN:', error);
      Alert.alert('Forgot PIN', error instanceof Error ? error.message : 'Failed to reset PIN. Please try again.');
    } finally {
      setSubmitting(false);
    }
  };

  const handleBack = () => {
    if (step === 'confirm') {
      setStep('new');
      setConfirmPin(Array(PIN_LENGTH).fill(''));
      setTimeout(() => newPinRefs[0].current?.focus(), 100);
    } else if (step === 'new') {
      setStep('password');
      setNewPin(Array(PIN_LENGTH).fill(''));
      setConfirmPin(Array(PIN_LENGTH).fill(''));
    } else {
      router.back();
    }
  };

  const renderPasswordStep = () => (
    <View style={styles.stepContainer}>
      <View style={styles.iconContainer}>
        <MaterialIcons name="vpn-key" size={56} color="#FF7F00" />
      </View>
      <ThemedText style={styles.stepTitle}>Verify your identity</ThemedText>
      <ThemedText style={styles.stepDescription}>
        {needsEmail
          ? 'Enter your email and login password to reset your transaction PIN.'
          : 'Enter your NetPay login password to reset your transaction PIN.'}
      </ThemedText>
      {needsEmail && (
        <View style={styles.passwordInputContainer}>
          <MaterialIcons name="email" size={20} color="#666" style={styles.passwordIcon} />
          <TextInput
            style={styles.passwordInput}
            placeholder="Email address"
            placeholderTextColor="#999"
            value={email}
            onChangeText={setEmail}
            keyboardType="email-address"
            autoCapitalize="none"
            autoCorrect={false}
            editable={!submitting}
          />
        </View>
      )}
      <View style={styles.passwordInputContainer}>
        <MaterialIcons name="lock" size={20} color="#666" style={styles.passwordIcon} />
        <TextInput
          style={styles.passwordInput}
          placeholder="Account password"
          placeholderTextColor="#999"
          value={password}
          onChangeText={setPassword}
          secureTextEntry={!showPassword}
          autoCapitalize="none"
          editable={!submitting}
        />
        <TouchableOpacity onPress={() => setShowPassword(!showPassword)} style={styles.eyeButton}>
          <MaterialIcons name={showPassword ? 'visibility' : 'visibility-off'} size={20} color="#666" />
        </TouchableOpacity>
      </View>
      <TouchableOpacity
        style={[styles.primaryButton, submitting && styles.primaryButtonDisabled]}
        onPress={handleVerifyPassword}
        disabled={submitting}
      >
        {submitting ? (
          <NetpayLoadingAnimation size={36} variant="onBrand" strokeWidth={2.5} />
        ) : (
          <ThemedText style={styles.primaryButtonText}>Continue</ThemedText>
        )}
      </TouchableOpacity>
      <TouchableOpacity
        style={styles.secondaryLink}
        onPress={() =>
          router.push(buildRouteHref('/forget-password', email.trim() ? { email: email.trim().toLowerCase() } : undefined))
        }
        activeOpacity={0.7}
      >
        <ThemedText style={styles.secondaryLinkText}>Forgot password instead?</ThemedText>
      </TouchableOpacity>
    </View>
  );

  const renderPinInputs = (
    digits: string[],
    refs: React.RefObject<TextInput | null>[],
    type: 'new' | 'confirm',
    title: string,
    description: string,
  ) => (
    <View style={styles.stepContainer}>
      <View style={styles.iconContainer}>
        <MaterialIcons name="lock-outline" size={56} color="#FF7F00" />
      </View>
      <ThemedText style={styles.stepTitle}>{title}</ThemedText>
      <ThemedText style={styles.stepDescription}>{description}</ThemedText>
      <View style={styles.pinContainer}>
        {digits.map((digit, index) => (
          <TextInput
            key={`${type}-${index}`}
            ref={refs[index]}
            style={[styles.pinInput, digit ? styles.pinInputFilled : styles.pinInputActive]}
            value={digit}
            onChangeText={(value) => handlePinChange(value, index, type)}
            onKeyPress={({ nativeEvent }) => {
              if (nativeEvent.key === 'Backspace') {
                handleBackspace(index, type);
              }
            }}
            keyboardType="number-pad"
            maxLength={1}
            secureTextEntry
            selectTextOnFocus
            editable={!submitting}
          />
        ))}
      </View>
      {type === 'confirm' && (
        <TouchableOpacity
          style={[
            styles.primaryButton,
            (!confirmPin.every((d) => d) || submitting) && styles.primaryButtonDisabled,
          ]}
          onPress={handleResetPin}
          disabled={submitting || !confirmPin.every((d) => d)}
        >
          {submitting ? (
            <NetpayLoadingAnimation size={36} variant="onBrand" strokeWidth={2.5} />
          ) : (
            <ThemedText style={styles.primaryButtonText}>Reset PIN</ThemedText>
          )}
        </TouchableOpacity>
      )}
    </View>
  );

  if (loading) {
    return (
      <ThemedView style={styles.loadingContainer}>
        <NetpayLoadingAnimation message="Loading…" />
      </ThemedView>
    );
  }

  const headerTitle =
    step === 'password' ? 'Forgot PIN' : step === 'new' ? 'New PIN' : 'Confirm PIN';

  return (
    <ThemedView style={styles.container}>
      <View style={styles.header}>
        <TouchableOpacity onPress={handleBack} style={styles.backButton}>
          <MaterialIcons name="arrow-back" size={24} color="#000" />
        </TouchableOpacity>
        <ThemedText style={styles.headerTitle}>{headerTitle}</ThemedText>
        <View style={styles.headerSpacer} />
      </View>

      <KeyboardAvoidingView
        style={styles.flex}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      >
        <ScrollView
          contentContainerStyle={styles.scrollContent}
          keyboardShouldPersistTaps="handled"
          showsVerticalScrollIndicator={false}
        >
          {step === 'password' && renderPasswordStep()}
          {step === 'new' &&
            renderPinInputs(
              newPin,
              newPinRefs,
              'new',
              'Create new PIN',
              'Choose a new 4-digit transaction PIN.',
            )}
          {step === 'confirm' &&
            renderPinInputs(
              confirmPin,
              confirmPinRefs,
              'confirm',
              'Confirm new PIN',
              'Re-enter your new PIN to confirm.',
            )}
        </ScrollView>
      </KeyboardAvoidingView>

      <Modal
        visible={showIncorrectPasswordModal}
        transparent
        animationType="fade"
        onRequestClose={() => setShowIncorrectPasswordModal(false)}
      >
        <View style={styles.modalOverlay}>
          <View style={styles.modalContent}>
            <View style={styles.modalIconError}>
              <MaterialIcons name="error-outline" size={40} color="#fff" />
            </View>
            <ThemedText style={styles.modalTitle}>Incorrect Password</ThemedText>
            <ThemedText style={styles.modalMessage}>
              The password you entered is incorrect. Please try again.
            </ThemedText>
            <TouchableOpacity
              style={styles.modalButton}
              onPress={() => setShowIncorrectPasswordModal(false)}
            >
              <ThemedText style={styles.modalButtonText}>Try Again</ThemedText>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>

      <Modal
        visible={showPinMismatchModal}
        transparent
        animationType="fade"
        onRequestClose={() => setShowPinMismatchModal(false)}
      >
        <View style={styles.modalOverlay}>
          <View style={styles.modalContent}>
            <View style={styles.modalIconWarning}>
              <MaterialIcons name="warning-amber" size={40} color="#fff" />
            </View>
            <ThemedText style={styles.modalTitle}>PIN Mismatch</ThemedText>
            <ThemedText style={styles.modalMessage}>
              Your PIN entries do not match. Please confirm your new PIN again.
            </ThemedText>
            <TouchableOpacity style={styles.modalButton} onPress={() => setShowPinMismatchModal(false)}>
              <ThemedText style={styles.modalButtonText}>Try Again</ThemedText>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>

      <Modal
        visible={showSuccessModal}
        transparent
        animationType="fade"
        onRequestClose={() => {
          setShowSuccessModal(false);
          router.replace(startedLoggedOut ? '/(tabs)' : '/security');
        }}
      >
        <View style={styles.modalOverlay}>
          <View style={styles.modalContent}>
            <View style={styles.modalIconSuccess}>
              <MaterialIcons name="check" size={40} color="#fff" />
            </View>
            <ThemedText style={styles.modalTitle}>PIN Reset!</ThemedText>
            <ThemedText style={styles.modalMessage}>
              Your transaction PIN has been reset successfully. Use your new PIN for transfers and sign-in.
            </ThemedText>
            <TouchableOpacity
              style={styles.modalButton}
              onPress={() => {
                setShowSuccessModal(false);
                router.replace(startedLoggedOut ? '/(tabs)' : '/security');
              }}
            >
              <ThemedText style={styles.modalButtonText}>Done</ThemedText>
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
  flex: {
    flex: 1,
  },
  loadingContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: '#fff',
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 20,
    paddingTop: Platform.OS === 'ios' ? 60 : 40,
    paddingBottom: 16,
    borderBottomWidth: 1,
    borderBottomColor: '#E0E0E0',
  },
  backButton: {
    padding: 8,
    marginLeft: -8,
  },
  headerTitle: {
    fontSize: 20,
    fontWeight: 'bold',
    color: '#000',
  },
  headerSpacer: {
    width: 40,
  },
  scrollContent: {
    flexGrow: 1,
    paddingHorizontal: 20,
    paddingTop: 32,
    paddingBottom: 40,
  },
  stepContainer: {
    alignItems: 'center',
    minHeight: 400,
  },
  iconContainer: {
    width: 100,
    height: 100,
    borderRadius: 50,
    backgroundColor: '#FFF3E0',
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 24,
  },
  stepTitle: {
    fontSize: 22,
    fontWeight: 'bold',
    color: '#000',
    marginBottom: 10,
    textAlign: 'center',
  },
  stepDescription: {
    fontSize: 15,
    color: '#666',
    textAlign: 'center',
    lineHeight: 22,
    marginBottom: 28,
    paddingHorizontal: 12,
  },
  passwordInputContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    width: '100%',
    maxWidth: 340,
    borderWidth: 1,
    borderColor: '#E0E0E0',
    borderRadius: 12,
    backgroundColor: '#F5F5F5',
    paddingHorizontal: 12,
    marginBottom: 24,
  },
  passwordIcon: {
    marginRight: 8,
  },
  passwordInput: {
    flex: 1,
    paddingVertical: 14,
    fontSize: 16,
    color: '#333',
  },
  eyeButton: {
    padding: 4,
  },
  pinContainer: {
    flexDirection: 'row',
    justifyContent: 'center',
    gap: 16,
    marginBottom: 28,
  },
  pinInput: {
    width: 60,
    height: 60,
    borderRadius: 12,
    borderWidth: 2,
    borderColor: '#E0E0E0',
    backgroundColor: '#F5F5F5',
    textAlign: 'center',
    fontSize: 24,
    fontWeight: 'bold',
    color: '#333',
  },
  pinInputActive: {
    borderColor: '#FF7F00',
    backgroundColor: '#FFF3E0',
  },
  pinInputFilled: {
    borderColor: '#FF7F00',
    backgroundColor: '#FFF3E0',
  },
  primaryButton: {
    backgroundColor: '#FF7F00',
    borderRadius: 12,
    width: '100%',
    maxWidth: 340,
    paddingVertical: 16,
    alignItems: 'center',
    marginTop: 8,
  },
  primaryButtonDisabled: {
    backgroundColor: '#CCC',
  },
  primaryButtonText: {
    fontSize: 17,
    fontWeight: 'bold',
    color: '#fff',
  },
  secondaryLink: {
    marginTop: 20,
    paddingVertical: 8,
  },
  secondaryLinkText: {
    fontSize: 15,
    color: '#FF7F00',
    fontWeight: '600',
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
    padding: 28,
    marginHorizontal: 32,
    alignItems: 'center',
    minWidth: 280,
  },
  modalIconError: {
    width: 72,
    height: 72,
    borderRadius: 36,
    backgroundColor: '#F44336',
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 20,
  },
  modalIconWarning: {
    width: 72,
    height: 72,
    borderRadius: 36,
    backgroundColor: '#FF7F00',
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 20,
  },
  modalIconSuccess: {
    width: 72,
    height: 72,
    borderRadius: 36,
    backgroundColor: '#4CAF50',
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 20,
  },
  modalTitle: {
    fontSize: 22,
    fontWeight: 'bold',
    color: '#333',
    marginBottom: 10,
    textAlign: 'center',
  },
  modalMessage: {
    fontSize: 15,
    color: '#666',
    textAlign: 'center',
    lineHeight: 22,
    marginBottom: 24,
  },
  modalButton: {
    backgroundColor: '#FF7F00',
    borderRadius: 12,
    paddingVertical: 14,
    paddingHorizontal: 40,
  },
  modalButtonText: {
    fontSize: 16,
    fontWeight: 'bold',
    color: '#fff',
  },
});
