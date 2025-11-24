import { AppSidebar } from "@/components/AppSidebar";
import { SidebarProvider, SidebarInset } from "@/components/ui/sidebar";
import { Card, CardContent } from "@/components/ui/card";
import { Shield, Database, Lock, Eye, FileText, UserCheck, Mail, Info, AlertCircle } from "lucide-react";

const PrivacyPolicy = () => {
  const sections = [
    {
      icon: Info,
      title: "1. Introduction",
      content: "Welcome to NetPay. We respect your privacy and are committed to protecting your personal data. This privacy policy will inform you about how we look after your personal data and tell you about your privacy rights.",
      color: "text-orange-600"
    },
    {
      icon: Database,
      title: "2. Information We Collect",
      content: "We may collect, use, store and transfer different kinds of personal data about you:",
      list: [
        "Identity Data: first name, last name, username",
        "Contact Data: email address, telephone numbers",
        "Financial Data: payment card details, transaction history",
        "Technical Data: IP address, browser type, device information",
        "Usage Data: information about how you use our services"
      ],
      color: "text-orange-600"
    },
    {
      icon: Eye,
      title: "3. How We Use Your Information",
      content: "We use your personal data for the following purposes:",
      list: [
        "To process your transactions and manage your account",
        "To provide customer support and respond to inquiries",
        "To send you service-related notifications",
        "To improve our services and develop new features",
        "To comply with legal obligations and prevent fraud"
      ],
      color: "text-orange-600"
    },
    {
      icon: Lock,
      title: "4. Data Security",
      content: "We have implemented appropriate security measures to prevent your personal data from being accidentally lost, used, or accessed in an unauthorized way. We limit access to your personal data to those employees and partners who have a business need to know.",
      color: "text-orange-600"
    },
    {
      icon: FileText,
      title: "5. Data Retention",
      content: "We will only retain your personal data for as long as necessary to fulfill the purposes we collected it for, including for the purposes of satisfying any legal, accounting, or reporting requirements.",
      color: "text-orange-600"
    },
    {
      icon: UserCheck,
      title: "6. Your Rights",
      content: "You have the right to:",
      list: [
        "Request access to your personal data",
        "Request correction of your personal data",
        "Request erasure of your personal data",
        "Object to processing of your personal data",
        "Request restriction of processing your personal data",
        "Request transfer of your personal data"
      ],
      color: "text-orange-600"
    },
    {
      icon: Mail,
      title: "7. Contact Us",
      content: "If you have any questions about this privacy policy or our privacy practices, please contact us at support@netpayy.ng",
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
