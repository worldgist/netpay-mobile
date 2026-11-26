import { StyleSheet, View, TouchableOpacity, Modal } from 'react-native';
import { ThemedText } from '@/components/themed-text';
import { MaterialIcons } from '@expo/vector-icons';

interface InvalidAccountModalProps {
  visible: boolean;
  onClose: () => void;
  accountId?: string;
  providerName?: string;
  message?: string;
}

export function InvalidAccountModal({
  visible,
  onClose,
  accountId,
  providerName,
  message,
}: InvalidAccountModalProps) {
  const defaultMessage = message || 
    `The Account ID / User ID "${accountId || ''}" is invalid or not found for ${providerName || 'the selected provider'}. Please check and try again.`;

  return (
    <Modal
      visible={visible}
      transparent={true}
      animationType="fade"
      onRequestClose={onClose}
    >
      <View style={styles.overlay}>
        <View style={styles.modalContainer}>
          <View style={styles.iconContainer}>
            <MaterialIcons name="error-outline" size={48} color="#d32f2f" />
          </View>

          <ThemedText style={styles.modalTitle}>Invalid Account ID</ThemedText>
          
          <ThemedText style={styles.modalMessage}>
            {defaultMessage}
          </ThemedText>

          {accountId && (
            <View style={styles.accountDetails}>
              <View style={styles.detailRow}>
                <MaterialIcons name="account-circle" size={20} color="#666" />
                <ThemedText style={styles.detailLabel}>Account ID</ThemedText>
                <ThemedText style={styles.detailValue}>{accountId}</ThemedText>
              </View>
              {providerName && (
                <View style={styles.detailRow}>
                  <MaterialIcons name="sports-soccer" size={20} color="#666" />
                  <ThemedText style={styles.detailLabel}>Provider</ThemedText>
                  <ThemedText style={styles.detailValue}>{providerName}</ThemedText>
                </View>
              )}
            </View>
          )}

          <View style={styles.buttonContainer}>
            <TouchableOpacity style={styles.closeButton} onPress={onClose}>
              <ThemedText style={styles.closeButtonText}>OK</ThemedText>
            </TouchableOpacity>
          </View>
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
    color: '#d32f2f',
  },
  modalMessage: {
    fontSize: 14,
    textAlign: 'center',
    marginBottom: 20,
    color: '#666',
    lineHeight: 20,
  },
  accountDetails: {
    backgroundColor: '#fff5f5',
    borderRadius: 12,
    padding: 16,
    marginBottom: 20,
    gap: 12,
  },
  detailRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  detailLabel: {
    fontSize: 14,
    color: '#666',
    marginLeft: 4,
    flex: 1,
  },
  detailValue: {
    fontSize: 14,
    fontWeight: '600',
    color: '#333',
  },
  buttonContainer: {
    flexDirection: 'row',
    gap: 12,
  },
  closeButton: {
    flex: 1,
    backgroundColor: '#d32f2f',
    paddingVertical: 14,
    paddingHorizontal: 20,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
  },
  closeButtonText: {
    color: '#fff',
    fontSize: 16,
    fontWeight: '600',
  },
});





