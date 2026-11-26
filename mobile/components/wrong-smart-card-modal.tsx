import { Modal, StyleSheet, View, TouchableOpacity } from 'react-native';
import { ThemedText } from '@/components/themed-text';
import { MaterialIcons } from '@expo/vector-icons';
import {
  sanitizeSmartCardErrorMessage,
  WRONG_SMART_CARD_DEFAULT_MESSAGE,
} from '@/utils/cable-smart-card-errors';

interface WrongSmartCardModalProps {
  visible: boolean;
  onClose: () => void;
  onTryAgain?: () => void;
  providerName?: string;
  message?: string;
}

export function WrongSmartCardModal({
  visible,
  onClose,
  onTryAgain,
  providerName,
  message,
}: WrongSmartCardModalProps) {
  const handleTryAgain = () => {
    if (onTryAgain) {
      onTryAgain();
    } else {
      onClose();
    }
  };

  const displayMessage = sanitizeSmartCardErrorMessage(message) || WRONG_SMART_CARD_DEFAULT_MESSAGE;

  return (
    <Modal
      visible={visible}
      transparent
      animationType="fade"
      onRequestClose={onClose}
    >
      <View style={styles.overlay}>
        <View style={styles.modalContainer}>
          <View style={styles.iconContainer}>
            <MaterialIcons name="error-outline" size={56} color="#FF7F00" />
          </View>

          <ThemedText style={styles.modalTitle}>Invalid Smart Card Number</ThemedText>

          <ThemedText style={styles.modalMessage}>{displayMessage}</ThemedText>

          <View style={styles.tipsBox}>
            <ThemedText style={styles.tipsTitle}>Tips:</ThemedText>
            <ThemedText style={styles.tipItem}>
              • Enter the smart card number printed on your decoder
            </ThemedText>
            {providerName ? (
              <ThemedText style={styles.tipItem}>
                • Confirm the number matches your {providerName} account
              </ThemedText>
            ) : null}
            <ThemedText style={styles.tipItem}>
              • Use digits only — no spaces or special characters
            </ThemedText>
            <ThemedText style={styles.tipItem}>
              • The number should be at least 10 digits long
            </ThemedText>
          </View>

          <TouchableOpacity style={styles.tryAgainButton} onPress={handleTryAgain} activeOpacity={0.8}>
            <ThemedText style={styles.tryAgainButtonText}>Try Again</ThemedText>
          </TouchableOpacity>
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  overlay: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.5)',
    justifyContent: 'center',
    alignItems: 'center',
    padding: 20,
  },
  modalContainer: {
    backgroundColor: '#fff',
    borderRadius: 20,
    padding: 24,
    width: '100%',
    maxWidth: 400,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.3,
    shadowRadius: 8,
    elevation: 8,
  },
  iconContainer: {
    alignItems: 'center',
    marginBottom: 16,
  },
  modalTitle: {
    fontSize: 22,
    fontWeight: 'bold',
    textAlign: 'center',
    marginBottom: 12,
    color: '#FF7F00',
  },
  modalMessage: {
    fontSize: 14,
    textAlign: 'center',
    marginBottom: 16,
    color: '#666',
    lineHeight: 20,
  },
  tipsBox: {
    backgroundColor: '#FFF1E6',
    borderRadius: 12,
    padding: 14,
    marginBottom: 20,
    borderWidth: 1,
    borderColor: '#FFD4A8',
    gap: 6,
  },
  tipsTitle: {
    fontSize: 14,
    fontWeight: '600',
    color: '#CC6600',
    marginBottom: 4,
  },
  tipItem: {
    fontSize: 13,
    color: '#994D00',
    lineHeight: 18,
  },
  tryAgainButton: {
    backgroundColor: '#FF7F00',
    paddingVertical: 14,
    borderRadius: 12,
    alignItems: 'center',
  },
  tryAgainButtonText: {
    color: '#fff',
    fontSize: 16,
    fontWeight: '600',
  },
});
