import { AppSidebar } from "@/components/AppSidebar";
import { SidebarProvider, SidebarInset } from "@/components/ui/sidebar";
import { Card, CardContent } from "@/components/ui/card";
import { Shield, Database, Lock, Eye, FileText, UserCheck, Mail, Info, AlertCircle } from "lucide-react";

const PrivacyPolicy = () => {
  const sections = [
    {
      icon: Info,
      title: "1. Introduction",
      content: "NetPay (\"we,\" \"our,\" \"us,\" or \"the Company\") operates the NetPay mobile application and related services. This Privacy Policy explains how we collect, use, disclose, and safeguard your information when you use our iOS and Android mobile application, website, and services. By using our services, you consent to the data practices described in this policy.",
      color: "text-orange-600"
    },
    {
      icon: Database,
      title: "2. Information We Collect",
      content: "We collect the following categories of information:",
      list: [
        "Personal Information: Name, email address, phone number, date of birth, government-issued identification (when required for KYC compliance)",
        "Account Information: Username, password (encrypted), PIN, biometric authentication data (Face ID/Touch ID - stored securely on your device only)",
        "Financial Information: Bank account details, virtual account numbers, transaction history, payment card information (processed securely through payment processors)",
        "Device Information: Device type, operating system version, unique device identifiers (UDID, advertising ID), IP address, mobile network information",
        "Usage Information: App features accessed, transaction patterns, time spent in app, error logs, crash reports",
        "Location Information: Approximate location based on IP address (we do not collect precise GPS location without your explicit consent)",
        "Cookies and Similar Technologies: Session data, authentication tokens stored securely on your device"
      ],
      color: "text-orange-600"
    },
    {
      icon: Eye,
      title: "3. How We Use Your Information",
      content: "We use collected information for the following purposes:",
      list: [
        "Service Delivery: Process transactions (airtime, data, cable TV, electricity, education services), manage your account, provide customer support",
        "Security and Fraud Prevention: Verify identity, detect and prevent fraudulent transactions, ensure account security",
        "Legal and Compliance: Comply with applicable laws, regulations, and legal processes; satisfy KYC/AML requirements",
        "Service Improvement: Analyze usage patterns, improve app functionality, develop new features, conduct internal research",
        "Communication: Send transaction confirmations, account alerts, service updates, respond to inquiries (marketing communications only with your consent)",
        "Business Operations: Manage our business operations, enforce our terms of service, resolve disputes"
      ],
      color: "text-orange-600"
    },
    {
      icon: FileText,
      title: "4. Data Sharing and Third-Party Services",
      content: "We may share your information with:",
      list: [
        "Payment Processors: Third-party payment service providers (e.g., Paystack) to process transactions - they are required to maintain similar privacy protections",
        "Service Providers: Cloud hosting providers (Supabase), analytics services, customer support platforms - all bound by confidentiality agreements",
        "Telecommunications Vendors: Airtime and data providers (MTN, Airtel, Glo, 9mobile), electricity distribution companies, cable TV providers - necessary to fulfill service requests",
        "Legal and Regulatory: Government agencies, law enforcement, regulatory bodies when required by law or to protect rights",
        "Business Transfers: In event of merger, acquisition, or sale of assets (with notice to users)",
        "With Your Consent: When you explicitly authorize sharing with specific third parties"
      ],
      note: "We do not sell your personal information to third parties for their marketing purposes. We do not share biometric data with any third party - it remains stored securely on your device.",
      color: "text-orange-600"
    },
    {
      icon: Lock,
      title: "5. Data Security",
      content: "We employ industry-standard security measures:",
      list: [
        "Encryption: All data transmitted between your device and our servers is encrypted using TLS/SSL. Sensitive data is encrypted at rest",
        "Authentication: Multi-factor authentication, PIN protection, optional biometric authentication (Face ID/Touch ID)",
        "Access Controls: Limited employee access on need-to-know basis, regular access audits, secure credential management",
        "Security Monitoring: Continuous monitoring for suspicious activity, intrusion detection systems, regular security assessments",
        "Data Breach Procedures: Established incident response procedures, prompt notification to affected users and authorities if required by law",
        "Compliance: Regular security audits, adherence to PCI DSS standards for payment processing, compliance with Nigerian data protection regulations"
      ],
      color: "text-orange-600"
    },
    {
      icon: FileText,
      title: "6. Data Retention and Deletion",
      content: "We retain your data as follows:",
      list: [
        "Active Accounts: Data retained while your account is active and for 7 years after last transaction (as required by Nigerian financial regulations)",
        "Inactive Accounts: Data retained for 3 years after account closure, then anonymized or securely deleted",
        "Legal Requirements: Transaction records retained for minimum 7 years as required by law",
        "You may request deletion of your account and associated data by contacting support@netpayy.ng. Note: We may retain certain information as required by law (e.g., transaction records for regulatory compliance)",
        "Upon account deletion request, we will process within 30 days, subject to legal retention requirements"
      ],
      color: "text-orange-600"
    },
    {
      icon: UserCheck,
      title: "7. Your Privacy Rights",
      content: "You have the right to:",
      list: [
        "Access: Request a copy of your personal information we hold",
        "Correction: Request correction of inaccurate or incomplete information",
        "Deletion: Request deletion of your personal information (subject to legal requirements)",
        "Data Portability: Request transfer of your data in a machine-readable format",
        "Objection: Object to processing of your information for certain purposes",
        "Restriction: Request restriction of processing in certain circumstances",
        "Withdraw Consent: Withdraw consent for data processing where consent is the legal basis",
        "Lodge Complaints: File a complaint with the Nigerian Data Protection Commission or relevant supervisory authority"
      ],
      note: "To exercise these rights, contact us at support@netpayy.ng. We will respond within 30 days.",
      color: "text-orange-600"
    },
    {
      icon: Info,
      title: "8. Age Restrictions and Children's Privacy",
      content: "Our services are intended for users aged 18 years and older. We do not knowingly collect personal information from individuals under 18 years of age. If we become aware that we have collected information from a minor, we will take steps to delete such information promptly. Parents or guardians who believe their child has provided us with personal information should contact us immediately at support@netpayy.ng.",
      color: "text-orange-600"
    },
    {
      icon: Mail,
      title: "9. Contact Information and Data Controller",
      content: "For privacy-related questions, requests, or complaints:",
      list: [
        "Data Controller: NetPay (registered in Nigeria)",
        "Email: support@netpayy.ng (include \"Privacy Request\" in subject line)",
        "Phone: +234 706 739 8399",
        "Address: Lagos, Nigeria (specific address available upon request)",
        "Response Time: We aim to respond to privacy requests within 30 days",
        "Data Protection Officer: Contact support@netpayy.ng for data protection inquiries"
      ],
      note: "For complaints not resolved directly, you may contact the Nigerian Data Protection Commission.",
      color: "text-orange-600"
    }
  ];

  return (
    <SidebarProvider>
      <AppSidebar />
      <SidebarInset>
        <div className="min-h-screen bg-gradient-to-br from-orange-50/50 via-white to-orange-50/30">
          {/* Header Section with Orange Theme */}
          <div className="bg-gradient-to-r from-orange-500 via-orange-600 to-orange-700 text-white shadow-lg">
            <div className="container mx-auto px-6 py-12">
              <div className="flex items-center gap-4 mb-4">
                <div className="p-3 bg-white/20 rounded-lg backdrop-blur-sm">
                  <Shield className="w-8 h-8" />
                </div>
                <div>
                  <h1 className="text-4xl font-bold mb-2">Privacy Policy</h1>
                  <p className="text-orange-100 text-lg">Last updated: {new Date().toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' })}</p>
                </div>
              </div>
              <p className="text-orange-50 max-w-3xl text-lg">
                Your privacy matters to us. Learn how we collect, use, and protect your personal information when you use NetPay services.
              </p>
            </div>
          </div>

          {/* Content Section */}
          <div className="container mx-auto px-6 py-12 max-w-5xl">
            <div className="space-y-8">
              {sections.map((section, index) => {
                const Icon = section.icon;
                return (
                  <Card key={index} className="border-l-4 border-l-orange-500 shadow-md hover:shadow-lg transition-shadow duration-300">
                    <CardContent className="p-8">
                      <div className="flex items-start gap-4 mb-4">
                        <div className={`p-3 bg-orange-100 rounded-lg ${section.color} flex-shrink-0`}>
                          <Icon className="w-6 h-6" />
                        </div>
                        <div className="flex-1">
                          <h2 className={`text-2xl font-bold mb-3 ${section.color}`}>
                            {section.title}
                          </h2>
                          <p className="text-gray-700 leading-relaxed mb-4">
                            {section.content}
                          </p>
                          {section.list && (
                            <ul className="space-y-2 ml-4">
                              {section.list.map((item, itemIndex) => (
                                <li key={itemIndex} className="flex items-start gap-2 text-gray-700">
                                  <span className="text-orange-500 mt-1.5">•</span>
                                  <span>{item}</span>
                                </li>
                              ))}
                            </ul>
                          )}
                          {section.note && (
                            <div className="mt-4 p-4 bg-orange-50 border-l-4 border-orange-400 rounded-r">
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

            {/* Footer Notice */}
            <Card className="mt-12 bg-orange-50 border-orange-200">
              <CardContent className="p-6">
                <div className="flex items-start gap-3">
                  <AlertCircle className="w-6 h-6 text-orange-600 flex-shrink-0 mt-1" />
                  <div>
                    <h3 className="font-semibold text-orange-900 mb-2">Your Privacy Rights</h3>
                    <p className="text-orange-800 text-sm leading-relaxed mb-4">
                      We are committed to protecting your personal data and respecting your privacy rights. 
                      If you have any concerns about how we handle your information, please contact our Data Protection Officer.
                    </p>
                    <div className="flex flex-wrap gap-3">
                      <a 
                        href="mailto:support@netpayy.ng"
                        className="px-4 py-2 bg-orange-600 text-white rounded-lg hover:bg-orange-700 transition-colors text-sm font-medium"
                      >
                        Contact DPO
                      </a>
                      <a 
                        href="mailto:support@netpayy.ng"
                        className="px-4 py-2 border border-orange-600 text-orange-600 rounded-lg hover:bg-orange-50 transition-colors text-sm font-medium"
                      >
                        Request Data Access
                      </a>
                    </div>
                  </div>
                </div>
              </CardContent>
            </Card>
          </div>
        </div>
      </SidebarInset>
    </SidebarProvider>
  );
};

export default PrivacyPolicy;
