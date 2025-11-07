import { StyleSheet, View, TouchableOpacity, Modal, Platform } from 'react-native';
import { ThemedText } from '@/components/themed-text';
import { MaterialIcons } from '@expo/vector-icons';
import { Image } from 'expo-image';

interface ConfirmPaymentModalProps {
  visible: boolean;
  onClose: () => void;
  onConfirm: () => void;
  amount: number;
  network: string;
  networkLogo: any;
  recipient: string;
  serviceType?: string;
}

export function ConfirmPaymentModal({
  visible,
  onClose,
  onConfirm,
  amount,
  network,
  networkLogo,
  recipient,
  serviceType = 'Airtime VTU',
}: ConfirmPaymentModalProps) {
  const currentDate = new Date();
  const formattedDate = currentDate.toLocaleDateString('en-GB', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
  });
  const formattedTime = currentDate.toLocaleTimeString('en-US', {
    hour: '2-digit',
    minute: '2-digit',
    hour12: true,
  });

  return (
    <Modal
      visible={visible}
      transparent={true}
      animationType="slide"
      onRequestClose={onClose}>
      <View style={styles.modalOverlay}>
        <View style={styles.modalContent}>
          {/* Header */}
          <View style={styles.header}>
            <ThemedText style={styles.headerTitle}>Confirm Payment</ThemedText>
            <TouchableOpacity onPress={onClose} style={styles.closeButton}>
              <MaterialIcons name="close" size={24} color="#333" />
            </TouchableOpacity>
          </View>

          {/* Amount Display */}
          <View style={styles.amountContainer}>
            <ThemedText style={styles.amountText}>₦{amount.toFixed(2)}</ThemedText>
          </View>

          {/* Service Provider */}
          <View style={styles.providerContainer}>
            <View style={styles.providerLogoContainer}>
              <Image
                source={networkLogo}
                style={styles.providerLogo}
                contentFit="contain"
              />
            </View>
            <ThemedText style={styles.providerName}>{network}</ThemedText>
            <ThemedText style={styles.serviceType}>{serviceType}</ThemedText>
          </View>

          {/* Transaction Summary */}
          <View style={styles.summaryContainer}>
            <View style={styles.summaryRow}>
              <ThemedText style={styles.summaryLabel}>Amount</ThemedText>
              <ThemedText style={styles.summaryValue}>₦{amount.toFixed(2)}</ThemedText>
            </View>
            <View style={styles.summaryRow}>
              <ThemedText style={styles.summaryLabel}>Recipient</ThemedText>
              <ThemedText style={styles.summaryValue}>{recipient}</ThemedText>
            </View>
            <View style={styles.summaryRow}>
              <ThemedText style={styles.summaryLabel}>Date</ThemedText>
              <ThemedText style={styles.summaryValue}>
                {formattedDate}, {formattedTime}
              </ThemedText>
            </View>
            <View style={styles.summaryRow}>
              <ThemedText style={styles.summaryLabel}>Status</ThemedText>
              <ThemedText style={styles.statusValue}>Ready</ThemedText>
            </View>
          </View>

          {/* Confirm Button */}
          <TouchableOpacity style={styles.confirmButton} onPress={onConfirm}>
            <ThemedText style={styles.confirmButtonText}>Confirm Payment</ThemedText>
          </TouchableOpacity>
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.5)',
    justifyContent: 'flex-end',
  },
  modalContent: {
    backgroundColor: '#fff',
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    paddingTop: 20,
    paddingBottom: Platform.OS === 'ios' ? 40 : 30,
    paddingHorizontal: 20,
    maxHeight: '90%',
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 24,
  },
  headerTitle: {
    fontSize: 20,
    fontWeight: 'bold',
    color: '#000',
  },
  closeButton: {
    padding: 4,
  },
  amountContainer: {
    alignItems: 'center',
    marginBottom: 24,
  },
  amountText: {
    fontSize: 48,
    fontWeight: 'bold',
    color: '#000',
  },
  providerContainer: {
    alignItems: 'center',
    marginBottom: 32,
  },
  providerLogoContainer: {
    width: 90,
    height: 90,
    borderRadius: 12,
    backgroundColor: '#FFD700',
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 12,
    padding: 16,
  },
  providerLogo: {
    width: '100%',
    height: '100%',
  },
  providerName: {
    fontSize: 20,
    fontWeight: 'bold',
    color: '#000',
    marginBottom: 4,
  },
  serviceType: {
    fontSize: 14,
    color: '#666',
  },
  summaryContainer: {
    marginBottom: 32,
  },
  summaryRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: '#F0F0F0',
  },
  summaryLabel: {
    fontSize: 16,
    color: '#666',
  },
  summaryValue: {
    fontSize: 16,
    fontWeight: '600',
    color: '#000',
  },
  statusValue: {
    fontSize: 16,
    fontWeight: '600',
    color: '#2196F3',
  },
  confirmButton: {
    backgroundColor: '#FF7F00',
    borderRadius: 12,
    paddingVertical: 16,
    alignItems: 'center',
  },
  confirmButtonText: {
    fontSize: 18,
    fontWeight: 'bold',
    color: '#fff',
  },
});

