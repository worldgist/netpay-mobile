import { StyleSheet, View, TouchableOpacity, TextInput, Platform, Modal, Alert, ActivityIndicator, ScrollView } from 'react-native';
import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { MaterialIcons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import { useState, useRef, useEffect } from 'react';
import * as Crypto from 'expo-crypto';
import { supabase } from '@/lib/supabase';

const PIN_LENGTH = 4;

export default function ChangePinScreen() {
  const router = useRouter();
  const [userId, setUserId] = useState<string | null>(null);
  const [currentPin, setCurrentPin] = useState(Array(PIN_LENGTH).fill(''));
  const [newPin, setNewPin] = useState(Array(PIN_LENGTH).fill(''));
  const [confirmPin, setConfirmPin] = useState(Array(PIN_LENGTH).fill(''));
  const [activeSection, setActiveSection] = useState<'current' | 'new' | 'confirm'>('current');
  const [showSuccessModal, setShowSuccessModal] = useState(false);
  const [showWrongPinModal, setShowWrongPinModal] = useState(false);
  const [loading, setLoading] = useState(true);
  const [updating, setUpdating] = useState(false);

  const currentPinRefs = Array.from({ length: PIN_LENGTH }, () => useRef<TextInput>(null));
  const newPinRefs = Array.from({ length: PIN_LENGTH }, () => useRef<TextInput>(null));
  const confirmPinRefs = Array.from({ length: PIN_LENGTH }, () => useRef<TextInput>(null));

  useEffect(() => {
    const loadPinState = async () => {
      try {
        const { data: sessionData, error: sessionError } = await supabase.auth.getSession();
        if (sessionError) throw sessionError;

        const session = sessionData.session;
        if (!session) {
          router.replace('/auth/login');
          return;
        }

        setUserId(session.user.id);

        const { data: profile, error: profileError } = await supabase
          .from('profiles')
          .select('pin_hash')
          .eq('id', session.user.id)
          .maybeSingle();

        if (profileError) throw profileError;

        if (!profile?.pin_hash) {
          Alert.alert(
            'Set Up PIN',
            'You do not have a PIN yet. Please create one first.',
            [
              {
                text: 'Set Up PIN',
                onPress: () => router.replace('/setup-pin'),
              },
            ],
          );
        }
      } catch (error) {
        console.error('Failed to load PIN info:', error);
        Alert.alert(
          'Unable to load PIN',
          error instanceof Error ? error.message : 'Please try again later.',
          [{ text: 'OK', onPress: () => router.back() }],
        );
      } finally {
        setLoading(false);
      }
    };

    loadPinState();
  }, [router]);

  const handlePinChange = (value: string, index: number, type: 'current' | 'new' | 'confirm') => {
    if (value && !/^\d$/.test(value)) return;

    const pinArray = type === 'current' ? currentPin : type === 'new' ? newPin : confirmPin;
    const setPin = type === 'current' ? setCurrentPin : type === 'new' ? setNewPin : setConfirmPin;
    const refs = type === 'current' ? currentPinRefs : type === 'new' ? newPinRefs : confirmPinRefs;

    const next = [...pinArray];
    next[index] = value;
    setPin(next);

    if (value && index < PIN_LENGTH - 1) {
      refs[index + 1].current?.focus();
    }

    if (type === 'current' && next.every((digit) => digit) && index === PIN_LENGTH - 1) {
      setTimeout(() => {
        setActiveSection('new');
        newPinRefs[0].current?.focus();
      }, 100);
    }

    if (type === 'new' && next.every((digit) => digit) && index === PIN_LENGTH - 1) {
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

  const handleChangePin = async () => {
    if (loading || updating) return;

    if (!userId) {
      Alert.alert('Change PIN', 'Please sign in again to change your PIN.');
      return;
    }

    const currentPinString = currentPin.join('');
    if (currentPinString.length !== PIN_LENGTH) {
      Alert.alert('Error', 'Please enter your current PIN');
      setActiveSection('current');
      currentPinRefs[0].current?.focus();
      return;
    }

    try {
      setUpdating(true);

      const { data: profile, error: profileError } = await supabase
        .from('profiles')
        .select('pin_hash')
        .eq('id', userId)
        .maybeSingle();

      if (profileError) throw profileError;

      const storedHash = profile?.pin_hash || '';
      const currentHash = await Crypto.digestStringAsync(
        Crypto.CryptoDigestAlgorithm.SHA256,
        currentPinString,
      );

      if (!storedHash || storedHash !== currentHash) {
        setShowWrongPinModal(true);
        setCurrentPin(Array(PIN_LENGTH).fill(''));
        setActiveSection('current');
        setUpdating(false);
        return;
      }
    } catch (error) {
      console.error('Failed to verify PIN:', error);
      setUpdating(false);
      Alert.alert('Error', 'Failed to verify PIN. Please try again.');
      return;
    }

    const newPinString = newPin.join('');
    if (newPinString.length !== PIN_LENGTH) {
      Alert.alert('Error', 'Please enter a new 4-digit PIN');
      setActiveSection('new');
      newPinRefs[0].current?.focus();
      setUpdating(false);
      return;
    }

    if (newPinString === currentPinString) {
      Alert.alert('Error', 'New PIN must be different from current PIN');
      setNewPin(Array(PIN_LENGTH).fill(''));
      setActiveSection('new');
      newPinRefs[0].current?.focus();
      setUpdating(false);
      return;
    }

    const confirmPinString = confirmPin.join('');
    if (confirmPinString.length !== PIN_LENGTH) {
      Alert.alert('Error', 'Please confirm your new PIN');
      setActiveSection('confirm');
      confirmPinRefs[0].current?.focus();
      setUpdating(false);
      return;
    }

    if (newPinString !== confirmPinString) {
      Alert.alert('Error', 'New PIN and confirm PIN do not match');
      setConfirmPin(Array(PIN_LENGTH).fill(''));
      setActiveSection('confirm');
      confirmPinRefs[0].current?.focus();
      setUpdating(false);
      return;
    }

    try {
      const newHash = await Crypto.digestStringAsync(
        Crypto.CryptoDigestAlgorithm.SHA256,
        newPinString,
      );

      const { error } = await supabase
        .from('profiles')
        .update({
          pin_hash: newHash,
          pin_enabled: true,
          updated_at: new Date().toISOString(),
        })
        .eq('id', userId);

      if (error) throw error;

      setShowSuccessModal(true);
      setNewPin(Array(PIN_LENGTH).fill(''));
      setConfirmPin(Array(PIN_LENGTH).fill(''));
      setCurrentPin(Array(PIN_LENGTH).fill(''));
      setActiveSection('current');
    } catch (error) {
      console.error('Failed to save new PIN:', error);
      Alert.alert('Error', error instanceof Error ? error.message : 'Failed to save new PIN');
    } finally {
      setUpdating(false);
    }
  };

  const handleCloseSuccessModal = () => {
    setShowSuccessModal(false);
    router.back();
  };

  const handleCloseWrongPinModal = () => {
    setShowWrongPinModal(false);
    setCurrentPin(Array(PIN_LENGTH).fill(''));
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
              editable={!loading && !updating}
            />
          ))}
        </View>
      </View>
    );
  };

  if (loading) {
    return (
      <ThemedView style={styles.loadingContainer}>
        <ActivityIndicator color="#FF7F00" size="large" />
      </ThemedView>
    );
  }

  return (
    <ThemedView style={styles.container}>
      <View style={styles.header}>
        <TouchableOpacity onPress={() => router.back()} style={styles.backButton}>
          <MaterialIcons name="arrow-back" size={24} color="#000" />
        </TouchableOpacity>
        <ThemedText style={styles.headerTitle}>Change PIN</ThemedText>
        <View style={styles.placeholder} />
      </View>

      <ScrollView
        style={styles.scrollView}
        contentContainerStyle={styles.scrollContent}
        showsVerticalScrollIndicator={false}
        keyboardShouldPersistTaps="handled"
      >
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
              ((!currentPin.every((digit) => digit) || !newPin.every((digit) => digit) || !confirmPin.every((digit) => digit)) || updating) && styles.changeButtonDisabled,
            ]}
            onPress={handleChangePin}
            disabled={
              updating ||
              !currentPin.every((digit) => digit) ||
              !newPin.every((digit) => digit) ||
              !confirmPin.every((digit) => digit)
            }
          >
            {updating ? (
              <ActivityIndicator color="#fff" />
            ) : (
              <ThemedText style={styles.changeButtonText}>Change PIN</ThemedText>
            )}
          </TouchableOpacity>
        </View>
      </ScrollView>

      <Modal
        visible={showSuccessModal}
        transparent={true}
        animationType="fade"
        onRequestClose={handleCloseSuccessModal}
      >
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

      <Modal
        visible={showWrongPinModal}
        transparent={true}
        animationType="fade"
        onRequestClose={handleCloseWrongPinModal}
      >
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
  scrollView: {
    flex: 1,
  },
  scrollContent: {
    paddingHorizontal: 20,
    paddingTop: 32,
    paddingBottom: 48,
  },
  content: {
    flex: 1,
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

