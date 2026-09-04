const tiers = [
  {
    name: "Starter",
    price: "Free",
    description: "Perfect for individuals and agents getting started with bill payments.",
    features: [
      "Instant airtime, data, TV and electricity purchases",
      "Wallet funding via transfers",
      "Basic analytics dashboard",
      "Email support during business hours",
    ],
  },
  {
    name: "Growth",
    price: "₦15,000/mo",
    description: "Built for super agents, SMEs and cooperatives scaling their bill payment operations.",
    features: [
      "All Starter features",
      "Automated settlements and statements",
      "Team roles and approvals",
      "SMS and email notifications",
      "Priority WhatsApp and phone support",
    ],
  },
  {
    name: "Enterprise",
    price: "Talk to sales",
    description: "For enterprises, banks and fintechs processing high volume or bespoke integrations.",
    features: [
      "All Growth features",
      "Dedicated account manager",
      "Custom credit lines and settlement schedules",
      "Audit trails, SIEM hooks and compliance reporting",
      "24/7 on-call support and SLA guarantees",
    ],
  },
];

const faqs = [
  {
    question: "Are transaction fees included?",
    answer:
      "Yes. Standard biller fees apply per transaction. We publish transparent schedules and notify you ahead of any changes.",
  },
  {
    question: "Can I switch plans later?",
    answer:
      "Absolutely. Upgrade or downgrade at any time. We prorate billing automatically and keep your data intact.",
  },
  {
    question: "Do you offer custom integrations?",
    answer:
      "Yes. Our Enterprise plan includes dedicated engineering support and bespoke integrations for banks, fintechs and aggregators.",
  },
];

const Pricing = () => (
  <div className="min-h-screen bg-background">
    <section className="container mx-auto px-4 py-16 md:py-24 space-y-12">
      <div className="max-w-3xl space-y-6 text-center mx-auto">
        <span className="text-brand font-semibold uppercase tracking-[0.35em] text-xs md:text-sm">
          Pricing & Plans
        </span>
        <h1 className="text-4xl md:text-5xl font-bold text-foreground leading-tight">
          Choose the perfect plan for your bill payments journey.
        </h1>
        <p className="text-muted-foreground text-lg leading-relaxed">
          NetPay scales from everyday consumers to nationwide enterprises. Start free, unlock automations as you grow,
          and get dedicated support when you need it most.
        </p>
      </div>

      <div className="grid md:grid-cols-3 gap-8">
        {tiers.map((tier) => (
          <div key={tier.name} className="rounded-3xl border border-border/40 bg-card/80 p-8 shadow-sm space-y-6">
            <div className="space-y-2">
              <h2 className="text-xl font-semibold text-foreground">{tier.name}</h2>
              <p className="text-3xl font-bold text-brand">{tier.price}</p>
              <p className="text-sm text-muted-foreground leading-relaxed">{tier.description}</p>
            </div>
            <ul className="space-y-2 text-sm text-muted-foreground">
              {tier.features.map((feature) => (
                <li key={feature} className="flex items-start gap-2">
                  <span className="mt-1 h-1.5 w-1.5 rounded-full bg-brand" />
                  <span>{feature}</span>
                </li>
              ))}
            </ul>
            <a
              href={tier.name === "Enterprise" ? "mailto:support@netppay.com" : "/contact-us"}
              className="inline-flex items-center justify-center rounded-xl border border-brand/50 text-brand hover:bg-brand/10 transition-colors text-sm font-medium px-4 py-2"
            >
              {tier.name === "Enterprise" ? "Talk to sales" : "Contact us"}
            </a>
          </div>
        ))}
      </div>

      <div className="max-w-3xl space-y-8 mx-auto pt-12">
        <h2 className="text-2xl font-semibold text-foreground text-center">Frequently Asked Questions</h2>
        <div className="space-y-6">
          {faqs.map((faq) => (
            <div key={faq.question} className="rounded-2xl border border-border/30 bg-card/70 p-6 shadow-sm space-y-2">
              <h3 className="text-lg font-semibold text-foreground">{faq.question}</h3>
              <p className="text-sm text-muted-foreground leading-relaxed">{faq.answer}</p>
            </div>
          ))}
        </div>
      </div>
    </section>
  </div>
);

export default Pricing;

