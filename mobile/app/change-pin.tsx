import { StyleSheet, View, TouchableOpacity, TextInput, Platform, Modal, Alert } from 'react-native';
import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { MaterialIcons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import { useState, useRef, useEffect } from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';

const PIN_STORAGE_KEY = '@netpay_pin';

export default function ChangePinScreen() {
  const router = useRouter();
  const [currentPin, setCurrentPin] = useState(['', '', '', '']);
  const [newPin, setNewPin] = useState(['', '', '', '']);
  const [confirmPin, setConfirmPin] = useState(['', '', '', '']);
  const [activeSection, setActiveSection] = useState<'current' | 'new' | 'confirm'>('current');
  const [showSuccessModal, setShowSuccessModal] = useState(false);
  const [showWrongPinModal, setShowWrongPinModal] = useState(false);

  // Refs for input fields
  const currentPinRefs = [useRef<TextInput>(null), useRef<TextInput>(null), useRef<TextInput>(null), useRef<TextInput>(null)];
  const newPinRefs = [useRef<TextInput>(null), useRef<TextInput>(null), useRef<TextInput>(null), useRef<TextInput>(null)];
  const confirmPinRefs = [useRef<TextInput>(null), useRef<TextInput>(null), useRef<TextInput>(null), useRef<TextInput>(null)];

  // Load stored PIN on mount
  useEffect(() => {
    const loadStoredPin = async () => {
      try {
        const storedPin = await AsyncStorage.getItem(PIN_STORAGE_KEY);
        if (!storedPin) {
          // If no PIN exists, set a default one (for first-time setup)
          await AsyncStorage.setItem(PIN_STORAGE_KEY, '0000');
        }
      } catch (error) {
        console.error('Error loading PIN:', error);
      }
    };
    loadStoredPin();
  }, []);

  const handlePinChange = (value: string, index: number, type: 'current' | 'new' | 'confirm') => {
    // Only allow digits
    if (value && !/^\d$/.test(value)) return;

    const pinArray = type === 'current' ? currentPin : type === 'new' ? newPin : confirmPin;
    const setPin = type === 'current' ? setCurrentPin : type === 'new' ? setNewPin : setConfirmPin;
    const refs = type === 'current' ? currentPinRefs : type === 'new' ? newPinRefs : confirmPinRefs;

    const newPinArray = [...pinArray];
    newPinArray[index] = value;
    setPin(newPinArray);

    // Auto-focus next input
    if (value && index < 3) {
      refs[index + 1].current?.focus();
    }

    // Auto-advance to next section when current PIN is complete
    if (type === 'current' && newPinArray.every(digit => digit !== '') && index === 3) {
      setTimeout(() => {
        setActiveSection('new');
        newPinRefs[0].current?.focus();
      }, 100);
    }

    // Auto-advance to confirm section when new PIN is complete
    if (type === 'new' && newPinArray.every(digit => digit !== '') && index === 3) {
      setTimeout(() => {
        setActiveSection('confirm');
        confirmPinRefs[0].current?.focus();
      }, 100);
    }
  };

  const handleBackspace = (index: number, type: 'current' | 'new' | 'confirm') => {
    const pinArray = type === 'current' ? currentPin : type === 'new' ? newPin : confirmPin;
    const setPin = type === 'current' ? setCurrentPin : type === 'new' ? setNewPin : setConfirmPin;
    const refs = type === 'current' ? currentPinRefs : type === 'new' ? newPinRefs : confirmPinRefs;

    const newPinArray = [...pinArray];
    
    if (newPinArray[index]) {
      // Clear current digit
      newPinArray[index] = '';
    } else if (index > 0) {
      // Move to previous input and clear it
      newPinArray[index - 1] = '';
      refs[index - 1].current?.focus();
    }
    
    setPin(newPinArray);
  };

  const handleChangePin = async () => {
    // Validate current PIN
    const currentPinString = currentPin.join('');
    if (currentPinString.length !== 4) {
      Alert.alert('Error', 'Please enter your current PIN');
      setActiveSection('current');
      currentPinRefs[0].current?.focus();
      return;
    }

    // Check if current PIN is correct
    try {
      const storedPin = await AsyncStorage.getItem(PIN_STORAGE_KEY);
      if (currentPinString !== storedPin) {
        setShowWrongPinModal(true);
        setCurrentPin(['', '', '', '']);
        setActiveSection('current');
        return;
      }
    } catch (error) {
      Alert.alert('Error', 'Failed to verify PIN');
      return;
    }

    // Validate new PIN
    const newPinString = newPin.join('');
    if (newPinString.length !== 4) {
      Alert.alert('Error', 'Please enter a new 4-digit PIN');
      setActiveSection('new');
      newPinRefs[0].current?.focus();
      return;
    }

    // Check if new PIN is different from current PIN
    if (newPinString === currentPinString) {
      Alert.alert('Error', 'New PIN must be different from current PIN');
      setNewPin(['', '', '', '']);
      setActiveSection('new');
      newPinRefs[0].current?.focus();
      return;
    }

    // Validate confirm PIN
    const confirmPinString = confirmPin.join('');
    if (confirmPinString.length !== 4) {
      Alert.alert('Error', 'Please confirm your new PIN');
      setActiveSection('confirm');
      confirmPinRefs[0].current?.focus();
      return;
    }

    // Check if new PIN and confirm PIN match
    if (newPinString !== confirmPinString) {
      Alert.alert('Error', 'New PIN and confirm PIN do not match');
      setConfirmPin(['', '', '', '']);
      setActiveSection('confirm');
      confirmPinRefs[0].current?.focus();
      return;
    }

    // Save new PIN
    try {
      await AsyncStorage.setItem(PIN_STORAGE_KEY, newPinString);
      setShowSuccessModal(true);
    } catch (error) {
      Alert.alert('Error', 'Failed to save new PIN');
    }
  };

  const handleCloseSuccessModal = () => {
    setShowSuccessModal(false);
    router.back();
  };

  const handleCloseWrongPinModal = () => {
    setShowWrongPinModal(false);
    setCurrentPin(['', '', '', '']);
    setActiveSection('current');
    setTimeout(() => {
      currentPinRefs[0].current?.focus();
    }, 100);
  };

  const renderPinInputs = (pin: string[], refs: React.RefObject<TextInput>[], type: 'current' | 'new' | 'confirm') => {
    const isActive = activeSection === type;
    const label = type === 'current' ? 'Current PIN' : type === 'new' ? 'New PIN' : 'Confirm New PIN';

    return (
      <View style={styles.pinSection}>
        <ThemedText style={styles.pinLabel}>{label}</ThemedText>
        <View style={styles.pinContainer}>
          {pin.map((digit, index) => (
            <TextInput
              key={index}
              ref={refs[index]}
              style={[
                styles.pinInput,
                isActive && digit && styles.pinInputFilled,
                isActive && !digit && styles.pinInputActive,
              ]}
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
  };

  return (
    <ThemedView style={styles.container}>
      <View style={styles.header}>
        <TouchableOpacity onPress={() => router.back()} style={styles.backButton}>
          <MaterialIcons name="arrow-back" size={24} color="#000" />
        </TouchableOpacity>
        <ThemedText style={styles.headerTitle}>Change PIN</ThemedText>
        <View style={styles.placeholder} />
      </View>

      <View style={styles.content}>
        <ThemedText style={styles.description}>
          Enter your current PIN and create a new 4-digit PIN
        </ThemedText>

        {renderPinInputs(currentPin, currentPinRefs, 'current')}
        {renderPinInputs(newPin, newPinRefs, 'new')}
        {renderPinInputs(confirmPin, confirmPinRefs, 'confirm')}

        <TouchableOpacity 
          style={[
            styles.changeButton,
            (!currentPin.every(d => d) || !newPin.every(d => d) || !confirmPin.every(d => d)) && styles.changeButtonDisabled
          ]} 
          onPress={handleChangePin}
          disabled={!currentPin.every(d => d) || !newPin.every(d => d) || !confirmPin.every(d => d)}>
          <ThemedText style={styles.changeButtonText}>Change PIN</ThemedText>
        </TouchableOpacity>
      </View>

      {/* Success Modal */}
      <Modal
        visible={showSuccessModal}
        transparent={true}
        animationType="fade"
        onRequestClose={handleCloseSuccessModal}>
        <View style={styles.modalOverlay}>
          <View style={styles.modalContent}>
            <View style={styles.successIconContainer}>
              <View style={styles.successIconCircle}>
                <MaterialIcons name="check" size={48} color="#fff" />
              </View>
            </View>
            <ThemedText style={styles.modalTitle}>PIN Changed!</ThemedText>
            <ThemedText style={styles.modalMessage}>
              Your PIN has been changed successfully
            </ThemedText>
            <TouchableOpacity style={styles.modalButton} onPress={handleCloseSuccessModal}>
              <ThemedText style={styles.modalButtonText}>OK</ThemedText>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>

      {/* Wrong PIN Modal */}
      <Modal
        visible={showWrongPinModal}
        transparent={true}
        animationType="fade"
        onRequestClose={handleCloseWrongPinModal}>
        <View style={styles.modalOverlay}>
          <View style={styles.modalContent}>
            <View style={styles.errorIconContainer}>
              <View style={styles.errorIconCircle}>
                <MaterialIcons name="close" size={48} color="#fff" />
              </View>
            </View>
            <ThemedText style={styles.modalTitle}>Wrong PIN</ThemedText>
            <ThemedText style={styles.modalMessage}>
              The current PIN you entered is incorrect. Please try again.
            </ThemedText>
            <TouchableOpacity style={styles.modalButton} onPress={handleCloseWrongPinModal}>
              <ThemedText style={styles.modalButtonText}>Try Again</ThemedText>
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
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 20,
    paddingTop: Platform.OS === 'ios' ? 60 : 40,
    paddingBottom: 20,
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
  placeholder: {
    width: 40,
  },
  content: {
    flex: 1,
    paddingHorizontal: 20,
    paddingTop: 32,
  },
  description: {
    fontSize: 16,
    color: '#666',
    textAlign: 'center',
    marginBottom: 40,
    lineHeight: 22,
  },
  pinSection: {
    marginBottom: 32,
  },
  pinLabel: {
    fontSize: 16,
    fontWeight: '600',
    color: '#333',
    marginBottom: 16,
    textAlign: 'center',
  },
  pinContainer: {
    flexDirection: 'row',
    justifyContent: 'center',
    gap: 12,
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
  changeButton: {
    backgroundColor: '#FF7F00',
    borderRadius: 12,
    paddingVertical: 16,
    alignItems: 'center',
    marginTop: 20,
    shadowColor: '#FF7F00',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.3,
    shadowRadius: 8,
    elevation: 5,
  },
  changeButtonDisabled: {
    backgroundColor: '#CCCCCC',
    shadowOpacity: 0,
    elevation: 0,
  },
  changeButtonText: {
    fontSize: 18,
    fontWeight: 'bold',
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
    padding: 32,
    marginHorizontal: 40,
    alignItems: 'center',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.3,
    shadowRadius: 8,
    elevation: 8,
    minWidth: 280,
  },
  successIconContainer: {
    marginBottom: 24,
  },
  successIconCircle: {
    width: 80,
    height: 80,
    borderRadius: 40,
    backgroundColor: '#4CAF50',
    justifyContent: 'center',
    alignItems: 'center',
    shadowColor: '#4CAF50',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.3,
    shadowRadius: 8,
    elevation: 8,
  },
  errorIconContainer: {
    marginBottom: 24,
  },
  errorIconCircle: {
    width: 80,
    height: 80,
    borderRadius: 40,
    backgroundColor: '#F44336',
    justifyContent: 'center',
    alignItems: 'center',
    shadowColor: '#F44336',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.3,
    shadowRadius: 8,
    elevation: 8,
  },
  modalTitle: {
    fontSize: 24,
    fontWeight: 'bold',
    color: '#333',
    marginBottom: 12,
    textAlign: 'center',
  },
  modalMessage: {
    fontSize: 16,
    color: '#666',
    textAlign: 'center',
    marginBottom: 32,
    lineHeight: 22,
  },
  modalButton: {
    backgroundColor: '#FF7F00',
    borderRadius: 12,
    paddingVertical: 14,
    paddingHorizontal: 48,
    minWidth: 120,
    alignItems: 'center',
  },
  modalButtonText: {
    fontSize: 16,
    fontWeight: 'bold',
    color: '#fff',
  },
});

