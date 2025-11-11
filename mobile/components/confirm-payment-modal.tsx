import { StyleSheet, View, TouchableOpacity, Modal, ActivityIndicator } from 'react-native';
import { useState } from 'react';
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
  planDetails?: string;
  loading?: boolean;
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
  planDetails,
  loading = false,
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
  const [submitting, setSubmitting] = useState(false);

  const isBusy = submitting || loading;

  const handleConfirm = async () => {
    if (isBusy) return;

    try {
      setSubmitting(true);
      await onConfirm();
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <Modal
      visible={visible}
      transparent={true}
      animationType="slide"
      onRequestClose={onClose}>
      <View style={styles.modalOverlay}>
        <View style={styles.modalContainer}>
          <View style={styles.modalBackground}>
            <View style={styles.modalContent}>
              <View style={styles.headerRow}>
                <ThemedText style={styles.headerTitle}>Payment</ThemedText>
                <TouchableOpacity onPress={isBusy ? undefined : onClose} style={styles.closeButton} disabled={isBusy}>
                  <MaterialIcons name="close" size={22} color="#333" />
                </TouchableOpacity>
              </View>

              <View style={styles.amountCard}>
                <View style={styles.amountBadge}>
                  <ThemedText style={styles.amountDisplay}>₦{amount.toFixed(2)}</ThemedText>
                </View>
                <View style={styles.headerProviderGroup}>
                  <Image source={networkLogo} style={styles.headerProviderLogo} contentFit="contain" />
                  <ThemedText style={styles.headerProviderName}>{network}</ThemedText>
                </View>
              </View>

              <View style={styles.summaryCard}>
                <View style={styles.summaryRow}>
                  <ThemedText style={styles.summaryLabel}>Amount</ThemedText>
                  <ThemedText style={styles.summaryValue}>₦{amount.toFixed(2)}</ThemedText>
                </View>
                <View style={styles.summaryRow}>
                  <ThemedText style={styles.summaryLabel}>Recipient</ThemedText>
                  <ThemedText style={styles.summaryValue}>{recipient}</ThemedText>
                </View>
                <View style={[styles.summaryRow, styles.providerRow]}>
                  <ThemedText style={styles.summaryLabel}>Provider</ThemedText>
                  <View style={styles.providerInfo}>
                    <Image source={networkLogo} style={styles.providerLogo} contentFit="contain" />
                    <ThemedText style={styles.providerName}>{network}</ThemedText>
                  </View>
                </View>
                {serviceType ? (
                  <View style={styles.summaryRow}>
                    <ThemedText style={styles.summaryLabel}>Service</ThemedText>
                    <ThemedText style={styles.summaryValue}>{serviceType}</ThemedText>
                  </View>
                ) : null}
                {planDetails ? (
                  <View style={styles.summaryRow}>
                    <ThemedText style={styles.summaryLabel}>Plan Details</ThemedText>
                    <ThemedText style={styles.summaryValue}>{planDetails}</ThemedText>
                  </View>
                ) : null}
              </View>

              <View style={styles.summaryCard}>
                <View style={styles.summaryRow}>
                  <ThemedText style={styles.summaryLabel}>Date</ThemedText>
                  <ThemedText style={styles.summaryValue}>
                    {formattedDate}, {formattedTime}
                  </ThemedText>
                </View>
                <View style={styles.summaryRow}>
                  <ThemedText style={styles.summaryLabel}>Status</ThemedText>
              <ThemedText style={[styles.summaryValue, styles.statusValue]}>
                {isBusy ? 'Authorizing payment…' : 'Ready'}
              </ThemedText>
                </View>
              </View>

          <TouchableOpacity style={[styles.confirmButton, isBusy && styles.confirmButtonDisabled]} onPress={handleConfirm} disabled={isBusy}>
            {isBusy ? (
                  <ActivityIndicator color="#fff" />
                ) : (
                  <ThemedText style={styles.confirmButtonText}>Confirm to Pay</ThemedText>
                )}
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.4)',
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: 12,
  },
  modalContainer: {
    width: '100%',
    maxWidth: 340,
    borderRadius: 20,
    overflow: 'hidden',
  },
  modalBackground: {
    backgroundColor: '#FF7F00',
    borderRadius: 20,
    paddingTop: 16,
    paddingHorizontal: 3,
  },
  modalContent: {
    backgroundColor: '#fff',
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    paddingHorizontal: 18,
    paddingBottom: 20,
    paddingTop: 16,
  },
  headerRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 12,
  },
  headerTitle: {
    fontSize: 16,
    fontWeight: '600',
    color: '#222',
  },
  closeButton: {
    padding: 4,
  },
  amountCard: {
    alignItems: 'center',
    paddingVertical: 14,
    marginBottom: 14,
    gap: 10,
  },
  amountBadge: {
    backgroundColor: '#FFF6ED',
    borderRadius: 24,
    paddingHorizontal: 28,
    paddingVertical: 14,
    borderWidth: 1,
    borderColor: '#FFD9B3',
  },
  amountDisplay: {
    fontSize: 24,
    fontWeight: '800',
    color: '#000',
  },
  headerProviderGroup: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginBottom: 8,
  },
  headerProviderLogo: {
    width: 28,
    height: 28,
    borderRadius: 14,
  },
  headerProviderName: {
    fontSize: 14,
    fontWeight: '600',
    color: '#444',
  },
  summaryCard: {
    backgroundColor: '#F8F8F8',
    borderRadius: 16,
    paddingHorizontal: 16,
    paddingVertical: 12,
    marginBottom: 14,
  },
  summaryRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: 6,
  },
  summaryLabel: {
    fontSize: 14,
    color: '#7A7A7A',
    fontWeight: '500',
  },
  summaryValue: {
    fontSize: 14,
    color: '#101010',
    fontWeight: '600',
  },
  providerRow: {
    alignItems: 'flex-start',
  },
  providerInfo: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  providerLogo: {
    width: 24,
    height: 24,
    borderRadius: 12,
  },
  providerName: {
    fontSize: 13,
    fontWeight: '600',
    color: '#101010',
  },
  statusValue: {
    color: '#2666CF',
  },
  confirmButton: {
    marginTop: 6,
    backgroundColor: '#FF7F00',
    borderRadius: 22,
    paddingVertical: 12,
    alignItems: 'center',
  },
  confirmButtonDisabled: {
    backgroundColor: '#FFB875',
  },
  confirmButtonText: {
    fontSize: 15,
    fontWeight: '700',
    color: '#fff',
  },
});

