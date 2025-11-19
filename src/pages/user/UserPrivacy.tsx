import { useNavigate } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { ArrowLeft } from "lucide-react";
import BottomNav from "@/components/BottomNav";

export default function UserPrivacy() {
  const navigate = useNavigate();

  return (
    <div className="min-h-screen bg-gray-50 pb-24">
      {/* Header */}
      <div className="bg-white border-b sticky top-0 z-10">
        <div className="px-4 py-4">
          <div className="flex items-center gap-3">
            <Button
              variant="ghost"
              size="icon"
              onClick={() => navigate("/user/profile")}
            >
              <ArrowLeft className="h-5 w-5" />
            </Button>
            <div>
              <h1 className="text-xl font-bold">Privacy Policy</h1>
              <p className="text-sm text-muted-foreground">
                Last updated: January 2025
              </p>
            </div>
          </div>
        </div>
      </div>

      <div className="p-4">
        <Card>
          <CardContent className="p-6 prose prose-sm max-w-none">
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