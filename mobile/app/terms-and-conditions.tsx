import { StyleSheet, View, TouchableOpacity, ScrollView, Platform } from 'react-native';
import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { MaterialIcons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';

export default function TermsAndConditionsScreen() {
  const router = useRouter();

  return (
    <ThemedView style={styles.container}>
      {/* Orange Header */}
      <View style={styles.orangeHeader}>
        <TouchableOpacity onPress={() => router.back()} style={styles.backButton}>
          <MaterialIcons name="arrow-back" size={24} color="#fff" />
        </TouchableOpacity>
        <ThemedText style={styles.headerTitle}>Terms & Conditions</ThemedText>
        <View style={styles.placeholder} />
      </View>

      <ScrollView 
        style={styles.scrollView}
        contentContainerStyle={styles.scrollContent}
        showsVerticalScrollIndicator={false}>
        
        <View style={styles.content}>
          <ThemedText style={styles.lastUpdated}>Last Updated: {new Date().toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' })}</ThemedText>

          <View style={styles.sectionCard}>
            <ThemedText style={styles.sectionTitle}>1. Acceptance of Terms</ThemedText>
            <ThemedText style={styles.sectionText}>
              By accessing and using the NetPay mobile application, you accept and agree to be bound by the terms and provision of this agreement. If you do not agree to abide by the above, please do not use this service.
            </ThemedText>
          </View>

          <View style={styles.sectionCard}>
            <ThemedText style={styles.sectionTitle}>2. Description of Service</ThemedText>
            <ThemedText style={styles.sectionText}>
              NetPay is a digital wallet and payment platform that allows users to send money, pay bills, purchase airtime, data, and other services. The service is provided "as is" and we reserve the right to modify or discontinue the service at any time.
            </ThemedText>
          </View>

          <View style={styles.sectionCard}>
            <ThemedText style={styles.sectionTitle}>3. User Account</ThemedText>
            <ThemedText style={styles.sectionText}>
              You are responsible for maintaining the confidentiality of your account credentials, including your PIN and password. You agree to notify us immediately of any unauthorized use of your account. We are not liable for any loss or damage arising from your failure to protect your account information.
            </ThemedText>
          </View>

          <View style={styles.sectionCard}>
            <ThemedText style={styles.sectionTitle}>4. Transactions</ThemedText>
            <ThemedText style={styles.sectionText}>
              All transactions made through NetPay are final and cannot be reversed unless required by law or at our sole discretion. You are responsible for verifying all transaction details before confirming. We are not responsible for transactions made to incorrect recipients due to user error.
            </ThemedText>
          </View>

          <View style={styles.sectionCard}>
            <ThemedText style={styles.sectionTitle}>5. Fees and Charges</ThemedText>
            <ThemedText style={styles.sectionText}>
              NetPay may charge fees for certain transactions. All fees will be clearly displayed before you confirm a transaction. By proceeding with a transaction, you agree to pay all applicable fees.
            </ThemedText>
          </View>

          <View style={styles.sectionCard}>
            <ThemedText style={styles.sectionTitle}>6. Prohibited Activities</ThemedText>
            <ThemedText style={styles.sectionText}>
              You agree not to use the service for any illegal or unauthorized purpose. Prohibited activities include but are not limited to: money laundering, fraud, terrorist financing, or any activity that violates applicable laws or regulations.
            </ThemedText>
          </View>

          <View style={styles.sectionCard}>
            <ThemedText style={styles.sectionTitle}>7. Limitation of Liability</ThemedText>
            <ThemedText style={styles.sectionText}>
              NetPay shall not be liable for any indirect, incidental, special, consequential, or punitive damages resulting from your use or inability to use the service. Our total liability shall not exceed the amount of fees you have paid to us in the past 12 months.
            </ThemedText>
          </View>

          <View style={styles.sectionCard}>
            <ThemedText style={styles.sectionTitle}>8. Intellectual Property</ThemedText>
            <ThemedText style={styles.sectionText}>
              All content, features, and functionality of the NetPay application are owned by NetPay and are protected by international copyright, trademark, and other intellectual property laws.
            </ThemedText>
          </View>

          <View style={styles.sectionCard}>
            <ThemedText style={styles.sectionTitle}>9. Modifications to Terms</ThemedText>
            <ThemedText style={styles.sectionText}>
              We reserve the right to modify these terms at any time. We will notify users of any material changes. Your continued use of the service after such modifications constitutes acceptance of the updated terms.
            </ThemedText>
          </View>

          <View style={styles.sectionCard}>
            <ThemedText style={styles.sectionTitle}>10. Governing Law</ThemedText>
            <ThemedText style={styles.sectionText}>
              These terms shall be governed by and construed in accordance with the laws of Nigeria. Any disputes arising from these terms shall be subject to the exclusive jurisdiction of Nigerian courts.
            </ThemedText>
          </View>

          <View style={styles.sectionCard}>
            <ThemedText style={styles.sectionTitle}>11. Contact Information</ThemedText>
            <ThemedText style={styles.sectionText}>
              If you have any questions about these Terms & Conditions, please contact us at support@netpayy.ng or call +234 706 739 8399.
            </ThemedText>
          </View>
        </View>
      </ScrollView>
    </ThemedView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#FFF8F0',
  },
  orangeHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 20,
    paddingTop: Platform.OS === 'ios' ? 60 : 40,
    paddingBottom: 20,
    backgroundColor: '#FF7F00',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 4,
    elevation: 3,
  },
  backButton: {
    padding: 8,
    marginLeft: -8,
  },
  headerTitle: {
    fontSize: 20,
    fontWeight: 'bold',
    color: '#fff',
  },
  placeholder: {
    width: 40,
  },
  scrollView: {
    flex: 1,
  },
  scrollContent: {
    paddingBottom: 40,
  },
  content: {
    paddingHorizontal: 20,
    paddingTop: 24,
  },
  lastUpdated: {
    fontSize: 14,
    color: '#FF7F00',
    marginBottom: 24,
    fontStyle: 'italic',
    fontWeight: '500',
  },
  sectionCard: {
    backgroundColor: '#fff',
    borderRadius: 12,
    padding: 16,
    marginBottom: 16,
    borderLeftWidth: 4,
    borderLeftColor: '#FF7F00',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.1,
    shadowRadius: 2,
    elevation: 2,
  },
  sectionTitle: {
    fontSize: 18,
    fontWeight: 'bold',
    color: '#FF7F00',
    marginBottom: 12,
  },
  sectionText: {
    fontSize: 15,
    color: '#333',
    lineHeight: 22,
  },
});

