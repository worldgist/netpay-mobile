import { StyleSheet, View, TouchableOpacity, Modal, Platform, ScrollView } from 'react-native';
import { ThemedText } from '@/components/themed-text';
import { MaterialIcons } from '@expo/vector-icons';
import { NetpayLoadingAnimation } from '@/components/netpay-loading-animation';

interface ConfirmTransferModalProps {
  visible: boolean;
  onClose: () => void;
  onConfirm: () => void;
  amount: number;
  recipientEmail: string;
  description?: string;
  transferFee?: number;
  loading?: boolean;
}

export function ConfirmTransferModal({
  visible,
  onClose,
  onConfirm,
  amount,
  recipientEmail,
  description,
  transferFee = 0,
  loading = false,
}: ConfirmTransferModalProps) {
  const totalAmount = amount + transferFee;
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
        <View style={[styles.modalContent, loading && styles.modalContentDisabled]} pointerEvents={loading ? 'none' : 'auto'}>
          {/* Header */}
          <View style={styles.header}>
            <ThemedText style={styles.headerTitle}>Confirm Transfer</ThemedText>
            <TouchableOpacity onPress={onClose} style={styles.closeButton} disabled={loading}>
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
                <ThemedText style={styles.summaryLabel}>Transfer Amount</ThemedText>
                <ThemedText style={styles.summaryValue}>₦{amount.toLocaleString('en-NG', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</ThemedText>
              </View>
              {transferFee > 0 && (
                <View style={styles.summaryRow}>
                  <ThemedText style={styles.summaryLabel}>Transfer Fee</ThemedText>
                  <ThemedText style={styles.summaryValue}>₦{transferFee.toLocaleString('en-NG', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</ThemedText>
                </View>
              )}
              {transferFee > 0 && (
                <View style={[styles.summaryRow, styles.summaryRowTotal]}>
                  <ThemedText style={styles.summaryLabelTotal}>Total Amount</ThemedText>
                  <ThemedText style={styles.summaryValueTotal}>₦{totalAmount.toLocaleString('en-NG', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</ThemedText>
                </View>
              )}
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
                <ThemedText style={[styles.statusValue, loading && styles.statusValueProcessing]}>
                  {loading ? 'Processing…' : 'Ready'}
                </ThemedText>
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
          <TouchableOpacity
            style={[styles.confirmButton, loading && styles.confirmButtonDisabled]}
            onPress={loading ? undefined : onConfirm}
            activeOpacity={loading ? 1 : 0.8}
            disabled={loading}
          >
            {loading ? (
              <View style={styles.confirmButtonContent}>
                <NetpayLoadingAnimation size={40} strokeWidth={2.5} variant="onBrand" />
                <ThemedText style={[styles.confirmButtonText, styles.confirmButtonTextLoading]}>Processing…</ThemedText>
              </View>
            ) : (
              <ThemedText style={styles.confirmButtonText}>Confirm Transfer</ThemedText>
            )}
          </TouchableOpacity>
        </View>
        {loading && (
          <View style={styles.loadingOverlay} pointerEvents="auto">
            <View style={styles.loadingCard}>
              <NetpayLoadingAnimation message="Processing transfer…" />
            </View>
          </View>
        )}
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
  modalContentDisabled: {
    opacity: 0.5,
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
  summaryRowTotal: {
    borderTopWidth: 2,
    borderTopColor: '#FF7F00',
    borderBottomWidth: 0,
    marginTop: 8,
    paddingTop: 12,
  },
  summaryLabelTotal: {
    fontSize: 17,
    fontWeight: '700',
    color: '#333',
    flex: 1,
  },
  summaryValueTotal: {
    fontSize: 17,
    fontWeight: '700',
    color: '#FF7F00',
    flex: 1,
    textAlign: 'right',
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
    color: '#4CAF50',
  },
  statusValueProcessing: {
    color: '#FF9800',
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
  confirmButtonDisabled: {
    opacity: 0.7,
  },
  confirmButtonContent: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 12,
  },
  confirmButtonTextLoading: {
    marginLeft: 4,
  },
  confirmButtonText: {
    fontSize: 18,
    fontWeight: 'bold',
    color: '#fff',
  },
  loadingOverlay: {
    ...StyleSheet.absoluteFillObject,
    justifyContent: 'center',
    alignItems: 'center',
  },
  loadingCard: {
    backgroundColor: '#fff',
    borderRadius: 22,
    paddingVertical: 28,
    paddingHorizontal: 32,
    alignItems: 'center',
    minWidth: 260,
    shadowColor: '#000',
    shadowOpacity: 0.12,
    shadowRadius: 24,
    shadowOffset: { width: 0, height: 14 },
    elevation: 16,
  },
});

