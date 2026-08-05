import { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { ArrowLeft, Mail, Phone, MapPin, Send, MessageCircle, Loader2 } from "lucide-react";
import { toast } from "sonner";
import BottomNav from "@/components/BottomNav";
import { supabase } from "@/integrations/supabase/client";
import { ensureProfileExists } from "@/utils/profile";

type BusinessHour = {
  day: string;
  time: string;
};

export default function UserContact() {
  const navigate = useNavigate();
  const [formData, setFormData] = useState({
    name: "",
    email: "",
    subject: "",
    message: "",
  });
  const [sending, setSending] = useState(false);
  const [userId, setUserId] = useState<string | null>(null);
  const [supportEmail, setSupportEmail] = useState("support@netppay.com");
  const [supportPhone, setSupportPhone] = useState("07067398399");
  const [supportPhoneDisplay, setSupportPhoneDisplay] = useState("+234 706 739 8399");
  const [address, setAddress] = useState("Lagos, Nigeria");
  const [businessHours, setBusinessHours] = useState<BusinessHour[]>([
    { day: "Monday - Friday", time: "9:00 AM - 6:00 PM" },
    { day: "Saturday", time: "10:00 AM - 4:00 PM" },
    { day: "Sunday", time: "Closed" },
  ]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let isMounted = true;

    const loadInitialData = async () => {
      try {
        const { data: { session } } = await supabase.auth.getSession();

        if (!session?.user) {
          navigate("/user/auth?mode=signin");
          return;
        }

        setUserId(session.user.id);

        const profile = await ensureProfileExists(session.user);
        if (!isMounted) return;

        const fallbackName = session.user.email?.split("@")[0] ?? "NetPay User";
        const derivedName = profile?.full_name || fallbackName;

        setFormData((prev) => ({
          ...prev,
          name: derivedName,
          email: session.user.email ?? prev.email,
        }));

        try {
          const { data: settingsRow, error: settingsError } = await supabase
            .from("contact_settings")
            .select("support_email, support_phone, support_phone_display, address_line, city, state, country, business_hours")
            .eq("is_active", true)
            .order("created_at", { ascending: false })
            .limit(1)
            .maybeSingle();

          const recoverableCodes = new Set(["PGRST116", "PGRST205", "42P01"]);
          if (settingsError && !recoverableCodes.has(settingsError.code ?? "")) {
            throw settingsError;
          }

          if (settingsRow) {
            if (settingsRow.support_email) setSupportEmail(settingsRow.support_email);
            if (settingsRow.support_phone) setSupportPhone(settingsRow.support_phone);
            if (settingsRow.support_phone_display) setSupportPhoneDisplay(settingsRow.support_phone_display);

            const addressParts = [
              settingsRow.address_line,
              settingsRow.city,
              settingsRow.state,
              settingsRow.country,
            ]
              .filter(Boolean)
              .join(", ");

            if (addressParts) {
              setAddress(addressParts);
            }

            if (Array.isArray(settingsRow.business_hours) && settingsRow.business_hours.length > 0) {
              const parsed = settingsRow.business_hours
                .map((entry: any) => ({
                  day: typeof entry.day === "string" ? entry.day : "",
                  time: typeof entry.time === "string" ? entry.time : "",
                }))
                .filter((entry) => entry.day && entry.time);

              if (parsed.length > 0) {
                setBusinessHours(parsed);
              }
            }
          }
        } catch (settingsError) {
          console.warn("contact_settings unavailable:", settingsError);
        }
      } catch (error) {
        console.error("Failed to load contact data:", error);
        toast.error("Unable to load your contact information. Please try again later.");
      } finally {
        if (isMounted) {
          setLoading(false);
        }
      }
    };

    loadInitialData();

    return () => {
      isMounted = false;
    };
  }, [navigate]);

  const displayBusinessHours = useMemo(() => businessHours, [businessHours]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (sending) return;
    const trimmedName = formData.name.trim();
    const trimmedEmail = formData.email.trim();
    const trimmedSubject = formData.subject.trim();
    const trimmedMessage = formData.message.trim();

    if (!trimmedName || !trimmedEmail || !trimmedSubject || !trimmedMessage) {
      toast.error("Please fill in all required fields.");
      return;
    }

    if (!userId) {
      toast.error("Please sign in again to contact support.");
      navigate("/user/auth?mode=signin");
      return;
    }

    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(trimmedEmail)) {
      toast.error("Please enter a valid email address.");
      return;
    }

    setSending(true);

    try {
      const { error } = await supabase.from("support_contact_submissions").insert({
        user_id: userId,
        name: trimmedName,
        email: trimmedEmail,
        subject: trimmedSubject,
        message: trimmedMessage,
        channel: "web_contact",
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
        console.error("send-support-email failed:", notifyError);
        toast.warning("Your message was saved, but we couldn't notify support automatically. We'll follow up shortly.");
      } else {
        toast.success("Message sent successfully! We'll get back to you soon.");
      }

      setFormData({
        name: trimmedName,
        email: trimmedEmail,
        subject: "",
        message: "",
      });
    } catch (error: any) {
      console.error("Failed to send support message:", error);
      toast.error(error?.message ?? "Unable to send your message right now. Please try again.");
    } finally {
      setSending(false);
    }
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-gray-50 flex flex-col items-center justify-center gap-4">
        <Loader2 className="h-10 w-10 animate-spin text-brand" />
        <p className="text-sm text-muted-foreground">Loading support options...</p>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-50 pb-24">
      {/* Header */}
      <div className="bg-white border-b">
        <div className="px-4 py-4">
          <div className="flex items-center gap-3">
            <Button
              variant="ghost"
              size="icon"
              onClick={() => navigate("/user/profile")}
            >
              <ArrowLeft className="h-5 w-5" />
            </Button>
            <div>
              <h1 className="text-xl font-bold">Contact Us</h1>
              <p className="text-sm text-muted-foreground">
                Get in touch with our support team
              </p>
            </div>
          </div>
        </div>
      </div>

      <div className="p-4 space-y-4">
        {/* Contact Form */}
        <Card>
          <CardHeader>
            <CardTitle>Send us a message</CardTitle>
            <CardDescription>
              Fill out the form below and we'll get back to you as soon as possible
            </CardDescription>
          </CardHeader>
          <CardContent>
            <form onSubmit={handleSubmit} className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="name">Name</Label>
                <Input
                  id="name"
                  value={formData.name}
                  onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                  placeholder="Your name"
                  required
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="email">Email</Label>
                <Input
                  id="email"
                  type="email"
                  value={formData.email}
                  onChange={(e) => setFormData({ ...formData, email: e.target.value })}
                  placeholder="your.email@example.com"
                  required
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="subject">Subject</Label>
                <Input
                  id="subject"
                  value={formData.subject}
                  onChange={(e) => setFormData({ ...formData, subject: e.target.value })}
                  placeholder="How can we help?"
                  required
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="message">Message</Label>
                <Textarea
                  id="message"
                  value={formData.message}
                  onChange={(e) => setFormData({ ...formData, message: e.target.value })}
                  placeholder="Your message..."
                  className="min-h-[120px]"
                  required
                />
              </div>

              <Button type="submit" className="w-full" disabled={sending}>
                {sending ? (
                  <>
                    <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-white mr-2"></div>
                    Sending...
                  </>
                ) : (
                  <>
                    <Send className="h-4 w-4 mr-2" />
                    Send Message
                  </>
                )}
              </Button>
            </form>
          </CardContent>
        </Card>

        {/* Contact Information */}
        <Card>
          <CardHeader>
            <CardTitle>Contact Information</CardTitle>
            <CardDescription>Other ways to reach us</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="flex items-start gap-3">
              <div className="w-10 h-10 rounded-full bg-brand/10 flex items-center justify-center flex-shrink-0">
                <Mail className="w-5 h-5 text-brand" />
              </div>
              <div>
                <p className="font-medium">Email</p>
                <p className="text-sm text-muted-foreground">
                  <button
                    type="button"
                    className="underline-offset-2 hover:underline"
                    onClick={() => navigator.clipboard.writeText(supportEmail)}
                  >
                    {supportEmail}
                  </button>
                </p>
                <p className="text-xs text-muted-foreground mt-1">
                  We typically respond within 24 hours
                </p>
              </div>
            </div>

            <div className="flex items-start gap-3">
              <div className="w-10 h-10 rounded-full bg-brand/10 flex items-center justify-center flex-shrink-0">
                <Phone className="w-5 h-5 text-brand" />
              </div>
              <div>
                <p className="font-medium">Phone</p>
                <p className="text-sm text-muted-foreground">
                  <button
                    type="button"
                    className="underline-offset-2 hover:underline"
                    onClick={() => navigator.clipboard.writeText(supportPhone)}
                  >
                    {supportPhoneDisplay}
                  </button>
                </p>
                <p className="text-xs text-muted-foreground mt-1">
                  Mon-Fri: 9:00 AM - 6:00 PM WAT
                </p>
              </div>
            </div>

            <div className="flex items-start gap-3">
              <div className="w-10 h-10 rounded-full bg-brand/10 flex items-center justify-center flex-shrink-0">
                <MapPin className="w-5 h-5 text-brand" />
              </div>
              <div>
                <p className="font-medium">Address</p>
                <p className="text-sm text-muted-foreground">
                  {address}
                </p>
              </div>
            </div>

          </CardContent>
        </Card>

        {/* Business Hours */}
        <Card>
          <CardHeader>
            <CardTitle>Business Hours</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-2 text-sm">
              {displayBusinessHours.map((entry, index) => (
                <div
                  key={`${entry.day}-${index}`}
                  className={`flex justify-between py-2 ${index !== displayBusinessHours.length - 1 ? "border-b" : ""}`}
                >
                  <span className="text-muted-foreground">{entry.day}</span>
                  <span className="font-medium">{entry.time}</span>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      </div>

      <BottomNav />
    </div>
  );
}