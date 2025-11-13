import { useMemo } from "react";

const DATA_PRACTICES = [
  {
    title: "Information We Collect",
    bullets: [
      "Identity: full name, username, BVN (where required for compliance).",
      "Contact: email, phone number, address and preferred communication channels.",
      "Financial: wallet balances, transaction identifiers, settlement accounts.",
      "Usage & Device: IP address, device identifiers, app version, browser type.",
      "Support: conversations, tickets, call recordings and troubleshooting notes.",
    ],
  },
  {
    title: "How We Use Your Data",
    bullets: [
      "Process payments, vend PINs, and reconcile bills on your behalf.",
      "Secure accounts with fraud monitoring, device management and 2FA.",
      "Provide customer care, notifications and service updates you request.",
      "Improve NetPay products through analytics, testing and quality control.",
      "Meet regulatory, audit, and anti-money laundering obligations.",
    ],
  },
  {
    title: "Data Sharing & Third Parties",
    body: [
      "We share the minimum data necessary with payment processors, telecoms, electricity discos, cable providers and KYC vendors to fulfil transactions.",
      "All partners must comply with NDPR, GDPR (where applicable) and contractual confidentiality requirements.",
      "NetPay never sells customer data. Requests from regulators or law enforcement are honoured only when legally required.",
    ],
  },
  {
    title: "Security Measures",
    bullets: [
      "Bank-grade encryption protects data in transit and at rest.",
      "Access is limited to authorised staff with role-based permissions.",
      "Continuous monitoring, penetration testing and incident response plans safeguard our infrastructure.",
      "Multi-factor authentication and device locks protect your account activities.",
    ],
  },
  {
    title: "Retention & Deletion",
    body: [
      "We retain transaction records and account history for the period required by Nigerian regulators, typically up to 7 years.",
      "Support records and analytics data are kept as long as necessary to operate the service, after which they are anonymised or deleted.",
      "You may request deletion or restriction of certain personal data by contacting privacy@netpay.ng. Some records must be retained to comply with legal obligations.",
    ],
  },
  {
    title: "Your Privacy Rights",
    bullets: [
      "Request a copy of the personal data we hold about you.",
      "Ask us to correct inaccurate or incomplete information.",
      "Request deletion of data that is no longer required.",
      "Object to processing or withdraw consent for marketing.",
      "Lodge a complaint with the Nigeria Data Protection Commission (NDPC).",
    ],
  },
  {
    title: "International Transfers",
    body: [
      "Some service providers operate outside Nigeria. When data leaves Nigeria, NetPay ensures safeguards such as standard contractual clauses or equivalent protections are in place.",
    ],
  },
  {
    title: "Cookies & Tracking",
    body: [
      "Our web experiences use cookies and similar technologies to remember sessions, enable secure access, and measure performance. You can manage cookie preferences in your browser. Disabling essential cookies may limit certain features.",
    ],
  },
];

const CONTACT_POINTS = [
  {
    label: "Email",
    value: "privacy@netpay.ng",
    href: "mailto:privacy@netpay.ng",
  },
  {
    label: "Compliance Desk",
    value: "compliance@netpay.ng",
    href: "mailto:compliance@netpay.ng",
  },
  {
    label: "Phone",
    value: "+234 700 638 729",
    href: "tel:+234700638729",
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
    <div className="min-h-screen bg-gradient-to-br from-white via-orange-50/40 to-brand/10">
      <div className="container mx-auto px-4 py-16 lg:py-24 space-y-12">
        <header className="max-w-4xl mx-auto text-center space-y-4">
          <p className="text-xs font-semibold uppercase tracking-[0.35em] text-brand">
            Privacy Policy
          </p>
          <h1 className="text-4xl md:text-5xl font-bold text-slate-900">
            Your data powers NetPay. We protect it with uncompromising security.
          </h1>
          <p className="text-slate-600 text-lg leading-relaxed">
            This Privacy Policy explains what information we collect, how we use it, and the choices you have. NetPay
            complies with NDPR and global best practices to keep customer data safe.
          </p>
          <p className="text-sm text-slate-500">Effective date: {lastUpdated}</p>
        </header>

        <main className="max-w-5xl mx-auto space-y-8">
          <section className="rounded-3xl border border-brand/20 bg-white/90 shadow-elegant px-6 py-6 md:px-10 md:py-8 space-y-4">
            <h2 className="text-2xl font-semibold text-slate-900">Overview</h2>
            <p className="text-slate-600 leading-relaxed">
              NetPay Limited (“NetPay”, “we”, “us”, or “our”) is a Nigerian-based digital payments company. We collect
              and use personal information to deliver, secure and improve our bill payment, wallet and agency products.
              We respect your right to privacy and handle your information transparently.
            </p>
          </section>

          <div className="grid gap-6">
            {DATA_PRACTICES.map((section) => (
              <section
                key={section.title}
                className="rounded-3xl border border-brand/20 bg-white/90 shadow-elegant px-6 py-6 md:px-10 md:py-8 space-y-4"
              >
                <h2 className="text-2xl font-semibold text-slate-900">{section.title}</h2>
                {section.body?.map((paragraph) => (
                  <p key={paragraph.slice(0, 30)} className="text-slate-600 leading-relaxed">
                    {paragraph}
                  </p>
                ))}
                {section.bullets && (
                  <ul className="space-y-2 text-slate-600 leading-relaxed list-disc pl-5">
                    {section.bullets.map((item) => (
                      <li key={item.slice(0, 32)}>{item}</li>
                    ))}
                  </ul>
                )}
              </section>
            ))}
          </div>
        </main>

        <section className="max-w-5xl mx-auto border border-dashed border-brand/30 bg-white/85 rounded-3xl px-6 py-10 shadow-elegant space-y-6">
          <h3 className="text-2xl font-semibold text-slate-900 text-center">Contact our Data Protection Officer</h3>
          <p className="text-slate-600 text-center max-w-3xl mx-auto">
            Questions about your data, privacy requests or regulatory enquiries can be directed to the contacts below.
            We respond within 48 business hours.
          </p>
          <div className="grid gap-4 md:grid-cols-3">
            {CONTACT_POINTS.map((contact) => (
              <a
                key={contact.label}
                href={contact.href}
                className="rounded-2xl border border-brand/20 bg-brand/5 px-5 py-6 text-center text-sm font-medium text-slate-700 hover:border-brand hover:bg-brand/10 transition-colors"
              >
                <div className="text-xs uppercase tracking-wide text-slate-500">{contact.label}</div>
                <div className="mt-2 text-slate-900">{contact.value}</div>
              </a>
            ))}
          </div>
        </section>

        <section className="max-w-4xl mx-auto text-center text-sm text-slate-500">
          <p>
            If you believe your privacy rights have been breached, you may lodge a complaint with the Nigeria Data
            Protection Commission (NDPC). We request the opportunity to resolve issues directly before escalation.
          </p>
        </section>
      </div>
    </div>
  );
};

export default PrivacyLanding;

