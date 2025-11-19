import { useMemo } from "react";

const SECTIONS = [
  {
    title: "1. Agreement to Terms",
    body: [
      "By creating an account or using any NetPay product, you agree to these Terms and Conditions. If you do not agree, please discontinue use of our website, mobile apps, and partner services.",
      "We may update these Terms from time to time. When we do, we will post the revised version with an updated date. Your continued use after changes means you accept the revised Terms.",
    ],
  },
  {
    title: "2. Services Covered",
    bullets: [
      "Airtime and voice recharge for all major Nigerian networks.",
      "Data bundles, SME data and enterprise connectivity services.",
      "Electricity token vending across national and regional discos.",
      "Cable TV, betting, gaming, insurance and education PIN purchases.",
      "Wallet funding, settlements, payouts and agent management.",
    ],
  },
  {
    title: "3. Eligibility & Account Security",
    bullets: [
      "You must be at least 18 years old or the legal age of majority in your jurisdiction.",
      "All information provided during signup must be accurate, complete, and kept up to date.",
      "You are responsible for safeguarding login credentials, transaction PINs and device access.",
      "Notify NetPay immediately of unauthorized activity via support@netpayy.ng or +234 706 739 8399.",
    ],
  },
  {
    title: "4. Transactions & Fees",
    bullets: [
      "All prices, commissions and service fees are displayed before you confirm a transaction.",
      "Transactions are processed instantly; completed purchases cannot be reversed.",
      "Refunds (where applicable) follow regulator guidelines and provider policies.",
      "We may suspend or decline suspicious transactions to protect you and our platform.",
    ],
  },
  {
    title: "5. User Responsibilities",
    bullets: [
      "Use NetPay solely for lawful purposes and in compliance with applicable regulations.",
      "Do not misuse the platform, attempt to hack, or disrupt our systems and integrations.",
      "Ensure the accuracy of beneficiary details before completing payments or transfers.",
      "Maintain sufficient wallet balance to cover purchases, charges and applied taxes.",
    ],
  },
  {
    title: "6. Intellectual Property",
    body: [
      "All product names, logos, UI layouts, copy, marketing material and proprietary technology belong to NetPay or our partners.",
      "You may not copy, resell, or exploit any part of the service without written permission.",
    ],
  },
  {
    title: "7. Liability Limitation",
    body: [
      "NetPay provides services on an “as-is” basis. While we strive for uptime, we cannot guarantee uninterrupted availability.",
      "We are not liable for indirect, incidental, special or consequential damages arising from use, misuse or inability to use the platform.",
      "Our total liability for any claim will not exceed the amount paid by you for the service giving rise to the claim.",
    ],
  },
  {
    title: "8. Service Changes & Termination",
    body: [
      "We may modify features, suspend services or discontinue certain products when required by providers, regulators or technical needs.",
      "We reserve the right to suspend or terminate accounts that breach these Terms, security rules or compliance obligations.",
    ],
  },
  {
    title: "9. Governing Law & Dispute Resolution",
    body: [
      "These Terms are governed by the laws of the Federal Republic of Nigeria.",
      "Disputes will first be handled through our support and compliance teams. If unresolved, disputes may be escalated to the appropriate regulatory or arbitration channels within Nigeria.",
    ],
  },
  {
    title: "10. Contact & Support",
    body: [
      "For questions about these Terms or to request clarifications, contact support@netpayy.ng or visit our Contact centre.",
    ],
  },
];

const TermsLanding = () => {
  const lastUpdated = useMemo(() => new Date().toLocaleDateString("en-NG", {
    year: "numeric",
    month: "long",
    day: "numeric",
  }), []);

  return (
    <div className="min-h-screen bg-gradient-to-br from-brand/10 via-white to-orange-50/40">
      <div className="container mx-auto px-4 py-16 lg:py-24 space-y-12">
        <header className="max-w-4xl mx-auto text-center space-y-4">
          <p className="text-xs font-semibold uppercase tracking-[0.35em] text-brand">
            Terms & Conditions
          </p>
          <h1 className="text-4xl md:text-5xl font-bold text-slate-900">
            Understand how NetPay keeps your payments secure and compliant
          </h1>
          <p className="text-slate-600 text-lg leading-relaxed">
            These Terms outline your rights, responsibilities, and the policies that guide every NetPay interaction.
            Please read them carefully before using our products or services.
          </p>
          <p className="text-sm text-slate-500">Last updated: {lastUpdated}</p>
        </header>

        <main className="max-w-5xl mx-auto space-y-8">
          <div className="grid gap-6">
            {SECTIONS.map((section) => (
              <section
                key={section.title}
                className="rounded-3xl border border-brand/20 bg-white/90 shadow-elegant px-6 py-6 md:px-10 md:py-8 space-y-4"
              >
                <h2 className="text-2xl font-semibold text-slate-900">{section.title}</h2>
                {section.body?.map((paragraph) => (
                  <p key={paragraph.slice(0, 24)} className="text-slate-600 leading-relaxed">
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

        <footer className="max-w-4xl mx-auto text-center border border-dashed border-brand/30 bg-white/80 rounded-3xl px-6 py-10 shadow-elegant">
          <h3 className="text-2xl font-semibold text-slate-900 mb-3">Need clarification?</h3>
          <p className="text-slate-600 mb-6">
            Our compliance and support teams are available to explain any part of these Terms, guide onboarding, or help with documentation.
          </p>
          <div className="flex flex-wrap justify-center gap-4 text-sm font-medium">
            <a
              href="mailto:support@netpayy.ng"
              className="px-5 py-3 rounded-full bg-brand text-white hover:bg-brand/90 transition-colors shadow-elegant"
            >
              Email support@netpayy.ng
            </a>
            <a
              href="mailto:support@netpayy.ng"
              className="px-5 py-3 rounded-full border border-brand/40 text-brand hover:bg-brand/10 transition-colors"
            >
              Contact support
            </a>
          </div>
        </footer>
      </div>
    </div>
  );
};

export default TermsLanding;

