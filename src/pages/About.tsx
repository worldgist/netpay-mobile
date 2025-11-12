const About = () => (
  <div className="min-h-screen bg-background">
    <section className="container mx-auto px-4 py-16 md:py-24 space-y-12">
      <div className="max-w-3xl space-y-6">
        <span className="text-brand font-semibold uppercase tracking-[0.35em] text-xs md:text-sm">
          Who We Are
        </span>
        <h1 className="text-4xl md:text-5xl font-bold text-foreground leading-tight">
          Building Nigeria&apos;s most trusted bill payments platform.
        </h1>
        <p className="text-muted-foreground text-lg leading-relaxed">
          NetPay connects individuals, agents, SMEs and enterprises to every service that matters—airtime, data,
          entertainment, utilities, education, gaming, and financial services. Our goal is simple: make every bill
          payment instant, delightful and reliable, regardless of the device or location.
        </p>
      </div>

      <div className="grid md:grid-cols-2 gap-12">
        <div className="space-y-4">
          <h2 className="text-2xl font-semibold text-foreground">Our Mission</h2>
          <p className="text-muted-foreground leading-relaxed">
            Deliver the fastest, safest and most intuitive payment experiences in Nigeria, backed by real-time insights,
            enterprise automations and a joyful orange-and-milk interface.
          </p>
        </div>
        <div className="space-y-4">
          <h2 className="text-2xl font-semibold text-foreground">Our Promise</h2>
          <ul className="list-disc list-inside text-muted-foreground space-y-2">
            <li>Always-on uptime, proactive monitoring and transparent communication.</li>
            <li>Security-first architecture with biometrics, 2FA, device locks and PCI-ready infrastructure.</li>
            <li>Support teams that resolve issues quickly and treat every transaction like it is their own.</li>
          </ul>
        </div>
      </div>

      <div className="grid md:grid-cols-3 gap-8">
        {[
          { title: "50k+", copy: "Daily users completing bill payments nationwide." },
          { title: "200+", copy: "Connected services covering lifestyle and enterprise needs." },
          { title: "24/7", copy: "Monitoring, support and escalation so you never go offline." },
        ].map((stat) => (
          <div key={stat.title} className="rounded-2xl border border-border/40 bg-card/80 p-6 shadow-sm">
            <div className="text-3xl font-bold text-brand">{stat.title}</div>
            <p className="text-sm text-muted-foreground mt-2 leading-relaxed">{stat.copy}</p>
          </div>
        ))}
      </div>
    </section>
  </div>
);

export default About;

