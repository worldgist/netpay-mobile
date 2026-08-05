import { StyleSheet, View, TouchableOpacity, TextInput, ScrollView, Platform, Modal, Alert } from 'react-native';
import { NetpayLoadingAnimation } from '@/components/netpay-loading-animation';
import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { MaterialIcons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import { useEffect, useRef, useState } from 'react';
import { supabase } from '@/lib/supabase';
import { useProfile } from '@/contexts/profile-context';

export default function EditProfileScreen() {
  const router = useRouter();
  const { profile, loading: profileLoading, patchProfile } = useProfile();
  const [fullName, setFullName] = useState('');
  const [email, setEmail] = useState('');
  const [phoneNumber, setPhoneNumber] = useState('');
  const [saving, setSaving] = useState(false);
  const [showSuccessModal, setShowSuccessModal] = useState(false);
  const isMounted = useRef(true);
  const hasHydratedRef = useRef(false);

  useEffect(() => {
    isMounted.current = true;
    return () => {
      isMounted.current = false;
    };
  }, []);

  useEffect(() => {
    if (!profile || hasHydratedRef.current) return;
    setFullName(profile.full_name);
    setEmail(profile.email);
    setPhoneNumber(profile.phone || '');
    hasHydratedRef.current = true;
  }, [profile]);

  useEffect(() => {
    if (!profileLoading && !profile) {
      router.replace('/auth/login');
    }
  }, [profileLoading, profile, router]);

  const handleSaveChanges = async () => {
    if (!profile) return;

    const trimmedName = fullName.trim();
    const trimmedPhone = phoneNumber.trim();

    if (!trimmedName) {
      Alert.alert('Edit Profile', 'Please enter your full name.');
      return;
    }

    if (trimmedPhone && trimmedPhone.length !== 11) {
      Alert.alert('Edit Profile', 'Phone number must be 11 digits.');
      return;
    }

    const previousProfile = profile;
    const nextPhone = trimmedPhone || null;

    patchProfile({
      full_name: trimmedName,
      phone: nextPhone,
    });

    try {
      setSaving(true);

      const payload = {
        id: profile.id,
        full_name: trimmedName,
        phone: nextPhone,
        email: profile.email,
        updated_at: new Date().toISOString(),
      };

      const { error } = await supabase.from('profiles').upsert(payload, { onConflict: 'id' });
      if (error) throw error;

      setShowSuccessModal(true);
    } catch (error) {
      patchProfile({
        full_name: previousProfile.full_name,
        phone: previousProfile.phone,
      });
      console.error('Failed to save profile changes:', error);
      const message = error instanceof Error ? error.message : 'Unable to save your profile changes. Please try again.';
      Alert.alert('Edit Profile', message);
    } finally {
      if (isMounted.current) setSaving(false);
    }
  };

  const handleCloseModal = () => {
    setShowSuccessModal(false);
    router.back();
  };

  const showInitialPlaceholder = profileLoading && !profile;

  return (
    <ThemedView style={styles.container}>
      <View style={styles.header}>
        <TouchableOpacity onPress={() => router.back()} style={styles.backButton}>
          <MaterialIcons name="arrow-back" size={24} color="#000" />
        </TouchableOpacity>
        <ThemedText style={styles.headerTitle}>Edit Profile</ThemedText>
        <View style={styles.placeholder} />
      </View>

      <ScrollView
        style={styles.scrollView}
        contentContainerStyle={styles.scrollContent}
        showsVerticalScrollIndicator={false}>
        <View style={styles.profilePictureContainer}>
          <View style={styles.profilePictureCircle}>
            <MaterialIcons name="person" size={64} color="#fff" />
          </View>
        </View>

        <View style={styles.infoCard}>
          <View style={styles.fieldContainer}>
            <ThemedText style={styles.fieldLabel}>Full Name</ThemedText>
            <View style={styles.inputContainer}>
              <MaterialIcons name="person" size={20} color="#999" style={styles.inputIcon} />
              <TextInput
                style={styles.input}
                value={fullName}
                onChangeText={setFullName}
                placeholder="Enter your full name"
                placeholderTextColor="#999"
                editable={!showInitialPlaceholder && !saving}
              />
            </View>
          </View>

          <View style={styles.fieldContainer}>
            <ThemedText style={styles.fieldLabel}>Email Address</ThemedText>
            <View style={[styles.inputContainer, styles.disabledInput]}>
              <MaterialIcons name="email" size={20} color="#999" style={styles.inputIcon} />
              <TextInput
                style={styles.input}
                value={email}
                editable={false}
                placeholder="Enter your email"
                placeholderTextColor="#999"
              />
            </View>
            <ThemedText style={styles.hintText}>Email cannot be changed</ThemedText>
          </View>

          <View style={styles.fieldContainer}>
            <ThemedText style={styles.fieldLabel}>Phone Number</ThemedText>
            <View style={styles.inputContainer}>
              <MaterialIcons name="phone" size={20} color="#999" style={styles.inputIcon} />
              <TextInput
                style={styles.input}
                value={phoneNumber}
                onChangeText={setPhoneNumber}
                placeholder="Enter your phone number"
                placeholderTextColor="#999"
                keyboardType="phone-pad"
                maxLength={11}
                editable={!showInitialPlaceholder && !saving}
              />
            </View>
            <ThemedText style={styles.hintText}>Enter 11-digit phone number</ThemedText>
          </View>
        </View>

        <TouchableOpacity
          style={[styles.saveButton, (showInitialPlaceholder || saving) && styles.saveButtonDisabled]}
          onPress={handleSaveChanges}
          disabled={showInitialPlaceholder || saving}>
          {saving ? (
            <NetpayLoadingAnimation size={40} variant="onBrand" strokeWidth={2.5} />
          ) : (
            <ThemedText style={styles.saveButtonText}>Save Changes</ThemedText>
          )}
        </TouchableOpacity>
      </ScrollView>

      <Modal
        visible={showSuccessModal}
        transparent={true}
        animationType="fade"
        onRequestClose={handleCloseModal}>
        <View style={styles.modalOverlay}>
          <View style={styles.modalContent}>
            <View style={styles.successIconContainer}>
              <View style={styles.successIconCircle}>
                <MaterialIcons name="check" size={48} color="#fff" />
              </View>
            </View>
            <ThemedText style={styles.modalTitle}>Changes Saved!</ThemedText>
            <ThemedText style={styles.modalMessage}>Your profile has been updated successfully</ThemedText>
            <TouchableOpacity style={styles.modalButton} onPress={handleCloseModal}>
              <ThemedText style={styles.modalButtonText}>OK</ThemedText>
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
    fontSize: 18,
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
    paddingBottom: 40,
  },
  profilePictureContainer: {
    alignItems: 'center',
    marginTop: 32,
    marginBottom: 32,
  },
  profilePictureCircle: {
    width: 120,
    height: 120,
    borderRadius: 60,
    backgroundColor: '#FF7F00',
    justifyContent: 'center',
    alignItems: 'center',
  },
  infoCard: {
    backgroundColor: '#fff',
    borderRadius: 16,
    marginHorizontal: 20,
    padding: 20,
    marginBottom: 32,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 8,
    elevation: 3,
  },
  fieldContainer: {
    marginBottom: 24,
  },
  fieldLabel: {
    fontSize: 13,
    fontWeight: '600',
    color: '#333',
    marginBottom: 8,
  },
  inputContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#F5F5F5',
    borderRadius: 12,
    paddingHorizontal: 16,
    paddingVertical: 14,
    borderWidth: 1,
    borderColor: '#E0E0E0',
  },
  disabledInput: {
    backgroundColor: '#F0F0F0',
    opacity: 0.7,
  },
  inputIcon: {
    marginRight: 12,
  },
  input: {
    flex: 1,
    fontSize: 14,
    color: '#333',
    padding: 0,
  },
  hintText: {
    fontSize: 11,
    color: '#999',
    marginTop: 6,
    marginLeft: 4,
  },
  saveButton: {
    backgroundColor: '#FF7F00',
    borderRadius: 12,
    paddingVertical: 16,
    marginHorizontal: 20,
    alignItems: 'center',
    shadowColor: '#FF7F00',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.3,
    shadowRadius: 8,
    elevation: 5,
  },
  saveButtonDisabled: {
    opacity: 0.6,
  },
  saveButtonText: {
    fontSize: 16,
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
  modalTitle: {
    fontSize: 20,
    fontWeight: 'bold',
    color: '#333',
    marginBottom: 12,
    textAlign: 'center',
  },
  modalMessage: {
    fontSize: 14,
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
    fontSize: 14,
    fontWeight: 'bold',
    color: '#fff',
  },
});

