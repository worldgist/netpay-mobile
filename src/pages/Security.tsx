const controls = [
  {
    title: "Infrastructure & Encryption",
    items: [
      "All data encrypted in transit (TLS 1.2+) and at rest using modern ciphers.",
      "Tokenised credentials, Vault-backed secrets management and rotating keys.",
      "Real-time infrastructure monitoring with alerts, failover regions and automated backups.",
    ],
  },
  {
    title: "Access & Authentication",
    items: [
      "Biometric login, 2FA, device locks and IP allow lists for sensitive workflows.",
      "Granular role-based permissions with approval flows, audit trails and activity feeds.",
      "Session timeouts, refresh token hardening and automated anomaly detection.",
    ],
  },
  {
    title: "Compliance & Assurance",
    items: [
      "NDPR compliant, PCI DSS ready and aligned with global best practices.",
      "Independent security assessments, penetration tests and routine vulnerability scans.",
      "Dedicated security team with 24/7 incident response playbooks and SLAs.",
    ],
  },
];

const Security = () => (
  <div className="min-h-screen bg-background">
    <section className="container mx-auto px-4 py-16 md:py-24 space-y-12">
      <div className="max-w-3xl space-y-6">
        <span className="text-brand font-semibold uppercase tracking-[0.35em] text-xs md:text-sm">
          Security & Compliance
        </span>
        <h1 className="text-4xl md:text-5xl font-bold text-foreground leading-tight">
          Safeguarding every naira across Nigeria.
        </h1>
        <p className="text-muted-foreground text-lg leading-relaxed">
          NetPay is architected with multiple layers of defense—from encryption and device locks to enterprise-grade
          monitoring and compliance programs. Every transaction, wallet and customer is protected by industry-leading controls.
        </p>
      </div>

      <div className="grid md:grid-cols-3 gap-8">
        {controls.map((control) => (
          <div key={control.title} className="rounded-3xl border border-border/40 bg-card/80 p-6 shadow-sm space-y-4">
            <h2 className="text-lg font-semibold text-foreground">{control.title}</h2>
            <ul className="space-y-2 text-sm text-muted-foreground leading-relaxed">
              {control.items.map((item) => (
                <li key={item} className="flex items-start gap-2">
                  <span className="mt-1 h-1.5 w-1.5 rounded-full bg-brand" />
                  <span>{item}</span>
                </li>
              ))}
            </ul>
          </div>
        ))}
      </div>

      <div className="rounded-3xl border border-border/30 bg-card/70 p-8 shadow-sm space-y-4">
        <h2 className="text-2xl font-semibold text-foreground">Responsible disclosure</h2>
        <p className="text-sm text-muted-foreground leading-relaxed">
          Found a vulnerability? Email <a href="mailto:support@netpayy.ng" className="text-brand hover:text-brand/80">support@netpayy.ng</a> with full details so we can respond swiftly. We appreciate researchers who help keep our ecosystem safe.
        </p>
      </div>
    </section>
  </div>
);

export default Security;

