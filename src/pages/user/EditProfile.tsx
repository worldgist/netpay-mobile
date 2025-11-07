import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { toast } from "sonner";
import { Loader2, ArrowLeft, User, Mail, Phone } from "lucide-react";
import { z } from "zod";

const profileSchema = z.object({
  full_name: z.string().trim().min(2, "Name must be at least 2 characters").max(100, "Name must be less than 100 characters"),
  phone: z.string().trim().regex(/^[0-9]{11}$/, "Phone number must be 11 digits").optional().or(z.literal("")),
});

export default function EditProfile() {
  const navigate = useNavigate();
  const [loading, setLoading] = useState(false);
  const [userId, setUserId] = useState("");
  const [fullName, setFullName] = useState("");
  const [email, setEmail] = useState("");
  const [phone, setPhone] = useState("");

  useEffect(() => {
    const fetchProfile = async () => {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) {
        navigate("/user/auth");
        return;
      }

      setUserId(session.user.id);
      setEmail(session.user.email || "");

      const { data: profile, error } = await supabase
        .from('profiles')
        .select('full_name, phone')
        .eq('id', session.user.id)
        .maybeSingle();

      if (error) {
        console.error("Error fetching profile:", error);
        return;
      }

      if (profile) {
        setFullName(profile.full_name || "");
        setPhone(profile.phone || "");
      }
    };

    fetchProfile();
  }, [navigate]);

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);

    try {
      // Validate input
      const validation = profileSchema.safeParse({ full_name: fullName, phone });
      if (!validation.success) {
        toast.error(validation.error.errors[0].message);
        return;
      }

      // Check if profile exists
      const { data: existingProfile } = await supabase
        .from('profiles')
        .select('id')
        .eq('id', userId)
        .maybeSingle();

      if (existingProfile) {
        // Update existing profile
        const { error } = await supabase
          .from('profiles')
          .update({
            full_name: fullName,
            phone: phone || null,
            email: email,
            updated_at: new Date().toISOString(),
          })
          .eq('id', userId);

        if (error) throw error;
      } else {
        // Insert new profile
        const { error } = await supabase
          .from('profiles')
          .insert({
            id: userId,
            full_name: fullName,
            phone: phone || null,
            email: email,
          });

        if (error) throw error;
      }

      toast.success("Profile updated successfully!");
      navigate("/user/profile");
    } catch (error: any) {
      toast.error(error.message || "Failed to update profile");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-gray-50 p-6">
      <div className="max-w-md mx-auto">
        {/* Header */}
        <div className="flex items-center gap-4 mb-8">
          <button
            onClick={() => navigate("/user/profile")}
            className="text-gray-600 hover:text-gray-900 transition-colors"
          >
            <ArrowLeft className="w-6 h-6" />
          </button>
          <h1 className="text-2xl font-bold text-gray-900">Edit Profile</h1>
        </div>

        {/* Profile Form */}
        <form onSubmit={handleSave} className="space-y-6">
          <div className="bg-white rounded-2xl p-6 space-y-6">
            {/* Profile Picture Placeholder */}
            <div className="flex justify-center">
              <div className="w-24 h-24 bg-[#FF6B00] rounded-full flex items-center justify-center">
                <User className="w-12 h-12 text-white" />
              </div>
            </div>

            {/* Full Name */}
            <div className="space-y-2">
              <Label htmlFor="fullName" className="text-sm font-medium text-gray-700">
                Full Name
              </Label>
              <div className="relative">
                <User className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-gray-400" />
                <Input
                  id="fullName"
                  type="text"
                  placeholder="Enter your full name"
                  value={fullName}
                  onChange={(e) => setFullName(e.target.value)}
                  className="bg-gray-50 border-gray-200 pl-10 h-12"
                  required
                  maxLength={100}
                />
              </div>
            </div>

            {/* Email (Read-only) */}
            <div className="space-y-2">
              <Label htmlFor="email" className="text-sm font-medium text-gray-700">
                Email Address
              </Label>
              <div className="relative">
                <Mail className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-gray-400" />
                <Input
                  id="email"
                  type="email"
                  value={email}
                  className="bg-gray-100 border-gray-200 pl-10 h-12 cursor-not-allowed"
                  disabled
                />
              </div>
              <p className="text-xs text-gray-500">Email cannot be changed</p>
            </div>

            {/* Phone Number */}
            <div className="space-y-2">
              <Label htmlFor="phone" className="text-sm font-medium text-gray-700">
                Phone Number
              </Label>
              <div className="relative">
                <Phone className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-gray-400" />
                <Input
                  id="phone"
                  type="tel"
                  placeholder="08012345678"
                  value={phone}
                  onChange={(e) => setPhone(e.target.value)}
                  className="bg-gray-50 border-gray-200 pl-10 h-12"
                  maxLength={11}
                />
              </div>
              <p className="text-xs text-gray-500">Enter 11-digit phone number</p>
            </div>
          </div>

          {/* Save Button */}
          <Button
            type="submit"
            className="w-full bg-[#FF6B00] hover:bg-[#FF8533] text-white h-12 rounded-xl font-medium"
            disabled={loading}
          >
            {loading ? (
              <Loader2 className="w-5 h-5 animate-spin" />
            ) : (
              "Save Changes"
            )}
          </Button>
        </form>
      </div>
    </div>
  );
}
