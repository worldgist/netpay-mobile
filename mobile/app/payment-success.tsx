import { StyleSheet, View, TouchableOpacity } from 'react-native';
import { ThemedView } from '@/components/themed-view';
import { ThemedText } from '@/components/themed-text';
import { MaterialIcons } from '@expo/vector-icons';
import { useRouter, useLocalSearchParams } from 'expo-router';
import { useEffect, useRef } from 'react';
import { supabase } from '@/lib/supabase';
import { sendPushNotification } from '@/utils/push-notifications';
import { TransactionStorage, generateTransactionId, generateReference } from '@/utils/transactionStorage';

export default function PaymentSuccessScreen() {
  const router = useRouter();
  const params = useLocalSearchParams();
  const amount = (params.amount as string) || '0';
  const network = (params.network as string) || '';
  const recipient = (params.recipient as string) || '';
  const serviceType = (params.serviceType as string) || '';
  const token = (params.token as string) || '';
  const meterType = (params.meterType as string) || '';
  const customerName = (params.customerName as string) || '';

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
        reference: generateReference(serviceType || 'PAYMENT'),
        status: 'Completed',
        description: serviceType || 'Payment',
        recipient: recipient || '',
        serviceType: serviceType || '',
        network: network || '',
        metadata: {
          token: token || undefined,
          meterType: meterType || undefined,
          customerName: customerName || undefined,
        },
      };
      await TransactionStorage.addTransaction(transaction);
    };

    saveTransaction();
  }, [amount, network, recipient, serviceType, token, meterType, customerName]);

  const pushSentRef = useRef(false);

  useEffect(() => {
    if (pushSentRef.current) return;

    const notify = async () => {
      try {
        const { data } = await supabase.auth.getSession();
        const userId = data.session?.user.id;
        if (!userId) return;

        const amountValue = Number(amount);
        const formattedAmount = Number.isFinite(amountValue) ? amountValue.toFixed(2) : amount;
        const title = 'Payment Successful';
        const bodyParts = [`₦${formattedAmount}`];
        if (serviceType) bodyParts.push(serviceType);
        bodyParts.push('completed');

        await sendPushNotification({
          user_id: userId,
          title,
          body: bodyParts.join(' '),
          data: {
            amount,
            network,
            serviceType,
            recipient,
            token,
          },
        });
      } catch (error) {
        console.error('Failed to send push notification:', error);
      }
    };

    pushSentRef.current = true;
    notify();
  }, [amount, network, recipient, serviceType, token]);

  const handleDone = () => {
    // Navigate back to home or pay bills
    router.replace('/(tabs)');
  };

  return (
    <ThemedView style={styles.container}>
      <View style={styles.content}>
        {/* Success Checkmark */}
        <View style={styles.checkmarkContainer}>
          <View style={styles.checkmarkCircle}>
            <MaterialIcons name="check" size={64} color="#fff" />
          </View>
        </View>

        {/* Success Message */}
        <ThemedText style={styles.successTitle}>Payment Successful!</ThemedText>
        <ThemedText style={styles.successMessage}>
          Your payment has been processed successfully
        </ThemedText>

        {/* Transaction Details */}
        <View style={styles.detailsCard}>
          <View style={styles.detailRow}>
            <ThemedText style={styles.detailLabel}>Amount</ThemedText>
            <ThemedText style={styles.detailValue}>₦{parseFloat(amount).toFixed(2)}</ThemedText>
          </View>
          {network && (
            <View style={styles.detailRow}>
              <ThemedText style={styles.detailLabel}>Network</ThemedText>
              <ThemedText style={styles.detailValue}>{network}</ThemedText>
            </View>
          )}
          {recipient && (
            <View style={styles.detailRow}>
              <ThemedText style={styles.detailLabel}>Recipient</ThemedText>
              <ThemedText style={styles.detailValue}>{recipient}</ThemedText>
            </View>
          )}
          {meterType ? (
            <View style={styles.detailRow}>
              <ThemedText style={styles.detailLabel}>Meter Type</ThemedText>
              <ThemedText style={styles.detailValue}>{meterType.toUpperCase()}</ThemedText>
            </View>
          ) : null}
          {customerName ? (
            <View style={styles.detailRow}>
              <ThemedText style={styles.detailLabel}>Customer</ThemedText>
              <ThemedText style={styles.detailValue}>{customerName}</ThemedText>
            </View>
          ) : null}
          {token ? (
            <View style={styles.detailRow}>
              <ThemedText style={styles.detailLabel}>Token</ThemedText>
              <ThemedText style={styles.detailValue}>{token}</ThemedText>
            </View>
          ) : null}
          <View style={styles.detailRow}>
            <ThemedText style={styles.detailLabel}>Status</ThemedText>
            <ThemedText style={styles.statusValue}>Completed</ThemedText>
          </View>
        </View>

        {/* Done Button */}
        <TouchableOpacity style={styles.doneButton} onPress={handleDone}>
          <ThemedText style={styles.doneButtonText}>Done</ThemedText>
        </TouchableOpacity>
      </View>
    </ThemedView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#fff',
  },
  content: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: 20,
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
    marginBottom: 40,
    paddingHorizontal: 20,
  },
  detailsCard: {
    width: '100%',
    backgroundColor: '#F5F5F5',
    borderRadius: 12,
    padding: 20,
    marginBottom: 40,
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
  },
  detailValue: {
    fontSize: 16,
    fontWeight: '600',
    color: '#000',
  },
  statusValue: {
    fontSize: 16,
    fontWeight: '600',
    color: '#4CAF50',
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

