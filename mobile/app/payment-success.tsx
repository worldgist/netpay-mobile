import { StyleSheet, View, TouchableOpacity, ScrollView, Platform } from 'react-native';
import { ThemedView } from '@/components/themed-view';
import { ThemedText } from '@/components/themed-text';
import { MaterialIcons } from '@expo/vector-icons';
import { useRouter, useLocalSearchParams } from 'expo-router';
import { useEffect, useRef } from 'react';
import { supabase } from '@/lib/supabase';
import { sendTransactionNotification } from '@/utils/push-notifications';
import { TransactionStorage, generateTransactionId, generateReference } from '@/utils/transactionStorage';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

export default function PaymentSuccessScreen() {
  const router = useRouter();
  const params = useLocalSearchParams();
  const insets = useSafeAreaInsets();
  const amount = (params.amount as string) || '0';
  const network = (params.network as string) || '';
  const recipient = (params.recipient as string) || '';
  const serviceType = (params.serviceType as string) || '';
  const token = (params.token as string) || '';
  const meterType = (params.meterType as string) || '';
  const customerName = (params.customerName as string) || '';
  const referenceParam = (params.reference as string) || '';
  const pinsParam = (params.pins as string) || '';
  
  // Parse PINs if provided (from education purchases)
  let pins: Array<{ Serial?: string; Pin?: string }> = [];
  try {
    if (pinsParam) {
      pins = JSON.parse(pinsParam);
    }
  } catch (e) {
    console.error('Failed to parse pins:', e);
  }
  
  const isEducationPurchase = serviceType.toLowerCase().includes('education');

  const transactionReference = referenceParam || generateReference(serviceType || 'PAYMENT');
  const currentDate = new Date();
  const transactionDate = currentDate.toLocaleDateString('en-US', {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
  });
  const transactionTime = currentDate.toLocaleTimeString('en-US', {
    hour: '2-digit',
    minute: '2-digit',
    hour12: true,
  });

  // Save transaction when screen loads
  useEffect(() => {
    const saveTransaction = async () => {
      const transaction = {
        id: generateTransactionId(),
        type: 'debit' as const,
        amount: parseFloat(amount),
        date: transactionDate,
        time: transactionTime,
        reference: transactionReference,
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
  }, [amount, network, recipient, serviceType, token, meterType, customerName, transactionReference, transactionDate, transactionTime]);

  const pushSentRef = useRef(false);

  useEffect(() => {
    if (pushSentRef.current) return;

    const notify = async () => {
      try {
        await sendTransactionNotification({
          amount: parseFloat(amount) || 0,
          serviceType: serviceType || undefined,
          network: network || undefined,
          recipient: recipient || undefined,
          reference: transactionReference,
          transactionType: 'purchase',
          metadata: {
            token: token || undefined,
            meterType: meterType || undefined,
            customerName: customerName || undefined,
            pins: pins.length > 0 ? pins : undefined,
          },
        });
      } catch (error) {
        console.error('Failed to send push notification:', error);
      }
    };

    pushSentRef.current = true;
    notify();
  }, [amount, network, recipient, serviceType, token, meterType, customerName, transactionReference, pins]);

  const handleDone = () => {
    // Navigate back to home or pay bills
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
        contentContainerStyle={[
          styles.scrollContent,
          { paddingTop: Math.max(insets.top, 20) + 20 }
        ]}
        showsVerticalScrollIndicator={false}>
        <View style={styles.content}>
          {/* Success Checkmark */}
          <View style={styles.checkmarkContainer}>
            <View style={styles.checkmarkCircle}>
              <MaterialIcons name="check" size={64} color="#fff" />
            </View>
          </View>

          {/* Success Message */}
          <View style={styles.titleContainer}>
            <ThemedText style={styles.successTitle} numberOfLines={2} adjustsFontSizeToFit>
              Payment Successful!
            </ThemedText>
          </View>
          <ThemedText style={styles.successMessage}>
            Your payment has been processed successfully
          </ThemedText>

          {/* Amount Display */}
          <View style={styles.amountCard}>
            <ThemedText style={styles.amountLabel}>Amount Paid</ThemedText>
            <View style={styles.amountValueContainer}>
              <ThemedText style={styles.amountValue}>₦{parseFloat(amount).toLocaleString('en-NG', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</ThemedText>
            </View>
          </View>

          {/* Transaction Details */}
          <View style={styles.detailsCard}>
            <ThemedText style={styles.detailsTitle}>Transaction Details</ThemedText>
            {serviceType && (
              <View style={styles.detailRow}>
                <ThemedText style={styles.detailLabel}>Service Type</ThemedText>
                <ThemedText style={styles.detailValue} numberOfLines={2}>{serviceType}</ThemedText>
              </View>
            )}
            {network && (
              <View style={styles.detailRow}>
                <ThemedText style={styles.detailLabel}>Network</ThemedText>
                <ThemedText style={styles.detailValue}>{network}</ThemedText>
              </View>
            )}
            {recipient && (
              <View style={styles.detailRow}>
                <ThemedText style={styles.detailLabel}>Recipient</ThemedText>
                <ThemedText style={styles.detailValue} numberOfLines={1}>{recipient}</ThemedText>
              </View>
            )}
            {customerName && (
              <View style={styles.detailRow}>
                <ThemedText style={styles.detailLabel}>Customer</ThemedText>
                <ThemedText style={styles.detailValue} numberOfLines={1}>{customerName}</ThemedText>
              </View>
            )}
            {meterType && (
              <View style={styles.detailRow}>
                <ThemedText style={styles.detailLabel}>Meter Type</ThemedText>
                <ThemedText style={styles.detailValue}>{meterType.toUpperCase()}</ThemedText>
              </View>
            )}
            {token && (
              <View style={[styles.detailRow, { backgroundColor: '#FFF5E6', borderWidth: 2, borderColor: '#FF7F00', borderRadius: 8, padding: 16, marginVertical: 8 }]}>
                <ThemedText style={[styles.detailLabel, { color: '#FF7F00', fontWeight: '600', fontSize: 12, textTransform: 'uppercase', letterSpacing: 0.5 }]}>Electricity Token</ThemedText>
                <ThemedText style={[styles.detailValue, { fontFamily: 'monospace', fontSize: 18, fontWeight: 'bold', textAlign: 'center', letterSpacing: 2, marginTop: 8 }]} numberOfLines={0}>{token}</ThemedText>
                <ThemedText style={{ fontSize: 11, color: '#666', textAlign: 'center', marginTop: 8 }}>Keep this token safe. You'll need it to recharge your meter.</ThemedText>
              </View>
            )}
            {isEducationPurchase && pins.length > 0 && (
              <View style={[styles.detailRow, { backgroundColor: '#E8F5E9', borderWidth: 2, borderColor: '#4CAF50', borderRadius: 8, padding: 16, marginVertical: 8, flexDirection: 'column' }]}>
                <ThemedText style={[styles.detailLabel, { color: '#4CAF50', fontWeight: '600', fontSize: 12, textTransform: 'uppercase', letterSpacing: 0.5, marginBottom: 12 }]}>PIN Details</ThemedText>
                {pins.map((pinData, index) => (
                  <View key={index} style={{ marginBottom: index < pins.length - 1 ? 16 : 0, paddingBottom: index < pins.length - 1 ? 16 : 0, borderBottomWidth: index < pins.length - 1 ? 1 : 0, borderBottomColor: '#C8E6C9' }}>
                    {pinData.Serial && (
                      <View style={{ marginBottom: 8 }}>
                        <ThemedText style={{ fontSize: 11, color: '#666', marginBottom: 4 }}>Serial Number</ThemedText>
                        <ThemedText style={{ fontFamily: 'monospace', fontSize: 16, fontWeight: '600', color: '#333' }}>{pinData.Serial}</ThemedText>
                      </View>
                    )}
                    {pinData.Pin && (
                      <View>
                        <ThemedText style={{ fontSize: 11, color: '#666', marginBottom: 4 }}>PIN</ThemedText>
                        <ThemedText style={{ fontFamily: 'monospace', fontSize: 18, fontWeight: 'bold', color: '#1B5E20', letterSpacing: 1 }}>{pinData.Pin}</ThemedText>
                      </View>
                    )}
                  </View>
                ))}
                <ThemedText style={{ fontSize: 11, color: '#666', textAlign: 'center', marginTop: 12, fontStyle: 'italic' }}>Keep this PIN safe. You'll need it for your exam registration.</ThemedText>
              </View>
            )}
            <View style={styles.detailRow}>
              <ThemedText style={styles.detailLabel}>Status</ThemedText>
              <ThemedText style={styles.statusValue}>Completed</ThemedText>
            </View>
            <View style={styles.detailRow}>
              <ThemedText style={styles.detailLabel}>Reference</ThemedText>
              <ThemedText style={styles.detailValue} numberOfLines={1}>{transactionReference}</ThemedText>
            </View>
            <View style={styles.detailRow}>
              <ThemedText style={styles.detailLabel}>Date</ThemedText>
              <ThemedText style={styles.detailValue}>{transactionDate}</ThemedText>
            </View>
            <View style={styles.detailRow}>
              <ThemedText style={styles.detailLabel}>Time</ThemedText>
              <ThemedText style={styles.detailValue}>{transactionTime}</ThemedText>
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
    alignItems: 'center',
    paddingHorizontal: 20,
    paddingTop: 20,
  },
  titleContainer: {
    width: '100%',
    paddingHorizontal: 10,
    marginBottom: 12,
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
    textAlign: 'center',
    lineHeight: 36,
    minHeight: 36,
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

