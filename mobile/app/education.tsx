import { useState } from 'react';
import { StyleSheet, View, TextInput, TouchableOpacity, ScrollView, KeyboardAvoidingView, Platform, Alert } from 'react-native';
import { ThemedView } from '@/components/themed-view';
import { ThemedText } from '@/components/themed-text';
import { MaterialIcons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import { Image } from 'expo-image';
import { ConfirmPaymentModal } from '@/components/confirm-payment-modal';

export default function EducationScreen() {
  const router = useRouter();
  const [selectedProvider, setSelectedProvider] = useState<string | null>('WAEC');
  const [referenceNumber, setReferenceNumber] = useState('');
  const [amount, setAmount] = useState('');
  const [showConfirmModal, setShowConfirmModal] = useState(false);
  const availableBalance = 500.00;

  const providers = [
    { id: '1', name: 'WAEC', logo: require('@/assets/images/waec.png') },
    { id: '2', name: 'NECO', logo: require('@/assets/images/neco.png') },
    { id: '3', name: 'JAMB', logo: require('@/assets/images/jamb.png') },
  ];

  const handleContinue = () => {
    if (!selectedProvider) {
      Alert.alert('Error', 'Please select an education provider');
      return;
    }
    if (!referenceNumber.trim()) {
      Alert.alert('Error', 'Please enter a reference number');
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
    
    router.push({
      pathname: '/payment-success',
      params: {
        amount: purchaseAmount.toString(),
        network: selectedProvider || '',
        recipient: referenceNumber,
        serviceType: 'Education',
      },
    });
  };

  const getProviderLogo = (providerName: string) => {
    const provider = providers.find(p => p.name === providerName);
    return provider?.logo;
  };

  const selectedProviderLogo = selectedProvider ? getProviderLogo(selectedProvider) : null;

  return (
    <ThemedView style={styles.container}>
      <KeyboardAvoidingView
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
        style={styles.keyboardView}>
        <View style={styles.header}>
          <TouchableOpacity onPress={() => router.back()} style={styles.backButton}>
            <MaterialIcons name="arrow-back" size={24} color="#000" />
          </TouchableOpacity>
          <ThemedText style={styles.headerTitle}>Education</ThemedText>
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
            <ThemedText style={styles.sectionTitle}>Select Service Provider</ThemedText>
            <View style={styles.networkContainer}>
              {providers.map((provider) => (
                <TouchableOpacity
                  key={provider.id}
                  style={styles.networkItem}
                  onPress={() => setSelectedProvider(provider.name)}
                  activeOpacity={0.7}>
                  <View
                    style={[
                      styles.networkLogoContainer,
                      {
                        borderWidth: selectedProvider === provider.name ? 2.5 : 1,
                        borderColor: selectedProvider === provider.name ? '#FF7F00' : '#E0E0E0',
                      },
                    ]}>
                    <Image
                      source={provider.logo}
                      style={styles.networkLogoImage}
                      contentFit="contain"
                    />
                  </View>
                  <ThemedText style={styles.networkName}>{provider.name}</ThemedText>
                </TouchableOpacity>
              ))}
            </View>
          </View>

          {/* Reference Number Input */}
          <View style={styles.section}>
            <ThemedText style={styles.inputLabel}>Reference Number</ThemedText>
            <View style={styles.inputContainer}>
              <TextInput
                style={styles.input}
                placeholder="Enter reference number"
                placeholderTextColor="#999"
                value={referenceNumber}
                onChangeText={setReferenceNumber}
              />
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
          network={selectedProvider || ''}
          networkLogo={selectedProviderLogo}
          recipient={referenceNumber}
          serviceType="Education"
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
  networkContainer: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginBottom: 8,
  },
  networkItem: {
    alignItems: 'center',
    flex: 1,
  },
  networkLogoContainer: {
    width: 70,
    height: 70,
    borderRadius: 12,
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 8,
    backgroundColor: '#fff',
    padding: 8,
  },
  networkLogoImage: {
    width: '100%',
    height: '100%',
  },
  networkName: {
    fontSize: 14,
    color: '#333',
    fontWeight: '500',
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
  input: {
    fontSize: 16,
    color: '#333',
    paddingVertical: 12,
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

