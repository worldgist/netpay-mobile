import { useNavigate } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { ArrowLeft, FileText, CheckCircle2, Settings, User, CreditCard, Shield, AlertCircle, XCircle, Scale, Mail } from "lucide-react";
import BottomNav from "@/components/BottomNav";

export default function UserTerms() {
  const navigate = useNavigate();

  const sections = [
    { icon: CheckCircle2, title: "1. Acceptance of Terms", content: "By accessing and using NetPay's services, you acknowledge that you have read, understood, and agree to be bound by these Terms and Conditions. If you do not agree with any part of these terms, you must not use our services." },
    { icon: Settings, title: "2. Services Description", content: "NetPay provides digital financial services including but not limited to:", list: ["Mobile airtime and data purchases", "Cable TV subscriptions", "Electricity bill payments", "Education services payments", "Peer-to-peer fund transfers", "Virtual account management"] },
    { icon: User, title: "3. User Account", content: "You are responsible for maintaining the confidentiality of your account credentials and for all activities that occur under your account. You must notify us immediately of any unauthorized use of your account." },
    { icon: CreditCard, title: "4. Transactions", content: "All transactions are subject to verification and may be declined or cancelled for various reasons including but not limited to insufficient funds, suspected fraud, or technical errors. Once a transaction is completed, it cannot be reversed except in cases of system errors or as required by law." },
    { icon: CreditCard, title: "5. Fees and Charges", content: "We reserve the right to charge fees for our services. All applicable fees will be clearly displayed before you complete any transaction. We may modify our fees at any time with prior notice to users." },
    { icon: Shield, title: "6. User Conduct", content: "You agree not to:", list: ["Use the service for any illegal or unauthorized purpose", "Attempt to gain unauthorized access to our systems", "Interfere with or disrupt the service", "Impersonate another person or entity", "Engage in fraudulent activities"] },
    { icon: Shield, title: "7. Privacy and Data Protection", content: "Your use of our services is also governed by our Privacy Policy. We are committed to protecting your personal information and complying with applicable data protection laws." },
    { icon: AlertCircle, title: "8. Limitation of Liability", content: "NetPay shall not be liable for any indirect, incidental, special, consequential, or punitive damages resulting from your use or inability to use the service. Our total liability for any claim arising out of or relating to these terms shall not exceed the amount paid by you for the service." },
    { icon: XCircle, title: "9. Termination", content: "We reserve the right to suspend or terminate your account at any time for violation of these terms or for any other reason at our sole discretion." },
    { icon: Settings, title: "10. Changes to Terms", content: "We reserve the right to modify these terms at any time. We will notify users of any material changes via email or through the app. Your continued use of the service after such modifications constitutes your acceptance of the updated terms." },
    { icon: Scale, title: "11. Governing Law", content: "These terms shall be governed by and construed in accordance with the laws of the Federal Republic of Nigeria, without regard to its conflict of law provisions." },
    { icon: Mail, title: "12. Contact Information", content: "If you have any questions about these Terms and Conditions, please contact us at: Email: support@netpayy.ng, Phone: +234 706 739 8399" },
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
            <h2 className="text-xl font-bold mb-4">1. Acceptance of Terms</h2>
            <p className="text-muted-foreground mb-4">
              By accessing and using NetPay's services, you acknowledge that you have read, understood, 
              and agree to be bound by these Terms and Conditions. If you do not agree with any part of 
              these terms, you must not use our services.
            </p>

            <h2 className="text-xl font-bold mb-4 mt-6">2. Services Description</h2>
            <p className="text-muted-foreground mb-4">
              NetPay provides digital financial services including but not limited to:
            </p>
            <ul className="list-disc pl-6 text-muted-foreground mb-4">
              <li>Mobile airtime and data purchases</li>
              <li>Cable TV subscriptions</li>
              <li>Electricity bill payments</li>
              <li>Education services payments</li>
              <li>Peer-to-peer fund transfers</li>
              <li>Virtual account management</li>
            </ul>

            <h2 className="text-xl font-bold mb-4 mt-6">3. User Account</h2>
            <p className="text-muted-foreground mb-4">
              You are responsible for maintaining the confidentiality of your account credentials and 
              for all activities that occur under your account. You must notify us immediately of any 
              unauthorized use of your account.
            </p>

            <h2 className="text-xl font-bold mb-4 mt-6">4. Transactions</h2>
            <p className="text-muted-foreground mb-4">
              All transactions are subject to verification and may be declined or cancelled for various 
              reasons including but not limited to insufficient funds, suspected fraud, or technical 
              errors. Once a transaction is completed, it cannot be reversed except in cases of system 
              errors or as required by law.
            </p>

            <h2 className="text-xl font-bold mb-4 mt-6">5. Fees and Charges</h2>
            <p className="text-muted-foreground mb-4">
              We reserve the right to charge fees for our services. All applicable fees will be clearly 
              displayed before you complete any transaction. We may modify our fees at any time with 
              prior notice to users.
            </p>

            <h2 className="text-xl font-bold mb-4 mt-6">6. User Conduct</h2>
            <p className="text-muted-foreground mb-4">
              You agree not to:
            </p>
            <ul className="list-disc pl-6 text-muted-foreground mb-4">
              <li>Use the service for any illegal or unauthorized purpose</li>
              <li>Attempt to gain unauthorized access to our systems</li>
              <li>Interfere with or disrupt the service</li>
              <li>Impersonate another person or entity</li>
              <li>Engage in fraudulent activities</li>
            </ul>

            <h2 className="text-xl font-bold mb-4 mt-6">7. Privacy and Data Protection</h2>
            <p className="text-muted-foreground mb-4">
              Your use of our services is also governed by our Privacy Policy. We are committed to 
              protecting your personal information and complying with applicable data protection laws.
            </p>

            <h2 className="text-xl font-bold mb-4 mt-6">8. Limitation of Liability</h2>
            <p className="text-muted-foreground mb-4">
              NetPay shall not be liable for any indirect, incidental, special, consequential, or 
              punitive damages resulting from your use or inability to use the service. Our total 
              liability for any claim arising out of or relating to these terms shall not exceed the 
              amount paid by you for the service.
            </p>

            <h2 className="text-xl font-bold mb-4 mt-6">9. Termination</h2>
            <p className="text-muted-foreground mb-4">
              We reserve the right to suspend or terminate your account at any time for violation of 
              these terms or for any other reason at our sole discretion.
            </p>

            <h2 className="text-xl font-bold mb-4 mt-6">10. Changes to Terms</h2>
            <p className="text-muted-foreground mb-4">
              We reserve the right to modify these terms at any time. We will notify users of any 
              material changes via email or through the app. Your continued use of the service after 
              such modifications constitutes your acceptance of the updated terms.
            </p>

            <h2 className="text-xl font-bold mb-4 mt-6">11. Governing Law</h2>
            <p className="text-muted-foreground mb-4">
              These terms shall be governed by and construed in accordance with the laws of the Federal 
              Republic of Nigeria, without regard to its conflict of law provisions.
            </p>

            <h2 className="text-xl font-bold mb-4 mt-6">12. Contact Information</h2>
            <p className="text-muted-foreground mb-4">
              If you have any questions about these Terms and Conditions, please contact us at:
            </p>
            <p className="text-muted-foreground">
              Email: support@netpayy.ng<br />
              Phone: +234 706 739 8399
            </p>
          </CardContent>
        </Card>
      </div>

      <BottomNav />
    </div>
  );
}