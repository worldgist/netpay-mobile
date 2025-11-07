import { useState } from 'react';
import { StyleSheet, View, TextInput, TouchableOpacity, ScrollView, KeyboardAvoidingView, Platform, Alert } from 'react-native';
import { ThemedView } from '@/components/themed-view';
import { ThemedText } from '@/components/themed-text';
import { MaterialIcons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import { Image } from 'expo-image';
import { ConfirmPaymentModal } from '@/components/confirm-payment-modal';
import { Dropdown } from '@/components/dropdown';

export default function ElectricityScreen() {
  const router = useRouter();
  const [selectedProvider, setSelectedProvider] = useState<string | null>('1');
  const [meterNumber, setMeterNumber] = useState('');
  const [amount, setAmount] = useState('');
  const [showConfirmModal, setShowConfirmModal] = useState(false);
  const availableBalance = 500.00;

  const providers = [
    { id: '1', name: 'AEDC', logo: require('@/assets/images/AEDC.png') },
    { id: '2', name: 'EEDC', logo: require('@/assets/images/EEDC.png') },
    { id: '3', name: 'EKEDC', logo: require('@/assets/images/EKEDC.png') },
    { id: '4', name: 'IKEDC', logo: require('@/assets/images/IKEDC.png') },
    { id: '5', name: 'KEDCO', logo: require('@/assets/images/KEDCO.png') },
    { id: '6', name: 'PHEDC', logo: require('@/assets/images/PHEDC.png') },
  ];

  const handleVerifyMeter = () => {
    if (!selectedProvider) {
      Alert.alert('Error', 'Please select an electricity provider first');
      return;
    }
    const selectedProviderObj = providers.find(p => p.id === selectedProvider);
    if (!selectedProviderObj) {
      Alert.alert('Error', 'Please select a valid electricity provider');
      return;
    }
    if (!meterNumber.trim() || meterNumber.length < 10) {
      Alert.alert('Error', 'Please enter a valid meter number');
      return;
    }
    // In a real app, verify the meter number with backend
    Alert.alert('Verified', `Meter number ${meterNumber} verified successfully for ${selectedProviderObj.name}`);
  };

  const handleContinue = () => {
    if (!selectedProvider) {
      Alert.alert('Error', 'Please select an electricity provider');
      return;
    }
    const selectedProviderObj = providers.find(p => p.id === selectedProvider);
    if (!selectedProviderObj) {
      Alert.alert('Error', 'Please select a valid electricity provider');
      return;
    }
    if (!meterNumber.trim() || meterNumber.length < 10) {
      Alert.alert('Error', 'Please enter a valid meter number');
      return;
    }
    const purchaseAmount = parseFloat(amount);
    if (isNaN(purchaseAmount) || purchaseAmount <= 0) {
      Alert.alert('Error', 'Please enter a valid amount');
      return;
    }
    if (purchaseAmount > availableBalance) {
      Alert.alert('Error', 'Insufficient balance');
      return;
    }

    // Show confirmation modal
    setShowConfirmModal(true);
  };

  const handleConfirmPayment = () => {
    setShowConfirmModal(false);
    const purchaseAmount = parseFloat(amount || '0');
    const selectedProviderObj = providers.find(p => p.id === selectedProvider);
    
    router.push({
      pathname: '/payment-success',
      params: {
        amount: purchaseAmount.toString(),
        network: selectedProviderObj?.name || '',
        recipient: meterNumber,
        serviceType: 'Electricity',
      },
    });
  };

  const getProviderLogo = (providerId: string | null) => {
    if (!providerId) return null;
    const provider = providers.find(p => p.id === providerId);
    return provider?.logo;
  };

  const getProviderName = (providerId: string | null) => {
    if (!providerId) return '';
    const provider = providers.find(p => p.id === providerId);
    return provider?.name || '';
  };

  const selectedProviderLogo = getProviderLogo(selectedProvider);
  const selectedProviderName = getProviderName(selectedProvider);

  return (
    <ThemedView style={styles.container}>
      <KeyboardAvoidingView
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
        style={styles.keyboardView}>
        <View style={styles.header}>
          <TouchableOpacity onPress={() => router.back()} style={styles.backButton}>
            <MaterialIcons name="arrow-back" size={24} color="#000" />
          </TouchableOpacity>
          <ThemedText style={styles.headerTitle}>Electricity</ThemedText>
          <View style={styles.placeholder} />
        </View>

        <ScrollView 
          style={styles.scrollView} 
          contentContainerStyle={styles.scrollContent}
          showsVerticalScrollIndicator={true}
          bounces={true}>
          {/* Available Balance Card */}
          <View style={styles.balanceCard}>
            <ThemedText style={styles.balanceLabel}>Available Balance</ThemedText>
            <View style={styles.balanceAmountContainer}>
              <ThemedText style={styles.balanceAmount}>₦{availableBalance.toFixed(2)}</ThemedText>
            </View>
          </View>

          {/* Select Service Provider */}
          <View style={styles.section}>
            <ThemedText style={styles.inputLabel}>Select Service Provider</ThemedText>
            <Dropdown
              options={providers.map(provider => ({ id: provider.id, name: provider.name, logo: provider.logo }))}
              selectedId={selectedProvider}
              onSelect={setSelectedProvider}
              placeholder="Select an electricity provider"
            />
          </View>

          {/* Meter Number Input */}
          <View style={styles.section}>
            <ThemedText style={styles.inputLabel}>Meter Number</ThemedText>
            <View style={styles.inputRow}>
              <TextInput
                style={styles.input}
                placeholder="Enter meter number"
                placeholderTextColor="#999"
                value={meterNumber}
                onChangeText={setMeterNumber}
                keyboardType="numeric"
              />
              <TouchableOpacity style={styles.verifyButton} onPress={handleVerifyMeter}>
                <ThemedText style={styles.verifyButtonText}>Verify</ThemedText>
              </TouchableOpacity>
            </View>
          </View>

          {/* Amount Input */}
          <View style={styles.section}>
            <ThemedText style={styles.inputLabel}>Amount (N)</ThemedText>
            <View style={styles.inputContainer}>
              <TextInput
                style={styles.input}
                placeholder="Enter amount"
                placeholderTextColor="#999"
                value={amount}
                onChangeText={setAmount}
                keyboardType="numeric"
              />
            </View>
          </View>
        </ScrollView>

        {/* Continue Button */}
        <View style={styles.buttonContainer}>
          <TouchableOpacity style={styles.continueButton} onPress={handleContinue}>
            <ThemedText style={styles.continueButtonText}>Continue</ThemedText>
          </TouchableOpacity>
        </View>
      </KeyboardAvoidingView>

      {/* Confirm Payment Modal */}
      {selectedProviderLogo && (
        <ConfirmPaymentModal
          visible={showConfirmModal}
          onClose={() => setShowConfirmModal(false)}
          onConfirm={handleConfirmPayment}
          amount={parseFloat(amount || '0')}
          network={selectedProviderName}
          networkLogo={selectedProviderLogo}
          recipient={meterNumber}
          serviceType="Electricity"
        />
      )}
    </ThemedView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#fff',
  },
  keyboardView: {
    flex: 1,
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 20,
    paddingTop: Platform.OS === 'ios' ? 60 : 40,
    paddingBottom: 20,
    backgroundColor: '#fff',
    zIndex: 10,
  },
  backButton: {
    width: 40,
    height: 40,
    justifyContent: 'center',
    alignItems: 'flex-start',
  },
  headerTitle: {
    fontSize: 24,
    fontWeight: 'bold',
    color: '#000',
  },
  placeholder: {
    width: 40,
  },
  scrollView: {
    flex: 1,
  },
  scrollContent: {
    flexGrow: 1,
    paddingBottom: 20,
  },
  balanceCard: {
    backgroundColor: '#FF7F00',
    borderRadius: 12,
    padding: 20,
    marginHorizontal: 20,
    marginBottom: 24,
    alignItems: 'center',
    minHeight: 100,
    justifyContent: 'center',
  },
  balanceLabel: {
    fontSize: 16,
    fontWeight: '500',
    color: '#fff',
    marginBottom: 12,
    opacity: 0.95,
  },
  balanceAmountContainer: {
    minHeight: 50,
    justifyContent: 'center',
  },
  balanceAmount: {
    fontSize: 32,
    fontWeight: 'bold',
    color: '#fff',
    lineHeight: 40,
  },
  section: {
    marginHorizontal: 20,
    marginBottom: 24,
  },
  sectionTitle: {
    fontSize: 18,
    fontWeight: 'bold',
    color: '#000',
    marginBottom: 16,
  },
  inputLabel: {
    fontSize: 16,
    fontWeight: '600',
    color: '#000',
    marginBottom: 8,
  },
  inputContainer: {
    backgroundColor: '#F5F5F5',
    borderRadius: 8,
    paddingHorizontal: 16,
    borderWidth: 1,
    borderColor: '#E0E0E0',
    minHeight: 50,
  },
  inputRow: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#F5F5F5',
    borderRadius: 8,
    paddingHorizontal: 12,
    borderWidth: 1,
    borderColor: '#E0E0E0',
    minHeight: 50,
  },
  input: {
    flex: 1,
    fontSize: 16,
    color: '#333',
    paddingVertical: 12,
  },
  verifyButton: {
    backgroundColor: '#E0E0E0',
    paddingHorizontal: 16,
    paddingVertical: 8,
    borderRadius: 8,
    marginLeft: 8,
  },
  verifyButtonText: {
    fontSize: 14,
    fontWeight: '600',
    color: '#333',
  },
  buttonContainer: {
    paddingHorizontal: 20,
    paddingBottom: 30,
    paddingTop: 10,
  },
  continueButton: {
    backgroundColor: '#FF7F00',
    borderRadius: 12,
    paddingVertical: 16,
    alignItems: 'center',
  },
  continueButtonText: {
    fontSize: 18,
    fontWeight: 'bold',
    color: '#fff',
  },
});

