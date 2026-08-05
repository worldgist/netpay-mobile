import { useEffect, useMemo, useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { Mail, Phone, MapPin, Clock, Send } from "lucide-react";
import { toast } from "@/hooks/use-toast";
import { supabase } from "@/integrations/supabase/client";

type ContactSettings = {
  support_email: string | null;
  support_phone: string | null;
  support_phone_display: string | null;
  address_line: string | null;
  city: string | null;
  state: string | null;
  country: string | null;
  business_hours: Array<{ day: string; time: string }> | null;
};

const DEFAULT_BUSINESS_HOURS = [
  { day: "Monday - Friday", time: "9:00 AM - 6:00 PM" },
  { day: "Saturday", time: "10:00 AM - 4:00 PM" },
  { day: "Sunday", time: "Closed" },
];

const ContactLanding = () => {
  const [formData, setFormData] = useState({
    name: "",
    email: "",
    subject: "",
    message: "",
  });
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isLoadingSettings, setIsLoadingSettings] = useState(true);
  const [settings, setSettings] = useState<ContactSettings | null>(null);

  useEffect(() => {
    const fetchSettings = async () => {
      try {
        const { data, error } = await supabase
          .from("contact_settings")
          .select(
            "support_email, support_phone, support_phone_display, address_line, city, state, country, business_hours",
          )
          .eq("is_active", true)
          .order("created_at", { ascending: false })
          .limit(1)
          .maybeSingle<ContactSettings>();

        if (error) {
          const recoverableCodes = new Set(["PGRST116", "PGRST205", "42P01"]);
          if (!recoverableCodes.has(error.code ?? "")) {
            throw error;
          }
        }

        setSettings(data ?? null);
      } catch (fetchError) {
        console.warn("Unable to load contact settings:", fetchError);
      } finally {
        setIsLoadingSettings(false);
      }
    };

    fetchSettings();
  }, []);

  const businessHours = useMemo(() => {
    if (!settings?.business_hours || !Array.isArray(settings.business_hours)) {
      return DEFAULT_BUSINESS_HOURS;
    }

    const parsed = settings.business_hours
      .map((entry: any) => ({
        day: typeof entry?.day === "string" ? entry.day : "",
        time: typeof entry?.time === "string" ? entry.time : "",
      }))
      .filter((entry) => entry.day && entry.time);

    return parsed.length > 0 ? parsed : DEFAULT_BUSINESS_HOURS;
  }, [settings?.business_hours]);

  const supportEmail = settings?.support_email || "support@netppay.com";
  const supportPhone = settings?.support_phone_display || "+234 706 739 8399";
  const supportPhoneRaw = settings?.support_phone || "07067398399";
  const supportAddress = [settings?.address_line, settings?.city, settings?.state, settings?.country]
    .filter(Boolean)
    .join(", ") || "Lagos, Nigeria";

  const handleSubmit = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (isSubmitting) return;

    const trimmedName = formData.name.trim();
    const trimmedEmail = formData.email.trim();
    const trimmedSubject = formData.subject.trim();
    const trimmedMessage = formData.message.trim();

    if (!trimmedName || !trimmedEmail || !trimmedSubject || !trimmedMessage) {
      toast.error("Please fill in all required fields.");
      return;
    }

    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(trimmedEmail)) {
      toast.error("Please enter a valid email address.");
      return;
    }

    setIsSubmitting(true);

    try {
      const { error } = await supabase.from("support_contact_submissions").insert({
        name: trimmedName,
        email: trimmedEmail,
        subject: trimmedSubject,
        message: trimmedMessage,
        channel: "landing_page",
      });

      if (error) {
        throw error;
      }

      const { error: notifyError } = await supabase.functions.invoke("send-support-email", {
        body: {
          name: trimmedName,
          email: trimmedEmail,
          subject: trimmedSubject,
          message: trimmedMessage,
        },
      });

      if (notifyError) {
        console.warn("send-support-email failed:", notifyError);
      }

      toast.success("Thank you! Your message has been received.");
      setFormData({
        name: "",
        email: trimmedEmail,
        subject: "",
        message: "",
      });
    } catch (submitError: any) {
      console.error("Failed to submit contact form:", submitError);
      toast.error(submitError?.message ?? "We couldn't send your message. Please try again.");
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-brand/10 via-orange-50/40 to-white">
      <div className="container mx-auto px-4 py-16 space-y-12">
        <section className="max-w-4xl mx-auto text-center space-y-6">
          <h1 className="text-4xl md:text-5xl font-bold text-slate-900">We’re here for you</h1>
          <p className="text-lg md:text-xl text-slate-600">
            Send us a message or use the contact details below. Our support team responds quickly and is happy
            to help with product questions, partnerships, or onboarding.
          </p>
        </section>

        <div className="grid gap-8 lg:grid-cols-[1fr,1fr]">
          <Card className="shadow-glow border-brand/20 bg-white/90 backdrop-blur">
            <CardHeader>
              <CardTitle>Send us a message</CardTitle>
              <CardDescription>We reply to most enquiries within a few hours.</CardDescription>
            </CardHeader>
            <CardContent>
              <form className="space-y-4" onSubmit={handleSubmit}>
                <div className="space-y-2">
                  <Label htmlFor="name">Full name</Label>
                  <Input
                    id="name"
                    value={formData.name}
                    onChange={(event) => setFormData({ ...formData, name: event.target.value })}
                    placeholder="Enter your name"
                    required
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="email">Email address</Label>
                  <Input
                    id="email"
                    type="email"
                    value={formData.email}
                    onChange={(event) => setFormData({ ...formData, email: event.target.value })}
                    placeholder="name@email.com"
                    required
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="subject">Subject</Label>
                  <Input
                    id="subject"
                    value={formData.subject}
                    onChange={(event) => setFormData({ ...formData, subject: event.target.value })}
                    placeholder="How can we help?"
                    required
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="message">Message</Label>
                  <Textarea
                    id="message"
                    rows={6}
                    value={formData.message}
                    onChange={(event) => setFormData({ ...formData, message: event.target.value })}
                    placeholder="Tell us about your enquiry..."
                    required
                  />
                </div>
                <Button type="submit" className="w-full h-12 text-base font-semibold" disabled={isSubmitting}>
                  {isSubmitting ? (
                    "Sending..."
                  ) : (
                    <>
                      <Send className="w-4 h-4 mr-2" />
                      Send message
                    </>
                  )}
                </Button>
              </form>
            </CardContent>
          </Card>

          <Card className="border-brand/20 bg-white/80 backdrop-blur">
            <CardHeader>
              <CardTitle>Contact information</CardTitle>
              <CardDescription>Reach us directly using any of the options below.</CardDescription>
            </CardHeader>
            <CardContent className="space-y-6">
              <div className="flex items-start gap-4">
                <div className="w-10 h-10 rounded-full bg-brand/10 flex items-center justify-center text-brand">
                  <Mail className="w-5 h-5" />
                </div>
                <div>
                  <h3 className="font-semibold text-slate-900">Email</h3>
                  <p className="text-sm text-slate-600">Prefer email? We respond quickly.</p>
                  <Button
                    variant="link"
                    className="px-0 text-brand font-semibold"
                    onClick={() => navigator.clipboard.writeText(supportEmail)}
                  >
                    {supportEmail}
                  </Button>
                </div>
              </div>

              <div className="flex items-start gap-4">
                <div className="w-10 h-10 rounded-full bg-brand/10 flex items-center justify-center text-brand">
                  <Phone className="w-5 h-5" />
                </div>
                <div>
                  <h3 className="font-semibold text-slate-900">Phone & WhatsApp</h3>
                  <p className="text-sm text-slate-600">Talk to a NetPay specialist.</p>
                  <div className="flex flex-col gap-1">
                    <Button
                      variant="link"
                      className="px-0 text-brand font-semibold"
                      onClick={() => navigator.clipboard.writeText(supportPhoneRaw)}
                    >
                      {supportPhone}
                    </Button>
                    <Button
                      variant="outline"
                      className="w-fit"
                      asChild
                    >
                      <a href={`https://wa.me/${supportPhoneRaw.replace(/\D/g, "")}`} target="_blank" rel="noreferrer">
                        Chat on WhatsApp
                      </a>
                    </Button>
                  </div>
                </div>
              </div>

              <div className="flex items-start gap-4">
                <div className="w-10 h-10 rounded-full bg-brand/10 flex items-center justify-center text-brand">
                  <MapPin className="w-5 h-5" />
                </div>
                <div>
                  <h3 className="font-semibold text-slate-900">Office</h3>
                  <p className="text-sm text-slate-600">Visit our Lagos experience centre.</p>
                  <p className="text-sm text-slate-700 font-medium">{supportAddress}</p>
                </div>
              </div>

              <div className="flex items-start gap-4">
                <div className="w-10 h-10 rounded-full bg-brand/10 flex items-center justify-center text-brand">
                  <Clock className="w-5 h-5" />
                </div>
                <div className="w-full">
                  <h3 className="font-semibold text-slate-900">Business hours</h3>
                  <p className="text-sm text-slate-600 mb-2">
                    We operate flexible hours to support teams nationwide.
                  </p>
                  <div className="space-y-1">
                    {isLoadingSettings ? (
                      <p className="text-sm text-slate-500">Loading hours...</p>
                    ) : (
                      businessHours.map((entry) => (
                        <div key={`${entry.day}-${entry.time}`} className="flex justify-between text-sm text-slate-600">
                          <span>{entry.day}</span>
                          <span className="text-slate-800 font-medium">{entry.time}</span>
                        </div>
                      ))
                    )}
                  </div>
                </div>
              </div>
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
};

export default ContactLanding;

