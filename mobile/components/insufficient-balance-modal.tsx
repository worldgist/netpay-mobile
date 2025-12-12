import React from 'react';
import { Modal, StyleSheet, View, TouchableOpacity } from 'react-native';
import { ThemedText } from './themed-text';
import { ThemedView } from './themed-view';
import { MaterialIcons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';

interface InsufficientBalanceModalProps {
  visible: boolean;
  onClose: () => void;
  currentBalance: number;
  requiredAmount?: number;
  message?: string;
}

const formatCurrency = (amount: number) => {
  return `₦${Number(amount).toLocaleString('en-NG', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })}`;
};

export function InsufficientBalanceModal({
  visible,
  onClose,
  currentBalance,
  requiredAmount,
  message,
}: InsufficientBalanceModalProps) {
  const router = useRouter();

  const handleFundWallet = () => {
    onClose();
    router.push('/add-money');
  };

  const defaultMessage = requiredAmount && requiredAmount > 0
    ? `Your wallet balance is ${formatCurrency(currentBalance)}. You need ${formatCurrency(requiredAmount)} to complete this transaction.`
    : `Your wallet balance is ${formatCurrency(currentBalance)}. Please fund your wallet to continue.`;

  const shortfall = requiredAmount && requiredAmount > 0
    ? Math.max(0, requiredAmount - currentBalance)
    : 0;

  return (
    <Modal
      visible={visible}
      transparent
      animationType="fade"
      onRequestClose={onClose}
    >
      <View style={styles.overlay}>
        <ThemedView style={styles.modalContainer}>
          <View style={styles.iconContainer}>
            <MaterialIcons name="account-balance-wallet" size={48} color="#FF7F00" />
          </View>

          <ThemedText style={styles.modalTitle}>Insufficient Balance</ThemedText>
          
          <ThemedText style={styles.modalMessage}>
            {message || defaultMessage}
          </ThemedText>

          {requiredAmount && requiredAmount > 0 && (
            <View style={styles.balanceDetails}>
              <View style={styles.balanceRow}>
                <View style={styles.balanceRowLeft}>
                  <MaterialIcons name="info-outline" size={20} color="#666" />
                  <ThemedText style={styles.balanceLabel}>Current Balance</ThemedText>
                </View>
                <ThemedText style={styles.balanceValue}>{formatCurrency(currentBalance)}</ThemedText>
              </View>

              <View style={[styles.balanceRow, styles.requiredRow]}>
                <View style={styles.balanceRowLeft}>
                  <MaterialIcons name="account-balance-wallet" size={20} color="#FF7F00" />
                  <ThemedText style={styles.requiredLabel}>Required Amount</ThemedText>
                </View>
                <ThemedText style={styles.requiredValue}>{formatCurrency(requiredAmount)}</ThemedText>
              </View>

              {shortfall > 0 && (
                <View style={styles.balanceRow}>
                  <ThemedText style={styles.shortfallLabel}>Shortfall</ThemedText>
                  <ThemedText style={styles.shortfallValue}>{formatCurrency(shortfall)}</ThemedText>
                </View>
              )}
            </View>
          )}

          <View style={styles.buttonContainer}>
            <TouchableOpacity
              style={[styles.button, styles.closeButton]}
              onPress={onClose}
            >
              <ThemedText style={styles.closeButtonText}>Close</ThemedText>
            </TouchableOpacity>

            <TouchableOpacity
              style={[styles.button, styles.fundButton]}
              onPress={handleFundWallet}
            >
              <MaterialIcons name="account-balance-wallet" size={20} color="#fff" />
              <ThemedText style={styles.fundButtonText}>Fund Wallet</ThemedText>
              <MaterialIcons name="arrow-forward" size={20} color="#fff" />
            </TouchableOpacity>
          </View>
        </ThemedView>
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
    color: '#333',
  },
  modalMessage: {
    fontSize: 14,
    textAlign: 'center',
    marginBottom: 20,
    color: '#666',
    lineHeight: 20,
  },
  balanceDetails: {
    backgroundColor: '#f9f9f9',
    borderRadius: 12,
    padding: 16,
    marginBottom: 20,
    gap: 12,
  },
  balanceRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: 8,
  },
  balanceRowLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  balanceLabel: {
    fontSize: 14,
    color: '#666',
  },
  balanceValue: {
    fontSize: 16,
    fontWeight: '600',
    color: '#333',
  },
  requiredRow: {
    backgroundColor: '#FFF1E6',
    padding: 12,
    borderRadius: 8,
    marginVertical: 4,
  },
  requiredLabel: {
    fontSize: 14,
    fontWeight: '600',
    color: '#FF7F00',
  },
  requiredValue: {
    fontSize: 18,
    fontWeight: 'bold',
    color: '#FF7F00',
  },
  shortfallLabel: {
    fontSize: 14,
    fontWeight: '600',
    color: '#d32f2f',
  },
  shortfallValue: {
    fontSize: 16,
    fontWeight: 'bold',
    color: '#d32f2f',
  },
  buttonContainer: {
    flexDirection: 'row',
    gap: 12,
  },
  button: {
    flex: 1,
    paddingVertical: 14,
    paddingHorizontal: 20,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
    flexDirection: 'row',
    gap: 8,
  },
  closeButton: {
    backgroundColor: '#f0f0f0',
    borderWidth: 1,
    borderColor: '#ddd',
  },
  closeButtonText: {
    fontSize: 16,
    fontWeight: '600',
    color: '#333',
  },
  fundButton: {
    backgroundColor: '#FF7F00',
  },
  fundButtonText: {
    fontSize: 16,
    fontWeight: '600',
    color: '#fff',
  },
});







