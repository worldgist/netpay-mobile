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
              By downloading, installing, accessing, or using the NetPay mobile application ("App") or website ("Service"), you acknowledge that you have read, understood, and agree to be bound by these Terms and Conditions ("Terms"). If you do not agree with any part of these Terms, you must not use our Service. These Terms constitute a legally binding agreement between you and NetPay.
            </ThemedText>
            <ThemedText style={styles.noteText}>
              You must be at least 18 years old to use our Service. By using the Service, you represent and warrant that you are of legal age to enter into this agreement.
            </ThemedText>
          </View>

          <View style={styles.sectionCard}>
            <ThemedText style={styles.sectionTitle}>2. Description of Services</ThemedText>
            <ThemedText style={styles.sectionText}>
              NetPay provides digital payment and financial services through our mobile application and website, including but not limited to:
            </ThemedText>
            <ThemedText style={styles.bulletPoint}>• Mobile airtime top-up and purchases</ThemedText>
            <ThemedText style={styles.bulletPoint}>• Mobile data bundle purchases and subscriptions</ThemedText>
            <ThemedText style={styles.bulletPoint}>• Cable TV subscriptions and renewals (DStv, GOtv, Startimes, etc.)</ThemedText>
            <ThemedText style={styles.bulletPoint}>• Electricity bill payments and prepaid token purchases</ThemedText>
            <ThemedText style={styles.bulletPoint}>• Education services payments (WAEC, JAMB, NECO result checker PINs, etc.)</ThemedText>
            <ThemedText style={styles.bulletPoint}>• Peer-to-peer fund transfers between NetPay users</ThemedText>
            <ThemedText style={styles.bulletPoint}>• Virtual account management and wallet services</ThemedText>
            <ThemedText style={styles.bulletPoint}>• Bill payment services for various utilities</ThemedText>
            <ThemedText style={styles.noteText}>
              We reserve the right to modify, suspend, or discontinue any service at any time with or without notice.
            </ThemedText>
          </View>

          <View style={styles.sectionCard}>
            <ThemedText style={styles.sectionTitle}>3. Account Registration and User Responsibilities</ThemedText>
            <ThemedText style={styles.sectionText}>
              To use our Service, you must:
            </ThemedText>
            <ThemedText style={styles.bulletPoint}>• Create an account providing accurate, current, and complete information</ThemedText>
            <ThemedText style={styles.bulletPoint}>• Maintain and promptly update your account information</ThemedText>
            <ThemedText style={styles.bulletPoint}>• Maintain the security and confidentiality of your account credentials (password, PIN)</ThemedText>
            <ThemedText style={styles.bulletPoint}>• Notify us immediately of any unauthorized access or suspected security breach</ThemedText>
            <ThemedText style={styles.bulletPoint}>• Be responsible for all activities that occur under your account</ThemedText>
            <ThemedText style={styles.bulletPoint}>• Ensure your device meets minimum technical requirements</ThemedText>
            <ThemedText style={styles.noteText}>
              You are solely responsible for maintaining the confidentiality of your account. We are not liable for any loss or damage arising from unauthorized use of your account.
            </ThemedText>
          </View>

          <View style={styles.sectionCard}>
            <ThemedText style={styles.sectionTitle}>4. Transactions, Payments, and Refunds</ThemedText>
            <ThemedText style={styles.sectionText}>
              Transaction terms:
            </ThemedText>
            <ThemedText style={styles.bulletPoint}>• All transactions are subject to verification and may be declined for security, fraud prevention, or insufficient funds</ThemedText>
            <ThemedText style={styles.bulletPoint}>• Service fees, charges, and commissions are displayed before transaction completion</ThemedText>
            <ThemedText style={styles.bulletPoint}>• Completed transactions are generally final and cannot be reversed except in cases of system errors or as required by law</ThemedText>
            <ThemedText style={styles.bulletPoint}>• Refunds: Refunds will be processed in accordance with our refund policy - typically within 5-10 business days if approved</ThemedText>
            <ThemedText style={styles.bulletPoint}>• Failed transactions: If a transaction fails after funds are deducted, we will investigate and refund within 48 hours if the service was not delivered</ThemedText>
            <ThemedText style={styles.bulletPoint}>• Disputed transactions: Contact support@netpayy.ng within 48 hours of transaction date with transaction reference</ThemedText>
            <ThemedText style={styles.bulletPoint}>• Transaction limits: We may impose daily or monthly transaction limits for security purposes</ThemedText>
            <ThemedText style={styles.noteText}>
              Transaction completion is indicated by confirmation message and deduction from your wallet balance. Please verify transaction status before assuming failure.
            </ThemedText>
          </View>

          <View style={styles.sectionCard}>
            <ThemedText style={styles.sectionTitle}>5. Fees, Charges, and Payment Terms</ThemedText>
            <ThemedText style={styles.sectionText}>
              Fees and charges:
            </ThemedText>
            <ThemedText style={styles.bulletPoint}>• Service fees are clearly displayed before you complete any transaction</ThemedText>
            <ThemedText style={styles.bulletPoint}>• We reserve the right to modify fees with 30 days prior notice via email or in-app notification</ThemedText>
            <ThemedText style={styles.bulletPoint}>• All fees are non-refundable except as required by law or in case of service failure</ThemedText>
            <ThemedText style={styles.bulletPoint}>• Wallet funding: Bank transfers and card payments may incur processing fees by payment providers</ThemedText>
            <ThemedText style={styles.bulletPoint}>• Transaction fees vary by service type and are subject to change</ThemedText>
            <ThemedText style={styles.noteText}>
              You authorize us to debit your wallet or linked payment method for all fees associated with your transactions.
            </ThemedText>
          </View>

          <View style={styles.sectionCard}>
            <ThemedText style={styles.sectionTitle}>6. Acceptable Use and Prohibited Activities</ThemedText>
            <ThemedText style={styles.sectionText}>
              You agree NOT to:
            </ThemedText>
            <ThemedText style={styles.bulletPoint}>• Use the Service for any illegal, fraudulent, or unauthorized purpose</ThemedText>
            <ThemedText style={styles.bulletPoint}>• Violate any applicable laws, regulations, or third-party rights</ThemedText>
            <ThemedText style={styles.bulletPoint}>• Attempt to gain unauthorized access to our systems, accounts, or networks</ThemedText>
            <ThemedText style={styles.bulletPoint}>• Interfere with or disrupt the Service, servers, or networks connected to the Service</ThemedText>
            <ThemedText style={styles.bulletPoint}>• Impersonate another person, entity, or organization</ThemedText>
            <ThemedText style={styles.bulletPoint}>• Engage in money laundering, terrorist financing, or other financial crimes</ThemedText>
            <ThemedText style={styles.bulletPoint}>• Use automated systems (bots, scrapers) to access the Service without authorization</ThemedText>
            <ThemedText style={styles.bulletPoint}>• Reverse engineer, decompile, or attempt to extract source code of the App</ThemedText>
            <ThemedText style={styles.bulletPoint}>• Introduce viruses, malware, or harmful code</ThemedText>
            <ThemedText style={styles.noteText}>
              Violation of these terms may result in immediate account suspension or termination and potential legal action.
            </ThemedText>
          </View>

          <View style={styles.sectionCard}>
            <ThemedText style={styles.sectionTitle}>7. Privacy and Data Protection</ThemedText>
            <ThemedText style={styles.sectionText}>
              Your privacy is important to us. Our collection, use, and protection of your personal information is governed by our Privacy Policy, which is incorporated into these Terms by reference. Key points:
            </ThemedText>
            <ThemedText style={styles.bulletPoint}>• We collect and process personal information necessary to provide our services</ThemedText>
            <ThemedText style={styles.bulletPoint}>• We implement industry-standard security measures to protect your data</ThemedText>
            <ThemedText style={styles.bulletPoint}>• We do not sell your personal information to third parties for marketing</ThemedText>
            <ThemedText style={styles.bulletPoint}>• We may share information with service providers necessary for service delivery</ThemedText>
            <ThemedText style={styles.bulletPoint}>• You have rights to access, correct, and delete your personal information</ThemedText>
            <ThemedText style={styles.noteText}>
              Please review our Privacy Policy (accessible in-app) for complete details on data practices.
            </ThemedText>
          </View>

          <View style={styles.sectionCard}>
            <ThemedText style={styles.sectionTitle}>8. Limitation of Liability and Disclaimers</ThemedText>
            <ThemedText style={styles.sectionText}>
              Important limitations:
            </ThemedText>
            <ThemedText style={styles.bulletPoint}>• We provide the Service "as is" and "as available" without warranties of any kind, express or implied</ThemedText>
            <ThemedText style={styles.bulletPoint}>• We do not guarantee uninterrupted, secure, or error-free operation of the Service</ThemedText>
            <ThemedText style={styles.bulletPoint}>• We are not liable for indirect, incidental, special, consequential, or punitive damages</ThemedText>
            <ThemedText style={styles.bulletPoint}>• Our total liability shall not exceed the amount you paid for the specific transaction in question</ThemedText>
            <ThemedText style={styles.bulletPoint}>• We are not responsible for third-party services (telecom providers, electricity companies, etc.) and their delivery of services</ThemedText>
            <ThemedText style={styles.bulletPoint}>• Force majeure: We are not liable for service interruptions due to circumstances beyond our reasonable control</ThemedText>
            <ThemedText style={styles.noteText}>
              This limitation does not affect your statutory rights as a consumer under applicable law.
            </ThemedText>
          </View>

          <View style={styles.sectionCard}>
            <ThemedText style={styles.sectionTitle}>9. Account Suspension and Termination</ThemedText>
            <ThemedText style={styles.sectionText}>
              We reserve the right to:
            </ThemedText>
            <ThemedText style={styles.bulletPoint}>• Suspend or terminate your account immediately, without prior notice, for violation of these Terms</ThemedText>
            <ThemedText style={styles.bulletPoint}>• Suspend accounts for security reasons, suspected fraud, or compliance requirements</ThemedText>
            <ThemedText style={styles.bulletPoint}>• Terminate inactive accounts after extended period of non-use (as defined in our policy)</ThemedText>
            <ThemedText style={styles.bulletPoint}>• Refuse service to anyone at any time for any reason</ThemedText>
            <ThemedText style={styles.sectionText}>
              Upon termination:
            </ThemedText>
            <ThemedText style={styles.bulletPoint}>• Your right to use the Service immediately ceases</ThemedText>
            <ThemedText style={styles.bulletPoint}>• We may delete or suspend access to your account and data (subject to legal retention requirements)</ThemedText>
            <ThemedText style={styles.bulletPoint}>• Outstanding transactions will be completed or refunded as appropriate</ThemedText>
            <ThemedText style={styles.bulletPoint}>• You remain liable for all transactions made before termination</ThemedText>
            <ThemedText style={styles.noteText}>
              You may close your account at any time by contacting support@netpayy.ng or using the delete account feature in-app.
            </ThemedText>
          </View>

          <View style={styles.sectionCard}>
            <ThemedText style={styles.sectionTitle}>10. Service Modifications and Changes to Terms</ThemedText>
            <ThemedText style={styles.sectionText}>
              We reserve the right to:
            </ThemedText>
            <ThemedText style={styles.bulletPoint}>• Modify, suspend, or discontinue any part of the Service at any time with or without notice</ThemedText>
            <ThemedText style={styles.bulletPoint}>• Update the App requiring you to download and install updates</ThemedText>
            <ThemedText style={styles.bulletPoint}>• Change these Terms at any time</ThemedText>
            <ThemedText style={styles.sectionText}>
              For material changes to Terms:
            </ThemedText>
            <ThemedText style={styles.bulletPoint}>• We will notify you via email or prominent in-app notification at least 30 days before changes take effect</ThemedText>
            <ThemedText style={styles.bulletPoint}>• Your continued use after changes constitutes acceptance of updated Terms</ThemedText>
            <ThemedText style={styles.bulletPoint}>• If you disagree with changes, you may close your account and stop using the Service</ThemedText>
            <ThemedText style={styles.noteText}>
              We recommend reviewing these Terms periodically. The "Last updated" date at the top indicates when Terms were last modified.
            </ThemedText>
          </View>

          <View style={styles.sectionCard}>
            <ThemedText style={styles.sectionTitle}>11. Dispute Resolution and Governing Law</ThemedText>
            <ThemedText style={styles.sectionText}>
              Dispute resolution process:
            </ThemedText>
            <ThemedText style={styles.bulletPoint}>• First: Contact our support team at support@netpayy.ng to attempt informal resolution (within 30 days)</ThemedText>
            <ThemedText style={styles.bulletPoint}>• Mediation: If informal resolution fails, disputes shall be resolved through mediation in Lagos, Nigeria</ThemedText>
            <ThemedText style={styles.bulletPoint}>• Arbitration: If mediation fails, disputes shall be resolved through binding arbitration under Nigerian Arbitration Act</ThemedText>
            <ThemedText style={styles.bulletPoint}>• Court Jurisdiction: Subject to arbitration clause, disputes shall be subject to exclusive jurisdiction of Nigerian courts</ThemedText>
            <ThemedText style={styles.sectionText}>
              Governing Law:
            </ThemedText>
            <ThemedText style={styles.bulletPoint}>• These Terms are governed by and construed in accordance with laws of the Federal Republic of Nigeria</ThemedText>
            <ThemedText style={styles.bulletPoint}>• Any legal action must be commenced within one year of the cause of action arising</ThemedText>
            <ThemedText style={styles.noteText}>
              This dispute resolution clause does not prevent you from filing complaints with relevant regulatory authorities.
            </ThemedText>
          </View>

          <View style={styles.sectionCard}>
            <ThemedText style={styles.sectionTitle}>12. Contact Information and Support</ThemedText>
            <ThemedText style={styles.sectionText}>
              For questions, complaints, or support:
            </ThemedText>
            <ThemedText style={styles.bulletPoint}>• Email: support@netpayy.ng (include transaction reference if applicable)</ThemedText>
            <ThemedText style={styles.bulletPoint}>• Phone: +234 706 739 8399 (Business hours: 9:00 AM - 9:00 PM WAT, Monday - Saturday)</ThemedText>
            <ThemedText style={styles.bulletPoint}>• In-App: Use the "Contact Us" feature</ThemedText>
            <ThemedText style={styles.bulletPoint}>• Address: Lagos, Nigeria (specific address available upon request)</ThemedText>
            <ThemedText style={styles.sectionText}>
              Response times:
            </ThemedText>
            <ThemedText style={styles.bulletPoint}>• General inquiries: Within 24 hours</ThemedText>
            <ThemedText style={styles.bulletPoint}>• Transaction disputes: Within 48 hours</ThemedText>
            <ThemedText style={styles.bulletPoint}>• Technical support: Within 24 hours</ThemedText>
            <ThemedText style={styles.noteText}>
              For urgent matters, please call our support line during business hours.
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
  bulletPoint: {
    fontSize: 15,
    color: '#333',
    lineHeight: 22,
    marginBottom: 8,
    marginLeft: 12,
  },
  noteText: {
    fontSize: 14,
    color: '#666',
    fontStyle: 'italic',
    marginTop: 12,
    padding: 12,
    backgroundColor: '#FFF8F0',
    borderRadius: 8,
    borderLeftWidth: 3,
    borderLeftColor: '#FF7F00',
  },
});

