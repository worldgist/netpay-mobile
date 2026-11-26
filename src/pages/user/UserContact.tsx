import { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { ArrowLeft, Mail, MapPin, MessageCircle, Loader2 } from "lucide-react";
import { toast } from "sonner";
import BottomNav from "@/components/BottomNav";
import { supabase } from "@/integrations/supabase/client";

type BusinessHour = {
  day: string;
  time: string;
};

const toWhatsAppNumber = (phone: string) => {
  const digits = phone.replace(/\D/g, "");
  if (digits.startsWith("234")) return digits;
  if (digits.startsWith("0")) return `234${digits.slice(1)}`;
  return digits;
};

export default function UserContact() {
  const navigate = useNavigate();
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
                <MessageCircle className="w-5 h-5 text-brand" />
              </div>
              <div>
                <p className="font-medium">WhatsApp</p>
                <p className="text-sm text-muted-foreground">
                  <a
                    href={`https://wa.me/${toWhatsAppNumber(supportPhone)}`}
                    target="_blank"
                    rel="noreferrer"
                    className="underline-offset-2 hover:underline"
                  >
                    {supportPhoneDisplay}
                  </a>
                </p>
                <p className="text-xs text-muted-foreground mt-1">
                  Tap to chat with us on WhatsApp
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
