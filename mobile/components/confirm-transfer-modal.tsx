import { StyleSheet, View, TouchableOpacity, Modal, Platform, ScrollView, Text } from 'react-native';
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

const formatNaira = (value: number) =>
  `₦${Number(value || 0).toLocaleString('en-NG', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })}`;

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
        <View style={styles.modalContent} pointerEvents={loading ? 'none' : 'auto'}>
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
              <ThemedText style={styles.amountLabel}>You're sending</ThemedText>
              <Text
                style={styles.amountText}
                numberOfLines={1}
                adjustsFontSizeToFit
                minimumFontScale={0.55}>
                {formatNaira(amount)}
              </Text>
              {transferFee > 0 ? (
                <View style={styles.totalPill}>
                  <ThemedText style={styles.totalPillLabel}>Total with fee</ThemedText>
                  <Text style={styles.totalPillValue}>{formatNaira(totalAmount)}</Text>
                </View>
              ) : null}
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
                <Text style={styles.summaryValue}>{formatNaira(amount)}</Text>
              </View>
              {transferFee > 0 && (
                <View style={styles.summaryRow}>
                  <ThemedText style={styles.summaryLabel}>Transfer Fee</ThemedText>
                  <Text style={styles.summaryValue}>{formatNaira(transferFee)}</Text>
                </View>
              )}
              {transferFee > 0 && (
                <View style={[styles.summaryRow, styles.summaryRowTotal]}>
                  <ThemedText style={styles.summaryLabelTotal}>Total Amount</ThemedText>
                  <Text style={styles.summaryValueTotal}>{formatNaira(totalAmount)}</Text>
                </View>
              )}
              <View style={styles.summaryRow}>
                <ThemedText style={styles.summaryLabel}>Recipient</ThemedText>
                <ThemedText style={styles.summaryValueText} numberOfLines={2}>
                  {recipientEmail}
                </ThemedText>
              </View>
              {description ? (
                <View style={styles.summaryRow}>
                  <ThemedText style={styles.summaryLabel}>Description</ThemedText>
                  <ThemedText style={styles.summaryValueText} numberOfLines={2}>
                    {description}
                  </ThemedText>
                </View>
              ) : null}
              <View style={styles.summaryRow}>
                <ThemedText style={styles.summaryLabel}>Date</ThemedText>
                <ThemedText style={styles.summaryValueText}>{formattedDate}</ThemedText>
              </View>
              <View style={styles.summaryRow}>
                <ThemedText style={styles.summaryLabel}>Time</ThemedText>
                <ThemedText style={styles.summaryValueText}>{formattedTime}</ThemedText>
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
          <TouchableOpacity
            style={[styles.confirmButton, loading && styles.confirmButtonDisabled]}
            onPress={loading ? undefined : onConfirm}
            activeOpacity={loading ? 1 : 0.8}
            disabled={loading}>
            <ThemedText style={styles.confirmButtonText}>
              Confirm {formatNaira(transferFee > 0 ? totalAmount : amount)}
            </ThemedText>
          </TouchableOpacity>
        </View>
        {loading ? (
          <View style={styles.loadingOverlay} pointerEvents="auto">
            <View style={styles.loadingCard}>
              <NetpayLoadingAnimation message="Processing transfer…" />
            </View>
          </View>
        ) : null}
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
    flexGrow: 0,
    maxHeight: 420,
  },
  scrollContent: {
    flexGrow: 1,
    paddingBottom: 20,
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 16,
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
    marginBottom: 20,
    paddingHorizontal: 8,
    paddingVertical: 16,
    backgroundColor: '#FFF8F1',
    borderRadius: 16,
    borderWidth: 1,
    borderColor: '#FFE0B2',
  },
  amountLabel: {
    fontSize: 14,
    fontWeight: '600',
    color: '#8D6E63',
    marginBottom: 8,
    textTransform: 'uppercase',
    letterSpacing: 0.6,
  },
  amountText: {
    fontSize: 40,
    lineHeight: 48,
    fontWeight: '800',
    color: '#FF7F00',
    textAlign: 'center',
    width: '100%',
  },
  totalPill: {
    marginTop: 12,
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: 20,
    backgroundColor: '#fff',
    borderWidth: 1,
    borderColor: '#FFCC80',
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  totalPillLabel: {
    fontSize: 13,
    color: '#666',
    fontWeight: '500',
  },
  totalPillValue: {
    fontSize: 15,
    fontWeight: '700',
    color: '#E65100',
  },
  iconContainer: {
    alignItems: 'center',
    marginBottom: 24,
  },
  iconCircle: {
    width: 72,
    height: 72,
    borderRadius: 36,
    backgroundColor: '#FFF3E0',
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 10,
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
    alignItems: 'flex-start',
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: '#E0E0E0',
    gap: 12,
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
    flexShrink: 0,
  },
  summaryValueTotal: {
    fontSize: 18,
    lineHeight: 24,
    fontWeight: '800',
    color: '#FF7F00',
    flex: 1,
    textAlign: 'right',
  },
  summaryLabel: {
    fontSize: 16,
    color: '#666',
    flexShrink: 0,
    maxWidth: '42%',
  },
  summaryValue: {
    fontSize: 16,
    lineHeight: 22,
    fontWeight: '700',
    color: '#222',
    flex: 1,
    textAlign: 'right',
  },
  summaryValueText: {
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
  warningContainer: {
    flexDirection: 'row',
    backgroundColor: '#FFF3E0',
    borderRadius: 8,
    padding: 12,
    marginBottom: 8,
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
  confirmButtonText: {
    fontSize: 18,
    fontWeight: 'bold',
    color: '#fff',
  },
  loadingOverlay: {
    ...StyleSheet.absoluteFill,
    backgroundColor: 'rgba(0, 0, 0, 0.35)',
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
