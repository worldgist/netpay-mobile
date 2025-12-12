import { useNavigate } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { ArrowLeft, Shield, Database, Eye, FileText, Lock, UserCheck, Mail, Info, Globe, Cookie } from "lucide-react";
import BottomNav from "@/components/BottomNav";

export default function UserPrivacy() {
  const navigate = useNavigate();

  const sections = [
    { icon: Info, title: "1. Introduction", content: "NetPay (\"we,\" \"our,\" \"us,\" or \"the Company\") operates the NetPay mobile application and related services. This Privacy Policy explains how we collect, use, disclose, and safeguard your information when you use our iOS and Android mobile application, website, and services. By using our services, you consent to the data practices described in this policy." },
    { icon: Database, title: "2. Information We Collect", content: "We collect the following categories of information:", list: ["Personal Information: Name, email address, phone number, date of birth, government-issued identification (when required for KYC compliance)", "Account Information: Username, password (encrypted), PIN, biometric authentication data (Face ID/Touch ID - stored securely on your device only)", "Financial Information: Bank account details, virtual account numbers, transaction history, payment card information (processed securely through payment processors)", "Device Information: Device type, operating system version, unique device identifiers (UDID, advertising ID), IP address, mobile network information", "Usage Information: App features accessed, transaction patterns, time spent in app, error logs, crash reports", "Location Information: Approximate location based on IP address (we do not collect precise GPS location without your explicit consent)", "Cookies and Similar Technologies: Session data, authentication tokens stored securely on your device"] },
    { icon: Eye, title: "3. How We Use Your Information", content: "We use collected information for the following purposes:", list: ["Service Delivery: Process transactions (airtime, data, cable TV, electricity, education services), manage your account, provide customer support", "Security and Fraud Prevention: Verify identity, detect and prevent fraudulent transactions, ensure account security", "Legal and Compliance: Comply with applicable laws, regulations, and legal processes; satisfy KYC/AML requirements", "Service Improvement: Analyze usage patterns, improve app functionality, develop new features, conduct internal research", "Communication: Send transaction confirmations, account alerts, service updates, respond to inquiries (marketing communications only with your consent)", "Business Operations: Manage our business operations, enforce our terms of service, resolve disputes"] },
    { icon: FileText, title: "4. Data Sharing and Third-Party Services", content: "We may share your information with:", list: ["Payment Processors: Third-party payment service providers (e.g., Paystack, Flutterwave) to process transactions - they are required to maintain similar privacy protections", "Service Providers: Cloud hosting providers (Supabase), analytics services, customer support platforms - all bound by confidentiality agreements", "Telecommunications Vendors: Airtime and data providers (MTN, Airtel, Glo, 9mobile), electricity distribution companies, cable TV providers - necessary to fulfill service requests", "Legal and Regulatory: Government agencies, law enforcement, regulatory bodies when required by law or to protect rights", "Business Transfers: In event of merger, acquisition, or sale of assets (with notice to users)", "With Your Consent: When you explicitly authorize sharing with specific third parties"], note: "We do not sell your personal information to third parties for their marketing purposes. We do not share biometric data with any third party - it remains stored securely on your device." },
    { icon: Lock, title: "5. Data Security", content: "We employ industry-standard security measures:", list: ["Encryption: All data transmitted between your device and our servers is encrypted using TLS/SSL. Sensitive data is encrypted at rest", "Authentication: Multi-factor authentication, PIN protection, optional biometric authentication (Face ID/Touch ID)", "Access Controls: Limited employee access on need-to-know basis, regular access audits, secure credential management", "Security Monitoring: Continuous monitoring for suspicious activity, intrusion detection systems, regular security assessments", "Data Breach Procedures: Established incident response procedures, prompt notification to affected users and authorities if required by law", "Compliance: Regular security audits, adherence to PCI DSS standards for payment processing, compliance with Nigerian data protection regulations"] },
    { icon: FileText, title: "6. Data Retention and Deletion", content: "We retain your data as follows:", list: ["Active Accounts: Data retained while your account is active and for 7 years after last transaction (as required by Nigerian financial regulations)", "Inactive Accounts: Data retained for 3 years after account closure, then anonymized or securely deleted", "Legal Requirements: Transaction records retained for minimum 7 years as required by law", "You may request deletion of your account and associated data by contacting support@netpayy.ng. Note: We may retain certain information as required by law (e.g., transaction records for regulatory compliance)", "Upon account deletion request, we will process within 30 days, subject to legal retention requirements"] },
    { icon: UserCheck, title: "7. Your Privacy Rights", content: "You have the right to:", list: ["Access: Request a copy of your personal information we hold", "Correction: Request correction of inaccurate or incomplete information", "Deletion: Request deletion of your personal information (subject to legal requirements)", "Data Portability: Request transfer of your data in a machine-readable format", "Objection: Object to processing of your information for certain purposes", "Restriction: Request restriction of processing in certain circumstances", "Withdraw Consent: Withdraw consent for data processing where consent is the legal basis", "Lodge Complaints: File a complaint with the Nigerian Data Protection Commission or relevant supervisory authority"], note: "To exercise these rights, contact us at support@netpayy.ng. We will respond within 30 days." },
    { icon: Cookie, title: "8. Cookies and Tracking Technologies", content: "Our app uses:", list: ["Essential Cookies: Required for app functionality, authentication, security - cannot be disabled", "Analytics: Usage analytics to improve services (anonymized data)", "Session Storage: Temporary storage of authentication tokens and session data on your device", "Third-Party Analytics: We may use analytics services (anonymized usage data only)", "Opt-Out: You can control cookies through your device settings, but disabling essential cookies may affect app functionality"], note: "We do not use cookies for advertising purposes or to track you across other apps or websites." },
    { icon: Info, title: "9. Age Restrictions and Children's Privacy", content: "Our services are intended for users aged 18 years and older. We do not knowingly collect personal information from individuals under 18 years of age. If we become aware that we have collected information from a minor, we will take steps to delete such information promptly. Parents or guardians who believe their child has provided us with personal information should contact us immediately at support@netpayy.ng." },
    { icon: Globe, title: "10. International Data Transfers and Storage", content: "Your information may be:", list: ["Stored: Primarily stored on servers located in Nigeria and cloud infrastructure (Supabase) which may have servers in other jurisdictions", "Transferred: May be transferred to service providers in other countries who have adequate data protection measures", "Safeguards: We ensure appropriate safeguards through contractual agreements requiring equivalent data protection standards", "Your Rights: Regardless of where data is stored, your privacy rights under this policy remain the same"], note: "By using our services, you consent to such transfers." },
    { icon: Shield, title: "11. Biometric Authentication", content: "Our app offers optional biometric authentication (Face ID/Touch ID on iOS, fingerprint on Android):", list: ["Storage: Biometric data is stored securely on your device only - we do not receive, store, or transmit your biometric data", "Privacy: Apple/Google handles biometric authentication through their secure enclave/systems", "Control: You can enable or disable biometric authentication at any time in app settings", "Purpose: Used solely for device authentication to access the app - not shared with third parties"], note: "If you disable biometric authentication, you can still use PIN or password to access the app." },
    { icon: CreditCard, title: "12. Payment Information and Financial Data", content: "Financial information handling:", list: ["Payment Cards: Card details are not stored by us - processed securely by PCI DSS compliant payment processors", "Bank Accounts: Virtual account details are provided by licensed financial institutions", "Transaction Records: Transaction history is stored securely and encrypted", "Regulatory Compliance: We comply with Nigerian financial services regulations and anti-money laundering requirements"], note: "We never store your full payment card details on our servers." },
    { icon: FileText, title: "13. In-App Purchases and Subscriptions", content: "Our app does not currently offer in-app purchases or subscriptions through Apple's App Store or Google Play Store. All transactions are processed through our payment infrastructure. If we introduce in-app purchases in the future, this policy will be updated accordingly. All service fees are clearly displayed before transaction completion." },
    { icon: FileText, title: "14. Changes to This Privacy Policy", content: "We may update this Privacy Policy periodically to reflect changes in our practices, technology, legal requirements, or other factors. We will:", list: ["Notification: Notify you of material changes via email, in-app notification, or prominent notice in the app", "Review Date: Update the \"Last updated\" date at the top of this policy", "Consent: Your continued use after changes constitutes acceptance - we encourage periodic review"], note: "Material changes affecting your rights will be communicated at least 30 days in advance when possible." },
    { icon: Mail, title: "15. Contact Information and Data Controller", content: "For privacy-related questions, requests, or complaints:", list: ["Data Controller: NetPay (registered in Nigeria)", "Email: support@netpayy.ng (include \"Privacy Request\" in subject line)", "Phone: +234 706 739 8399", "Address: Lagos, Nigeria (specific address available upon request)", "Response Time: We aim to respond to privacy requests within 30 days", "Data Protection Officer: Contact support@netpayy.ng for data protection inquiries"], note: "For complaints not resolved directly, you may contact the Nigerian Data Protection Commission." },
  ];

  return (
    <div className="min-h-screen bg-gradient-to-br from-orange-50/50 via-white to-orange-50/30 pb-24">
      {/* Header with Orange Theme */}
      <div className="bg-gradient-to-r from-orange-500 via-orange-600 to-orange-700 text-white shadow-lg">
        <div className="px-4 py-6">
          <div className="flex items-center gap-3 mb-2">
            <Button
              variant="ghost"
              size="icon"
              onClick={() => navigate("/user/profile")}
              className="text-white hover:bg-white/20"
            >
              <ArrowLeft className="h-5 w-5" />
            </Button>
            <div className="p-2 bg-white/20 rounded-lg">
              <Shield className="w-6 h-6" />
            </div>
            <div className="flex-1">
              <h1 className="text-2xl font-bold">Privacy Policy</h1>
              <p className="text-orange-100 text-sm">
                Last updated: {new Date().toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' })}
              </p>
            </div>
          </div>
        </div>
      </div>

      <div className="p-4 space-y-4">
        {sections.map((section, index) => {
          const Icon = section.icon;
          return (
            <Card key={index} className="border-l-4 border-l-orange-500 shadow-md">
              <CardContent className="p-6">
                <div className="flex items-start gap-3 mb-3">
                  <div className="p-2 bg-orange-100 rounded-lg text-orange-600 flex-shrink-0">
                    <Icon className="w-5 h-5" />
                  </div>
                  <div className="flex-1">
                    <h2 className="text-lg font-bold mb-2 text-orange-600">{section.title}</h2>
                    <p className="text-gray-700 text-sm leading-relaxed mb-2">{section.content}</p>
                    {section.list && (
                      <ul className="space-y-1 ml-4 mt-2">
                        {section.list.map((item, itemIndex) => (
                          <li key={itemIndex} className="flex items-start gap-2 text-gray-700 text-sm">
                            <span className="text-orange-500 mt-1">•</span>
                            <span>{item}</span>
                          </li>
                        ))}
                      </ul>
                    )}
                    {section.note && (
                      <div className="mt-3 p-3 bg-orange-50 border-l-4 border-orange-400 rounded-r">
                        <p className="text-gray-700 text-sm italic">{section.note}</p>
                      </div>
                    )}
                  </div>
                </div>
              </CardContent>
            </Card>
          );
        })}
      </div>

      <BottomNav />
    </div>
  );
}