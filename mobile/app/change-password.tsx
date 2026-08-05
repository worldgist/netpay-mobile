import { useState } from 'react';
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
import { MaterialIcons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';

import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { supabase } from '@/lib/supabase';
import { disableBiometricLoginForCurrentUser } from '@/utils/disable-biometric-after-password-change';
import { markPendingBiometricReenrollment } from '@/utils/pending-biometric-reenrollment';

export default function ChangePasswordScreen() {
  const router = useRouter();
  const [step, setStep] = useState<'current' | 'new'>('current');
  const [oldPassword, setOldPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [showOldPassword, setShowOldPassword] = useState(false);
  const [showNewPassword, setShowNewPassword] = useState(false);
  const [showConfirmPassword, setShowConfirmPassword] = useState(false);
  const [updating, setUpdating] = useState(false);
  const [showSuccessModal, setShowSuccessModal] = useState(false);
  const [showIncorrectPasswordModal, setShowIncorrectPasswordModal] = useState(false);

  const handleVerifyCurrentPassword = async () => {
    if (!oldPassword) {
      Alert.alert('Change Password', 'Please enter your current password.');
      return;
    }

    try {
      setUpdating(true);

      const {
        data: { session },
        error: sessionError,
      } = await supabase.auth.getSession();

      if (sessionError) {
        throw sessionError;
      }

      if (!session?.user?.email) {
        setUpdating(false);
        Alert.alert('Change Password', 'Your session has expired. Please log in again.');
        router.replace('/auth/login');
        return;
      }

      const { error: verifyOldPasswordError } = await supabase.auth.signInWithPassword({
        email: session.user.email.trim().toLowerCase(),
        password: oldPassword,
      });

      if (verifyOldPasswordError) {
        setUpdating(false);
        setShowIncorrectPasswordModal(true);
        return;
      }

      setUpdating(false);
      setStep('new');
    } catch (error) {
      setUpdating(false);
      Alert.alert('Change Password', error instanceof Error ? error.message : 'An unexpected error occurred.');
    }
  };

  const handleChangePassword = async () => {
    if (!newPassword || !confirmPassword) {
      Alert.alert('Change Password', 'Please enter and confirm your new password.');
      return;
    }

    if (newPassword.length < 6) {
      Alert.alert('Change Password', 'New password must be at least 6 characters long.');
      return;
    }

    if (newPassword !== confirmPassword) {
      Alert.alert('Change Password', 'New password and confirm password do not match.');
      return;
    }

    if (oldPassword === newPassword) {
      Alert.alert('Change Password', 'New password must be different from current password.');
      return;
    }

    try {
      setUpdating(true);

      const { error: updateError } = await supabase.auth.updateUser({
        password: newPassword.trim(),
      });

      if (updateError) {
        setUpdating(false);
        Alert.alert('Change Password', updateError.message || 'Failed to change password. Please try again.');
        return;
      }

      const bio = await disableBiometricLoginForCurrentUser();
      if (!bio.ok) {
        console.warn('Could not disable biometric on profile after password change:', bio.error);
        Alert.alert(
          'Biometric login',
          'Your password was updated, but biometric could not be turned off automatically. Please disable Biometric login in Profile, then turn it on again after signing in with your new password.',
        );
      } else {
        await markPendingBiometricReenrollment();
      }

      setUpdating(false);
      setShowSuccessModal(true);
    } catch (error) {
      setUpdating(false);
      Alert.alert('Change Password', error instanceof Error ? error.message : 'An unexpected error occurred.');
    }
  };

  const handleCloseSuccess = () => {
    setShowSuccessModal(false);
    router.back();
  };

  return (
    <KeyboardAvoidingView style={styles.container} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
      <View style={styles.pageHeader}>
        <TouchableOpacity
          style={styles.pageHeaderBackButton}
          onPress={() => {
            if (step === 'new') {
              setStep('current');
              return;
            }
            router.back();
          }}>
          <MaterialIcons name="arrow-back" size={24} color="#000" />
        </TouchableOpacity>
        <ThemedText style={styles.pageHeaderTitle}>
          {step === 'current' ? 'Verify Current Password' : 'Create New Password'}
        </ThemedText>
        <View style={styles.pageHeaderSpacer} />
      </View>

      <ScrollView contentContainerStyle={styles.scrollContent} showsVerticalScrollIndicator={false}>
        <ThemedView style={styles.card}>
          <View style={styles.header}>
            <ThemedText style={styles.subtitle}>
              {step === 'current'
                ? 'Enter your current password to continue.'
                : 'Enter your new password and confirm it to finish.'}
            </ThemedText>
          </View>

          {step === 'current' ? (
            <View style={styles.inputContainer}>
              <MaterialIcons name="lock" size={20} color="#666" style={styles.inputIcon} />
              <TextInput
                style={styles.input}
                placeholder="Current password"
                placeholderTextColor="#999"
                value={oldPassword}
                onChangeText={setOldPassword}
                secureTextEntry={!showOldPassword}
                autoCapitalize="none"
                editable={!updating}
              />
              <TouchableOpacity onPress={() => setShowOldPassword(!showOldPassword)} style={styles.eyeIcon}>
                <MaterialIcons name={showOldPassword ? 'visibility' : 'visibility-off'} size={20} color="#666" />
              </TouchableOpacity>
            </View>
          ) : (
            <>
              <View style={styles.inputContainer}>
                <MaterialIcons name="lock" size={20} color="#666" style={styles.inputIcon} />
                <TextInput
                  style={styles.input}
                  placeholder="New password"
                  placeholderTextColor="#999"
                  value={newPassword}
                  onChangeText={setNewPassword}
                  secureTextEntry={!showNewPassword}
                  autoCapitalize="none"
                  editable={!updating}
                />
                <TouchableOpacity onPress={() => setShowNewPassword(!showNewPassword)} style={styles.eyeIcon}>
                  <MaterialIcons name={showNewPassword ? 'visibility' : 'visibility-off'} size={20} color="#666" />
                </TouchableOpacity>
              </View>

              <View style={styles.inputContainer}>
                <MaterialIcons name="lock" size={20} color="#666" style={styles.inputIcon} />
                <TextInput
                  style={styles.input}
                  placeholder="Confirm new password"
                  placeholderTextColor="#999"
                  value={confirmPassword}
                  onChangeText={setConfirmPassword}
                  secureTextEntry={!showConfirmPassword}
                  autoCapitalize="none"
                  editable={!updating}
                />
                <TouchableOpacity onPress={() => setShowConfirmPassword(!showConfirmPassword)} style={styles.eyeIcon}>
                  <MaterialIcons name={showConfirmPassword ? 'visibility' : 'visibility-off'} size={20} color="#666" />
                </TouchableOpacity>
              </View>
            </>
          )}

          <TouchableOpacity
            style={[styles.updateButton, updating && { opacity: 0.7 }]}
            onPress={step === 'current' ? handleVerifyCurrentPassword : handleChangePassword}
            disabled={updating}>
            {updating ? (
              <NetpayLoadingAnimation size={40} variant="onBrand" strokeWidth={2.5} />
            ) : (
              <ThemedText style={styles.updateButtonText}>
                {step === 'current' ? 'Continue' : 'Update Password'}
              </ThemedText>
            )}
          </TouchableOpacity>

          {step === 'current' ? (
            <TouchableOpacity
              style={styles.forgotLink}
              onPress={() => router.push('/forget-password')}
              activeOpacity={0.7}
              disabled={updating}
            >
              <ThemedText style={styles.forgotLinkText}>Forgot Password?</ThemedText>
            </TouchableOpacity>
          ) : null}
        </ThemedView>
      </ScrollView>

      <Modal visible={showIncorrectPasswordModal} transparent animationType="fade" onRequestClose={() => setShowIncorrectPasswordModal(false)}>
        <View style={styles.modalOverlay}>
          <View style={styles.modalContent}>
            <View style={styles.modalIconCircleError}>
              <MaterialIcons name="error-outline" size={36} color="#fff" />
            </View>
            <ThemedText style={styles.modalTitle}>Incorrect Password</ThemedText>
            <ThemedText style={styles.modalMessage}>
              The current password you entered is incorrect. Please try again.
            </ThemedText>
            <TouchableOpacity style={styles.modalButton} onPress={() => setShowIncorrectPasswordModal(false)}>
              <ThemedText style={styles.modalButtonText}>Try Again</ThemedText>
            </TouchableOpacity>
            <TouchableOpacity
              style={styles.modalSecondaryButton}
              onPress={() => {
                setShowIncorrectPasswordModal(false);
                router.push('/forget-password');
              }}
            >
              <ThemedText style={styles.modalSecondaryButtonText}>Forgot Password?</ThemedText>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>

      <Modal visible={showSuccessModal} transparent animationType="fade" onRequestClose={handleCloseSuccess}>
        <View style={styles.modalOverlay}>
          <View style={styles.modalContent}>
            <View style={styles.modalIconCircleSuccess}>
              <MaterialIcons name="check-circle" size={36} color="#fff" />
            </View>
            <ThemedText style={styles.modalTitle}>Password Updated</ThemedText>
            <ThemedText style={styles.modalMessage}>
              Your password has been changed successfully. For security, biometric login is turned off until you enable it again in Profile settings.
            </ThemedText>
            <TouchableOpacity style={styles.modalButton} onPress={handleCloseSuccess}>
              <ThemedText style={styles.modalButtonText}>Done</ThemedText>
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
  pageHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 20,
    paddingTop: Platform.OS === 'ios' ? 60 : 40,
    paddingBottom: 14,
    borderBottomWidth: 1,
    borderBottomColor: '#E0E0E0',
    backgroundColor: '#F8F9FC',
  },
  pageHeaderBackButton: {
    padding: 8,
    marginLeft: -8,
  },
  pageHeaderTitle: {
    fontSize: 20,
    fontWeight: 'bold',
    color: '#000',
  },
  pageHeaderSpacer: {
    width: 40,
  },
  scrollContent: {
    flexGrow: 1,
    paddingHorizontal: 20,
    paddingTop: 20,
    paddingBottom: 32,
    justifyContent: 'center',
  },
  card: {
    width: '100%',
    maxWidth: 420,
    alignSelf: 'center',
    paddingHorizontal: Platform.OS === 'ios' ? 20 : 32,
    paddingTop: Platform.OS === 'ios' ? 48 : 42,
    paddingBottom: 40,
    backgroundColor: '#fff',
    borderRadius: 20,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 0.08,
    shadowRadius: 12,
    elevation: 6,
  },
  header: {
    alignItems: 'stretch',
    marginBottom: 24,
    paddingHorizontal: 4,
    width: '100%',
  },
  subtitle: {
    fontSize: 15,
    color: '#666',
    textAlign: 'center',
    lineHeight: 21,
    width: '100%',
  },
  inputContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#F5F5F5',
    borderRadius: 12,
    paddingHorizontal: 16,
    borderWidth: 1,
    borderColor: '#E0E0E0',
    height: 56,
    marginBottom: 16,
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
  updateButton: {
    backgroundColor: '#FF7F00',
    borderRadius: 12,
    height: 54,
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: 8,
  },
  updateButtonText: {
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
    paddingVertical: 36,
    width: '80%',
    maxWidth: 360,
    alignItems: 'center',
  },
  modalIconCircleSuccess: {
    width: 80,
    height: 80,
    borderRadius: 40,
    backgroundColor: '#4CAF50',
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 24,
  },
  modalIconCircleError: {
    width: 80,
    height: 80,
    borderRadius: 40,
    backgroundColor: '#F44336',
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 24,
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
  forgotLink: {
    alignItems: 'center',
    marginTop: 16,
    paddingVertical: 8,
  },
  forgotLinkText: {
    fontSize: 15,
    fontWeight: '600',
    color: '#FF7F00',
    textDecorationLine: 'underline',
  },
  modalSecondaryButton: {
    marginTop: 12,
    paddingVertical: 8,
  },
  modalSecondaryButtonText: {
    fontSize: 15,
    fontWeight: '600',
    color: '#FF7F00',
  },
});
