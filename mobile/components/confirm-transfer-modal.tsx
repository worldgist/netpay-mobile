import { StyleSheet, View, TouchableOpacity, Modal, Platform, ScrollView } from 'react-native';
import { ThemedText } from '@/components/themed-text';
import { MaterialIcons } from '@expo/vector-icons';

interface ConfirmTransferModalProps {
  visible: boolean;
  onClose: () => void;
  onConfirm: () => void;
  amount: number;
  recipientEmail: string;
  description?: string;
}

export function ConfirmTransferModal({
  visible,
  onClose,
  onConfirm,
  amount,
  recipientEmail,
  description,
}: ConfirmTransferModalProps) {
  const currentDate = new Date();
  const formattedDate = currentDate.toLocaleDateString('en-US', {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
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
            <ThemedText style={styles.headerTitle}>Confirm Transfer</ThemedText>
            <TouchableOpacity onPress={onClose} style={styles.closeButton}>
              <MaterialIcons name="close" size={24} color="#333" />
            </TouchableOpacity>
          </View>

          <ScrollView 
            style={styles.scrollView}
            contentContainerStyle={styles.scrollContent}
            showsVerticalScrollIndicator={true}
            bounces={true}
            nestedScrollEnabled={true}>
            {/* Amount Display */}
            <View style={styles.amountContainer}>
              <ThemedText style={styles.amountText}>₦{amount.toLocaleString('en-NG', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</ThemedText>
            </View>

            {/* Transfer Icon */}
            <View style={styles.iconContainer}>
              <View style={styles.iconCircle}>
                <MaterialIcons name="send" size={32} color="#FF7F00" />
              </View>
              <ThemedText style={styles.transferLabel}>Money Transfer</ThemedText>
            </View>

            {/* Transaction Summary */}
            <View style={styles.summaryContainer}>
              <View style={styles.summaryRow}>
                <ThemedText style={styles.summaryLabel}>Amount</ThemedText>
                <ThemedText style={styles.summaryValue}>₦{amount.toLocaleString('en-NG', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</ThemedText>
              </View>
              <View style={styles.summaryRow}>
                <ThemedText style={styles.summaryLabel}>Recipient</ThemedText>
                <ThemedText style={styles.summaryValue} numberOfLines={1}>{recipientEmail}</ThemedText>
              </View>
              {description && (
                <View style={styles.summaryRow}>
                  <ThemedText style={styles.summaryLabel}>Description</ThemedText>
                  <ThemedText style={styles.summaryValue} numberOfLines={2}>{description}</ThemedText>
                </View>
              )}
              <View style={styles.summaryRow}>
                <ThemedText style={styles.summaryLabel}>Date</ThemedText>
                <ThemedText style={styles.summaryValue}>{formattedDate}</ThemedText>
              </View>
              <View style={styles.summaryRow}>
                <ThemedText style={styles.summaryLabel}>Time</ThemedText>
                <ThemedText style={styles.summaryValue}>{formattedTime}</ThemedText>
              </View>
              <View style={[styles.summaryRow, styles.summaryRowLast]}>
                <ThemedText style={styles.summaryLabel}>Status</ThemedText>
                <ThemedText style={styles.statusValue}>Ready</ThemedText>
              </View>
            </View>

            {/* Warning Note */}
            <View style={styles.warningContainer}>
              <MaterialIcons name="info-outline" size={20} color="#FF9800" />
              <ThemedText style={styles.warningText}>
                Transfers are instant and cannot be reversed. Please verify recipient details before confirming.
              </ThemedText>
            </View>
          </ScrollView>

          {/* Confirm Button */}
          <TouchableOpacity style={styles.confirmButton} onPress={onConfirm}>
            <ThemedText style={styles.confirmButtonText}>Confirm Transfer</ThemedText>
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
    paddingBottom: Platform.OS === 'ios' ? 40 : 20,
    paddingHorizontal: 20,
    maxHeight: '85%',
    width: '100%',
  },
  scrollView: {
    flex: 1,
    maxHeight: 400,
  },
  scrollContent: {
    flexGrow: 1,
    paddingBottom: 20,
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 24,
  },
  headerTitle: {
    fontSize: 22,
    fontWeight: 'bold',
    color: '#333',
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
    color: '#FF7F00',
  },
  iconContainer: {
    alignItems: 'center',
    marginBottom: 32,
  },
  iconCircle: {
    width: 90,
    height: 90,
    borderRadius: 45,
    backgroundColor: '#FFF3E0',
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 12,
  },
  transferLabel: {
    fontSize: 16,
    color: '#666',
    fontWeight: '500',
  },
  summaryContainer: {
    backgroundColor: '#F5F5F5',
    borderRadius: 12,
    padding: 20,
    marginBottom: 20,
  },
  summaryRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: '#E0E0E0',
  },
  summaryRowLast: {
    borderBottomWidth: 0,
  },
  summaryLabel: {
    fontSize: 16,
    color: '#666',
    flex: 1,
  },
  summaryValue: {
    fontSize: 16,
    fontWeight: '600',
    color: '#333',
    flex: 1,
    textAlign: 'right',
  },
  statusValue: {
    fontSize: 16,
    fontWeight: '600',
    color: '#2196F3',
  },
  warningContainer: {
    flexDirection: 'row',
    backgroundColor: '#FFF3E0',
    borderRadius: 8,
    padding: 12,
    marginBottom: 24,
    alignItems: 'flex-start',
  },
  warningText: {
    fontSize: 13,
    color: '#E65100',
    marginLeft: 8,
    flex: 1,
    lineHeight: 18,
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

