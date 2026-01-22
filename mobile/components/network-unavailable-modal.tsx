import { StyleSheet, View, TouchableOpacity, Modal } from 'react-native';
import { ThemedText } from '@/components/themed-text';
import { MaterialIcons } from '@expo/vector-icons';

interface NetworkUnavailableModalProps {
  visible: boolean;
  onClose: () => void;
}

export function NetworkUnavailableModal({
  visible,
  onClose,
}: NetworkUnavailableModalProps) {
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
            <MaterialIcons name="wifi-off" size={48} color="#ff7f00" />
          </View>

          <ThemedText style={styles.modalTitle}>Network Unavailable</ThemedText>
          
          <ThemedText style={styles.modalMessage}>
            The betting service is currently unavailable. This could be due to network issues or temporary service unavailability.
          </ThemedText>

          <ThemedText style={styles.modalSubMessage}>
            Please try again later or contact support if the issue persists.
          </ThemedText>

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
    color: '#ff7f00',
  },
  modalMessage: {
    fontSize: 15,
    textAlign: 'center',
    marginBottom: 12,
    color: '#666',
    lineHeight: 22,
  },
  modalSubMessage: {
    fontSize: 14,
    textAlign: 'center',
    marginBottom: 24,
    color: '#999',
    lineHeight: 20,
  },
  buttonContainer: {
    flexDirection: 'row',
    gap: 12,
  },
  closeButton: {
    flex: 1,
    backgroundColor: '#ff7f00',
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
