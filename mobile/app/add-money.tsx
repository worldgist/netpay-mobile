import { StyleSheet, View, ScrollView, TouchableOpacity, Alert, Platform } from 'react-native';
import { ThemedView } from '@/components/themed-view';
import { ThemedText } from '@/components/themed-text';
import { MaterialIcons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import * as Clipboard from 'expo-clipboard';

export default function AddMoneyScreen() {
  const router = useRouter();
  const accountNumber = '6675125456';
  const bankName = 'Palmpay';
  const accountName = 'Mustapha Netpay World Enterprise Ltd(Payvessel)';

  const handleCopy = async (text: string, label: string) => {
    try {
      if (Platform.OS === 'web') {
        // For web, use the Clipboard API
        await navigator.clipboard.writeText(text);
      } else {
        // For mobile, use expo-clipboard
        await Clipboard.setStringAsync(text);
      }
      Alert.alert('Copied', `${label} copied to clipboard`);
    } catch (error) {
      Alert.alert('Error', 'Failed to copy to clipboard');
    }
  };

  return (
    <ThemedView style={styles.container}>
      <View style={styles.header}>
        <TouchableOpacity onPress={() => router.back()} style={styles.backButton}>
          <MaterialIcons name="arrow-back" size={24} color="#000" />
        </TouchableOpacity>
        <ThemedText style={styles.headerTitle}>Account Details</ThemedText>
        <View style={styles.placeholder} />
      </View>

      <ScrollView style={styles.scrollView} showsVerticalScrollIndicator={false}>
        {/* Information Banner */}
        <View style={styles.infoBanner}>
          <View style={styles.infoIconContainer}>
            <ThemedText style={styles.infoIcon}>i</ThemedText>
          </View>
          <ThemedText style={styles.infoText}>Transfer to the virtual account number below</ThemedText>
        </View>

        {/* Account Number Card */}
        <View style={styles.accountCard}>
          <View style={styles.accountIconContainer}>
            <MaterialIcons name="list-alt" size={24} color="#FF7F00" />
          </View>
          <View style={styles.accountInfo}>
            <ThemedText style={styles.accountLabel}>PalmPay Account Number</ThemedText>
            <ThemedText style={styles.accountValue}>{accountNumber}</ThemedText>
          </View>
          <TouchableOpacity
            style={styles.copyButton}
            onPress={() => handleCopy(accountNumber, 'Account number')}>
            <MaterialIcons name="content-copy" size={18} color="#FF7F00" />
            <ThemedText style={styles.copyButtonText}>Copy</ThemedText>
          </TouchableOpacity>
        </View>

        {/* Bank Name Card */}
        <View style={styles.accountCard}>
          <View style={styles.accountIconContainer}>
            <MaterialIcons name="list-alt" size={24} color="#FF7F00" />
          </View>
          <View style={styles.accountInfo}>
            <ThemedText style={styles.accountLabel}>Bank Name</ThemedText>
            <ThemedText style={styles.accountValue}>{bankName}</ThemedText>
          </View>
          <View style={styles.recommendedTag}>
            <MaterialIcons name="check-circle" size={16} color="#4CAF50" />
            <ThemedText style={styles.recommendedText}>Recommended</ThemedText>
          </View>
        </View>

        {/* Account Name Card */}
        <View style={styles.accountCard}>
          <View style={styles.accountIconContainer}>
            <MaterialIcons name="person" size={24} color="#FF7F00" />
          </View>
          <View style={styles.accountInfo}>
            <ThemedText style={styles.accountLabel}>Account Name</ThemedText>
            <ThemedText style={styles.accountValue}>{accountName}</ThemedText>
          </View>
        </View>

        {/* How to add money section */}
        <View style={styles.instructionsCard}>
          <ThemedText style={styles.instructionsTitle}>How to add money:</ThemedText>
          <View style={styles.instructionItem}>
            <ThemedText style={styles.instructionNumber}>1.</ThemedText>
            <ThemedText style={styles.instructionText}>Copy the account number above</ThemedText>
          </View>
          <View style={styles.instructionItem}>
            <ThemedText style={styles.instructionNumber}>2.</ThemedText>
            <ThemedText style={styles.instructionText}>Open your bank app and make a transfer</ThemedText>
          </View>
          <View style={styles.instructionItem}>
            <ThemedText style={styles.instructionNumber}>3.</ThemedText>
            <ThemedText style={styles.instructionText}>Your wallet will be credited automatically</ThemedText>
          </View>
        </View>

        {/* Note Section */}
        <View style={styles.noteBanner}>
          <ThemedText style={styles.noteText}>
            Note: This is your dedicated virtual account. All transfers to this account will be automatically credited to your wallet.
          </ThemedText>
        </View>
      </ScrollView>

      {/* Back to Dashboard Button */}
      <View style={styles.buttonContainer}>
        <TouchableOpacity style={styles.dashboardButton} onPress={() => router.back()}>
          <ThemedText style={styles.dashboardButtonText}>Back to Dashboard</ThemedText>
        </TouchableOpacity>
      </View>
    </ThemedView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#fff',
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 20,
    paddingTop: 60,
    paddingBottom: 20,
  },
  backButton: {
    width: 40,
    height: 40,
    justifyContent: 'center',
    alignItems: 'flex-start',
  },
  headerTitle: {
    fontSize: 20,
    fontWeight: 'bold',
    color: '#000',
  },
  placeholder: {
    width: 40,
  },
  scrollView: {
    flex: 1,
  },
  infoBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#F5E6D3',
    paddingHorizontal: 16,
    paddingVertical: 12,
    marginHorizontal: 20,
    marginBottom: 20,
    borderRadius: 8,
  },
  infoIconContainer: {
    width: 24,
    height: 24,
    borderRadius: 12,
    backgroundColor: '#FF7F00',
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: 12,
  },
  infoIcon: {
    fontSize: 16,
    fontWeight: 'bold',
    color: '#fff',
  },
  infoText: {
    flex: 1,
    fontSize: 14,
    color: '#333',
  },
  accountCard: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#fff',
    borderRadius: 12,
    padding: 16,
    marginHorizontal: 20,
    marginBottom: 16,
    borderWidth: 1,
    borderColor: '#E0E0E0',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.1,
    shadowRadius: 2,
    elevation: 2,
  },
  accountIconContainer: {
    width: 48,
    height: 48,
    borderRadius: 24,
    backgroundColor: '#FFF3E0',
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: 16,
  },
  accountInfo: {
    flex: 1,
  },
  accountLabel: {
    fontSize: 14,
    color: '#666',
    marginBottom: 4,
  },
  accountValue: {
    fontSize: 20,
    fontWeight: 'bold',
    color: '#000',
  },
  copyButton: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#FFF3E0',
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 8,
    gap: 6,
  },
  copyButtonText: {
    fontSize: 14,
    fontWeight: '600',
    color: '#FF7F00',
  },
  recommendedTag: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#E8F5E9',
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 12,
    gap: 4,
  },
  recommendedText: {
    fontSize: 12,
    fontWeight: '600',
    color: '#4CAF50',
  },
  instructionsCard: {
    backgroundColor: '#FF7F00',
    borderRadius: 12,
    padding: 20,
    marginHorizontal: 20,
    marginBottom: 20,
  },
  instructionsTitle: {
    fontSize: 18,
    fontWeight: 'bold',
    color: '#fff',
    marginBottom: 16,
  },
  instructionItem: {
    flexDirection: 'row',
    marginBottom: 12,
  },
  instructionNumber: {
    fontSize: 16,
    fontWeight: 'bold',
    color: '#fff',
    marginRight: 12,
    width: 20,
  },
  instructionText: {
    flex: 1,
    fontSize: 16,
    color: '#fff',
    lineHeight: 24,
  },
  noteBanner: {
    backgroundColor: '#F5E6D3',
    borderRadius: 8,
    padding: 16,
    marginHorizontal: 20,
    marginBottom: 20,
  },
  noteText: {
    fontSize: 14,
    color: '#333',
    lineHeight: 20,
  },
  buttonContainer: {
    paddingHorizontal: 20,
    paddingBottom: 30,
    paddingTop: 10,
  },
  dashboardButton: {
    backgroundColor: '#FF7F00',
    borderRadius: 12,
    paddingVertical: 16,
    alignItems: 'center',
  },
  dashboardButtonText: {
    fontSize: 16,
    fontWeight: '600',
    color: '#fff',
  },
});

