import { useNavigate } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { ArrowLeft, FileText, CheckCircle2, Settings, User, CreditCard, Shield, AlertCircle, XCircle, Scale, Mail } from "lucide-react";
import BottomNav from "@/components/BottomNav";

export default function UserTerms() {
  const navigate = useNavigate();

  const sections = [
    { icon: CheckCircle2, title: "1. Acceptance of Terms", content: "By downloading, installing, accessing, or using the NetPay website at https://netppay.com, the NetPay mobile application (\"App\"), or related services (\"Service\"), you acknowledge that you have read, understood, and agree to be bound by these Terms and Conditions (\"Terms\"). If you do not agree with any part of these Terms, you must not use our Service. These Terms constitute a legally binding agreement between you and NetPay.", note: "You must be at least 18 years old to use our Service. By using the Service, you represent and warrant that you are of legal age to enter into this agreement." },
    { icon: Settings, title: "2. Description of Services", content: "NetPay provides digital payment and financial services through our mobile application and website, including but not limited to:", list: ["Mobile airtime top-up and purchases", "Mobile data bundle purchases and subscriptions", "Cable TV subscriptions and renewals (DStv, GOtv, Startimes, etc.)", "Electricity bill payments and prepaid token purchases", "Education services payments (WAEC, JAMB, NECO result checker PINs, etc.)", "Peer-to-peer fund transfers between NetPay users", "Virtual account management and wallet services", "Bill payment services for various utilities"], note: "We reserve the right to modify, suspend, or discontinue any service at any time with or without notice." },
    { icon: User, title: "3. Account Registration and User Responsibilities", content: "To use our Service, you must:", list: ["Create an account providing accurate, current, and complete information", "Maintain and promptly update your account information", "Maintain the security and confidentiality of your account credentials (password, PIN)", "Notify us immediately of any unauthorized access or suspected security breach", "Be responsible for all activities that occur under your account", "Ensure your device meets minimum technical requirements"], note: "You are solely responsible for maintaining the confidentiality of your account. We are not liable for any loss or damage arising from unauthorized use of your account." },
    { icon: CreditCard, title: "4. Transactions, Payments, and Refunds", content: "Transaction terms:", list: ["All transactions are subject to verification and may be declined for security, fraud prevention, or insufficient funds", "Service fees, charges, and commissions are displayed before transaction completion", "Completed transactions are generally final and cannot be reversed except in cases of system errors or as required by law", "Refunds: Refunds will be processed in accordance with our refund policy - typically within 5-10 business days if approved", "Failed transactions: If a transaction fails after funds are deducted, we will investigate and refund within 48 hours if the service was not delivered", "Disputed transactions: Contact support@netppay.com within 48 hours of transaction date with transaction reference", "Transaction limits: We may impose daily or monthly transaction limits for security purposes"], note: "Transaction completion is indicated by confirmation message and deduction from your wallet balance. Please verify transaction status before assuming failure." },
    { icon: CreditCard, title: "5. Fees, Charges, and Payment Terms", content: "Fees and charges:", list: ["Service fees are clearly displayed before you complete any transaction", "We reserve the right to modify fees with 30 days prior notice via email or in-app notification", "All fees are non-refundable except as required by law or in case of service failure", "Wallet funding: Bank transfers and card payments may incur processing fees by payment providers", "Transaction fees vary by service type and are subject to change"], note: "You authorize us to debit your wallet or linked payment method for all fees associated with your transactions." },
    { icon: Shield, title: "6. Acceptable Use and Prohibited Activities", content: "You agree NOT to:", list: ["Use the Service for any illegal, fraudulent, or unauthorized purpose", "Violate any applicable laws, regulations, or third-party rights", "Attempt to gain unauthorized access to our systems, accounts, or networks", "Interfere with or disrupt the Service, servers, or networks connected to the Service", "Impersonate another person, entity, or organization", "Engage in money laundering, terrorist financing, or other financial crimes", "Use automated systems (bots, scrapers) to access the Service without authorization", "Reverse engineer, decompile, or attempt to extract source code of the App", "Introduce viruses, malware, or harmful code"], note: "Violation of these terms may result in immediate account suspension or termination and potential legal action." },
    { icon: Shield, title: "7. Privacy and Data Protection", content: "Your privacy is important to us. Our collection, use, and protection of your personal information is governed by our Privacy Policy, which is incorporated into these Terms by reference. Key points:", list: ["We collect and process personal information necessary to provide our services", "We implement industry-standard security measures to protect your data", "We do not sell your personal information to third parties for marketing", "We may share information with service providers necessary for service delivery", "You have rights to access, correct, and delete your personal information"], note: "Please review our Privacy Policy (accessible in-app) for complete details on data practices." },
    { icon: AlertCircle, title: "8. Limitation of Liability and Disclaimers", content: "Important limitations:", list: ["We provide the Service \"as is\" and \"as available\" without warranties of any kind, express or implied", "We do not guarantee uninterrupted, secure, or error-free operation of the Service", "We are not liable for indirect, incidental, special, consequential, or punitive damages", "Our total liability shall not exceed the amount you paid for the specific transaction in question", "We are not responsible for third-party services (telecom providers, electricity companies, etc.) and their delivery of services", "Force majeure: We are not liable for service interruptions due to circumstances beyond our reasonable control"], note: "This limitation does not affect your statutory rights as a consumer under applicable law." },
    { icon: XCircle, title: "9. Account Suspension and Termination", content: "We reserve the right to:", list: ["Suspend or terminate your account immediately, without prior notice, for violation of these Terms", "Suspend accounts for security reasons, suspected fraud, or compliance requirements", "Terminate inactive accounts after extended period of non-use (as defined in our policy)", "Refuse service to anyone at any time for any reason"], content2: "Upon termination:", list2: ["Your right to use the Service immediately ceases", "We may delete or suspend access to your account and data (subject to legal retention requirements)", "Outstanding transactions will be completed or refunded as appropriate", "You remain liable for all transactions made before termination"], note: "You may close your account at any time by contacting support@netppay.com or using the delete account feature in-app." },
    { icon: Settings, title: "10. Service Modifications and Changes to Terms", content: "We reserve the right to:", list: ["Modify, suspend, or discontinue any part of the Service at any time with or without notice", "Update the App requiring you to download and install updates", "Change these Terms at any time"], content2: "For material changes to Terms:", list2: ["We will notify you via email or prominent in-app notification at least 30 days before changes take effect", "Your continued use after changes constitutes acceptance of updated Terms", "If you disagree with changes, you may close your account and stop using the Service"], note: "We recommend reviewing these Terms periodically. The \"Last updated\" date at the top indicates when Terms were last modified." },
    { icon: Scale, title: "11. Dispute Resolution and Governing Law", content: "Dispute resolution process:", list: ["First: Contact our support team at support@netppay.com to attempt informal resolution (within 30 days)", "Mediation: If informal resolution fails, disputes shall be resolved through mediation in Lagos, Nigeria", "Arbitration: If mediation fails, disputes shall be resolved through binding arbitration under Nigerian Arbitration Act", "Court Jurisdiction: Subject to arbitration clause, disputes shall be subject to exclusive jurisdiction of Nigerian courts"], content2: "Governing Law:", list2: ["These Terms are governed by and construed in accordance with laws of the Federal Republic of Nigeria", "Any legal action must be commenced within one year of the cause of action arising"], note: "This dispute resolution clause does not prevent you from filing complaints with relevant regulatory authorities." },
    { icon: CreditCard, title: "12. Intellectual Property Rights", content: "All content, features, and functionality of the Service, including but not limited to:", list: ["App design, logos, text, graphics, and software", "Trade names, trademarks, and service marks", "Proprietary algorithms and business methods"], content2: "These are owned by NetPay or its licensors and are protected by copyright, trademark, and other intellectual property laws. You may not:", list2: ["Copy, modify, distribute, sell, or lease any part of the Service", "Use our trademarks or logos without written permission", "Remove any copyright or proprietary notices"], note: "Your use of the Service does not grant you ownership of any intellectual property rights." },
    { icon: Info, title: "13. Age Restrictions and Eligibility", content: "Service eligibility:", list: ["You must be at least 18 years old to use our Service", "You must have legal capacity to enter into binding contracts in your jurisdiction", "You must comply with all applicable laws and regulations", "You must not be prohibited from using financial services by any law or regulatory body"], note: "By using the Service, you represent and warrant that you meet all eligibility requirements." },
    { icon: FileText, title: "14. In-App Purchases and Third-Party Services", content: "Our Service:", list: ["Does not currently use Apple's In-App Purchase system or Google Play Billing", "All payments are processed through our own payment infrastructure", "If we introduce in-app purchases through App Store/Play Store in the future, additional terms will apply"], content2: "Third-party services:", list2: ["We integrate with third-party service providers (telecom operators, payment processors, etc.)", "We are not responsible for the availability, quality, or delivery of third-party services", "Third-party terms and conditions apply to their respective services"], note: "Your relationship with third-party service providers is separate from your relationship with NetPay." },
    { icon: Mail, title: "15. Contact Information and Support", content: "For questions, complaints, or support:", list: ["Website: https://netppay.com", "Email: support@netppay.com (include transaction reference if applicable)", "Phone: +234 706 739 8399 (Business hours: 9:00 AM - 9:00 PM WAT, Monday - Saturday)", "In-App: Use the \"Contact Us\" feature", "Address: Lagos, Nigeria (specific address available upon request)"], content2: "Response times:", list2: ["General inquiries: Within 24 hours", "Transaction disputes: Within 48 hours", "Technical support: Within 24 hours"], note: "For urgent matters, please call our support line during business hours." },
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
              <FileText className="w-6 h-6" />
            </div>
            <div className="flex-1">
              <h1 className="text-2xl font-bold">Terms & Conditions</h1>
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
                    {section.content2 && (
                      <>
                        <p className="text-gray-700 text-sm leading-relaxed mb-2 mt-3">{section.content2}</p>
                        {section.list2 && (
                          <ul className="space-y-1 ml-4 mt-2">
                            {section.list2.map((item, itemIndex) => (
                              <li key={itemIndex} className="flex items-start gap-2 text-gray-700 text-sm">
                                <span className="text-orange-500 mt-1">•</span>
                                <span>{item}</span>
                              </li>
                            ))}
                          </ul>
                        )}
                      </>
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