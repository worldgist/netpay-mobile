import { StyleSheet, View, TouchableOpacity, ScrollView, Platform } from 'react-native';
import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { MaterialIcons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';

export default function PrivacyPolicyScreen() {
  const router = useRouter();

  return (
    <ThemedView style={styles.container}>
      <View style={styles.header}>
        <TouchableOpacity onPress={() => router.back()} style={styles.backButton}>
          <MaterialIcons name="arrow-back" size={24} color="#000" />
        </TouchableOpacity>
        <ThemedText style={styles.headerTitle}>Privacy Policy</ThemedText>
        <View style={styles.placeholder} />
      </View>

      <ScrollView 
        style={styles.scrollView}
        contentContainerStyle={styles.scrollContent}
        showsVerticalScrollIndicator={false}>
        
        <View style={styles.content}>
          <ThemedText style={styles.lastUpdated}>Last Updated: November 2025</ThemedText>

          <ThemedText style={styles.sectionTitle}>1. Introduction</ThemedText>
          <ThemedText style={styles.sectionText}>
            NetPay ("we," "our," or "us") is committed to protecting your privacy. This Privacy Policy explains how we collect, use, disclose, and safeguard your information when you use our mobile application and services.
          </ThemedText>

          <ThemedText style={styles.sectionTitle}>2. Information We Collect</ThemedText>
          <ThemedText style={styles.sectionText}>
            We collect information that you provide directly to us, including:
          </ThemedText>
          <ThemedText style={styles.bulletPoint}>• Personal information (name, email, phone number)</ThemedText>
          <ThemedText style={styles.bulletPoint}>• Financial information (bank account details, transaction history)</ThemedText>
          <ThemedText style={styles.bulletPoint}>• Device information (device type, operating system, unique device identifiers)</ThemedText>
          <ThemedText style={styles.bulletPoint}>• Usage data (how you interact with our app, features used)</ThemedText>
          <ThemedText style={styles.bulletPoint}>• Location data (with your permission)</ThemedText>

          <ThemedText style={styles.sectionTitle}>3. How We Use Your Information</ThemedText>
          <ThemedText style={styles.sectionText}>
            We use the information we collect to:
          </ThemedText>
          <ThemedText style={styles.bulletPoint}>• Provide, maintain, and improve our services</ThemedText>
          <ThemedText style={styles.bulletPoint}>• Process transactions and send related information</ThemedText>
          <ThemedText style={styles.bulletPoint}>• Send you technical notices and support messages</ThemedText>
          <ThemedText style={styles.bulletPoint}>• Respond to your comments and questions</ThemedText>
          <ThemedText style={styles.bulletPoint}>• Detect, prevent, and address technical issues and fraud</ThemedText>
          <ThemedText style={styles.bulletPoint}>• Comply with legal obligations</ThemedText>

          <ThemedText style={styles.sectionTitle}>4. Information Sharing and Disclosure</ThemedText>
          <ThemedText style={styles.sectionText}>
            We do not sell your personal information. We may share your information only in the following circumstances:
          </ThemedText>
          <ThemedText style={styles.bulletPoint}>• With service providers who assist us in operating our platform</ThemedText>
          <ThemedText style={styles.bulletPoint}>• To comply with legal obligations or respond to lawful requests</ThemedText>
          <ThemedText style={styles.bulletPoint}>• To protect our rights, privacy, safety, or property</ThemedText>
          <ThemedText style={styles.bulletPoint}>• In connection with a business transfer or merger</ThemedText>
          <ThemedText style={styles.bulletPoint}>• With your explicit consent</ThemedText>

          <ThemedText style={styles.sectionTitle}>5. Data Security</ThemedText>
          <ThemedText style={styles.sectionText}>
            We implement appropriate technical and organizational security measures to protect your personal information against unauthorized access, alteration, disclosure, or destruction. However, no method of transmission over the internet or electronic storage is 100% secure.
          </ThemedText>

          <ThemedText style={styles.sectionTitle}>6. Data Retention</ThemedText>
          <ThemedText style={styles.sectionText}>
            We retain your personal information for as long as necessary to fulfill the purposes outlined in this Privacy Policy, unless a longer retention period is required or permitted by law. When we no longer need your information, we will securely delete or anonymize it.
          </ThemedText>

          <ThemedText style={styles.sectionTitle}>7. Your Rights</ThemedText>
          <ThemedText style={styles.sectionText}>
            You have the right to:
          </ThemedText>
          <ThemedText style={styles.bulletPoint}>• Access and receive a copy of your personal information</ThemedText>
          <ThemedText style={styles.bulletPoint}>• Request correction of inaccurate or incomplete information</ThemedText>
          <ThemedText style={styles.bulletPoint}>• Request deletion of your personal information</ThemedText>
          <ThemedText style={styles.bulletPoint}>• Object to or restrict processing of your information</ThemedText>
          <ThemedText style={styles.bulletPoint}>• Withdraw consent at any time</ThemedText>
          <ThemedText style={styles.sectionText}>
            To exercise these rights, please contact us at support@netpayy.ng.
          </ThemedText>

          <ThemedText style={styles.sectionTitle}>8. Cookies and Tracking Technologies</ThemedText>
          <ThemedText style={styles.sectionText}>
            We use cookies and similar tracking technologies to track activity on our app and hold certain information. You can instruct your device to refuse all cookies or to indicate when a cookie is being sent.
          </ThemedText>

          <ThemedText style={styles.sectionTitle}>9. Third-Party Links</ThemedText>
          <ThemedText style={styles.sectionText}>
            Our app may contain links to third-party websites or services. We are not responsible for the privacy practices of these third parties. We encourage you to read their privacy policies.
          </ThemedText>

          <ThemedText style={styles.sectionTitle}>10. Children's Privacy</ThemedText>
          <ThemedText style={styles.sectionText}>
            Our service is not intended for individuals under the age of 18. We do not knowingly collect personal information from children. If you become aware that a child has provided us with personal information, please contact us immediately.
          </ThemedText>

          <ThemedText style={styles.sectionTitle}>11. Changes to This Privacy Policy</ThemedText>
          <ThemedText style={styles.sectionText}>
            We may update our Privacy Policy from time to time. We will notify you of any changes by posting the new Privacy Policy on this page and updating the "Last Updated" date. You are advised to review this Privacy Policy periodically for any changes.
          </ThemedText>

          <ThemedText style={styles.sectionTitle}>12. Contact Us</ThemedText>
          <ThemedText style={styles.sectionText}>
            If you have any questions about this Privacy Policy, please contact us at:
          </ThemedText>
          <ThemedText style={styles.contactInfo}>Email: support@netpayy.ng</ThemedText>
          <ThemedText style={styles.contactInfo}>Phone: +234 706 739 8399</ThemedText>
          <ThemedText style={styles.contactInfo}>Address: 123 Business Street, Lagos, Nigeria</ThemedText>
        </View>
      </ScrollView>
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
    paddingTop: Platform.OS === 'ios' ? 60 : 40,
    paddingBottom: 20,
    borderBottomWidth: 1,
    borderBottomColor: '#E0E0E0',
  },
  backButton: {
    padding: 8,
    marginLeft: -8,
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
  scrollContent: {
    paddingBottom: 40,
  },
  content: {
    paddingHorizontal: 20,
    paddingTop: 24,
  },
  lastUpdated: {
    fontSize: 14,
    color: '#999',
    marginBottom: 24,
    fontStyle: 'italic',
  },
  sectionTitle: {
    fontSize: 20,
    fontWeight: 'bold',
    color: '#333',
    marginTop: 24,
    marginBottom: 12,
  },
  sectionText: {
    fontSize: 16,
    color: '#666',
    lineHeight: 24,
    marginBottom: 16,
  },
  bulletPoint: {
    fontSize: 16,
    color: '#666',
    lineHeight: 24,
    marginBottom: 8,
    marginLeft: 16,
  },
  contactInfo: {
    fontSize: 16,
    color: '#666',
    lineHeight: 24,
    marginBottom: 8,
    marginLeft: 16,
    fontWeight: '500',
  },
});

