import { Modal, StyleSheet, TouchableOpacity, View } from 'react-native';
import { MaterialIcons } from '@expo/vector-icons';
import { ThemedText } from '@/components/themed-text';

export type PurchaseOutcomeSheetVariant = 'pending' | 'connection_uncertain';

type PurchaseOutcomeSheetProps = {
  visible: boolean;
  variant: PurchaseOutcomeSheetVariant;
  message?: string;
  onViewTransactions: () => void;
  onClose: () => void;
};

const COPY: Record<
  PurchaseOutcomeSheetVariant,
  { title: string; defaultMessage: string; icon: keyof typeof MaterialIcons.glyphMap; iconColor: string }
> = {
  pending: {
    title: 'Payment submitted',
    defaultMessage:
      'Your payment is being processed. We will notify you when the provider confirms delivery.',
    icon: 'hourglass-top',
    iconColor: '#FF7F00',
  },
  connection_uncertain: {
    title: 'Connection interrupted',
    defaultMessage:
      'We could not confirm the result right now. If your wallet was debited, the payment may still be processing. Check Transactions for Pending or Processing — not Failed.',
    icon: 'wifi-off',
    iconColor: '#1565C0',
  },
};

export function PurchaseOutcomeSheet({
  visible,
  variant,
  message,
  onViewTransactions,
  onClose,
}: PurchaseOutcomeSheetProps) {
  const meta = COPY[variant];

  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}>
      <View style={styles.overlay}>
        <View style={styles.sheet}>
          <View style={styles.iconWrap}>
            <MaterialIcons name={meta.icon} size={36} color={meta.iconColor} />
          </View>
          <ThemedText style={styles.title}>{meta.title}</ThemedText>
          <ThemedText style={styles.message}>{message?.trim() || meta.defaultMessage}</ThemedText>
          <TouchableOpacity style={styles.primaryButton} onPress={onViewTransactions}>
            <ThemedText style={styles.primaryButtonText}>View transactions</ThemedText>
          </TouchableOpacity>
          <TouchableOpacity style={styles.secondaryButton} onPress={onClose}>
            <ThemedText style={styles.secondaryButtonText}>OK</ThemedText>
          </TouchableOpacity>
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  overlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.45)',
    justifyContent: 'flex-end',
  },
  sheet: {
    backgroundColor: '#fff',
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    paddingHorizontal: 24,
    paddingTop: 24,
    paddingBottom: 32,
  },
  iconWrap: {
    alignSelf: 'center',
    marginBottom: 12,
  },
  title: {
    fontSize: 20,
    fontWeight: '700',
    textAlign: 'center',
    marginBottom: 10,
  },
  message: {
    fontSize: 15,
    lineHeight: 22,
    textAlign: 'center',
    color: '#444',
    marginBottom: 20,
  },
  primaryButton: {
    backgroundColor: '#FF7F00',
    borderRadius: 10,
    paddingVertical: 14,
    alignItems: 'center',
    marginBottom: 10,
  },
  primaryButtonText: {
    color: '#fff',
    fontSize: 16,
    fontWeight: '600',
  },
  secondaryButton: {
    paddingVertical: 12,
    alignItems: 'center',
  },
  secondaryButtonText: {
    color: '#666',
    fontSize: 16,
  },
});
