import { CheckCircle2, User, Linkedin, Twitter } from "lucide-react";

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

    {/* Co-Founder & CEO */}
    <section className="bg-gradient-to-br from-white via-orange-50/20 to-brand/5 py-16">
      <div className="container mx-auto px-4">
        <div className="max-w-4xl mx-auto">
          <div className="text-center space-y-4 mb-12">
            <span className="text-brand font-semibold uppercase tracking-[0.35em] text-xs md:text-sm">
              Leadership
            </span>
            <h2 className="text-3xl md:text-4xl font-bold text-foreground">
              Meet Our Co-Founder & CEO
            </h2>
            <p className="text-muted-foreground max-w-2xl mx-auto">
              Driving innovation and excellence in Nigeria's fintech landscape
            </p>
          </div>

          <div className="bg-white/90 backdrop-blur-sm rounded-3xl border border-brand/20 shadow-glow p-8 md:p-12">
            <div className="grid md:grid-cols-[200px_1fr] gap-8 items-start">
              <div className="flex flex-col items-center md:items-start">
                <div className="w-48 h-48 rounded-2xl bg-gradient-to-br from-brand/20 to-brand/10 border-4 border-brand/30 shadow-elegant flex items-center justify-center mb-4">
                  <User className="w-24 h-24 text-brand/60" />
                </div>
                <div className="flex gap-3 mt-4">
                  <a
                    href="https://linkedin.com/in/netpay"
                    target="_blank"
                    rel="noreferrer"
                    className="w-10 h-10 rounded-full bg-brand/10 hover:bg-brand/20 flex items-center justify-center text-brand transition-colors"
                    aria-label="LinkedIn"
                  >
                    <Linkedin className="w-5 h-5" />
                  </a>
                  <a
                    href="https://twitter.com/netpay"
                    target="_blank"
                    rel="noreferrer"
                    className="w-10 h-10 rounded-full bg-brand/10 hover:bg-brand/20 flex items-center justify-center text-brand transition-colors"
                    aria-label="Twitter"
                  >
                    <Twitter className="w-5 h-5" />
                  </a>
                </div>
              </div>

              <div className="space-y-6">
                <div>
                  <h3 className="text-2xl md:text-3xl font-bold text-foreground mb-2">
                    Mustapha Suleiman
                  </h3>
                  <p className="text-brand font-semibold text-lg mb-4">
                    Co-Founder & Chief Executive Officer
                  </p>
                  <p className="text-muted-foreground leading-relaxed">
                    Mustapha Suleiman is a visionary leader and entrepreneur with a passion for transforming
                    financial services in Nigeria. With extensive experience in fintech and a deep understanding of
                    the Nigerian market, he co-founded NetPay to make bill payments seamless, secure, and
                    accessible for all Nigerians. He is also the owner of Chaincola, a leading cryptocurrency platform
                    that enables buying and selling of Bitcoin and other digital assets, further demonstrating his
                    commitment to advancing financial technology and digital innovation in Nigeria.
                  </p>
                </div>

                <div className="space-y-3">
                  <h4 className="font-semibold text-foreground">Key Achievements</h4>
                  <ul className="space-y-2 text-muted-foreground">
                    <li className="flex items-start gap-2">
                      <CheckCircle2 className="w-5 h-5 text-brand mt-0.5 flex-shrink-0" />
                      <span>Led NetPay to become one of Nigeria's fastest-growing bill payment platforms</span>
                    </li>
                    <li className="flex items-start gap-2">
                      <CheckCircle2 className="w-5 h-5 text-brand mt-0.5 flex-shrink-0" />
                      <span>Owner of Chaincola, a leading cryptocurrency platform for Bitcoin and digital assets trading</span>
                    </li>
                    <li className="flex items-start gap-2">
                      <CheckCircle2 className="w-5 h-5 text-brand mt-0.5 flex-shrink-0" />
                      <span>Built a team of talented professionals dedicated to financial inclusion</span>
                    </li>
                    <li className="flex items-start gap-2">
                      <CheckCircle2 className="w-5 h-5 text-brand mt-0.5 flex-shrink-0" />
                      <span>Established partnerships with major service providers across Nigeria</span>
                    </li>
                    <li className="flex items-start gap-2">
                      <CheckCircle2 className="w-5 h-5 text-brand mt-0.5 flex-shrink-0" />
                      <span>Committed to delivering exceptional user experiences and enterprise-grade security</span>
                    </li>
                  </ul>
                </div>

                <div className="pt-4 border-t border-border/30">
                  <p className="text-sm text-muted-foreground italic">
                    "Our mission is to empower every Nigerian with the tools they need to manage their bills
                    effortlessly. We're building the future of payments, one transaction at a time."
                  </p>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </section>
  </div>
);

export default About;

