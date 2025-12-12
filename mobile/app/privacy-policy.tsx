import { StyleSheet, View, TouchableOpacity, ScrollView, Platform } from 'react-native';
import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { MaterialIcons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';

export default function PrivacyPolicyScreen() {
  const router = useRouter();

  return (
    <ThemedView style={styles.container}>
      {/* Orange Header */}
      <View style={styles.orangeHeader}>
        <TouchableOpacity onPress={() => router.back()} style={styles.backButton}>
          <MaterialIcons name="arrow-back" size={24} color="#fff" />
        </TouchableOpacity>
        <ThemedText style={styles.headerTitle}>Privacy Policy</ThemedText>
        <View style={styles.placeholder} />
      </View>

      <ScrollView 
        style={styles.scrollView}
        contentContainerStyle={styles.scrollContent}
        showsVerticalScrollIndicator={false}>
        
        <View style={styles.content}>
          <ThemedText style={styles.lastUpdated}>Last Updated: {new Date().toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' })}</ThemedText>

          <View style={styles.sectionCard}>
            <ThemedText style={styles.sectionTitle}>1. Introduction</ThemedText>
            <ThemedText style={styles.sectionText}>
              NetPay ("we," "our," "us," or "the Company") operates the NetPay mobile application and related services. This Privacy Policy explains how we collect, use, disclose, and safeguard your information when you use our iOS and Android mobile application, website, and services. By using our services, you consent to the data practices described in this policy.
            </ThemedText>
          </View>

          <View style={styles.sectionCard}>
            <ThemedText style={styles.sectionTitle}>2. Information We Collect</ThemedText>
            <ThemedText style={styles.sectionText}>
              We collect the following categories of information:
            </ThemedText>
            <ThemedText style={styles.bulletPoint}>• Personal Information: Name, email address, phone number, date of birth, government-issued identification (when required for KYC compliance)</ThemedText>
            <ThemedText style={styles.bulletPoint}>• Account Information: Username, password (encrypted), PIN, biometric authentication data (Face ID/Touch ID - stored securely on your device only)</ThemedText>
            <ThemedText style={styles.bulletPoint}>• Financial Information: Bank account details, virtual account numbers, transaction history, payment card information (processed securely through payment processors)</ThemedText>
            <ThemedText style={styles.bulletPoint}>• Device Information: Device type, operating system version, unique device identifiers (UDID, advertising ID), IP address, mobile network information</ThemedText>
            <ThemedText style={styles.bulletPoint}>• Usage Information: App features accessed, transaction patterns, time spent in app, error logs, crash reports</ThemedText>
            <ThemedText style={styles.bulletPoint}>• Location Information: Approximate location based on IP address (we do not collect precise GPS location without your explicit consent)</ThemedText>
            <ThemedText style={styles.bulletPoint}>• Cookies and Similar Technologies: Session data, authentication tokens stored securely on your device</ThemedText>
          </View>

          <View style={styles.sectionCard}>
            <ThemedText style={styles.sectionTitle}>3. How We Use Your Information</ThemedText>
            <ThemedText style={styles.sectionText}>
              We use collected information for the following purposes:
            </ThemedText>
            <ThemedText style={styles.bulletPoint}>• Service Delivery: Process transactions (airtime, data, cable TV, electricity, education services), manage your account, provide customer support</ThemedText>
            <ThemedText style={styles.bulletPoint}>• Security and Fraud Prevention: Verify identity, detect and prevent fraudulent transactions, ensure account security</ThemedText>
            <ThemedText style={styles.bulletPoint}>• Legal and Compliance: Comply with applicable laws, regulations, and legal processes; satisfy KYC/AML requirements</ThemedText>
            <ThemedText style={styles.bulletPoint}>• Service Improvement: Analyze usage patterns, improve app functionality, develop new features, conduct internal research</ThemedText>
            <ThemedText style={styles.bulletPoint}>• Communication: Send transaction confirmations, account alerts, service updates, respond to inquiries (marketing communications only with your consent)</ThemedText>
            <ThemedText style={styles.bulletPoint}>• Business Operations: Manage our business operations, enforce our terms of service, resolve disputes</ThemedText>
          </View>

          <View style={styles.sectionCard}>
            <ThemedText style={styles.sectionTitle}>4. Data Sharing and Third-Party Services</ThemedText>
            <ThemedText style={styles.sectionText}>
              We may share your information with:
            </ThemedText>
            <ThemedText style={styles.bulletPoint}>• Payment Processors: Third-party payment service providers (e.g., Paystack, Flutterwave) to process transactions - they are required to maintain similar privacy protections</ThemedText>
            <ThemedText style={styles.bulletPoint}>• Service Providers: Cloud hosting providers (Supabase), analytics services, customer support platforms - all bound by confidentiality agreements</ThemedText>
            <ThemedText style={styles.bulletPoint}>• Telecommunications Vendors: Airtime and data providers (MTN, Airtel, Glo, 9mobile), electricity distribution companies, cable TV providers - necessary to fulfill service requests</ThemedText>
            <ThemedText style={styles.bulletPoint}>• Legal and Regulatory: Government agencies, law enforcement, regulatory bodies when required by law or to protect rights</ThemedText>
            <ThemedText style={styles.bulletPoint}>• Business Transfers: In event of merger, acquisition, or sale of assets (with notice to users)</ThemedText>
            <ThemedText style={styles.bulletPoint}>• With Your Consent: When you explicitly authorize sharing with specific third parties</ThemedText>
            <ThemedText style={styles.noteText}>
              Note: We do not sell your personal information to third parties for their marketing purposes. We do not share biometric data with any third party - it remains stored securely on your device.
            </ThemedText>
          </View>

          <View style={styles.sectionCard}>
            <ThemedText style={styles.sectionTitle}>5. Data Security</ThemedText>
            <ThemedText style={styles.sectionText}>
              We employ industry-standard security measures:
            </ThemedText>
            <ThemedText style={styles.bulletPoint}>• Encryption: All data transmitted between your device and our servers is encrypted using TLS/SSL. Sensitive data is encrypted at rest</ThemedText>
            <ThemedText style={styles.bulletPoint}>• Authentication: Multi-factor authentication, PIN protection, optional biometric authentication (Face ID/Touch ID)</ThemedText>
            <ThemedText style={styles.bulletPoint}>• Access Controls: Limited employee access on need-to-know basis, regular access audits, secure credential management</ThemedText>
            <ThemedText style={styles.bulletPoint}>• Security Monitoring: Continuous monitoring for suspicious activity, intrusion detection systems, regular security assessments</ThemedText>
            <ThemedText style={styles.bulletPoint}>• Data Breach Procedures: Established incident response procedures, prompt notification to affected users and authorities if required by law</ThemedText>
            <ThemedText style={styles.bulletPoint}>• Compliance: Regular security audits, adherence to PCI DSS standards for payment processing, compliance with Nigerian data protection regulations</ThemedText>
          </View>

          <View style={styles.sectionCard}>
            <ThemedText style={styles.sectionTitle}>6. Data Retention and Deletion</ThemedText>
            <ThemedText style={styles.sectionText}>
              We retain your data as follows:
            </ThemedText>
            <ThemedText style={styles.bulletPoint}>• Active Accounts: Data retained while your account is active and for 7 years after last transaction (as required by Nigerian financial regulations)</ThemedText>
            <ThemedText style={styles.bulletPoint}>• Inactive Accounts: Data retained for 3 years after account closure, then anonymized or securely deleted</ThemedText>
            <ThemedText style={styles.bulletPoint}>• Legal Requirements: Transaction records retained for minimum 7 years as required by law</ThemedText>
            <ThemedText style={styles.bulletPoint}>• You may request deletion of your account and associated data by contacting support@netpayy.ng. Note: We may retain certain information as required by law (e.g., transaction records for regulatory compliance)</ThemedText>
            <ThemedText style={styles.bulletPoint}>• Upon account deletion request, we will process within 30 days, subject to legal retention requirements</ThemedText>
          </View>

          <View style={styles.sectionCard}>
            <ThemedText style={styles.sectionTitle}>7. Your Privacy Rights</ThemedText>
            <ThemedText style={styles.sectionText}>
              You have the right to:
            </ThemedText>
            <ThemedText style={styles.bulletPoint}>• Access: Request a copy of your personal information we hold</ThemedText>
            <ThemedText style={styles.bulletPoint}>• Correction: Request correction of inaccurate or incomplete information</ThemedText>
            <ThemedText style={styles.bulletPoint}>• Deletion: Request deletion of your personal information (subject to legal requirements)</ThemedText>
            <ThemedText style={styles.bulletPoint}>• Data Portability: Request transfer of your data in a machine-readable format</ThemedText>
            <ThemedText style={styles.bulletPoint}>• Objection: Object to processing of your information for certain purposes</ThemedText>
            <ThemedText style={styles.bulletPoint}>• Restriction: Request restriction of processing in certain circumstances</ThemedText>
            <ThemedText style={styles.bulletPoint}>• Withdraw Consent: Withdraw consent for data processing where consent is the legal basis</ThemedText>
            <ThemedText style={styles.bulletPoint}>• Lodge Complaints: File a complaint with the Nigerian Data Protection Commission or relevant supervisory authority</ThemedText>
            <ThemedText style={styles.noteText}>
              To exercise these rights, contact us at support@netpayy.ng. We will respond within 30 days.
            </ThemedText>
          </View>

          <View style={styles.sectionCard}>
            <ThemedText style={styles.sectionTitle}>8. Biometric Authentication</ThemedText>
            <ThemedText style={styles.sectionText}>
              Our app offers optional biometric authentication (Face ID/Touch ID on iOS, fingerprint on Android):
            </ThemedText>
            <ThemedText style={styles.bulletPoint}>• Storage: Biometric data is stored securely on your device only - we do not receive, store, or transmit your biometric data</ThemedText>
            <ThemedText style={styles.bulletPoint}>• Privacy: Apple/Google handles biometric authentication through their secure enclave/systems</ThemedText>
            <ThemedText style={styles.bulletPoint}>• Control: You can enable or disable biometric authentication at any time in app settings</ThemedText>
            <ThemedText style={styles.bulletPoint}>• Purpose: Used solely for device authentication to access the app - not shared with third parties</ThemedText>
            <ThemedText style={styles.noteText}>
              If you disable biometric authentication, you can still use PIN or password to access the app.
            </ThemedText>
          </View>

          <View style={styles.sectionCard}>
            <ThemedText style={styles.sectionTitle}>9. Age Restrictions and Children's Privacy</ThemedText>
            <ThemedText style={styles.sectionText}>
              Our services are intended for users aged 18 years and older. We do not knowingly collect personal information from individuals under 18 years of age. If we become aware that we have collected information from a minor, we will take steps to delete such information promptly. Parents or guardians who believe their child has provided us with personal information should contact us immediately at support@netpayy.ng.
            </ThemedText>
          </View>

          <View style={styles.sectionCard}>
            <ThemedText style={styles.sectionTitle}>10. International Data Transfers</ThemedText>
            <ThemedText style={styles.sectionText}>
              Your information may be:
            </ThemedText>
            <ThemedText style={styles.bulletPoint}>• Stored: Primarily stored on servers located in Nigeria and cloud infrastructure (Supabase) which may have servers in other jurisdictions</ThemedText>
            <ThemedText style={styles.bulletPoint}>• Transferred: May be transferred to service providers in other countries who have adequate data protection measures</ThemedText>
            <ThemedText style={styles.bulletPoint}>• Safeguards: We ensure appropriate safeguards through contractual agreements requiring equivalent data protection standards</ThemedText>
            <ThemedText style={styles.bulletPoint}>• Your Rights: Regardless of where data is stored, your privacy rights under this policy remain the same</ThemedText>
            <ThemedText style={styles.noteText}>
              By using our services, you consent to such transfers.
            </ThemedText>
          </View>

          <View style={styles.sectionCard}>
            <ThemedText style={styles.sectionTitle}>11. Changes to This Privacy Policy</ThemedText>
            <ThemedText style={styles.sectionText}>
              We may update this Privacy Policy periodically to reflect changes in our practices, technology, legal requirements, or other factors. We will:
            </ThemedText>
            <ThemedText style={styles.bulletPoint}>• Notify you of material changes via email, in-app notification, or prominent notice in the app</ThemedText>
            <ThemedText style={styles.bulletPoint}>• Update the "Last updated" date at the top of this policy</ThemedText>
            <ThemedText style={styles.bulletPoint}>• Your continued use after changes constitutes acceptance - we encourage periodic review</ThemedText>
            <ThemedText style={styles.noteText}>
              Material changes affecting your rights will be communicated at least 30 days in advance when possible.
            </ThemedText>
          </View>

          <View style={styles.sectionCard}>
            <ThemedText style={styles.sectionTitle}>12. Contact Information and Data Controller</ThemedText>
            <ThemedText style={styles.sectionText}>
              For privacy-related questions, requests, or complaints:
            </ThemedText>
            <ThemedText style={styles.contactInfo}>Data Controller: NetPay (registered in Nigeria)</ThemedText>
            <ThemedText style={styles.contactInfo}>Email: support@netpayy.ng (include "Privacy Request" in subject line)</ThemedText>
            <ThemedText style={styles.contactInfo}>Phone: +234 706 739 8399</ThemedText>
            <ThemedText style={styles.contactInfo}>Address: Lagos, Nigeria (specific address available upon request)</ThemedText>
            <ThemedText style={styles.contactInfo}>Response Time: We aim to respond to privacy requests within 30 days</ThemedText>
            <ThemedText style={styles.contactInfo}>Data Protection Officer: Contact support@netpayy.ng for data protection inquiries</ThemedText>
            <ThemedText style={styles.noteText}>
              For complaints not resolved directly, you may contact the Nigerian Data Protection Commission.
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
    marginBottom: 12,
  },
  bulletPoint: {
    fontSize: 15,
    color: '#333',
    lineHeight: 22,
    marginBottom: 8,
    marginLeft: 12,
  },
  contactInfo: {
    fontSize: 15,
    color: '#333',
    lineHeight: 22,
    marginBottom: 8,
    marginLeft: 12,
    fontWeight: '500',
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

