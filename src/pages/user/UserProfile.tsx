import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import BottomNav from "@/components/BottomNav";
import { Switch } from "@/components/ui/switch";
import {
  Edit,
  TrendingUp,
  Bell,
  Users,
  Mail,
  MessageCircle,
  FileText,
  Shield,
  Trash2,
  LogOut,
  ChevronRight,
  User,
  Fingerprint,
  Lock,
} from "lucide-react";
import { toast } from "sonner";

export default function UserProfile() {
  const navigate = useNavigate();
  const [userName, setUserName] = useState("");
  const [userEmail, setUserEmail] = useState("");
  const [userId, setUserId] = useState("");
  const [biometricEnabled, setBiometricEnabled] = useState(false);
  const [pinEnabled, setPinEnabled] = useState(false);

  useEffect(() => {
    const checkAuth = async () => {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) {
        navigate("/user/auth");
        return;
      }

      setUserEmail(session.user.email || "");
      setUserId(session.user.id);

      const { data: profile } = await supabase
        .from('profiles')
        .select('full_name, biometric_enabled, pin_enabled')
        .eq('id', session.user.id)
        .maybeSingle();

      if (profile) {
        setUserName(profile.full_name || session.user.email?.split('@')[0] || 'User');
        setBiometricEnabled(profile.biometric_enabled || false);
        setPinEnabled(profile.pin_enabled || false);
      } else {
        setUserName(session.user.email?.split('@')[0] || 'User');
      }
    };

    checkAuth();
  }, [navigate]);

  const handleToggleBiometric = async (enabled: boolean) => {
    try {
      const { error } = await supabase
        .from('profiles')
        .update({ biometric_enabled: enabled })
        .eq('id', userId);

      if (error) throw error;

      setBiometricEnabled(enabled);
      toast.success(enabled ? "Biometric enabled" : "Biometric disabled");
    } catch (error: any) {
      toast.error(error.message || "Failed to update biometric setting");
    }
  };

  const handleManagePin = () => {
    navigate("/user/setup-pin");
  };

  const handleLogout = async () => {
    await supabase.auth.signOut();
    toast.success("Logged out successfully");
    navigate("/user/auth");
  };

  const menuItems = [
    { icon: Edit, label: "Edit Profile", onClick: () => navigate("/user/edit-profile"), color: "text-brand" },
    { icon: Bell, label: "Notifications", onClick: () => navigate("/user/notifications"), color: "text-brand" },
    { icon: Users, label: "Referral", onClick: () => navigate("/user/referrals"), color: "text-brand" },
    { icon: MessageCircle, label: "Support chat", onClick: () => navigate("/user/support-chat"), color: "text-brand" },
    { icon: Mail, label: "Contact us", onClick: () => navigate("/user/contact"), color: "text-brand" },
    { icon: FileText, label: "Terms & Conditions", onClick: () => navigate("/user/terms"), color: "text-brand" },
    { icon: Shield, label: "Privacy Policy", onClick: () => navigate("/user/privacy"), color: "text-brand" },
  ];

  return (
    <div className="min-h-screen bg-gray-50 pb-20">
      {/* Profile Header */}
      <div className="bg-white px-6 pt-8 pb-6 text-center">
        <div className="w-24 h-24 bg-brand rounded-full flex items-center justify-center mx-auto mb-4">
          <User className="w-12 h-12 text-white" />
        </div>
        <h2 className="text-2xl font-bold text-gray-900 mb-1">{userName}</h2>
        <p className="text-gray-600">{userEmail}</p>
      </div>

      {/* Security Section */}
      <div className="px-4 py-4">
        <h3 className="text-sm font-semibold text-gray-500 mb-3 px-2">SECURITY</h3>
        <div className="bg-white rounded-xl divide-y divide-gray-100">
          {/* Biometric Toggle */}
          <div className="px-4 py-4 flex items-center justify-between">
            <div className="flex items-center gap-3">
              <Fingerprint className="w-5 h-5 text-brand" />
              <div>
                <span className="font-medium text-gray-900 block">Biometric Login</span>
                <span className="text-xs text-gray-500">Use fingerprint or face ID</span>
              </div>
            </div>
            <Switch
              checked={biometricEnabled}
              onCheckedChange={handleToggleBiometric}
            />
          </div>

          {/* PIN Management */}
          <button
            onClick={handleManagePin}
            className="w-full px-4 py-4 flex items-center justify-between hover:bg-gray-50 transition-colors"
          >
            <div className="flex items-center gap-3">
              <Lock className="w-5 h-5 text-brand" />
              <div className="text-left">
                <span className="font-medium text-gray-900 block">PIN Code</span>
                <span className="text-xs text-gray-500">
                  {pinEnabled ? "Change your PIN" : "Set up PIN"}
                </span>
              </div>
            </div>
            <ChevronRight className="w-5 h-5 text-gray-400" />
          </button>
        </div>
      </div>

      {/* Menu Items */}
      <div className="px-4 py-4 space-y-1">
        <h3 className="text-sm font-semibold text-gray-500 mb-3 px-2">ACCOUNT</h3>
        {menuItems.map((item) => {
          const Icon = item.icon;
          return (
            <button
              key={item.label}
              onClick={item.onClick}
              className="w-full bg-white rounded-xl px-4 py-4 flex items-center justify-between hover:bg-gray-50 transition-colors"
            >
              <div className="flex items-center gap-3">
                <Icon className={`w-5 h-5 ${item.color}`} />
                <span className={`font-medium ${item.color === "text-red-500" ? "text-red-500" : "text-gray-900"}`}>
                  {item.label}
                </span>
              </div>
              <ChevronRight className="w-5 h-5 text-gray-400" />
            </button>
          );
        })}
      </div>

      {/* Logout Button */}
      <div className="px-4 mt-4">
        <button
          onClick={handleLogout}
          className="w-full bg-white border-2 border-red-500 text-red-500 rounded-xl px-4 py-4 flex items-center justify-center gap-2 font-medium hover:bg-red-50 transition-colors"
        >
          <LogOut className="w-5 h-5" />
          Logout
        </button>
      </div>

      <BottomNav />
    </div>
  );
}
