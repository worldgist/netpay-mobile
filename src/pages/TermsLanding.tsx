import { useMemo } from "react";
import { FileText, CheckCircle2, Settings, User, CreditCard, Shield, AlertCircle, XCircle, Scale, Mail } from "lucide-react";

const SECTIONS = [
  {
    icon: CheckCircle2,
    title: "1. Agreement to Terms",
    body: [
      "By creating an account or using any NetPay product, you agree to these Terms and Conditions. If you do not agree, please discontinue use of our website, mobile apps, and partner services.",
      "We may update these Terms from time to time. When we do, we will post the revised version with an updated date. Your continued use after changes means you accept the revised Terms.",
    ],
    color: "text-orange-600"
  },
  {
    icon: Settings,
    title: "2. Services Covered",
    bullets: [
      "Airtime and voice recharge for all major Nigerian networks.",
      "Data bundles, SME data and enterprise connectivity services.",
      "Electricity token vending across national and regional discos.",
      "Cable TV, betting, gaming, insurance and education PIN purchases.",
      "Wallet funding, settlements, payouts and agent management.",
    ],
    color: "text-orange-600"
  },
  {
    icon: User,
    title: "3. Eligibility & Account Security",
    bullets: [
      "You must be at least 18 years old or the legal age of majority in your jurisdiction.",
      "All information provided during signup must be accurate, complete, and kept up to date.",
      "You are responsible for safeguarding login credentials, transaction PINs and device access.",
      "Notify NetPay immediately of unauthorized activity via support@netpayy.ng or +234 706 739 8399.",
    ],
    color: "text-orange-600"
  },
  {
    icon: CreditCard,
    title: "4. Transactions & Fees",
    bullets: [
      "All prices, commissions and service fees are displayed before you confirm a transaction.",
      "Transactions are processed instantly; completed purchases cannot be reversed.",
      "Refunds (where applicable) follow regulator guidelines and provider policies.",
      "We may suspend or decline suspicious transactions to protect you and our platform.",
    ],
    color: "text-orange-600"
  },
  {
    icon: Shield,
    title: "5. User Responsibilities",
    bullets: [
      "Use NetPay solely for lawful purposes and in compliance with applicable regulations.",
      "Do not misuse the platform, attempt to hack, or disrupt our systems and integrations.",
      "Ensure the accuracy of beneficiary details before completing payments or transfers.",
      "Maintain sufficient wallet balance to cover purchases, charges and applied taxes.",
    ],
    color: "text-orange-600"
  },
  {
    icon: FileText,
    title: "6. Intellectual Property",
    body: [
      "All product names, logos, UI layouts, copy, marketing material and proprietary technology belong to NetPay or our partners.",
      "You may not copy, resell, or exploit any part of the service without written permission.",
    ],
    color: "text-orange-600"
  },
  {
    icon: AlertCircle,
    title: "7. Liability Limitation",
    body: [
      'NetPay provides services on an "as-is" basis. While we strive for uptime, we cannot guarantee uninterrupted availability.',
      "We are not liable for indirect, incidental, special or consequential damages arising from use, misuse or inability to use the platform.",
      "Our total liability for any claim will not exceed the amount paid by you for the service giving rise to the claim.",
    ],
    color: "text-orange-600"
  },
  {
    icon: XCircle,
    title: "8. Service Changes & Termination",
    body: [
      "We may modify features, suspend services or discontinue certain products when required by providers, regulators or technical needs.",
      "We reserve the right to suspend or terminate accounts that breach these Terms, security rules or compliance obligations.",
    ],
    color: "text-orange-600"
  },
  {
    icon: Scale,
    title: "9. Governing Law & Dispute Resolution",
    body: [
      "These Terms are governed by the laws of the Federal Republic of Nigeria.",
      "Disputes will first be handled through our support and compliance teams. If unresolved, disputes may be escalated to the appropriate regulatory or arbitration channels within Nigeria.",
    ],
    color: "text-orange-600"
  },
  {
    icon: Mail,
    title: "10. Contact & Support",
    body: [
      "For questions about these Terms or to request clarifications, contact support@netpayy.ng or visit our Contact centre.",
    ],
    color: "text-orange-600"
  },
];

