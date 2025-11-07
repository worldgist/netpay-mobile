import { StyleSheet, View, TouchableOpacity, ScrollView } from 'react-native';
import { ThemedView } from '@/components/themed-view';
import { ThemedText } from '@/components/themed-text';
import { MaterialIcons } from '@expo/vector-icons';
import { useRouter, useLocalSearchParams } from 'expo-router';
import { useEffect } from 'react';
import { TransactionStorage, generateTransactionId, generateReference } from '@/utils/transactionStorage';

export default function TransferSuccessScreen() {
  const router = useRouter();
  const params = useLocalSearchParams();
  const amount = params.amount as string || '0';
  const recipientEmail = params.recipientEmail as string || '';
  const description = params.description as string || '';

  // Save transaction when screen loads
  useEffect(() => {
    const saveTransaction = async () => {
      const currentDate = new Date();
      const transaction = {
        id: generateTransactionId(),
        type: 'debit' as const,
        amount: parseFloat(amount),
        date: currentDate.toLocaleDateString('en-US', {
          year: 'numeric',
          month: 'short',
          day: 'numeric',
        }),
        time: currentDate.toLocaleTimeString('en-US', {
          hour: '2-digit',
          minute: '2-digit',
          hour12: true,
        }),
        reference: generateReference('TRANSFER'),
        status: 'Completed',
        description: description || 'Money Transfer',
        recipient: recipientEmail || '',
        serviceType: 'Money Transfer',
        network: '',
      };
      await TransactionStorage.addTransaction(transaction);
    };

    saveTransaction();
  }, [amount, recipientEmail, description]);

  const handleDone = () => {
    // Navigate back to home
    router.replace('/(tabs)');
  };

  const handleViewTransaction = () => {
    // Navigate to transactions screen
    router.push('/(tabs)/transactions');
  };

  return (
    <ThemedView style={styles.container}>
      <ScrollView 
        style={styles.scrollView}
        contentContainerStyle={styles.scrollContent}
        showsVerticalScrollIndicator={false}>
        <View style={styles.content}>
          {/* Success Checkmark */}
          <View style={styles.checkmarkContainer}>
            <View style={styles.checkmarkCircle}>
              <MaterialIcons name="check" size={64} color="#fff" />
            </View>
          </View>

          {/* Success Message */}
          <ThemedText style={styles.successTitle}>Transfer Successful!</ThemedText>
          <ThemedText style={styles.successMessage}>
            Your money transfer has been completed successfully
          </ThemedText>

          {/* Amount Display */}
          <View style={styles.amountCard}>
            <ThemedText style={styles.amountLabel}>Amount Transferred</ThemedText>
            <View style={styles.amountValueContainer}>
              <ThemedText style={styles.amountValue}>₦{parseFloat(amount).toLocaleString('en-NG', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</ThemedText>
            </View>
          </View>

          {/* Transaction Details */}
          <View style={styles.detailsCard}>
            <ThemedText style={styles.detailsTitle}>Transaction Details</ThemedText>
            <View style={styles.detailRow}>
              <ThemedText style={styles.detailLabel}>Recipient</ThemedText>
              <ThemedText style={styles.detailValue} numberOfLines={1}>{recipientEmail}</ThemedText>
            </View>
            {description && (
              <View style={styles.detailRow}>
                <ThemedText style={styles.detailLabel}>Description</ThemedText>
                <ThemedText style={styles.detailValue} numberOfLines={2}>{description}</ThemedText>
              </View>
            )}
            <View style={styles.detailRow}>
              <ThemedText style={styles.detailLabel}>Status</ThemedText>
              <ThemedText style={styles.statusValue}>Completed</ThemedText>
            </View>
            <View style={styles.detailRow}>
              <ThemedText style={styles.detailLabel}>Date</ThemedText>
              <ThemedText style={styles.detailValue}>
                {new Date().toLocaleDateString('en-US', {
                  year: 'numeric',
                  month: 'short',
                  day: 'numeric',
                })}
              </ThemedText>
            </View>
            <View style={styles.detailRow}>
              <ThemedText style={styles.detailLabel}>Time</ThemedText>
              <ThemedText style={styles.detailValue}>
                {new Date().toLocaleTimeString('en-US', {
                  hour: '2-digit',
                  minute: '2-digit',
                  hour12: true,
                })}
              </ThemedText>
            </View>
          </View>

          {/* Action Buttons */}
          <View style={styles.buttonContainer}>
            <TouchableOpacity 
              style={styles.viewTransactionButton} 
              onPress={handleViewTransaction}>
              <MaterialIcons name="receipt" size={20} color="#FF7F00" style={styles.buttonIcon} />
              <ThemedText style={styles.viewTransactionButtonText}>View Transaction</ThemedText>
            </TouchableOpacity>

            <TouchableOpacity style={styles.doneButton} onPress={handleDone}>
              <ThemedText style={styles.doneButtonText}>Done</ThemedText>
            </TouchableOpacity>
          </View>
        </View>
      </ScrollView>
    </ThemedView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#fff',
  },
  scrollView: {
    flex: 1,
  },
  scrollContent: {
    flexGrow: 1,
    paddingBottom: 40,
  },
  content: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: 20,
    paddingTop: 60,
  },
  checkmarkContainer: {
    marginBottom: 32,
  },
  checkmarkCircle: {
    width: 120,
    height: 120,
    borderRadius: 60,
    backgroundColor: '#4CAF50',
    justifyContent: 'center',
    alignItems: 'center',
    shadowColor: '#4CAF50',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.3,
    shadowRadius: 8,
    elevation: 8,
  },
  successTitle: {
    fontSize: 28,
    fontWeight: 'bold',
    color: '#000',
    marginBottom: 12,
    textAlign: 'center',
  },
  successMessage: {
    fontSize: 16,
    color: '#666',
    textAlign: 'center',
    marginBottom: 32,
    paddingHorizontal: 20,
  },
  amountCard: {
    width: '100%',
    backgroundColor: '#FF7F00',
    borderRadius: 12,
    padding: 24,
    marginBottom: 24,
    alignItems: 'center',
    minHeight: 120,
    justifyContent: 'center',
  },
  amountLabel: {
    fontSize: 14,
    color: '#fff',
    opacity: 0.95,
    marginBottom: 12,
    fontWeight: '500',
  },
  amountValueContainer: {
    minHeight: 50,
    justifyContent: 'center',
    alignItems: 'center',
    width: '100%',
  },
  amountValue: {
    fontSize: 36,
    fontWeight: 'bold',
    color: '#fff',
    lineHeight: 44,
    textAlign: 'center',
  },
  detailsCard: {
    width: '100%',
    backgroundColor: '#F5F5F5',
    borderRadius: 12,
    padding: 20,
    marginBottom: 32,
  },
  detailsTitle: {
    fontSize: 18,
    fontWeight: 'bold',
    color: '#333',
    marginBottom: 16,
  },
  detailRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: '#E0E0E0',
  },
  detailLabel: {
    fontSize: 16,
    color: '#666',
    flex: 1,
  },
  detailValue: {
    fontSize: 16,
    fontWeight: '600',
    color: '#333',
    flex: 1,
    textAlign: 'right',
  },
  statusValue: {
    fontSize: 16,
    fontWeight: '600',
    color: '#4CAF50',
  },
  buttonContainer: {
    width: '100%',
    gap: 12,
  },
  viewTransactionButton: {
    width: '100%',
    backgroundColor: '#fff',
    borderRadius: 12,
    paddingVertical: 16,
    flexDirection: 'row',
    justifyContent: 'center',
    alignItems: 'center',
    borderWidth: 2,
    borderColor: '#FF7F00',
  },
  buttonIcon: {
    marginRight: 8,
  },
  viewTransactionButtonText: {
    fontSize: 18,
    fontWeight: 'bold',
    color: '#FF7F00',
  },
  doneButton: {
    width: '100%',
    backgroundColor: '#FF7F00',
    borderRadius: 12,
    paddingVertical: 16,
    alignItems: 'center',
  },
  doneButtonText: {
    fontSize: 18,
    fontWeight: 'bold',
    color: '#fff',
  },
});

