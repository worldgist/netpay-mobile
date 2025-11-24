import { AppSidebar } from "@/components/AppSidebar";
import { SidebarProvider, SidebarInset } from "@/components/ui/sidebar";
import { Card, CardContent } from "@/components/ui/card";
import { FileText, CheckCircle2, AlertCircle, Shield, CreditCard, User, Ban, Settings, XCircle, Scale, Mail } from "lucide-react";

const TermsAndConditions = () => {
  const sections = [
    {
      icon: CheckCircle2,
      title: "1. Agreement to Terms",
      content: "By accessing or using NetPay services, you agree to be bound by these Terms and Conditions. If you disagree with any part of these terms, you may not access our services.",
      color: "text-orange-600"
    },
    {
      icon: Settings,
      title: "2. Services",
      content: "NetPay provides comprehensive payment and bill services including:",
      list: [
        "Airtime purchase and recharge",
        "Data bundle subscriptions",
        "Electricity bill payments",
        "Cable TV subscriptions",
        "Education service payments"
      ],
      color: "text-orange-600"
    },
    {
      icon: User,
      title: "3. Account Registration",
      content: "To use our services, you must:",
      list: [
        "Provide accurate and complete registration information",
        "Maintain the security of your account credentials",
        "Notify us immediately of any unauthorized access",
        "Be responsible for all activities under your account"
      ],
      color: "text-orange-600"
    },
    {
      icon: CreditCard,
      title: "4. Transaction Terms",
      content: "When making transactions:",
      list: [
        "All transactions are subject to available balance",
        "Service fees and commissions apply as displayed",
        "Transactions are final once completed",
        "Refunds are processed according to our refund policy",
        "We reserve the right to refuse or cancel any transaction"
      ],
      color: "text-orange-600"
    },
    {
      icon: Shield,
      title: "5. User Responsibilities",
      content: "You agree to:",
      list: [
        "Use services only for lawful purposes",
        "Not engage in fraudulent activities",
        "Not attempt to gain unauthorized access to our systems",
        "Not interfere with the proper functioning of our services",
        "Comply with all applicable laws and regulations"
      ],
      color: "text-orange-600"
    },
    {
      icon: AlertCircle,
      title: "6. Limitations of Liability",
      content: "NetPay shall not be liable for any indirect, incidental, special, consequential, or punitive damages resulting from your use of or inability to use our services. We do not guarantee uninterrupted or error-free service.",
      color: "text-orange-600"
    },
    {
      icon: Settings,
      title: "7. Service Modifications",
      content: "We reserve the right to modify, suspend, or discontinue any part of our services at any time without prior notice. We may also update these terms and conditions periodically.",
      color: "text-orange-600"
    },
    {
      icon: XCircle,
      title: "8. Termination",
      content: "We may terminate or suspend your account immediately, without prior notice, for any breach of these Terms and Conditions. Upon termination, your right to use our services will cease immediately.",
      color: "text-orange-600"
    },
    {
      icon: Scale,
      title: "9. Governing Law",
      content: "These Terms shall be governed by and construed in accordance with the laws of Nigeria, without regard to its conflict of law provisions.",
      color: "text-orange-600"
    },
    {
      icon: Mail,
      title: "10. Contact Information",
      content: "For questions about these Terms and Conditions, please contact us at support@netpayy.ng",
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
                  <FileText className="w-8 h-8" />
                </div>
                <div>
                  <h1 className="text-4xl font-bold mb-2">Terms and Conditions</h1>
                  <p className="text-orange-100 text-lg">Last updated: {new Date().toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' })}</p>
                </div>
              </div>
              <p className="text-orange-50 max-w-3xl text-lg">
                Please read these terms carefully before using NetPay services. By using our platform, you agree to be bound by these terms.
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
                    <h3 className="font-semibold text-orange-900 mb-2">Important Notice</h3>
                    <p className="text-orange-800 text-sm leading-relaxed">
                      These terms and conditions may be updated from time to time. We will notify users of any significant changes. 
                      Continued use of our services after changes constitutes acceptance of the updated terms.
                    </p>
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

export default TermsAndConditions;
