import { useState, useEffect } from 'react';
import { StyleSheet, View, ScrollView, TouchableOpacity, TextInput, Alert, Modal, Text, Platform } from 'react-native';
import { NetpayLoadingAnimation } from '@/components/netpay-loading-animation';
import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { MaterialIcons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import { supabase } from '@/lib/supabase';

export default function DeleteAccountScreen() {
  const router = useRouter();
  const [loading, setLoading] = useState(false);
  const [confirmText, setConfirmText] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [isDemoUser, setIsDemoUser] = useState(false);
  const [showSuccessModal, setShowSuccessModal] = useState(false);

  const requiredText = 'DELETE MY ACCOUNT';

  useEffect(() => {
    const checkDemoUser = async () => {
      const { data: { user } } = await supabase.auth.getUser();
      if (user?.email === 'demo@netppay.com') {
        setIsDemoUser(true);
      }
    };
    checkDemoUser();
  }, []);

  const handleDeleteAccount = () => {
    if (confirmText !== requiredText) {
      Alert.alert('Error', `Please type "${requiredText}" to confirm`);
      return;
    }

    Alert.alert(
      'Final Confirmation',
      'Are you absolutely sure you want to delete your account? This action is permanent and cannot be undone. All your data, transactions, and account information will be permanently deleted.',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Delete Account',
          style: 'destructive',
          onPress: confirmDelete,
        },
      ]
    );
  };

  const confirmDelete = async () => {
    try {
      setLoading(true);

      const { data: { session } } = await supabase.auth.getSession();
      if (!session) {
        Alert.alert('Error', 'Session expired. Please login again.');
        router.replace('/auth/login');
        return;
      }

      // Try supabase.functions.invoke first
      let data: any = null;
      let invokeError: any = null;
      
      try {
        // For demo users, password is optional
        const result = await supabase.functions.invoke('delete-user-account', {
          body: {
            password: isDemoUser ? undefined : (password || undefined),
          },
        });
        
        data = result.data;
        invokeError = result.error;
        
        if (invokeError) {
          throw invokeError;
        }
      } catch (err: any) {
        invokeError = err;
        console.error('Supabase invoke failed, trying direct fetch:', err);
        
        // Fallback to direct fetch to get better error messages
        try {
          const supabaseUrl = process.env.EXPO_PUBLIC_SUPABASE_URL || 
                             'https://xrpuvnhmdmpgelfxpdcx.supabase.co';
          
          const response = await fetch(`${supabaseUrl}/functions/v1/delete-user-account`, {
            method: 'POST',
            headers: {
              'Authorization': `Bearer ${session.access_token}`,
              'Content-Type': 'application/json',
            },
            body: JSON.stringify({
              password: isDemoUser ? undefined : (password || undefined),
            }),
          });

          const responseText = await response.text();
          
          if (!response.ok) {
            // Parse error response
            let errorBody: any = {};
            try {
              errorBody = JSON.parse(responseText);
            } catch {
              errorBody = { message: responseText || `HTTP ${response.status}: ${response.statusText}` };
            }
            
            const errorMsg = errorBody.error || errorBody.message || `HTTP ${response.status}: ${response.statusText}`;
            console.error('Direct fetch error:', errorMsg);
            throw new Error(errorMsg);
          }
          
          // Parse success response
          try {
            data = JSON.parse(responseText);
          } catch {
            throw new Error('Invalid response from server');
          }
        } catch (fetchError: any) {
          // If direct fetch also fails, use the original error
          console.error('Direct fetch also failed:', fetchError);
          
          // Extract error message from fetch error
          let errorMessage = fetchError?.message || 'Failed to delete account. Please try again.';
          
          // Try to extract from the original invoke error
          const errorObj = invokeError as any;
          if (errorObj?.message && !errorObj.message.includes('non-2xx')) {
            errorMessage = errorObj.message;
          } else if (errorObj?.context?.message) {
            errorMessage = errorObj.context.message;
          } else if (errorObj?.error) {
            if (typeof errorObj.error === 'string') {
              errorMessage = errorObj.error;
            } else if (errorObj.error.message) {
              errorMessage = errorObj.error.message;
            }
          }
          
          throw new Error(errorMessage);
        }
      }

      if (!data?.success) {
        const errorMsg = data?.error || data?.message || 'Failed to delete account';
        console.error('Delete account returned error:', data);
        throw new Error(errorMsg);
      }

      setLoading(false);
      console.log('Account deleted successfully, showing modal');
      setShowSuccessModal(true);
    } catch (error: any) {
      console.error('Error deleting account:', error);
      
      // Provide more user-friendly error messages
      let errorMessage = 'Failed to delete account. Please try again.';
      
      if (error?.message) {
        errorMessage = error.message;
      } else if (typeof error === 'string') {
        errorMessage = error;
      }
      
      // Check for specific error types
      if (errorMessage.includes('non-2xx') || errorMessage.includes('Edge Function')) {
        errorMessage = 'The delete account service is currently unavailable. Please contact support at support@netppay.com or try again later.';
      } else if (errorMessage.includes('Unauthorized') || errorMessage.includes('Session')) {
        errorMessage = 'Your session has expired. Please log in again and try deleting your account.';
      }
      
      Alert.alert('Error', errorMessage);
    } finally {
      setLoading(false);
    }
  };

  return (
    <ThemedView style={styles.container}>
      {/* Orange Header */}
      <View style={styles.orangeHeader}>
        <TouchableOpacity onPress={() => router.back()} style={styles.backButton}>
          <MaterialIcons name="arrow-back" size={24} color="#fff" />
        </TouchableOpacity>
        <ThemedText style={styles.headerTitle}>Delete Account</ThemedText>
        <View style={styles.placeholder} />
      </View>

      <ScrollView
        style={styles.scrollView}
        contentContainerStyle={styles.scrollContent}
        showsVerticalScrollIndicator={false}>
        
        {/* Warning Card */}
        <View style={styles.warningCard}>
          <MaterialIcons name="warning" size={24} color="#DC2626" />
          <View style={styles.warningContent}>
            <ThemedText style={styles.warningTitle}>Warning: Permanent Action</ThemedText>
            <ThemedText style={styles.warningText}>
              Deleting your account will permanently remove all your data, transactions, and account information. 
              This action cannot be undone.
            </ThemedText>
          </View>
        </View>

        {/* Demo User Banner */}
        {isDemoUser && (
          <View style={styles.demoUserCard}>
            <View style={styles.demoUserHeader}>
              <MaterialIcons name="info" size={24} color="#FF7F00" />
              <ThemedText style={styles.demoUserTitle}>Demo Account Information</ThemedText>
            </View>
            <View style={styles.demoUserContent}>
              <ThemedText style={styles.demoUserText}>
                You are currently using a demo account (demo@netppay.com). This account is designed for testing purposes.
              </ThemedText>
              <ThemedText style={styles.demoUserText}>
                Account deletion for demo accounts may be restricted or handled differently. If you need to delete a demo account, please contact support.
              </ThemedText>
            </View>
          </View>
        )}

        {/* What Will Be Deleted */}
        <View style={styles.sectionCard}>
          <View style={styles.sectionHeader}>
            <MaterialIcons name="shield" size={20} color="#FF7F00" />
            <ThemedText style={styles.sectionTitle}>What Will Be Deleted</ThemedText>
          </View>
          <View style={styles.listContainer}>
            <ThemedText style={styles.listItem}>• Your profile and personal information</ThemedText>
            <ThemedText style={styles.listItem}>• All transaction history</ThemedText>
            <ThemedText style={styles.listItem}>• Wallet balance (ensure you withdraw funds first)</ThemedText>
            <ThemedText style={styles.listItem}>• Referral codes and referral history</ThemedText>
            <ThemedText style={styles.listItem}>• All saved preferences and settings</ThemedText>
          </View>
        </View>

        {/* Confirmation Form */}
        <View style={styles.sectionCard}>
          <ThemedText style={styles.formTitle}>Confirm Account Deletion</ThemedText>
          <ThemedText style={styles.formDescription}>
            To confirm, please type <ThemedText style={styles.requiredText}>{requiredText}</ThemedText> in the field below
          </ThemedText>

          <View style={styles.inputContainer}>
            <ThemedText style={styles.inputLabel}>Type to confirm</ThemedText>
            <TextInput
              style={styles.input}
              placeholder={requiredText}
              placeholderTextColor="#999"
              value={confirmText}
              onChangeText={setConfirmText}
              autoCapitalize="characters"
            />
          </View>

          <View style={styles.inputContainer}>
            <ThemedText style={styles.inputLabel}>Password (Optional)</ThemedText>
            <View style={styles.passwordField}>
              <MaterialIcons name="lock" size={20} color="#666" style={styles.passwordIcon} />
              <TextInput
                style={styles.passwordInput}
                placeholder="Enter your password"
                placeholderTextColor="#999"
                value={password}
                onChangeText={setPassword}
                secureTextEntry={!showPassword}
                autoCapitalize="none"
                autoCorrect={false}
                textContentType="password"
              />
              <TouchableOpacity
                onPress={() => setShowPassword((current) => !current)}
                style={styles.passwordToggle}
                accessibilityRole="button"
                accessibilityLabel={showPassword ? 'Hide password' : 'Show password'}>
                <MaterialIcons
                  name={showPassword ? 'visibility' : 'visibility-off'}
                  size={20}
                  color="#666"
                />
              </TouchableOpacity>
            </View>
            <ThemedText style={styles.inputHint}>
              Providing your password adds an extra layer of security
            </ThemedText>
          </View>

          <TouchableOpacity
            style={[
              styles.deleteButton,
              (loading || confirmText !== requiredText) && styles.deleteButtonDisabled,
            ]}
            onPress={handleDeleteAccount}
            disabled={loading || confirmText !== requiredText}
            activeOpacity={0.7}>
            {loading ? (
              <NetpayLoadingAnimation size={40} variant="onBrand" strokeWidth={2.5} />
            ) : (
              <>
                <MaterialIcons name="delete" size={20} color="#fff" />
                <ThemedText style={styles.deleteButtonText}>Delete My Account</ThemedText>
              </>
            )}
          </TouchableOpacity>
        </View>

        {/* Information Card */}
        <View style={styles.infoCard}>
          <MaterialIcons name="info" size={20} color="#FF7F00" />
          <View style={styles.infoContent}>
            <ThemedText style={styles.infoTitle}>Before You Delete</ThemedText>
            <ThemedText style={styles.infoText}>• Withdraw any remaining balance from your wallet</ThemedText>
            <ThemedText style={styles.infoText}>• Download any transaction records you need</ThemedText>
            <ThemedText style={styles.infoText}>• Cancel any pending transactions</ThemedText>
            <ThemedText style={styles.infoText}>• Contact support if you have questions</ThemedText>
          </View>
        </View>
      </ScrollView>

      {/* Success Modal */}
      <Modal 
        visible={showSuccessModal} 
        transparent 
        animationType="fade"
        statusBarTranslucent
        onRequestClose={() => {
          setShowSuccessModal(false);
          supabase.auth.signOut();
          router.replace('/auth/login');
        }}>
        <View style={styles.modalOverlay}>
          <View style={styles.modalContent}>
            <View style={styles.modalIconCircle}>
              <MaterialIcons name="check-circle" size={48} color="#fff" />
            </View>
            <Text style={styles.modalTitle}>Delete Account Successful</Text>
            <Text style={styles.modalMessage}>
              Your account has been permanently deleted. All your data, transactions, and account information have been removed.
            </Text>
            <TouchableOpacity 
              style={styles.modalButton} 
              onPress={async () => {
                setShowSuccessModal(false);
                await supabase.auth.signOut();
                router.replace('/auth/login');
              }}>
              <Text style={styles.modalButtonText}>Continue</Text>
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
    backgroundColor: '#FFF8F0',
  },
  orangeHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 20,
    paddingTop: 60,
    paddingBottom: 20,
    backgroundColor: '#FF7F00',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 4,
    elevation: 3,
  },
  backButton: {
    padding: 8,
    marginLeft: -8,
  },
  headerTitle: {
    fontSize: 20,
    fontWeight: 'bold',
    color: '#fff',
  },
  placeholder: {
    width: 40,
  },
  scrollView: {
    flex: 1,
  },
  scrollContent: {
    padding: 16,
    paddingBottom: 40,
  },
  warningCard: {
    flexDirection: 'row',
    backgroundColor: '#FEE2E2',
    borderRadius: 12,
    padding: 16,
    marginBottom: 16,
    borderLeftWidth: 4,
    borderLeftColor: '#DC2626',
  },
  warningContent: {
    flex: 1,
    marginLeft: 12,
  },
  warningTitle: {
    fontSize: 16,
    fontWeight: 'bold',
    color: '#991B1B',
    marginBottom: 8,
  },
  warningText: {
    fontSize: 14,
    color: '#991B1B',
    lineHeight: 20,
  },
  sectionCard: {
    backgroundColor: '#fff',
    borderRadius: 12,
    padding: 16,
    marginBottom: 16,
    borderLeftWidth: 4,
    borderLeftColor: '#FF7F00',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.1,
    shadowRadius: 2,
    elevation: 2,
  },
  sectionHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginBottom: 12,
  },
  sectionTitle: {
    fontSize: 18,
    fontWeight: 'bold',
    color: '#FF7F00',
  },
  listContainer: {
    marginLeft: 4,
  },
  listItem: {
    fontSize: 15,
    color: '#333',
    lineHeight: 24,
    marginBottom: 8,
  },
  formTitle: {
    fontSize: 18,
    fontWeight: 'bold',
    color: '#333',
    marginBottom: 8,
  },
  formDescription: {
    fontSize: 14,
    color: '#666',
    marginBottom: 16,
    lineHeight: 20,
  },
  requiredText: {
    fontWeight: 'bold',
    color: '#FF7F00',
  },
  inputContainer: {
    marginBottom: 16,
  },
  inputLabel: {
    fontSize: 14,
    fontWeight: '500',
    color: '#333',
    marginBottom: 8,
  },
  input: {
    backgroundColor: '#F9FAFB',
    borderWidth: 1,
    borderColor: '#E5E7EB',
    borderRadius: 8,
    paddingHorizontal: 12,
    paddingVertical: Platform.OS === 'android' ? 10 : 12,
    minHeight: 48,
    fontSize: 16,
    lineHeight: 22,
    color: '#333',
    fontFamily: 'monospace',
    ...(Platform.OS === 'android' ? { includeFontPadding: false, textAlignVertical: 'center' as const } : {}),
  },
  passwordField: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#F9FAFB',
    borderWidth: 1,
    borderColor: '#E5E7EB',
    borderRadius: 8,
    paddingHorizontal: 12,
    minHeight: 48,
    height: 48,
  },
  passwordIcon: {
    marginRight: 10,
  },
  passwordInput: {
    flex: 1,
    fontSize: 16,
    lineHeight: 22,
    color: '#333',
    paddingVertical: Platform.OS === 'android' ? 0 : 8,
    ...(Platform.OS === 'android' ? { includeFontPadding: false, textAlignVertical: 'center' as const } : {}),
  },
  passwordToggle: {
    padding: 4,
    marginLeft: 8,
  },
  inputHint: {
    fontSize: 12,
    color: '#999',
    marginTop: 4,
  },
  deleteButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#DC2626',
    borderRadius: 12,
    padding: 16,
    gap: 8,
    marginTop: 8,
  },
  deleteButtonDisabled: {
    backgroundColor: '#FCA5A5',
    opacity: 0.6,
  },
  deleteButtonText: {
    color: '#fff',
    fontSize: 16,
    fontWeight: 'bold',
  },
  infoCard: {
    flexDirection: 'row',
    backgroundColor: '#FFF7ED',
    borderRadius: 12,
    padding: 16,
    borderLeftWidth: 4,
    borderLeftColor: '#FF7F00',
  },
  infoContent: {
    flex: 1,
    marginLeft: 12,
  },
  infoTitle: {
    fontSize: 16,
    fontWeight: 'bold',
    color: '#9A3412',
    marginBottom: 8,
  },
  infoText: {
    fontSize: 14,
    color: '#9A3412',
    lineHeight: 20,
    marginBottom: 4,
  },
  demoUserCard: {
    backgroundColor: '#FFF8E1',
    borderRadius: 12,
    padding: 16,
    marginBottom: 16,
    borderWidth: 2,
    borderColor: '#FF7F00',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 4,
    elevation: 4,
  },
  demoUserHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginBottom: 12,
  },
  demoUserTitle: {
    fontSize: 16,
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
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.5)',
    justifyContent: 'center',
    alignItems: 'center',
    zIndex: 9999,
  },
  modalContent: {
    backgroundColor: '#fff',
    borderRadius: 20,
    paddingHorizontal: 32,
    paddingVertical: 40,
    width: '85%',
    maxWidth: 400,
    alignItems: 'center',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.2,
    shadowRadius: 16,
    elevation: 8,
  },
  modalIconCircle: {
    width: 100,
    height: 100,
    borderRadius: 50,
    backgroundColor: '#FF7F00',
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 24,
  },
  modalTitle: {
    fontSize: 24,
    fontWeight: 'bold',
    color: '#FF7F00',
    marginBottom: 16,
    textAlign: 'center',
  },
  modalMessage: {
    fontSize: 16,
    color: '#666',
    textAlign: 'center',
    marginBottom: 32,
    lineHeight: 24,
  },
  modalButton: {
    backgroundColor: '#FF7F00',
    borderRadius: 12,
    paddingVertical: 16,
    paddingHorizontal: 48,
    alignItems: 'center',
    width: '100%',
    minWidth: 200,
  },
  modalButtonText: {
    fontSize: 16,
    fontWeight: '600',
    color: '#fff',
  },
});











