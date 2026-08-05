const openings = [
  {
    title: "Senior Frontend Engineer",
    location: "Hybrid – Lagos",
    summary: "Build delightful bill payment experiences across web and mobile using modern tooling.",
  },
  {
    title: "Product Manager – Payments",
    location: "Hybrid – Lagos / Remote",
    summary: "Own roadmap, stakeholder alignment and delivery for NetPay’s core bill payment platform.",
  },
  {
    title: "Customer Success Lead",
    location: "Remote – Nigeria",
    summary: "Guide agents, merchants and enterprises to success with proactive, data-driven support.",
  },
];

const values = [
  {
    heading: "Customers First",
    body: "We obsess over speed, reliability and clarity so customers never have to chase a payment.",
  },
  {
    heading: "Build for Nigeria",
    body: "We design around real-world constraints—network reliability, agent workflows and local compliance.",
  },
  {
    heading: "Move with Integrity",
    body: "We treat every transaction, stakeholder and teammate with respect, transparency and accountability.",
  },
];

const Careers = () => (
  <div className="min-h-screen bg-background">
    <section className="container mx-auto px-4 py-16 md:py-24 space-y-12">
      <div className="max-w-3xl space-y-6">
        <span className="text-brand font-semibold uppercase tracking-[0.35em] text-xs md:text-sm">
          Join NetPay
        </span>
        <h1 className="text-4xl md:text-5xl font-bold text-foreground leading-tight">
          Help us deliver Nigeria’s most delightful bill payments experience.
        </h1>
        <p className="text-muted-foreground text-lg leading-relaxed">
          We are a team of product-builders, engineers, designers, payment specialists and support champions who believe
          in building joyful, secure and reliable payment journeys. Come help us shape the future of bills, utilities and commerce.
        </p>
      </div>

      <div className="grid md:grid-cols-3 gap-6">
        {values.map((value) => (
          <div key={value.heading} className="rounded-2xl border border-border/40 bg-card/80 p-6 shadow-sm space-y-3">
            <h2 className="text-lg font-semibold text-foreground">{value.heading}</h2>
            <p className="text-sm text-muted-foreground leading-relaxed">{value.body}</p>
          </div>
        ))}
      </div>

      <div className="space-y-6">
        <h2 className="text-2xl font-semibold text-foreground">Open Roles</h2>
        <div className="space-y-4">
          {openings.map((opening) => (
            <div
              key={opening.title}
              className="flex flex-col md:flex-row md:items-center md:justify-between gap-3 border border-border/40 rounded-2xl bg-card/70 p-5 shadow-sm hover:border-brand/40 transition"
            >
              <div>
                <h3 className="text-lg font-semibold text-foreground">{opening.title}</h3>
                <p className="text-xs uppercase tracking-wide text-muted-foreground">{opening.location}</p>
                <p className="text-sm text-muted-foreground mt-2">{opening.summary}</p>
              </div>
              <a
                href="mailto:support@netppay.com"
                className="text-sm font-medium text-brand hover:text-brand/80 transition-colors"
              >
                Apply via support@netppay.com →
              </a>
            </div>
          ))}
        </div>
        <p className="text-sm text-muted-foreground">
          Don't see a role that fits yet? Send us your portfolio or CV at <a href="mailto:support@netppay.com" className="text-brand hover:text-brand/80">support@netppay.com</a> and tell us why you're excited about NetPay.
        </p>
      </div>
    </section>
  </div>
);

export default Careers;

