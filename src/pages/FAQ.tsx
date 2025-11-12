const questions = [
  {
    q: "Which bills can I pay with NetPay?",
    a: "All major Nigerian airtime and data networks, TV subscriptions, electricity discos, betting wallets, education PINs, internet services, municipal utilities and more. Our catalogue grows every month.",
  },
  {
    q: "How fast are transactions settled?",
    a: "Payments are instant. Wallet balances update immediately and statements reflect in real time. For enterprise settlements we offer configurable schedules and automated exports.",
  },
  {
    q: "How secure is NetPay?",
    a: "We use bank-grade encryption, biometrics, 2FA and device locks. Activity is monitored round the clock with SIEM integrations, and we are NDPR compliant and PCI-ready.",
  },
  {
    q: "Can I manage multiple agents or branches?",
    a: "Yes. Role-based access controls, approval workflows and granular reporting make it easy to manage teams, branches and agents within a single dashboard.",
  },
  {
    q: "Do you offer APIs or custom integrations?",
    a: "Enterprise customers get access to dedicated integration support, sandbox environments and bespoke settlement schedules. Contact sales for details.",
  },
];

const FAQ = () => (
  <div className="min-h-screen bg-background">
    <section className="container mx-auto px-4 py-16 md:py-24 space-y-10">
      <div className="max-w-3xl space-y-6">
        <span className="text-brand font-semibold uppercase tracking-[0.35em] text-xs md:text-sm">
          Help Centre
        </span>
        <h1 className="text-4xl md:text-5xl font-bold text-foreground leading-tight">
          Frequently asked questions about NetPay.
        </h1>
        <p className="text-muted-foreground text-lg leading-relaxed">
          Everything you need to know about getting started, managing teams and keeping your bill payments running 24/7.
        </p>
      </div>

      <div className="space-y-6">
        {questions.map((item) => (
          <div key={item.q} className="rounded-2xl border border-border/30 bg-card/70 p-6 shadow-sm space-y-3">
            <h2 className="text-lg font-semibold text-foreground">{item.q}</h2>
            <p className="text-sm text-muted-foreground leading-relaxed">{item.a}</p>
          </div>
        ))}
      </div>
    </section>
  </div>
);

export default FAQ;

