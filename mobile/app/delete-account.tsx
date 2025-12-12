import { useState } from 'react';
import { StyleSheet, View, ScrollView, TouchableOpacity, TextInput, Alert, ActivityIndicator } from 'react-native';
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

  const requiredText = 'DELETE MY ACCOUNT';

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

      // Call edge function to delete account
      const { data, error } = await supabase.functions.invoke('delete-user-account', {
        body: {
          password: password || undefined,
        },
      });

      if (error) throw error;

      if (!data?.success) {
        throw new Error(data?.error || 'Failed to delete account');
      }

      Alert.alert('Success', 'Account deleted successfully', [
        {
          text: 'OK',
          onPress: async () => {
            await supabase.auth.signOut();
            router.replace('/auth/login');
          },
        },
      ]);
    } catch (error: any) {
      console.error('Error deleting account:', error);
      Alert.alert('Error', error.message || 'Failed to delete account. Please try again.');
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
            <TextInput
              style={styles.input}
              placeholder="Enter your password for additional verification"
              placeholderTextColor="#999"
              value={password}
              onChangeText={setPassword}
              secureTextEntry
            />
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
              <ActivityIndicator color="#fff" />
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
    padding: 12,
    fontSize: 16,
    color: '#333',
    fontFamily: 'monospace',
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
});








