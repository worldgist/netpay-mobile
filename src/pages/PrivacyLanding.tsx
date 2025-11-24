import { useMemo } from "react";
import { Shield, Database, Lock, Eye, FileText, UserCheck, Mail, Info, AlertCircle, Globe, Cookie } from "lucide-react";

const DATA_PRACTICES = [
  {
    icon: Database,
    title: "Information We Collect",
    bullets: [
      "Identity: full name, username, BVN (where required for compliance).",
      "Contact: email, phone number, address and preferred communication channels.",
      "Financial: wallet balances, transaction identifiers, settlement accounts.",
      "Usage & Device: IP address, device identifiers, app version, browser type.",
      "Support: conversations, tickets, call recordings and troubleshooting notes.",
    ],
    color: "text-orange-600"
  },
  {
    icon: Eye,
    title: "How We Use Your Data",
    bullets: [
      "Process payments, vend PINs, and reconcile bills on your behalf.",
      "Secure accounts with fraud monitoring, device management and 2FA.",
      "Provide customer care, notifications and service updates you request.",
      "Improve NetPay products through analytics, testing and quality control.",
      "Meet regulatory, audit, and anti-money laundering obligations.",
    ],
    color: "text-orange-600"
  },
  {
    icon: FileText,
    title: "Data Sharing & Third Parties",
    body: [
      "We share the minimum data necessary with payment processors, telecoms, electricity discos, cable providers and KYC vendors to fulfil transactions.",
      "All partners must comply with NDPR, GDPR (where applicable) and contractual confidentiality requirements.",
      "NetPay never sells customer data. Requests from regulators or law enforcement are honoured only when legally required.",
    ],
    color: "text-orange-600"
  },
  {
    icon: Lock,
    title: "Security Measures",
    bullets: [
      "Bank-grade encryption protects data in transit and at rest.",
      "Access is limited to authorised staff with role-based permissions.",
      "Continuous monitoring, penetration testing and incident response plans safeguard our infrastructure.",
      "Multi-factor authentication and device locks protect your account activities.",
    ],
    color: "text-orange-600"
  },
  {
    icon: FileText,
    title: "Retention & Deletion",
    body: [
      "We retain transaction records and account history for the period required by Nigerian regulators, typically up to 7 years.",
      "Support records and analytics data are kept as long as necessary to operate the service, after which they are anonymised or deleted.",
      "You may request deletion or restriction of certain personal data by contacting support@netpayy.ng. Some records must be retained to comply with legal obligations.",
    ],
    color: "text-orange-600"
  },
  {
    icon: UserCheck,
    title: "Your Privacy Rights",
    bullets: [
      "Request a copy of the personal data we hold about you.",
      "Ask us to correct inaccurate or incomplete information.",
      "Request deletion of data that is no longer required.",
      "Object to processing or withdraw consent for marketing.",
      "Lodge a complaint with the Nigeria Data Protection Commission (NDPC).",
    ],
    color: "text-orange-600"
  },
  {
    icon: Globe,
    title: "International Transfers",
    body: [
      "Some service providers operate outside Nigeria. When data leaves Nigeria, NetPay ensures safeguards such as standard contractual clauses or equivalent protections are in place.",
    ],
    color: "text-orange-600"
  },
  {
    icon: Cookie,
    title: "Cookies & Tracking",
    body: [
      "Our web experiences use cookies and similar technologies to remember sessions, enable secure access, and measure performance. You can manage cookie preferences in your browser. Disabling essential cookies may limit certain features.",
    ],
    color: "text-orange-600"
  },
];

const CONTACT_POINTS = [
  {
    label: "Email",
    value: "support@netpayy.ng",
    href: "mailto:support@netpayy.ng",
  },
  {
    label: "Compliance Desk",
    value: "support@netpayy.ng",
    href: "mailto:support@netpayy.ng",
  },
  {
    label: "Phone",
    value: "+234 706 739 8399",
    href: "tel:+2347067398399",
  },
];

const PrivacyLanding = () => {
  const lastUpdated = useMemo(
    () =>
      new Date().toLocaleDateString("en-NG", {
        year: "numeric",
        month: "long",
        day: "numeric",
      }),
    [],
  );

  return (
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
              <p className="text-orange-100 text-lg">Effective date: {lastUpdated}</p>
            </div>
          </div>
          <p className="text-orange-50 max-w-3xl text-lg">
            Your data powers NetPay. We protect it with uncompromising security. This Privacy Policy explains what 
            information we collect, how we use it, and the choices you have.
          </p>
        </div>
      </div>

      {/* Content Section */}
      <div className="container mx-auto px-6 py-12 max-w-5xl">
        {/* Overview Section */}
        <div className="border-l-4 border-l-orange-500 bg-white rounded-lg shadow-md mb-8 p-8">
          <div className="flex items-start gap-4">
            <div className="p-3 bg-orange-100 rounded-lg text-orange-600 flex-shrink-0">
              <Info className="w-6 h-6" />
            </div>
            <div className="flex-1">
              <h2 className="text-2xl font-bold mb-3 text-orange-600">Overview</h2>
              <p className="text-gray-700 leading-relaxed">
                NetPay Limited ("NetPay", "we", "us", or "our") is a Nigerian-based digital payments company. 
                We collect and use personal information to deliver, secure and improve our bill payment, wallet and 
                agency products. We respect your right to privacy and handle your information transparently.
              </p>
            </div>
          </div>
        </div>

        <div className="space-y-8">
          {DATA_PRACTICES.map((section, index) => {
            const Icon = section.icon || Shield;
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

        {/* Contact Section */}
        <div className="mt-12 bg-orange-50 border-orange-200 border rounded-lg p-8">
          <h3 className="text-2xl font-semibold text-orange-900 mb-3 text-center">Contact our Data Protection Officer</h3>
          <p className="text-orange-800 text-center mb-6 max-w-3xl mx-auto">
            Questions about your data, privacy requests or regulatory enquiries can be directed to the contacts below.
            We respond within 48 business hours.
          </p>
          <div className="grid gap-4 md:grid-cols-3">
            {CONTACT_POINTS.map((contact) => (
              <a
                key={contact.label}
                href={contact.href}
                className="rounded-lg border border-orange-300 bg-white px-5 py-6 text-center hover:border-orange-500 hover:bg-orange-50 transition-colors"
              >
                <div className="text-xs uppercase tracking-wide text-orange-600 font-semibold">{contact.label}</div>
                <div className="mt-2 text-gray-900 font-medium">{contact.value}</div>
              </a>
            ))}
          </div>
        </div>

        {/* Footer Notice */}
        <div className="mt-8 text-center text-sm text-gray-600">
          <p>
            If you believe your privacy rights have been breached, you may lodge a complaint with the Nigeria Data
            Protection Commission (NDPC). We request the opportunity to resolve issues directly before escalation.
          </p>
        </div>
      </div>
    </div>
  );
};

export default PrivacyLanding;

