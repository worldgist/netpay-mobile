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
import { ThemedView } from '@/components/themed-view';
import { ThemedText } from '@/components/themed-text';
import { useRouter } from 'expo-router';
import AsyncStorage from '@react-native-async-storage/async-storage';

const PIN_LENGTH = 4;
const PIN_STORAGE_KEY = '@netpay_pin';

export default function SetupPinScreen() {
  const router = useRouter();
  const [pin, setPin] = useState(Array(PIN_LENGTH).fill(''));
  const [confirmPin, setConfirmPin] = useState(Array(PIN_LENGTH).fill(''));
  const [showSuccessModal, setShowSuccessModal] = useState(false);

  const pinRefs = useRef<Array<TextInput | null>>([]);
  const confirmRefs = useRef<Array<TextInput | null>>([]);

  useEffect(() => {
    pinRefs.current[0]?.focus();
  }, []);

  const handlePinChange = (value: string, index: number, type: 'pin' | 'confirm') => {
    if (value && !/^\d$/.test(value)) return;

    const currentArray = type === 'pin' ? pin : confirmPin;
    const setArray = type === 'pin' ? setPin : setConfirmPin;
    const refs = type === 'pin' ? pinRefs.current : confirmRefs.current;

    const updated = [...currentArray];
    updated[index] = value;
    setArray(updated);

    if (value && index < PIN_LENGTH - 1) {
      refs[index + 1]?.focus();
    }
  };

  const handleBackspace = (index: number, type: 'pin' | 'confirm') => {
    const currentArray = type === 'pin' ? pin : confirmPin;
    const setArray = type === 'pin' ? setPin : setConfirmPin;
    const refs = type === 'pin' ? pinRefs.current : confirmRefs.current;

    const updated = [...currentArray];

    if (updated[index]) {
      updated[index] = '';
      setArray(updated);
      return;
    }

    if (index > 0) {
      updated[index - 1] = '';
      setArray(updated);
      refs[index - 1]?.focus();
    }
  };

  const handleContinue = async () => {
    if (!pin.every((digit) => digit)) {
      Alert.alert('Setup PIN', 'Please enter your new 4-digit PIN.');
      return;
    }

    if (!confirmPin.every((digit) => digit)) {
      Alert.alert('Setup PIN', 'Please confirm your PIN.');
      return;
    }

    const newPin = pin.join('');
    const confirm = confirmPin.join('');

    if (newPin !== confirm) {
      Alert.alert('Setup PIN', 'PINs do not match. Please try again.');
      setConfirmPin(Array(PIN_LENGTH).fill(''));
      confirmRefs.current[0]?.focus();
      return;
    }

    try {
      await AsyncStorage.setItem(PIN_STORAGE_KEY, newPin);
      setShowSuccessModal(true);
    } catch (error) {
      Alert.alert('Setup PIN', 'Failed to save your PIN. Please try again.');
    }
  };

  const handleSkipBiometric = () => {
    setShowSuccessModal(false);
    router.replace('/(tabs)');
  };

  const handleSetupBiometric = () => {
    setShowSuccessModal(false);
    router.push('/setup-biometric');
  };

  const renderInputs = (array: string[], refs: Array<TextInput | null>, label: string, type: 'pin' | 'confirm') => (
    <View style={styles.section}>
      <ThemedText style={styles.sectionTitle}>{label}</ThemedText>
      <View style={styles.inputRow}>
        {array.map((digit, index) => (
          <TextInput
            key={`${label}-${index}`}
            ref={(ref) => (refs[index] = ref)}
            style={styles.pinInput}
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
          />
        ))}
      </View>
    </View>
  );

  return (
    <KeyboardAvoidingView
      style={styles.container}
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
      <ScrollView contentContainerStyle={styles.scrollContent} showsVerticalScrollIndicator={false}>
        <ThemedView style={styles.card}>
          <View style={styles.header}>
            <ThemedText style={styles.title}>Set Up Your PIN</ThemedText>
            <ThemedText style={styles.subtitle}>
              Create a secure 4-digit PIN that you will use to authorize transactions and log in with your PIN.
            </ThemedText>
          </View>

          {renderInputs(pin, pinRefs.current, 'Enter New PIN', 'pin')}
          {renderInputs(confirmPin, confirmRefs.current, 'Confirm PIN', 'confirm')}

          <TouchableOpacity style={styles.continueButton} onPress={handleContinue}>
            <ThemedText style={styles.continueButtonText}>Save PIN</ThemedText>
          </TouchableOpacity>
        </ThemedView>
      </ScrollView>

      <Modal
        visible={showSuccessModal}
        transparent
        animationType="fade"
        onRequestClose={handleSkipBiometric}>
        <View style={styles.modalOverlay}>
          <View style={styles.modalContent}>
            <View style={styles.iconCircle}>
              <ThemedText style={styles.iconTick}>✓</ThemedText>
            </View>
            <ThemedText style={styles.modalTitle}>PIN Set Successfully</ThemedText>
            <ThemedText style={styles.modalMessage}>
              Your security PIN has been created. You can now use it to quickly access the app.
            </ThemedText>
            <View style={styles.modalButtonsRow}>
              <TouchableOpacity style={styles.modalPrimaryButton} onPress={handleSetupBiometric}>
                <ThemedText style={styles.modalPrimaryButtonText}>Set Up Biometric</ThemedText>
              </TouchableOpacity>
              <TouchableOpacity style={styles.modalSecondaryButton} onPress={handleSkipBiometric}>
                <ThemedText style={styles.modalSecondaryButtonText}>Maybe Later</ThemedText>
              </TouchableOpacity>
            </View>
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
    paddingHorizontal: 32,
    paddingVertical: 48,
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
    marginBottom: 32,
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
  section: {
    marginBottom: 32,
  },
  sectionTitle: {
    fontSize: 18,
    fontWeight: '600',
    color: '#333',
    marginBottom: 16,
    textAlign: 'center',
  },
  inputRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
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
  continueButton: {
    backgroundColor: '#FF7F00',
    borderRadius: 12,
    height: 56,
    alignItems: 'center',
    justifyContent: 'center',
  },
  continueButtonText: {
    fontSize: 16,
    color: '#fff',
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
  iconCircle: {
    width: 80,
    height: 80,
    borderRadius: 40,
    backgroundColor: '#4CAF50',
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 24,
  },
  iconTick: {
    fontSize: 42,
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
    fontSize: 16,
    color: '#666',
    textAlign: 'center',
    marginBottom: 28,
    lineHeight: 22,
  },
  modalButtonsRow: {
    width: '100%',
    gap: 12,
  },
  modalPrimaryButton: {
    backgroundColor: '#FF7F00',
    borderRadius: 12,
    paddingVertical: 14,
    alignItems: 'center',
  },
  modalPrimaryButtonText: {
    fontSize: 16,
    fontWeight: '600',
    color: '#fff',
  },
  modalSecondaryButton: {
    backgroundColor: '#F5F5F5',
    borderRadius: 12,
    paddingVertical: 14,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: '#E0E0E0',
  },
  modalSecondaryButtonText: {
    fontSize: 16,
    fontWeight: '600',
    color: '#333',
  },
});
