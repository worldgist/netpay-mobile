import { useEffect, useState } from 'react';
import {
  StyleSheet,
  View,
  TouchableOpacity,
  KeyboardAvoidingView,
  Platform,
  ScrollView,
  Modal,
  Alert,
} from 'react-native';
import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { MaterialIcons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import * as LocalAuthentication from 'expo-local-authentication';

const getBiometricLabel = (type: LocalAuthentication.AuthenticationType) => {
  switch (type) {
    case LocalAuthentication.AuthenticationType.FINGERPRINT:
      return 'Fingerprint';
    case LocalAuthentication.AuthenticationType.FACIAL_RECOGNITION:
      return 'Face ID';
    case LocalAuthentication.AuthenticationType.IRIS:
      return 'Iris';
    default:
      return 'Biometric';
  }
};

export default function SetupBiometricScreen() {
  const router = useRouter();
  const [showSuccessModal, setShowSuccessModal] = useState(false);
  const [biometricSupported, setBiometricSupported] = useState(false);
  const [biometricTypes, setBiometricTypes] = useState<LocalAuthentication.AuthenticationType[]>([]);

  useEffect(() => {
    const checkHardware = async () => {
      const hasHardware = await LocalAuthentication.hasHardwareAsync();
      const isEnrolled = await LocalAuthentication.isEnrolledAsync();
      const supportedTypes = await LocalAuthentication.supportedAuthenticationTypesAsync();
      setBiometricSupported(hasHardware && supportedTypes.length > 0);
      setBiometricTypes(supportedTypes);

      if (!isEnrolled && hasHardware) {
        Alert.alert(
          'Biometric Not Found',
          'Please register a fingerprint or face ID in your device settings before enabling biometric login.'
        );
      }
    };

    checkHardware();
  }, []);

  const handleEnableBiometric = () => {
    if (!biometricSupported) {
      Alert.alert(
        'Not Available',
        'Biometric authentication is not available on this device. You can continue using your PIN.'
      );
      return;
    }

    LocalAuthentication.authenticateAsync({
      promptMessage: 'Enable biometric login',
      cancelLabel: 'Cancel',
    }).then((result) => {
      if (result.success) {
        setShowSuccessModal(true);
      } else {
        Alert.alert('Biometric Setup', result.error || 'Biometric authentication was cancelled.');
      }
    });
  };

  const handleSkip = () => {
    router.replace('/(tabs)');
  };

  const handleCloseModal = () => {
    setShowSuccessModal(false);
    router.replace('/(tabs)');
  };

  return (
    <KeyboardAvoidingView
      style={styles.container}
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
      <ScrollView contentContainerStyle={styles.scrollContent} showsVerticalScrollIndicator={false}>
        <ThemedView style={styles.card}>
          <View style={styles.iconCircle}>
            <MaterialIcons name="fingerprint" size={42} color="#FF7F00" />
          </View>

          <ThemedText style={styles.title} numberOfLines={2} ellipsizeMode="tail">
            Enable Biometric Login
          </ThemedText>
          <ThemedText style={styles.subtitle} numberOfLines={3} ellipsizeMode="tail">
            Use your fingerprint or face ID for quick and secure access to your NetPay account.
          </ThemedText>

          <View style={styles.benefitsList}>
            <View style={styles.benefitItem}>
              <MaterialIcons name="check-circle" size={20} color="#4CAF50" />
              <ThemedText style={styles.benefitText}>Faster login without entering your PIN</ThemedText>
            </View>
            <View style={styles.benefitItem}>
              <MaterialIcons name="check-circle" size={20} color="#4CAF50" />
              <ThemedText style={styles.benefitText}>Enhanced security with device-level authentication</ThemedText>
            </View>
            <View style={styles.benefitItem}>
              <MaterialIcons name="check-circle" size={20} color="#4CAF50" />
              <ThemedText style={styles.benefitText}>You can disable biometric login anytime in settings</ThemedText>
            </View>
            {biometricTypes.length > 0 && (
              <View style={styles.benefitItem}>
                <MaterialIcons name="check-circle" size={20} color="#4CAF50" />
                <ThemedText style={styles.benefitText}>
                  Supported on this device: {biometricTypes.map((type) => getBiometricLabel(type)).join(', ')}
                </ThemedText>
              </View>
            )}
          </View>

          <TouchableOpacity style={styles.enableButton} onPress={handleEnableBiometric}>
            <View style={styles.buttonTextContainer}>
              <ThemedText style={styles.enableButtonText} numberOfLines={1}>
                Enable Biometric Login
              </ThemedText>
            </View>
          </TouchableOpacity>

          <TouchableOpacity style={styles.skipButton} onPress={handleSkip}>
            <ThemedText style={styles.skipButtonText}>Skip for Now</ThemedText>
          </TouchableOpacity>
        </ThemedView>
      </ScrollView>

      <Modal visible={showSuccessModal} transparent animationType="fade" onRequestClose={handleCloseModal}>
        <View style={styles.modalOverlay}>
          <View style={styles.modalContent}>
            <View style={styles.successIconCircle}>
              <MaterialIcons name="fingerprint" size={40} color="#fff" />
            </View>
            <ThemedText style={styles.modalTitle} numberOfLines={2} ellipsizeMode="tail">
              Biometric Enabled
            </ThemedText>
            <ThemedText style={styles.modalMessage}>
              You can now use biometric authentication the next time you log in.
            </ThemedText>
            <TouchableOpacity style={styles.modalButton} onPress={handleCloseModal}>
              <ThemedText style={styles.modalButtonText}>Finish</ThemedText>
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
    paddingHorizontal: Platform.OS === 'ios' ? 24 : 32,
    paddingTop: Platform.OS === 'ios' ? 56 : 48,
    paddingBottom: 48,
    backgroundColor: '#fff',
    borderRadius: 20,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 0.08,
    shadowRadius: 12,
    elevation: 6,
    alignItems: 'center',
  },
  iconCircle: {
    width: 90,
    height: 90,
    borderRadius: 45,
    backgroundColor: '#FFF3E0',
    borderWidth: 1,
    borderColor: '#FF7F00',
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 28,
    paddingTop: Platform.OS === 'ios' ? 4 : 0,
    paddingBottom: Platform.OS === 'ios' ? 4 : 0,
  },
  title: {
    fontSize: Platform.OS === 'ios' ? 28 : 32,
    fontWeight: 'bold',
    color: '#333',
    marginBottom: 12,
    textAlign: 'center',
    includeFontPadding: true,
    width: '100%',
    flexShrink: 1,
    paddingHorizontal: 4,
    paddingTop: Platform.OS === 'ios' ? 8 : 0,
    paddingBottom: Platform.OS === 'ios' ? 8 : 0,
    lineHeight: Platform.OS === 'ios' ? 38 : 40,
    overflow: 'visible',
  },
  subtitle: {
    fontSize: 16,
    color: '#666',
    textAlign: 'center',
    lineHeight: 22,
    marginBottom: 28,
    width: '100%',
    paddingHorizontal: 4,
  },
  benefitsList: {
    width: '100%',
    marginBottom: 32,
    gap: 16,
  },
  benefitItem: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  benefitText: {
    fontSize: 16,
    color: '#444',
    lineHeight: 22,
    flex: 1,
  },
  enableButton: {
    backgroundColor: '#FF7F00',
    borderRadius: 12,
    minHeight: 56,
    paddingVertical: 16,
    paddingHorizontal: 24,
    alignItems: 'center',
    justifyContent: 'center',
    width: '100%',
    marginBottom: 16,
  },
  buttonTextContainer: {
    width: '100%',
    alignItems: 'center',
    justifyContent: 'center',
  },
  enableButtonText: {
    fontSize: 16,
    fontWeight: '600',
    color: '#fff',
    textAlign: 'center',
    includeFontPadding: false,
  },
  skipButton: {
    alignItems: 'center',
  },
  skipButtonText: {
    fontSize: 16,
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
    paddingHorizontal: 32,
    paddingVertical: 40,
    width: '80%',
    maxWidth: 360,
    alignItems: 'center',
  },
  successIconCircle: {
    width: 80,
    height: 80,
    borderRadius: 40,
    backgroundColor: '#4CAF50',
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 24,
  },
  modalTitle: {
    fontSize: Platform.OS === 'ios' ? 20 : 22,
    fontWeight: 'bold',
    color: '#333',
    marginBottom: 12,
    textAlign: 'center',
    includeFontPadding: true,
    paddingTop: Platform.OS === 'ios' ? 4 : 0,
    paddingBottom: Platform.OS === 'ios' ? 4 : 0,
    lineHeight: Platform.OS === 'ios' ? 28 : 30,
    overflow: 'visible',
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
