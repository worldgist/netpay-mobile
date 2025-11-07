import { useState } from 'react';
import { StyleSheet, View, TextInput, TouchableOpacity, ScrollView, KeyboardAvoidingView, Platform, Alert } from 'react-native';
import { ThemedView } from '@/components/themed-view';
import { ThemedText } from '@/components/themed-text';
import { MaterialIcons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import { ConfirmTransferModal } from '@/components/confirm-transfer-modal';

export default function TransferScreen() {
  const router = useRouter();
  const [recipientEmail, setRecipientEmail] = useState('');
  const [amount, setAmount] = useState('');
  const [description, setDescription] = useState('');
  const [showConfirmModal, setShowConfirmModal] = useState(false);
  const availableBalance = 500;

  const handleVerify = () => {
    if (!recipientEmail.trim()) {
      Alert.alert('Error', 'Please enter recipient email address');
      return;
    }
    // In a real app, verify the email with backend
    Alert.alert('Verified', `Recipient ${recipientEmail} verified successfully`);
  };

  const handleTransfer = () => {
    if (!recipientEmail.trim()) {
      Alert.alert('Error', 'Please enter recipient email address');
      return;
    }
    const transferAmount = parseFloat(amount);
    if (isNaN(transferAmount) || transferAmount <= 0) {
      Alert.alert('Error', 'Please enter a valid amount');
      return;
    }
    if (transferAmount > availableBalance) {
      Alert.alert('Error', 'Insufficient balance');
      return;
    }

    // Show confirmation modal
    setShowConfirmModal(true);
  };

  const handleConfirmTransfer = () => {
    setShowConfirmModal(false);
    const transferAmount = parseFloat(amount || '0');
    
    router.push({
      pathname: '/transfer-success',
      params: {
        amount: transferAmount.toString(),
        recipientEmail: recipientEmail,
        description: description || '',
      },
    });
  };

  return (
    <ThemedView style={styles.container}>
      <KeyboardAvoidingView
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
        style={styles.keyboardView}
        keyboardVerticalOffset={Platform.OS === 'ios' ? 0 : 20}>
        <View style={styles.header}>
          <TouchableOpacity onPress={() => router.back()} style={styles.backButton}>
            <MaterialIcons name="arrow-back" size={24} color="#000" />
          </TouchableOpacity>
          <ThemedText style={styles.headerTitle}>Transfer Money</ThemedText>
          <View style={styles.placeholder} />
        </View>

        <ScrollView style={styles.scrollView} showsVerticalScrollIndicator={false}>
          {/* Available Balance Card */}
          <View style={styles.balanceCard}>
            <ThemedText style={styles.balanceLabel}>Available Balance</ThemedText>
            <View style={styles.balanceAmountContainer}>
              <ThemedText style={styles.balanceAmount}>₦{availableBalance.toLocaleString()}</ThemedText>
            </View>
          </View>

          {/* Input Fields Section */}
          <View style={styles.inputSection}>
            {/* Recipient Email */}
            <View style={styles.inputGroup}>
              <ThemedText style={styles.inputLabel}>Recipient Email Address</ThemedText>
              <View style={styles.inputRow}>
                <MaterialIcons name="email" size={20} color="#666" style={styles.inputIcon} />
                <TextInput
                  style={styles.input}
                  placeholder="Enter recipient's email"
                  placeholderTextColor="#999"
                  value={recipientEmail}
                  onChangeText={setRecipientEmail}
                  keyboardType="email-address"
                  autoCapitalize="none"
                  autoCorrect={false}
                />
                <TouchableOpacity style={styles.verifyButton} onPress={handleVerify}>
                  <ThemedText style={styles.verifyButtonText}>Verify</ThemedText>
                </TouchableOpacity>
              </View>
            </View>

            {/* Amount */}
            <View style={styles.inputGroup}>
              <ThemedText style={styles.inputLabel}>Amount</ThemedText>
              <View style={styles.inputRow}>
                <MaterialIcons name="attach-money" size={20} color="#666" style={styles.inputIcon} />
                <TextInput
                  style={styles.input}
                  placeholder="Enter amount"
                  placeholderTextColor="#999"
                  value={amount}
                  onChangeText={setAmount}
                  keyboardType="numeric"
                />
              </View>
            </View>

            {/* Description */}
            <View style={styles.inputGroup}>
              <ThemedText style={styles.inputLabel}>Description (Optional)</ThemedText>
              <View style={styles.inputRow}>
                <TextInput
                  style={styles.input}
                  placeholder="What's this for?"
                  placeholderTextColor="#999"
                  value={description}
                  onChangeText={setDescription}
                  multiline
                />
              </View>
            </View>
          </View>

          {/* Transfer Button */}
          <TouchableOpacity style={styles.transferButton} onPress={handleTransfer}>
            <MaterialIcons name="send" size={20} color="#fff" style={styles.transferIcon} />
            <ThemedText style={styles.transferButtonText}>
              Transfer ₦{parseFloat(amount || '0').toLocaleString()}
            </ThemedText>
          </TouchableOpacity>

          {/* Note */}
          <View style={styles.noteContainer}>
            <ThemedText style={styles.noteText}>
              <ThemedText style={styles.noteBold}>Note:</ThemedText> Transfers are instant and cannot be reversed. Please verify recipient details before confirming.
            </ThemedText>
          </View>
        </ScrollView>
      </KeyboardAvoidingView>

      {/* Confirm Transfer Modal */}
      <ConfirmTransferModal
        visible={showConfirmModal}
        onClose={() => setShowConfirmModal(false)}
        onConfirm={handleConfirmTransfer}
        amount={parseFloat(amount || '0')}
        recipientEmail={recipientEmail}
        description={description}
      />
    </ThemedView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#fff',
  },
  keyboardView: {
    flex: 1,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 20,
    paddingTop: 60,
    paddingBottom: 20,
  },
  backButton: {
    width: 40,
    height: 40,
    justifyContent: 'center',
    alignItems: 'flex-start',
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
  balanceCard: {
    backgroundColor: '#FF7F00',
    borderRadius: 12,
    padding: 24,
    marginHorizontal: 20,
    marginBottom: 24,
    alignItems: 'center',
    minHeight: 100,
    justifyContent: 'center',
  },
  balanceLabel: {
    fontSize: 16,
    color: '#fff',
    marginBottom: 12,
    opacity: 0.95,
    fontWeight: '500',
  },
  balanceAmountContainer: {
    minHeight: 50,
    justifyContent: 'center',
  },
  balanceAmount: {
    fontSize: 36,
    fontWeight: 'bold',
    color: '#fff',
    lineHeight: 44,
  },
  inputSection: {
    backgroundColor: '#fff',
    borderRadius: 12,
    padding: 20,
    marginHorizontal: 20,
    marginBottom: 24,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 4,
    elevation: 3,
  },
  inputGroup: {
    marginBottom: 20,
  },
  inputLabel: {
    fontSize: 14,
    fontWeight: '600',
    color: '#333',
    marginBottom: 8,
  },
  inputRow: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#F5F5F5',
    borderRadius: 8,
    paddingHorizontal: 12,
    borderWidth: 1,
    borderColor: '#E0E0E0',
    minHeight: 50,
  },
  inputIcon: {
    marginRight: 8,
  },
  input: {
    flex: 1,
    fontSize: 16,
    color: '#333',
    paddingVertical: 12,
  },
  verifyButton: {
    backgroundColor: '#E0E0E0',
    paddingHorizontal: 16,
    paddingVertical: 8,
    borderRadius: 8,
    marginLeft: 8,
  },
  verifyButtonText: {
    fontSize: 14,
    fontWeight: '600',
    color: '#333',
  },
  transferButton: {
    backgroundColor: '#FF7F00',
    borderRadius: 12,
    paddingVertical: 16,
    flexDirection: 'row',
    justifyContent: 'center',
    alignItems: 'center',
    marginHorizontal: 20,
    marginBottom: 20,
  },
  transferIcon: {
    marginRight: 8,
  },
  transferButtonText: {
    fontSize: 18,
    fontWeight: 'bold',
    color: '#fff',
  },
  noteContainer: {
    backgroundColor: '#E3F2FD',
    borderRadius: 8,
    padding: 16,
    marginHorizontal: 20,
    marginBottom: 20,
  },
  noteText: {
    fontSize: 13,
    color: '#1976D2',
    lineHeight: 20,
  },
  noteBold: {
    fontWeight: 'bold',
  },
});

