import { useState } from 'react';
import { StyleSheet, View, TextInput, TouchableOpacity, ScrollView, KeyboardAvoidingView, Platform, Alert } from 'react-native';
import { ThemedView } from '@/components/themed-view';
import { ThemedText } from '@/components/themed-text';
import { MaterialIcons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import { Image } from 'expo-image';
import { Dropdown } from '@/components/dropdown';
import { ConfirmPaymentModal } from '@/components/confirm-payment-modal';

export default function CableTVScreen() {
  const router = useRouter();
  const [selectedProvider, setSelectedProvider] = useState<string | null>('DSTV');
  const [smartCardNumber, setSmartCardNumber] = useState('');
  const [packagePlan, setPackagePlan] = useState('');
  const [showConfirmModal, setShowConfirmModal] = useState(false);
  const availableBalance = 500.00;

  const providers = [
    { id: '1', name: 'DSTV', logo: require('@/assets/images/dstv.png') },
    { id: '2', name: 'GOTV', logo: require('@/assets/images/gotv.png') },
    { id: '3', name: 'Startimes', logo: require('@/assets/images/startimes.png') },
  ];

  const packagePlans = [
    { id: '1', name: 'Compact', amount: 7900 },
    { id: '2', name: 'Compact Plus', amount: 12400 },
    { id: '3', name: 'Premium', amount: 24500 },
    { id: '4', name: 'Confam', amount: 5200 },
  ];

  const handleVerifySmartCard = () => {
    if (!selectedProvider) {
      Alert.alert('Error', 'Please select a cable TV provider first');
      return;
    }
    const selectedProviderObj = providers.find(p => p.name === selectedProvider);
    if (!selectedProviderObj) {
      Alert.alert('Error', 'Please select a valid cable TV provider');
      return;
    }
    if (!smartCardNumber.trim() || smartCardNumber.length < 10) {
      Alert.alert('Error', 'Please enter a valid smart card number');
      return;
    }
    // In a real app, verify the smart card with backend
    Alert.alert('Verified', `Smart card ${smartCardNumber} verified successfully for ${selectedProviderObj.name}`);
  };

  const handleContinue = () => {
    if (!selectedProvider) {
      Alert.alert('Error', 'Please select a cable TV provider');
      return;
    }
    if (!smartCardNumber.trim() || smartCardNumber.length < 10) {
      Alert.alert('Error', 'Please enter a valid smart card number');
      return;
    }
    if (!packagePlan) {
      Alert.alert('Error', 'Please select a package plan');
      return;
    }
    const selectedPlan = packagePlans.find(p => p.id === packagePlan);
    if (!selectedPlan) {
      Alert.alert('Error', 'Please select a valid package plan');
      return;
    }
    if (selectedPlan.amount > availableBalance) {
      Alert.alert('Error', 'Insufficient balance');
      return;
    }

    // Show confirmation modal
    setShowConfirmModal(true);
  };

  const handleConfirmPayment = () => {
    setShowConfirmModal(false);
    const selectedPlan = packagePlans.find(p => p.id === packagePlan);
    if (!selectedPlan) return;
    
    router.push({
      pathname: '/payment-success',
      params: {
        amount: selectedPlan.amount.toString(),
        network: selectedProvider || '',
        recipient: smartCardNumber,
        serviceType: 'Cable TV',
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
          <ThemedText style={styles.headerTitle}>Cable TV</ThemedText>
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

          {/* Smart Card Number Input */}
          <View style={styles.section}>
            <ThemedText style={styles.inputLabel}>Smart Card Number</ThemedText>
            <View style={styles.inputRow}>
              <TextInput
                style={styles.input}
                placeholder="Enter smart card number"
                placeholderTextColor="#999"
                value={smartCardNumber}
                onChangeText={setSmartCardNumber}
                keyboardType="numeric"
              />
              <TouchableOpacity style={styles.verifyButton} onPress={handleVerifySmartCard}>
                <ThemedText style={styles.verifyButtonText}>Verify</ThemedText>
              </TouchableOpacity>
            </View>
          </View>

          {/* Package Plan Selection */}
          <View style={styles.section}>
            <ThemedText style={styles.inputLabel}>Select Package Plan</ThemedText>
            <Dropdown
              options={packagePlans.map(plan => ({ id: plan.id, name: plan.name, amount: plan.amount }))}
              selectedId={packagePlan}
              onSelect={setPackagePlan}
              placeholder="Select a package plan"
            />
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
          amount={packagePlans.find(p => p.id === packagePlan)?.amount || 0}
          network={selectedProvider || ''}
          networkLogo={selectedProviderLogo}
          recipient={smartCardNumber}
          serviceType="Cable TV"
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

