import { useNavigate } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { Phone, CreditCard, Wifi, GraduationCap, Zap, TrendingUp, Shield, Clock } from "lucide-react";

const Index = () => {
  const navigate = useNavigate();

  const features = [
    {
      icon: Phone,
      title: "Airtime Recharge",
      description: "Quick and easy airtime top-up for all networks"
    },
    {
      icon: Wifi,
      title: "Data Bundles",
      description: "Affordable data plans for all your internet needs"
    },
    {
      icon: CreditCard,
      title: "Cable TV",
      description: "Subscribe to your favorite TV packages instantly"
    },
    {
      icon: Zap,
      title: "Electricity",
      description: "Pay your electricity bills with ease"
    },
    {
      icon: GraduationCap,
      title: "Education",
      description: "Purchase exam pins and education services"
    },
    {
      icon: Shield,
      title: "Secure",
      description: "Your transactions are safe and protected"
    }
  ];

  return (
    <div className="min-h-screen bg-background">
      {/* Header */}
      <header className="border-b border-border/40 bg-card/50 backdrop-blur-sm sticky top-0 z-50">
        <div className="container mx-auto px-4 py-4 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="bg-brand p-2 rounded-lg">
              <svg className="w-8 h-8 text-white" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <path d="M13 2L3 14h9l-1 8 10-12h-9l1-8z" />
              </svg>
            </div>
            <span className="text-2xl font-bold">
              <span className="text-brand">NET</span>PAY
            </span>
          </div>
          <div className="flex items-center gap-3">
            <Button 
              onClick={() => navigate("/user/auth")}
              variant="ghost"
              className="hidden sm:inline-flex"
            >
              Login
            </Button>
            <Button 
              onClick={() => navigate("/user/auth")}
              className="bg-brand hover:bg-brand/90 text-white"
            >
              Get Started
            </Button>
          </div>
        </div>
      </header>

      {/* Hero Section */}
      <section className="container mx-auto px-4 py-16 md:py-24">
        <div className="max-w-4xl mx-auto text-center space-y-8">
          <div className="space-y-4">
            <h1 className="text-4xl md:text-6xl font-bold text-foreground">
              Fast & Secure Bill Payments
            </h1>
            <p className="text-xl text-muted-foreground max-w-2xl mx-auto">
              Pay your bills instantly with NetPay. Airtime, data, cable TV, electricity bills and more - all in one place.
            </p>
          </div>

          <div className="flex flex-wrap gap-4 justify-center pt-4">
            <Button 
              onClick={() => navigate("/user/auth")}
              size="lg"
              className="bg-brand hover:bg-brand/90 text-white h-12 px-8 text-base"
            >
              Create Free Account
            </Button>
          </div>

          {/* Stats */}
          <div className="grid grid-cols-3 gap-6 pt-12 max-w-2xl mx-auto">
            <div className="text-center">
              <div className="text-3xl font-bold text-brand">99.9%</div>
              <div className="text-sm text-muted-foreground">Uptime</div>
            </div>
            <div className="text-center">
              <div className="text-3xl font-bold text-brand">50k+</div>
              <div className="text-sm text-muted-foreground">Users</div>
            </div>
            <div className="text-center">
              <div className="text-3xl font-bold text-brand">24/7</div>
              <div className="text-sm text-muted-foreground">Support</div>
            </div>
          </div>
        </div>
      </section>

      {/* Features Section */}
      <section className="bg-muted/30 py-16">
        <div className="container mx-auto px-4">
          <div className="text-center mb-12">
            <h2 className="text-3xl md:text-4xl font-bold mb-4">Our Services</h2>
            <p className="text-muted-foreground max-w-2xl mx-auto">
              Everything you need for convenient bill payments and top-ups
            </p>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6 max-w-6xl mx-auto">
            {features.map((feature, index) => (
              <div
                key={index}
                className="bg-card p-6 rounded-2xl border border-border/50 hover:border-brand/30 transition-all hover:shadow-lg"
              >
                <div className="bg-brand/10 w-14 h-14 rounded-full flex items-center justify-center mb-4">
                  <feature.icon className="w-7 h-7 text-brand" />
                </div>
                <h3 className="font-bold text-lg mb-2">{feature.title}</h3>
                <p className="text-muted-foreground text-sm">{feature.description}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Why Choose Us */}
      <section className="py-16">
        <div className="container mx-auto px-4">
          <div className="max-w-4xl mx-auto">
            <div className="text-center mb-12">
              <h2 className="text-3xl md:text-4xl font-bold mb-4">Why Choose NetPay?</h2>
            </div>

            <div className="grid md:grid-cols-3 gap-8">
              <div className="text-center">
                <div className="bg-brand/10 w-16 h-16 rounded-full flex items-center justify-center mx-auto mb-4">
                  <Clock className="w-8 h-8 text-brand" />
                </div>
                <h3 className="font-bold text-lg mb-2">Instant Processing</h3>
                <p className="text-muted-foreground text-sm">
                  All transactions are processed instantly, no delays
                </p>
              </div>

              <div className="text-center">
                <div className="bg-brand/10 w-16 h-16 rounded-full flex items-center justify-center mx-auto mb-4">
                  <Shield className="w-8 h-8 text-brand" />
                </div>
                <h3 className="font-bold text-lg mb-2">100% Secure</h3>
                <p className="text-muted-foreground text-sm">
                  Bank-grade security for all your transactions
                </p>
              </div>

              <div className="text-center">
                <div className="bg-brand/10 w-16 h-16 rounded-full flex items-center justify-center mx-auto mb-4">
                  <TrendingUp className="w-8 h-8 text-brand" />
                </div>
                <h3 className="font-bold text-lg mb-2">Best Rates</h3>
                <p className="text-muted-foreground text-sm">
                  Competitive pricing with great value for money
                </p>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* CTA Section */}
      <section className="bg-brand py-16">
        <div className="container mx-auto px-4 text-center">
          <h2 className="text-3xl md:text-4xl font-bold text-white mb-4">
            Ready to Get Started?
          </h2>
          <p className="text-white/90 text-lg mb-8 max-w-2xl mx-auto">
            Join thousands of users who trust NetPay for their bill payments
          </p>
          <Button 
            onClick={() => navigate("/user/auth")}
            size="lg"
            className="bg-white text-brand hover:bg-white/90 h-12 px-8"
          >
            Create Your Free Account
          </Button>
        </div>
      </section>

      {/* Footer */}
      <footer className="border-t border-border/40 bg-card/50 py-8">
        <div className="container mx-auto px-4">
          <div className="flex flex-col md:flex-row items-center justify-between gap-4">
            <div className="flex items-center gap-3">
              <div className="bg-brand p-2 rounded-lg">
                <svg className="w-6 h-6 text-white" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <path d="M13 2L3 14h9l-1 8 10-12h-9l1-8z" />
                </svg>
              </div>
              <span className="text-xl font-bold">
                <span className="text-brand">NET</span>PAY
              </span>
            </div>
            <div className="flex gap-6 text-sm text-muted-foreground">
              <button onClick={() => navigate("/terms")} className="hover:text-foreground transition-colors">
                Terms & Conditions
              </button>
              <button onClick={() => navigate("/privacy")} className="hover:text-foreground transition-colors">
                Privacy Policy
              </button>
              <button onClick={() => navigate("/contact")} className="hover:text-foreground transition-colors">
                Contact Us
              </button>
            </div>
          </div>
          <div className="text-center text-sm text-muted-foreground mt-6">
            © 2025 NetPay. All rights reserved.
          </div>
        </div>
      </footer>
    </div>
  );
};

export default Index;
