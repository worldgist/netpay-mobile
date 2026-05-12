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
import { useRouter, useLocalSearchParams } from 'expo-router';
import * as LocalAuthentication from 'expo-local-authentication';
import { supabase } from '@/lib/supabase';
import { registerForPushNotifications } from '@/utils/push-notifications';
import { markDeviceWelcomeSetupComplete } from '@/utils/device-welcome';

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
  const { from } = useLocalSearchParams<{ from?: string }>();
  const isNewDevice = from === 'new_device';
  const [showSuccessModal, setShowSuccessModal] = useState(false);
  const [showNotificationModal, setShowNotificationModal] = useState(false);
  const [biometricSupported, setBiometricSupported] = useState(false);
  const [biometricTypes, setBiometricTypes] = useState<LocalAuthentication.AuthenticationType[]>([]);
  const [isDemoUser, setIsDemoUser] = useState(false);
  const [registeringNotifications, setRegisteringNotifications] = useState(false);

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

    const checkDemoUser = async () => {
      const { data: { user } } = await supabase.auth.getUser();
      if (user?.email === 'demo@netpayy.ng') {
        setIsDemoUser(true);
      }
    };

    checkHardware();
    checkDemoUser();
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
    }).then(async (result) => {
      if (result.success) {
        // Update biometric_enabled in database
        try {
          const { data: { user } } = await supabase.auth.getUser();
          if (user) {
            await supabase
              .from('profiles')
              .update({ biometric_enabled: true })
              .eq('id', user.id);
          }
        } catch (error) {
          console.error('Failed to update biometric setting:', error);
        }
        setShowSuccessModal(true);
      } else {
        Alert.alert('Biometric Setup', result.error || 'Biometric authentication was cancelled.');
      }
    });
  };

  const handleSkip = () => {
    // After signup flow, show notification prompt before home.
    setShowNotificationModal(true);
  };

  const handleCloseModal = () => {
    setShowSuccessModal(false);
    // Show notification prompt after biometric setup
    setShowNotificationModal(true);
  };

  const goHome = async () => {
    try {
      const { data: { user } } = await supabase.auth.getUser();
      await markDeviceWelcomeSetupComplete(user?.id);
    } catch (e) {
      console.warn('markDeviceWelcomeSetupComplete:', e);
    }
    router.replace('/(tabs)');
  };

  const handleEnableNotifications = async () => {
    setRegisteringNotifications(true);
    try {
      const result = await registerForPushNotifications();
      if (result.registered) {
        console.log('Push notifications enabled successfully');
        setShowNotificationModal(false);
        await goHome();
      } else {
        Alert.alert(
          'Notifications',
          result.reason || 'Failed to enable notifications. You can enable them later in settings.',
          [
            {
              text: 'OK',
              onPress: async () => {
                setShowNotificationModal(false);
                await goHome();
              },
            },
          ]
        );
      }
    } catch (error) {
      console.error('Error enabling notifications:', error);
      Alert.alert(
        'Notifications',
        'Failed to enable notifications. You can enable them later in settings.',
        [
          {
            text: 'OK',
            onPress: async () => {
              setShowNotificationModal(false);
              await goHome();
            },
          },
        ]
      );
    } finally {
      setRegisteringNotifications(false);
    }
  };

  const handleSkipNotifications = async () => {
    setShowNotificationModal(false);
    await goHome();
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
          <ThemedText style={styles.subtitle} numberOfLines={4} ellipsizeMode="tail">
            {isNewDevice
              ? 'This looks like a new device. Set up quick login and notifications to stay secure and informed.'
              : 'Use your fingerprint or face ID for quick and secure access to your NetPay account.'}
          </ThemedText>

          {/* Demo User Banner */}
          {isDemoUser && (
            <View style={styles.demoUserCard}>
              <View style={styles.demoUserHeader}>
                <MaterialIcons name="info" size={20} color="#FF7F00" />
                <ThemedText style={styles.demoUserTitle}>Demo Account Information</ThemedText>
              </View>
              <View style={styles.demoUserContent}>
                <ThemedText style={styles.demoUserText}>
                  You are currently using a demo account (demo@netpayy.ng). Biometric login works normally with demo accounts.
                </ThemedText>
                <ThemedText style={styles.demoUserText}>
                  After enabling biometric login, you can use it to quickly sign in to your demo account.
                </ThemedText>
              </View>
            </View>
          )}

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
              <ThemedText style={styles.modalButtonText}>Continue</ThemedText>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>

      {/* Notification Prompt Modal */}
      <Modal 
        visible={showNotificationModal} 
        transparent 
        animationType="fade" 
        onRequestClose={handleSkipNotifications}>
        <View style={styles.modalOverlay}>
          <View style={styles.modalContent}>
            <View style={styles.notificationIconCircle}>
              <MaterialIcons name="notifications" size={40} color="#fff" />
            </View>
            <ThemedText style={styles.modalTitle} numberOfLines={2} ellipsizeMode="tail">
              Enable Notifications
            </ThemedText>
            <ThemedText style={styles.modalMessage}>
              Stay updated with transaction alerts, payment reminders, and important account notifications.
            </ThemedText>
            <TouchableOpacity 
              style={[styles.modalButton, registeringNotifications && styles.modalButtonDisabled]} 
              onPress={handleEnableNotifications}
              disabled={registeringNotifications}>
              <ThemedText style={styles.modalButtonText}>
                {registeringNotifications ? 'Enabling...' : 'Enable Notifications'}
              </ThemedText>
            </TouchableOpacity>
            <TouchableOpacity 
              style={styles.skipButtonModal} 
              onPress={handleSkipNotifications}
              disabled={registeringNotifications}>
              <ThemedText style={styles.skipButtonTextModal}>Skip for Now</ThemedText>
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
  demoUserCard: {
    backgroundColor: '#FFF8E1',
    borderRadius: 12,
    padding: 16,
    marginBottom: 24,
    borderWidth: 2,
    borderColor: '#FF7F00',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 4,
    elevation: 4,
    width: '100%',
  },
  demoUserHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginBottom: 12,
  },
  demoUserTitle: {
    fontSize: 15,
    fontWeight: '700',
    color: '#E65100',
    flex: 1,
  },
  demoUserContent: {
    gap: 8,
  },
  demoUserText: {
    fontSize: 14,
    color: '#666',
    lineHeight: 20,
  },
  notificationIconCircle: {
    width: 80,
    height: 80,
    borderRadius: 40,
    backgroundColor: '#FF7F00',
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 24,
  },
  modalButtonDisabled: {
    opacity: 0.6,
  },
  skipButtonModal: {
    marginTop: 16,
    alignItems: 'center',
  },
  skipButtonTextModal: {
    fontSize: 16,
    fontWeight: '600',
    color: '#666',
    textDecorationLine: 'underline',
  },
});
