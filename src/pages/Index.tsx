import { useNavigate } from "react-router-dom";
import { useEffect } from "react";
import { Button } from "@/components/ui/button";
import { LandingHeader } from "@/components/LandingHeader";
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
  Globe2,
  Droplet,
  ShieldCheck,
  CheckCircle2,
  Mail,
} from "lucide-react";

const SMARTSUPP_KEY = 'aacb718ad1c939c6d54d2ecc8f3b840bf7a7f97b';

const Index = () => {
  const navigate = useNavigate();

  // Load Smartsupp chat widget
  useEffect(() => {
    // Initialize Smartsupp
    (window as any)._smartsupp = (window as any)._smartsupp || {};
    (window as any)._smartsupp.key = SMARTSUPP_KEY;

    // Load Smartsupp script if not already loaded
    if (!document.querySelector('script[src*="smartsuppchat.com"]')) {
      const script = document.createElement('script');
      script.type = 'text/javascript';
      script.async = true;
      script.src = 'https://www.smartsuppchat.com/loader.js';
      script.charset = 'utf-8';
      document.getElementsByTagName('head')[0].appendChild(script);
    }

    // Cleanup function
    return () => {
      // Optionally remove the script on unmount if needed
      // But usually we want to keep it for better UX
    };
  }, []);

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

  return (
    <div className="min-h-screen bg-gradient-to-br from-brand/10 via-orange-50/30 to-white text-foreground">
      <LandingHeader />

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
                onClick={() => navigate("/open/signup")}
                size="lg"
                className="bg-brand hover:bg-brand/90 text-white h-12 px-8 text-base"
              >
                Create Free Account
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
                <div key={stat.label} className="text-center bg-white/80 border border-brand/20 rounded-2xl py-4 shadow-elegant">
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
      <section className="bg-gradient-to-r from-brand/5 via-white to-brand/5 py-16">
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
                  className="rounded-3xl border border-brand/15 bg-white/85 p-6 shadow-elegant transition-all hover:shadow-lg hover:border-brand/40"
                >
                  <div className="bg-brand/10 w-12 h-12 rounded-xl flex items-center justify-center text-brand mb-4 shadow-inner">
                    <service.icon className="w-6 h-6" />
                  </div>
                  <h3 className="font-semibold text-lg text-foreground mb-2">{service.title}</h3>
                  <p className="text-sm text-muted-foreground leading-relaxed">{service.blurb}</p>
                </div>
              ))}
            </div>
          </div>

          <div className="relative rounded-[32px] bg-white/90 p-4 shadow-glow border border-brand/20">
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

      {/* Trust Signals */}
      <section className="bg-gradient-to-br from-brand/5 via-white to-orange-50/40 py-16">
        <div className="container mx-auto px-4">
          <div className="max-w-3xl mx-auto text-center space-y-4">
            <h2 className="text-3xl md:text-4xl font-bold text-foreground">Why teams choose NetPay</h2>
            <p className="text-muted-foreground">
              We combine delightful experiences with enterprise stability so your organisation can focus on what matters—growth.
            </p>
          </div>

          <div className="grid md:grid-cols-3 gap-8 pt-10">
            <div className="text-center">
              <div className="bg-brand/15 w-16 h-16 rounded-full flex items-center justify-center mx-auto mb-4 shadow-elegant">
                <Clock className="w-8 h-8 text-brand" />
              </div>
              <h3 className="font-bold text-lg mb-2">Instant Processing</h3>
              <p className="text-muted-foreground text-sm">
                Every purchase, funding and payout settles within seconds—no waiting, no delays.
              </p>
            </div>
            <div className="text-center">
              <div className="bg-brand/15 w-16 h-16 rounded-full flex items-center justify-center mx-auto mb-4 shadow-elegant">
                <Shield className="w-8 h-8 text-brand" />
              </div>
              <h3 className="font-bold text-lg mb-2">Bank-Grade Security</h3>
              <p className="text-muted-foreground text-sm">
                Industry-leading encryption, biometric verification and best-in-class fraud monitoring.
              </p>
            </div>
            <div className="text-center">
              <div className="bg-brand/15 w-16 h-16 rounded-full flex items-center justify-center mx-auto mb-4 shadow-elegant">
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
      <section className="bg-brand py-16 shadow-inner">
        <div className="container mx-auto px-4 text-center space-y-6 text-white">
          <h2 className="text-3xl md:text-4xl font-bold">
            Ready to offer the most delightful bill payment experience?
          </h2>
          <p className="text-white/90 text-lg max-w-2xl mx-auto">
            Join thousands of individuals, businesses and resellers who trust NetPay for their everyday payments.
          </p>
          <div className="flex flex-wrap justify-center gap-4">
              <Button
                onClick={() => navigate("/open/signup")}
                size="lg"
                className="bg-white text-brand hover:bg-white/90 h-12 px-8 shadow-elegant"
              >
              Create Your Free Account
            </Button>
            <Button
              onClick={() => navigate("/contact-us")}
              size="lg"
              variant="outline"
              className="border-white/0 text-white/70 bg-white/10 hover:bg-white/20 cursor-not-allowed h-12 px-8"
              disabled
            >
              Talk To Sales
            </Button>
          </div>
        </div>
      </section>

      {/* Footer */}
      <footer className="border-t border-brand/20 bg-white/85 py-12">
        <div className="container mx-auto px-4 flex flex-col gap-8">
          <div className="flex flex-col lg:flex-row justify-between gap-8">
            <div className="max-w-sm space-y-4">
              <div className="flex items-center gap-3">
                <img
                  src="/logo.png"
                  alt="NetPay"
                  className="w-10 h-10 rounded-lg border border-brand/30 shadow-elegant"
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

            <div className="grid grid-cols-2 md:grid-cols-3 gap-6 text-sm">
              <div className="space-y-3">
                <p className="text-foreground font-semibold uppercase tracking-wide text-xs">Company</p>
                <div className="flex flex-col gap-2 text-muted-foreground">
                  <button onClick={() => navigate("/about")} className="hover:text-foreground transition-colors text-left">
                    About NetPay
                  </button>
                  <button onClick={() => navigate("/contact-us")} className="hover:text-foreground transition-colors text-left">
                    Contact & Support
                  </button>
                  <button onClick={() => navigate("/careers")} className="hover:text-foreground transition-colors text-left">
                    Careers
                  </button>
                  <p className="text-xs leading-relaxed text-muted-foreground/90 pt-1">
                    Registered with the Corporate Affairs Commission (CAC), RC: RN7062973.
                  </p>
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
                    <img src="/x.png" alt="X" className="w-4 h-4" />
                    <span>Twitter / X</span>
                  </a>
                  <a
                    href="https://instagram.com/netpay"
                    target="_blank"
                    rel="noreferrer"
                    className="hover:text-foreground transition-colors flex items-center gap-2"
                  >
                    <img src="/instagram.png" alt="Instagram" className="w-4 h-4 rounded" />
                    <span>Instagram</span>
                  </a>
                  <a
                    href="https://facebook.com/netpay"
                    target="_blank"
                    rel="noreferrer"
                    className="hover:text-foreground transition-colors flex items-center gap-2"
                  >
                    <img src="/facebook.png" alt="Facebook" className="w-4 h-4 rounded" />
                    <span>Facebook</span>
                  </a>
                  <a
                    href="https://wa.me/2348012345678"
                    target="_blank"
                    rel="noreferrer"
                    className="hover:text-foreground transition-colors flex items-center gap-2"
                  >
                    <img src="/whatsapp.png" alt="WhatsApp" className="w-4 h-4 rounded" />
                    <span>WhatsApp</span>
                  </a>
                  <a
                    href="mailto:support@netppay.com"
                    className="hover:text-foreground transition-colors flex items-center gap-2"
                  >
                    <Mail className="w-4 h-4" />
                    <span>support@netppay.com</span>
                  </a>
                </div>
              </div>
            </div>
          </div>

          <div className="border-t border-border/30 pt-6 flex flex-col md:flex-row items-center justify-between gap-4">
            <p className="text-sm text-muted-foreground text-center md:text-left">
              © {new Date().getFullYear()} NetPay. All rights reserved. Built in Lagos, powering payments across Nigeria.
            </p>
            <p className="text-xs text-muted-foreground text-center md:text-right">
              Corporate Affairs Commission Registration: RN7062973.
            </p>
          </div>
        </div>
      </footer>
    </div>
  );
};

export default Index;
