import { useNavigate } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { ArrowLeft, Shield, Database, Eye, FileText, Lock, UserCheck, Mail, Info, Globe, Cookie } from "lucide-react";
import BottomNav from "@/components/BottomNav";

export default function UserPrivacy() {
  const navigate = useNavigate();

  const sections = [
    { icon: Info, title: "1. Introduction", content: "NetPay (\"we,\" \"our,\" or \"us\") is committed to protecting your privacy. This Privacy Policy explains how we collect, use, disclose, and safeguard your information when you use our mobile application and services." },
    { icon: Database, title: "2. Information We Collect", content: "We collect information that you provide directly to us, including:", list: ["Personal identification information (name, email address, phone number)", "Account credentials (username, password)", "Payment information (transaction history, virtual account details)", "Device information (device type, operating system, unique device identifiers)", "Usage data (app interactions, features used, time spent)", "Location data (with your permission)"] },
    { icon: Eye, title: "3. How We Use Your Information", content: "We use the collected information for various purposes:", list: ["To provide, maintain, and improve our services", "To process your transactions and send related information", "To send you technical notices, updates, and support messages", "To respond to your comments, questions, and customer service requests", "To detect, prevent, and address technical issues and fraudulent activity", "To comply with legal obligations", "To send you promotional communications (with your consent)"] },
    { icon: FileText, title: "4. Data Sharing and Disclosure", content: "We may share your information in the following circumstances:", list: ["With Service Providers: We share information with third-party vendors who perform services on our behalf", "For Legal Reasons: We may disclose information if required by law or in response to valid requests by public authorities", "Business Transfers: In connection with any merger, sale of company assets, or acquisition", "With Your Consent: We may share information with your explicit consent"] },
    { icon: Lock, title: "5. Data Security", content: "We implement appropriate technical and organizational measures to protect your personal information against unauthorized access, alteration, disclosure, or destruction. These measures include:", list: ["Encryption of data in transit and at rest", "Regular security audits and assessments", "Secure authentication mechanisms", "Access controls and monitoring", "Employee training on data protection"] },
    { icon: FileText, title: "6. Data Retention", content: "We retain your personal information for as long as necessary to provide our services, comply with legal obligations, resolve disputes, and enforce our agreements. When we no longer need your information, we will securely delete or anonymize it." },
    { icon: UserCheck, title: "7. Your Rights", content: "You have certain rights regarding your personal information:", list: ["Access: You can request access to your personal information", "Correction: You can request correction of inaccurate information", "Deletion: You can request deletion of your personal information", "Objection: You can object to processing of your information", "Data Portability: You can request transfer of your data", "Withdraw Consent: You can withdraw consent where applicable"] },
    { icon: Cookie, title: "8. Cookies and Tracking Technologies", content: "We use cookies and similar tracking technologies to track activity on our service and hold certain information. You can instruct your browser to refuse all cookies or to indicate when a cookie is being sent." },
    { icon: Info, title: "9. Children's Privacy", content: "Our service is not intended for children under the age of 18. We do not knowingly collect personal information from children under 18. If you are a parent or guardian and believe your child has provided us with personal information, please contact us." },
    { icon: Globe, title: "10. International Data Transfers", content: "Your information may be transferred to and maintained on computers located outside of your jurisdiction where data protection laws may differ. We will take appropriate steps to ensure your data is treated securely and in accordance with this Privacy Policy." },
    { icon: FileText, title: "11. Changes to This Privacy Policy", content: "We may update our Privacy Policy from time to time. We will notify you of any changes by posting the new Privacy Policy on this page and updating the \"Last updated\" date. You are advised to review this Privacy Policy periodically for any changes." },
    { icon: Mail, title: "12. Contact Us", content: "If you have any questions about this Privacy Policy, please contact us: Email: support@netpayy.ng, Phone: +234 706 739 8399" },
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
            <h2 className="text-xl font-bold mb-4">1. Introduction</h2>
            <p className="text-muted-foreground mb-4">
              NetPay ("we," "our," or "us") is committed to protecting your privacy. This Privacy Policy 
              explains how we collect, use, disclose, and safeguard your information when you use our 
              mobile application and services.
            </p>

            <h2 className="text-xl font-bold mb-4 mt-6">2. Information We Collect</h2>
            <p className="text-muted-foreground mb-4">
              We collect information that you provide directly to us, including:
            </p>
            <ul className="list-disc pl-6 text-muted-foreground mb-4">
              <li>Personal identification information (name, email address, phone number)</li>
              <li>Account credentials (username, password)</li>
              <li>Payment information (transaction history, virtual account details)</li>
              <li>Device information (device type, operating system, unique device identifiers)</li>
              <li>Usage data (app interactions, features used, time spent)</li>
              <li>Location data (with your permission)</li>
            </ul>

            <h2 className="text-xl font-bold mb-4 mt-6">3. How We Use Your Information</h2>
            <p className="text-muted-foreground mb-4">
              We use the collected information for various purposes:
            </p>
            <ul className="list-disc pl-6 text-muted-foreground mb-4">
              <li>To provide, maintain, and improve our services</li>
              <li>To process your transactions and send related information</li>
              <li>To send you technical notices, updates, and support messages</li>
              <li>To respond to your comments, questions, and customer service requests</li>
              <li>To detect, prevent, and address technical issues and fraudulent activity</li>
              <li>To comply with legal obligations</li>
              <li>To send you promotional communications (with your consent)</li>
            </ul>

            <h2 className="text-xl font-bold mb-4 mt-6">4. Data Sharing and Disclosure</h2>
            <p className="text-muted-foreground mb-4">
              We may share your information in the following circumstances:
            </p>
            <ul className="list-disc pl-6 text-muted-foreground mb-4">
              <li><strong>With Service Providers:</strong> We share information with third-party vendors 
              who perform services on our behalf</li>
              <li><strong>For Legal Reasons:</strong> We may disclose information if required by law or 
              in response to valid requests by public authorities</li>
              <li><strong>Business Transfers:</strong> In connection with any merger, sale of company 
              assets, or acquisition</li>
              <li><strong>With Your Consent:</strong> We may share information with your explicit consent</li>
            </ul>

            <h2 className="text-xl font-bold mb-4 mt-6">5. Data Security</h2>
            <p className="text-muted-foreground mb-4">
              We implement appropriate technical and organizational measures to protect your personal 
              information against unauthorized access, alteration, disclosure, or destruction. These 
              measures include:
            </p>
            <ul className="list-disc pl-6 text-muted-foreground mb-4">
              <li>Encryption of data in transit and at rest</li>
              <li>Regular security audits and assessments</li>
              <li>Secure authentication mechanisms</li>
              <li>Access controls and monitoring</li>
              <li>Employee training on data protection</li>
            </ul>

            <h2 className="text-xl font-bold mb-4 mt-6">6. Data Retention</h2>
            <p className="text-muted-foreground mb-4">
              We retain your personal information for as long as necessary to provide our services, 
              comply with legal obligations, resolve disputes, and enforce our agreements. When we no 
              longer need your information, we will securely delete or anonymize it.
            </p>

            <h2 className="text-xl font-bold mb-4 mt-6">7. Your Rights</h2>
            <p className="text-muted-foreground mb-4">
              You have certain rights regarding your personal information:
            </p>
            <ul className="list-disc pl-6 text-muted-foreground mb-4">
              <li><strong>Access:</strong> You can request access to your personal information</li>
              <li><strong>Correction:</strong> You can request correction of inaccurate information</li>
              <li><strong>Deletion:</strong> You can request deletion of your personal information</li>
              <li><strong>Objection:</strong> You can object to processing of your information</li>
              <li><strong>Data Portability:</strong> You can request transfer of your data</li>
              <li><strong>Withdraw Consent:</strong> You can withdraw consent where applicable</li>
            </ul>

            <h2 className="text-xl font-bold mb-4 mt-6">8. Cookies and Tracking Technologies</h2>
            <p className="text-muted-foreground mb-4">
              We use cookies and similar tracking technologies to track activity on our service and hold 
              certain information. You can instruct your browser to refuse all cookies or to indicate 
              when a cookie is being sent.
            </p>

            <h2 className="text-xl font-bold mb-4 mt-6">9. Children's Privacy</h2>
            <p className="text-muted-foreground mb-4">
              Our service is not intended for children under the age of 18. We do not knowingly collect 
              personal information from children under 18. If you are a parent or guardian and believe 
              your child has provided us with personal information, please contact us.
            </p>

            <h2 className="text-xl font-bold mb-4 mt-6">10. International Data Transfers</h2>
            <p className="text-muted-foreground mb-4">
              Your information may be transferred to and maintained on computers located outside of your 
              jurisdiction where data protection laws may differ. We will take appropriate steps to 
              ensure your data is treated securely and in accordance with this Privacy Policy.
            </p>

            <h2 className="text-xl font-bold mb-4 mt-6">11. Changes to This Privacy Policy</h2>
            <p className="text-muted-foreground mb-4">
              We may update our Privacy Policy from time to time. We will notify you of any changes by 
              posting the new Privacy Policy on this page and updating the "Last updated" date. You are 
              advised to review this Privacy Policy periodically for any changes.
            </p>

            <h2 className="text-xl font-bold mb-4 mt-6">12. Contact Us</h2>
            <p className="text-muted-foreground mb-4">
              If you have any questions about this Privacy Policy, please contact us:
            </p>
            <p className="text-muted-foreground">
              Email: support@netpayy.ng<br />
              Phone: +234 706 739 8399<br />
              Address: 123 Business Street, Lagos, Nigeria
            </p>
          </CardContent>
        </Card>
      </div>

      <BottomNav />
    </div>
  );
}