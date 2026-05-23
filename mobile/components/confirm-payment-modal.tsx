import { StyleSheet, View, TouchableOpacity, Modal, ScrollView } from 'react-native';
import { NetpayLoadingAnimation } from '@/components/netpay-loading-animation';
import { useState } from 'react';
import { ThemedText } from '@/components/themed-text';
import { MaterialIcons } from '@expo/vector-icons';
import { Image } from 'expo-image';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

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
  charges?: number; // Optional service charges/fees
  quantity?: number; // Optional quantity (for WAEC/NECO PINs)
  disabled?: boolean;
  customerName?: string; // Optional customer name (for betting, etc.)
  recipientLabel?: string;
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
  charges = 0,
  quantity = 1,
  customerName,
  recipientLabel = 'Recipient',
}: ConfirmPaymentModalProps) {
  const insets = useSafeAreaInsets();
  const currentDate = new Date();
  const formattedDate = currentDate.toLocaleDateString('en-US', {
    month: '2-digit',
    day: '2-digit',
    year: 'numeric',
  });
  const formattedTime = currentDate.toLocaleTimeString('en-US', {
    hour: '2-digit',
    minute: '2-digit',
    hour12: true,
  });
  const [submitting, setSubmitting] = useState(false);

  const isBusy = submitting || loading;
  // Ensure charges is a number
  const numericCharges = typeof charges === 'number' ? charges : (typeof charges === 'string' ? parseFloat(charges) || 0 : 0);
  // Calculate total: (amount + charges) * quantity
  const unitTotal = amount + numericCharges;
  const totalAmount = unitTotal * quantity;

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
      statusBarTranslucent
      onRequestClose={onClose}>
      <View style={styles.modalOverlay}>
        <TouchableOpacity 
          style={styles.backdrop} 
          activeOpacity={1} 
          onPress={isBusy ? undefined : onClose}
          disabled={isBusy}
        />
        <View style={[styles.modalContainer, { paddingBottom: Math.max(insets.bottom, 20) }]}>
          <View style={styles.modalContent}>
            {/* Header with Amount */}
            <View style={styles.headerRow}>
              <TouchableOpacity onPress={isBusy ? undefined : onClose} style={styles.closeButton} disabled={isBusy}>
                <MaterialIcons name="close" size={24} color="#333" />
              </TouchableOpacity>
              <View style={styles.headerCenter}>
                <ThemedText style={styles.headerTitle}>Payment</ThemedText>
                <ThemedText 
                  style={styles.headerAmount}
                  numberOfLines={2}
                  adjustsFontSizeToFit={true}
                  minimumFontScale={0.7}>
                  ₦{totalAmount.toLocaleString('en-NG', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                </ThemedText>
              </View>
              <View style={styles.closeButtonPlaceholder} />
            </View>

            <ScrollView
              style={styles.detailsScroll}
              contentContainerStyle={styles.detailsScrollContent}
              showsVerticalScrollIndicator={false}
              keyboardShouldPersistTaps="handled">
              {/* Payment Details Card */}
              <View style={styles.detailsCard}>
                <ThemedText style={styles.cardTitle}>Payment Details</ThemedText>
                <View style={styles.detailRow}>
                  <ThemedText style={styles.detailLabel}>Price {quantity > 1 ? `(×${quantity})` : ''}</ThemedText>
                  <ThemedText style={styles.detailValue}>
                    ₦{(amount * quantity).toLocaleString('en-NG', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                    {quantity > 1 && (
                      <ThemedText style={{ fontSize: 12, color: '#666' }}> (₦{amount.toLocaleString('en-NG', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} each)</ThemedText>
                    )}
                  </ThemedText>
                </View>
                {numericCharges > 0 && (
                  <View style={styles.detailRow}>
                    <ThemedText style={styles.detailLabel}>Charge Fee {quantity > 1 ? `(×${quantity})` : ''}</ThemedText>
                    <ThemedText style={styles.detailValue}>
                      ₦{(numericCharges * quantity).toLocaleString('en-NG', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                      {quantity > 1 && (
                        <ThemedText style={{ fontSize: 12, color: '#666' }}> (₦{numericCharges.toLocaleString('en-NG', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} each)</ThemedText>
                      )}
                    </ThemedText>
                  </View>
                )}
                {quantity > 1 && (
                  <View style={styles.detailRow}>
                    <ThemedText style={styles.detailLabel}>Quantity</ThemedText>
                    <ThemedText style={styles.detailValue}>{quantity} PIN{quantity > 1 ? 's' : ''}</ThemedText>
                  </View>
                )}
                <View style={styles.detailRow}>
                  <ThemedText style={styles.detailLabel}>{recipientLabel}</ThemedText>
                  <ThemedText style={styles.detailValue} numberOfLines={1} ellipsizeMode="tail">{recipient || 'N/A'}</ThemedText>
                </View>
                <View style={styles.detailRow}>
                  <ThemedText style={styles.detailLabel}>Provider</ThemedText>
                  <View style={styles.providerInfo}>
                    <Image source={networkLogo} style={styles.providerLogo} contentFit="contain" />
                    <ThemedText style={styles.providerName} numberOfLines={1} ellipsizeMode="tail">{network}</ThemedText>
                  </View>
                </View>
                {customerName && (
                  <View style={styles.detailRow}>
                    <ThemedText style={styles.detailLabel}>Customer Name</ThemedText>
                    <ThemedText style={styles.detailValue} numberOfLines={1} ellipsizeMode="tail">{customerName}</ThemedText>
                  </View>
                )}
              </View>

              {/* Transaction Status Card */}
              <View style={styles.statusCard}>
                <ThemedText style={styles.cardTitle}>Transaction Status</ThemedText>
                <View style={styles.detailRow}>
                  <ThemedText style={styles.detailLabel}>Date</ThemedText>
                  <ThemedText style={styles.detailValue} numberOfLines={1}>
                    {formattedDate}, {formattedTime}
                  </ThemedText>
                </View>
                <View style={styles.detailRow}>
                  <ThemedText style={styles.detailLabel}>Status</ThemedText>
                  <ThemedText style={[styles.statusValue, styles.statusProcessing]}>
                    {isBusy ? 'Processing' : 'Ready'}
                  </ThemedText>
                </View>
              </View>
            </ScrollView>

            {/* Confirm Button */}
            <TouchableOpacity 
              style={[styles.confirmButton, isBusy && styles.confirmButtonDisabled]} 
              onPress={handleConfirm} 
              disabled={isBusy}>
              {isBusy ? (
                <NetpayLoadingAnimation size={40} variant="onBrand" strokeWidth={2.5} />
              ) : (
                <ThemedText style={styles.confirmButtonText}>Confirm to Pay</ThemedText>
              )}
            </TouchableOpacity>
          </View>
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  modalOverlay: {
    flex: 1,
    justifyContent: 'flex-end',
  },
  backdrop: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(0, 0, 0, 0.5)',
  },
  modalContainer: {
    backgroundColor: '#fff',
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    paddingBottom: 32,
    maxHeight: '90%',
    overflow: 'visible',
  },
  modalContent: {
    paddingHorizontal: 20,
    paddingTop: 20,
    flexShrink: 1,
    overflow: 'visible',
  },
  detailsScroll: {
    flexGrow: 0,
    marginBottom: 16,
  },
  detailsScrollContent: {
    paddingBottom: 4,
  },
  headerRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    marginBottom: 24,
    paddingBottom: 16,
    borderBottomWidth: 1,
    borderBottomColor: '#F0F0F0',
    paddingRight: 0,
    paddingLeft: 0,
  },
  headerCenter: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 16,
  },
  headerTitle: {
    fontSize: 18,
    fontWeight: '600',
    color: '#666',
    marginBottom: 6,
    textAlign: 'center',
  },
  headerAmount: {
    fontSize: 32,
    fontWeight: 'bold',
    color: '#000',
    letterSpacing: -0.5,
    lineHeight: 40,
    includeFontPadding: false,
    textAlign: 'center',
    textAlignVertical: 'center',
  },
  closeButton: {
    padding: 4,
    marginTop: 4,
    width: 32,
    height: 32,
    alignItems: 'center',
    justifyContent: 'center',
    flexShrink: 0,
  },
  closeButtonPlaceholder: {
    width: 32,
    flexShrink: 0,
  },
  detailsCard: {
    backgroundColor: '#FAFAFA',
    borderRadius: 12,
    padding: 16,
    marginBottom: 12,
    borderWidth: 1,
    borderColor: '#E8E8E8',
  },
  statusCard: {
    backgroundColor: '#FAFAFA',
    borderRadius: 12,
    padding: 16,
    marginBottom: 8,
    borderWidth: 1,
    borderColor: '#E8E8E8',
  },
  cardTitle: {
    fontSize: 14,
    fontWeight: '600',
    color: '#666',
    marginBottom: 12,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
  detailRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: 8,
    minHeight: 44,
  },
  detailLabel: {
    fontSize: 15,
    color: '#666',
    fontWeight: '500',
    flex: 1,
  },
  detailValue: {
    fontSize: 15,
    color: '#333',
    fontWeight: '600',
    flex: 1,
    textAlign: 'right',
    marginLeft: 12,
  },
  providerInfo: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    flex: 1,
    justifyContent: 'flex-end',
  },
  providerLogo: {
    width: 24,
    height: 24,
    borderRadius: 4,
  },
  providerName: {
    fontSize: 16,
    fontWeight: '600',
    color: '#333',
    flexShrink: 1,
  },
  statusValue: {
    fontSize: 16,
    fontWeight: '600',
  },
  statusProcessing: {
    color: '#2666CF',
  },
  confirmButton: {
    backgroundColor: '#FF7F00',
    borderRadius: 12,
    paddingVertical: 16,
    alignItems: 'center',
    justifyContent: 'center',
    minHeight: 52,
  },
  confirmButtonDisabled: {
    backgroundColor: '#FFB875',
    opacity: 0.7,
  },
  confirmButtonText: {
    fontSize: 18,
    fontWeight: 'bold',
    color: '#fff',
  },
});

export default ConfirmPaymentModal;

