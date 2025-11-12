import { useNavigate } from "react-router-dom";
import { Button } from "@/components/ui/button";
import {
  Phone,
  CreditCard,
  Wifi,
  GraduationCap,
  Zap,
  TrendingUp,
  Shield,
  Clock,
  Gamepad2,
  Twitter,
  Instagram,
  Facebook,
  Youtube,
  Globe2,
  Droplet,
  ShieldCheck,
  BarChart3,
  Users,
  Briefcase,
  CheckCircle2,
  Mail,
} from "lucide-react";

const Index = () => {
  const navigate = useNavigate();

  const heroHighlights = [
    "Deliver the fastest airtime, data, TV, betting, utilities and education payments nationwide.",
    "Track wallet balances, settlements and reconciliations in real time across every state.",
    "Delight customers on Web, Android and iOS with one unified orange-and-milk experience.",
    "Guard every naira with biometrics, 2FA, device locks, approvals and bank-grade infrastructure.",
  ];

  const billServices = [
    {
      icon: Phone,
      title: "Airtime & Voice",
      blurb: "Fast top-ups for MTN, Airtel, Glo, 9mobile and more at the best rates.",
    },
    {
      icon: Wifi,
      title: "Data Bundles",
      blurb: "Flexible daily, weekly and monthly bundles for every lifestyle.",
    },
    {
      icon: CreditCard,
      title: "Cable & Streaming",
      blurb: "Renew DStv, GOtv, Startimes and other entertainment packages instantly.",
    },
    {
      icon: Zap,
      title: "Electricity Tokens",
      blurb: "Instant vend for prepaid meters across all discos nationwide.",
    },
    {
      icon: GraduationCap,
      title: "Education PINs",
      blurb: "WAEC, NECO, JAMB, Post-UTME and result checker PINs in seconds.",
    },
    {
      icon: Gamepad2,
      title: "Betting & Gaming",
      blurb: "Fund Bet9ja, SportyBet, BetKing, 1xBet and top gaming platforms instantly.",
    },
    {
      icon: Globe2,
      title: "Internet & Wi-Fi",
      blurb: "Smile, Spectranet, FibreOne, IPNX, fibre broadband and fixed line bills.",
    },
    {
      icon: Droplet,
      title: "Utilities & Municipal",
      blurb: "Water, waste management, government levies and other municipal payments.",
    },
    {
      icon: ShieldCheck,
      title: "Insurance & Loans",
      blurb: "Renew micro-insurance covers and settle loan repayments securely.",
    },
  ];

  const platformHighlights = [
    {
      icon: BarChart3,
      title: "Real-time Monitoring",
      description: "Every wallet top-up, bill purchase and settlement at your fingertips with live dashboards.",
    },
    {
      icon: Users,
      title: "Collaborative Workflows",
      description: "Assign roles, manage approvals and keep teams aligned across channels.",
    },
    {
      icon: Shield,
      title: "Bank-Grade Security",
      description: "Biometrics, 2FA, device management and PCI-compliant frameworks keep you safe.",
    },
    {
      icon: Briefcase,
      title: "Business Ready",
      description: "Built for enterprises, resellers and agencies managing multiple wallets and customers.",
    },
  ];

  const automationBenefits = [
    "Schedule recurring payments and receive renewals alerts automatically.",
    "Instant receipts, downloadable statements and branded customer emails.",
    "Dedicated support with proactive monitoring and real human escalation.",
    "Export-ready reconciliation, audit trails and multi-wallet visibility.",
  ];

  return (
    <div className="min-h-screen bg-background">
      {/* Header */}
      <header className="border-b border-border/40 bg-card/60 backdrop-blur-sm sticky top-0 z-50">
        <div className="container mx-auto px-4 py-4 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <img
              src="/logo.png"
              alt="NetPay"
              className="w-10 h-10 rounded-lg border border-border/40 shadow-sm"
              loading="lazy"
            />
            <span className="text-2xl font-bold">
              <span className="text-brand">NET</span>PAY
            </span>
          </div>
          <div className="flex items-center gap-3">
            <Button
              onClick={() => navigate("/user/auth?mode=signin")}
              variant="ghost"
              className="hidden sm:inline-flex"
            >
              Login
            </Button>
            <Button
              onClick={() => navigate("/user/auth?mode=signup")}
              className="bg-brand hover:bg-brand/90 text-white"
            >
              Get Started
            </Button>
          </div>
        </div>
      </header>

      {/* Hero */}
      <section className="container mx-auto px-4 py-16 md:py-24">
        <div className="grid lg:grid-cols-2 gap-12 items-center">
          <div className="space-y-8">
            <div className="space-y-4">
              <span className="text-brand font-semibold uppercase tracking-[0.35em] text-xs md:text-sm">
                Nigeria’s Best Bill Payments Platform
              </span>
              <h1 className="text-4xl md:text-6xl font-bold text-foreground leading-tight">
                The #1 way Nigerians pay every bill with speed and confidence.
              </h1>
              <p className="text-lg md:text-xl text-muted-foreground leading-relaxed">
                NetPay is the best bill payments app in Nigeria—built for individuals, agents and enterprises who demand instant airtime, data,
                entertainment, utilities, gaming, education and financial services. Automate approvals, monitor activity instantly and keep every customer delighted
                with a bright, intuitive experience built in Nigeria for Nigeria.
              </p>
            </div>

            <div className="flex flex-wrap gap-4">
              <Button
                onClick={() => navigate("/user/auth?mode=signup")}
                size="lg"
                className="bg-brand hover:bg-brand/90 text-white h-12 px-8 text-base"
              >
                Create Free Account
              </Button>
              <Button
                onClick={() => navigate("/user/auth?mode=signin")}
                variant="outline"
                size="lg"
                className="h-12 px-8 text-base border-brand/40 text-brand hover:bg-brand/10"
              >
                View Dashboard
              </Button>
            </div>

            <div className="grid sm:grid-cols-2 gap-4">
              {heroHighlights.map((highlight) => (
                <div key={highlight} className="flex items-start gap-3 text-sm text-muted-foreground">
                  <CheckCircle2 className="w-5 h-5 text-brand mt-0.5 flex-shrink-0" />
                  <span>{highlight}</span>
                </div>
              ))}
            </div>

            <div className="grid grid-cols-3 gap-6 pt-4">
              {[
                { label: "Uptime", value: "99.9%" },
                { label: "Users", value: "50k+" },
                { label: "Support", value: "24/7" },
              ].map((stat) => (
                <div key={stat.label} className="text-center bg-card/70 border border-border/40 rounded-2xl py-4 shadow-sm">
                  <div className="text-3xl font-bold text-brand">{stat.value}</div>
                  <div className="text-xs uppercase tracking-wide text-muted-foreground">{stat.label}</div>
                </div>
              ))}
            </div>
          </div>

          <div className="relative">
            <div className="relative rounded-[32px] bg-card p-4 shadow-glow border border-border/40">
              <img
                src="/splash1.png"
                alt="NetPay daily activity"
                className="rounded-3xl w-full"
                loading="lazy"
              />
            </div>
            <img
              src="/splash.png"
              alt="NetPay mobile wallet view"
              className="hidden md:block absolute -bottom-16 right-0 w-3/4 rounded-3xl shadow-xl border border-border/30"
              loading="lazy"
            />
            <img
              src="/splash2.png"
              alt="NetPay cards collection"
              className="hidden md:block absolute -top-16 left-0 w-2/3 rounded-3xl shadow-xl border border-border/30"
              loading="lazy"
            />
          </div>
        </div>
      </section>

      {/* Bill Services */}
      <section className="bg-secondary/25 py-16">
        <div className="container mx-auto px-4 grid lg:grid-cols-[3fr_2fr] gap-12 items-start">
          <div className="space-y-10">
            <div className="space-y-4">
              <span className="text-brand font-semibold uppercase tracking-[0.35em] text-xs md:text-sm">
                Pay Every Bill In One Place
              </span>
              <h2 className="text-3xl md:text-4xl font-bold text-foreground">
                The most complete catalogue of lifestyle and business payments.
              </h2>
              <p className="text-muted-foreground leading-relaxed">
                From daily airtime purchases to enterprise-grade settlements, NetPay centralises every utility so your
                customers, partners and teams remain connected without friction.
              </p>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-6">
              {billServices.map((service) => (
                <div
                  key={service.title}
                  className="rounded-3xl border border-border/40 bg-card/90 p-6 shadow-sm transition-all hover:shadow-lg hover:border-brand/40"
                >
                  <div className="bg-brand/10 w-12 h-12 rounded-xl flex items-center justify-center text-brand mb-4">
                    <service.icon className="w-6 h-6" />
                  </div>
                  <h3 className="font-semibold text-lg text-foreground mb-2">{service.title}</h3>
                  <p className="text-sm text-muted-foreground leading-relaxed">{service.blurb}</p>
                </div>
              ))}
            </div>
          </div>

          <div className="relative rounded-[32px] bg-card p-4 shadow-lg border border-border/40">
            <img
              src="/splash2.png"
              alt="NetPay consolidated billers"
              className="rounded-3xl w-full"
              loading="lazy"
            />
            <div className="absolute -bottom-10 left-1/2 -translate-x-1/2 bg-card border border-border/30 shadow-xl rounded-2xl px-6 py-4">
              <p className="text-sm font-medium text-foreground">100+ lifestyle and business payment destinations</p>
            </div>
          </div>
        </div>
      </section>

      {/* Platform Highlights */}
      <section className="container mx-auto px-4 py-16">
        <div className="grid lg:grid-cols-2 gap-12 items-center">
          <div className="space-y-6">
            <span className="text-brand font-semibold uppercase tracking-[0.35em] text-xs md:text-sm">
              Designed For Modern Teams
            </span>
            <h2 className="text-3xl md:text-4xl font-bold text-foreground">
              Smart automations for finance, operations and customer success.
            </h2>
            <p className="text-muted-foreground leading-relaxed">
              Equip your organisation with the tools it needs to manage bills, wallets and payouts with ease.
              Real-time analytics, reliable infrastructure, and cross-channel experiences your customers will love.
            </p>

            <div className="grid sm:grid-cols-2 gap-6">
              {platformHighlights.map((item) => (
                <div key={item.title} className="bg-card border border-border/40 rounded-2xl p-5 space-y-3 shadow-sm">
                  <div className="bg-brand/10 w-10 h-10 rounded-lg flex items-center justify-center text-brand">
                    <item.icon className="w-5 h-5" />
                  </div>
                  <h3 className="font-semibold text-foreground">{item.title}</h3>
                  <p className="text-sm text-muted-foreground leading-relaxed">{item.description}</p>
                </div>
              ))}
            </div>

            <div className="grid sm:grid-cols-2 gap-3 pt-2">
              {automationBenefits.map((point) => (
                <div key={point} className="flex items-start gap-2 text-sm text-muted-foreground">
                  <CheckCircle2 className="w-4 h-4 text-brand mt-1 flex-shrink-0" />
                  <span>{point}</span>
                </div>
              ))}
            </div>
          </div>

          <div className="relative">
            <div className="relative rounded-[32px] bg-card p-4 shadow-glow border border-border/40">
              <img
                src="/splash.png"
                alt="NetPay workflow overview"
                className="rounded-3xl w-full"
                loading="lazy"
              />
            </div>
            <img
              src="/splash1.png"
              alt="NetPay transaction list"
              className="hidden md:block absolute -bottom-16 right-0 w-2/3 rounded-3xl shadow-xl border border-border/40"
              loading="lazy"
            />
            <img
              src="/splash2.png"
              alt="NetPay card stack"
              className="hidden md:block absolute -top-16 left-0 w-1/2 rounded-3xl shadow-xl border border-border/40"
              loading="lazy"
            />
          </div>
        </div>
      </section>

      {/* Trust Signals */}
      <section className="bg-muted/25 py-16">
        <div className="container mx-auto px-4">
          <div className="max-w-3xl mx-auto text-center space-y-4">
            <h2 className="text-3xl md:text-4xl font-bold text-foreground">Why teams choose NetPay</h2>
            <p className="text-muted-foreground">
              We combine delightful experiences with enterprise stability so your organisation can focus on what matters—growth.
            </p>
          </div>

          <div className="grid md:grid-cols-3 gap-8 pt-10">
            <div className="text-center">
              <div className="bg-brand/10 w-16 h-16 rounded-full flex items-center justify-center mx-auto mb-4">
                <Clock className="w-8 h-8 text-brand" />
              </div>
              <h3 className="font-bold text-lg mb-2">Instant Processing</h3>
              <p className="text-muted-foreground text-sm">
                Every purchase, funding and payout settles within seconds—no waiting, no delays.
              </p>
            </div>
            <div className="text-center">
              <div className="bg-brand/10 w-16 h-16 rounded-full flex items-center justify-center mx-auto mb-4">
                <Shield className="w-8 h-8 text-brand" />
              </div>
              <h3 className="font-bold text-lg mb-2">Bank-Grade Security</h3>
              <p className="text-muted-foreground text-sm">
                Industry-leading encryption, biometric verification and best-in-class fraud monitoring.
              </p>
            </div>
            <div className="text-center">
              <div className="bg-brand/10 w-16 h-16 rounded-full flex items-center justify-center mx-auto mb-4">
                <TrendingUp className="w-8 h-8 text-brand" />
              </div>
              <h3 className="font-bold text-lg mb-2">Scales With You</h3>
              <p className="text-muted-foreground text-sm">
                Built to support startups, agencies, fintechs and enterprises handling millions of transactions.
              </p>
            </div>
          </div>
        </div>
      </section>

      {/* CTA */}
      <section className="bg-brand py-16">
        <div className="container mx-auto px-4 text-center space-y-6">
          <h2 className="text-3xl md:text-4xl font-bold text-white">
            Ready to offer the most delightful bill payment experience?
          </h2>
          <p className="text-white/90 text-lg max-w-2xl mx-auto">
            Join thousands of individuals, businesses and resellers who trust NetPay for their everyday payments.
          </p>
          <div className="flex flex-wrap justify-center gap-4">
            <Button
              onClick={() => navigate("/user/auth?mode=signup")}
              size="lg"
              className="bg-white text-brand hover:bg-white/90 h-12 px-8"
            >
              Create Your Free Account
            </Button>
            <Button
              onClick={() => navigate("/contact")}
              size="lg"
              variant="outline"
              className="border-white/60 text-white hover:bg-white/10 h-12 px-8"
            >
              Talk To Sales
            </Button>
          </div>
        </div>
      </section>

      {/* Footer */}
      <footer className="border-t border-border/40 bg-card/70 py-12">
        <div className="container mx-auto px-4 flex flex-col gap-8">
          <div className="flex flex-col lg:flex-row justify-between gap-8">
            <div className="max-w-sm space-y-4">
              <div className="flex items-center gap-3">
                <img
                  src="/logo.png"
                  alt="NetPay"
                  className="w-10 h-10 rounded-lg border border-border/40 shadow-sm"
                  loading="lazy"
                />
                <span className="text-xl font-bold text-foreground">
                  <span className="text-brand">NET</span>PAY
                </span>
              </div>
              <p className="text-muted-foreground text-sm leading-relaxed">
                Nigeria’s best bill payments platform—powering airtime, data, entertainment, utilities, gaming, education and
                financial services with instant settlement, enterprise-grade security and a delightful orange-and-milk experience.
              </p>
            </div>

            <div className="grid grid-cols-2 md:grid-cols-4 gap-6 text-sm">
              <div className="space-y-3">
                <p className="text-foreground font-semibold uppercase tracking-wide text-xs">Company</p>
                <div className="flex flex-col gap-2 text-muted-foreground">
                  <button onClick={() => navigate("/about")} className="hover:text-foreground transition-colors text-left">
                    About NetPay
                  </button>
                  <button onClick={() => navigate("/contact")} className="hover:text-foreground transition-colors text-left">
                    Contact & Support
                  </button>
                  <button onClick={() => navigate("/careers")} className="hover:text-foreground transition-colors text-left">
                    Careers
                  </button>
                </div>
              </div>

              <div className="space-y-3">
                <p className="text-foreground font-semibold uppercase tracking-wide text-xs">Resources</p>
                <div className="flex flex-col gap-2 text-muted-foreground">
                  <button onClick={() => navigate("/pricing")} className="hover:text-foreground transition-colors text-left">
                    Pricing & Plans
                  </button>
                  <button onClick={() => navigate("/smeplug")} className="hover:text-foreground transition-colors text-left">
                    SME & Reseller Tools
                  </button>
                  <button onClick={() => navigate("/faq")} className="hover:text-foreground transition-colors text-left">
                    FAQs
                  </button>
                </div>
              </div>

              <div className="space-y-3">
                <p className="text-foreground font-semibold uppercase tracking-wide text-xs">Legal</p>
                <div className="flex flex-col gap-2 text-muted-foreground">
                  <button onClick={() => navigate("/terms")} className="hover:text-foreground transition-colors text-left">
                    Terms & Conditions
                  </button>
                  <button onClick={() => navigate("/privacy")} className="hover:text-foreground transition-colors text-left">
                    Privacy Policy
                  </button>
                  <button onClick={() => navigate("/security")} className="hover:text-foreground transition-colors text-left">
                    Security & Compliance
                  </button>
                </div>
              </div>

              <div className="space-y-3">
                <p className="text-foreground font-semibold uppercase tracking-wide text-xs">Connect</p>
                <div className="flex flex-col gap-3 text-muted-foreground">
                  <a
                    href="https://twitter.com/netpay"
                    target="_blank"
                    rel="noreferrer"
                    className="hover:text-foreground transition-colors flex items-center gap-2"
                  >
                    <Twitter className="w-4 h-4" />
                    <span>Twitter</span>
                  </a>
                  <a
                    href="https://instagram.com/netpay"
                    target="_blank"
                    rel="noreferrer"
                    className="hover:text-foreground transition-colors flex items-center gap-2"
                  >
                    <Instagram className="w-4 h-4" />
                    <span>Instagram</span>
                  </a>
                  <a
                    href="https://facebook.com/netpay"
                    target="_blank"
                    rel="noreferrer"
                    className="hover:text-foreground transition-colors flex items-center gap-2"
                  >
                    <Facebook className="w-4 h-4" />
                    <span>Facebook</span>
                  </a>
                  <a
                    href="https://youtube.com/@netpay"
                    target="_blank"
                    rel="noreferrer"
                    className="hover:text-foreground transition-colors flex items-center gap-2"
                  >
                    <Youtube className="w-4 h-4" />
                    <span>YouTube</span>
                  </a>
                  <a
                    href="mailto:support@netpay.ng"
                    className="hover:text-foreground transition-colors flex items-center gap-2"
                  >
                    <Mail className="w-4 h-4" />
                    <span>support@netpay.ng</span>
                  </a>
                </div>
              </div>
            </div>
          </div>

          <div className="border-t border-border/30 pt-6 flex flex-col md:flex-row items-center justify-between gap-4">
            <p className="text-sm text-muted-foreground text-center md:text-left">
              © {new Date().getFullYear()} NetPay. All rights reserved. Built in Lagos, powering payments across Nigeria.
            </p>
            <div className="flex items-center gap-3 text-xs text-muted-foreground">
              <span className="uppercase tracking-wide">PCI DSS Ready</span>
              <span className="uppercase tracking-wide">NDPR Compliant</span>
              <span className="uppercase tracking-wide">24/7 Support</span>
            </div>
          </div>
        </div>
      </footer>
    </div>
  );
};

export default Index;