const TermsLanding = () => {
  const lastUpdated = useMemo(() => new Date().toLocaleDateString("en-NG", {
    year: "numeric",
    month: "long",
    day: "numeric",
  }), []);

  return (
    <div className="min-h-screen bg-gradient-to-br from-orange-50/50 via-white to-orange-50/30">
      {/* Header Section with Orange Theme */}
      <div className="bg-gradient-to-r from-orange-500 via-orange-600 to-orange-700 text-white shadow-lg">
        <div className="container mx-auto px-6 py-12">
          <div className="flex items-center gap-4 mb-4">
            <div className="p-3 bg-white/20 rounded-lg backdrop-blur-sm">
              <FileText className="w-8 h-8" />
            </div>
            <div>
              <h1 className="text-4xl font-bold mb-2">Terms & Conditions</h1>
              <p className="text-orange-100 text-lg">Last updated: {lastUpdated}</p>
            </div>
          </div>
          <p className="text-orange-50 max-w-3xl text-lg">
            Understand how NetPay keeps your payments secure and compliant. These Terms outline your rights, 
            responsibilities, and the policies that guide every NetPay interaction.
          </p>
        </div>
      </div>

      {/* Content Section */}
      <div className="container mx-auto px-6 py-12 max-w-5xl">
        <div className="space-y-8">
          {SECTIONS.map((section, index) => {
            const Icon = section.icon || FileText;
            return (
              <div
                key={section.title}
                className="border-l-4 border-l-orange-500 bg-white rounded-lg shadow-md hover:shadow-lg transition-shadow duration-300 p-8"
              >
                <div className="flex items-start gap-4 mb-4">
                  <div className={`p-3 bg-orange-100 rounded-lg ${section.color || "text-orange-600"} flex-shrink-0`}>
                    <Icon className="w-6 h-6" />
                  </div>
                  <div className="flex-1">
                    <h2 className={`text-2xl font-bold mb-3 ${section.color || "text-orange-600"}`}>
                      {section.title}
                    </h2>
                    {section.body?.map((paragraph, pIndex) => (
                      <p key={pIndex} className="text-gray-700 leading-relaxed mb-4">
                        {paragraph}
                      </p>
                    ))}
                    {section.bullets && (
                      <ul className="space-y-2 ml-4">
                        {section.bullets.map((item, itemIndex) => (
                          <li key={itemIndex} className="flex items-start gap-2 text-gray-700">
                            <span className="text-orange-500 mt-1.5">•</span>
                            <span>{item}</span>
                          </li>
                        ))}
                      </ul>
                    )}
                  </div>
                </div>
              </div>
            );
          })}
        </div>

        {/* Footer Notice */}
        <div className="mt-12 bg-orange-50 border-orange-200 border rounded-lg p-6">
          <div className="flex items-start gap-3">
            <AlertCircle className="w-6 h-6 text-orange-600 flex-shrink-0 mt-1" />
            <div>
              <h3 className="font-semibold text-orange-900 mb-2">Need clarification?</h3>
              <p className="text-orange-800 text-sm leading-relaxed mb-4">
                Our compliance and support teams are available to explain any part of these Terms, guide onboarding, or help with documentation.
              </p>
              <div className="flex flex-wrap gap-3">
                <a
                  href="mailto:support@netpayy.ng"
                  className="px-5 py-2 bg-orange-600 text-white rounded-lg hover:bg-orange-700 transition-colors text-sm font-medium"
                >
                  Email support@netpayy.ng
                </a>
                <a
                  href="mailto:support@netpayy.ng"
                  className="px-5 py-2 border border-orange-600 text-orange-600 rounded-lg hover:bg-orange-50 transition-colors text-sm font-medium"
                >
                  Contact support
                </a>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

export default TermsLanding;

