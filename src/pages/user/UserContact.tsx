import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { ArrowLeft, Mail, Phone, MapPin, Send } from "lucide-react";
import { toast } from "sonner";
import BottomNav from "@/components/BottomNav";

export default function UserContact() {
  const navigate = useNavigate();
  const [formData, setFormData] = useState({
    name: "",
    email: "",
    subject: "",
    message: "",
  });
  const [sending, setSending] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setSending(true);

    // Simulate sending (replace with actual API call)
    setTimeout(() => {
      toast.success("Message sent successfully! We'll get back to you soon.");
      setFormData({ name: "", email: "", subject: "", message: "" });
      setSending(false);
    }, 1000);
  };

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
                <p className="text-sm text-muted-foreground">support@netpay.com</p>
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
                <p className="text-sm text-muted-foreground">+234 (0) 800 000 0000</p>
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
                  123 Business Street<br />
                  Lagos, Nigeria
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
              <div className="flex justify-between py-2 border-b">
                <span className="text-muted-foreground">Monday - Friday</span>
                <span className="font-medium">9:00 AM - 6:00 PM</span>
              </div>
              <div className="flex justify-between py-2 border-b">
                <span className="text-muted-foreground">Saturday</span>
                <span className="font-medium">10:00 AM - 4:00 PM</span>
              </div>
              <div className="flex justify-between py-2">
                <span className="text-muted-foreground">Sunday</span>
                <span className="font-medium">Closed</span>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      <BottomNav />
    </div>
  );
}