import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { ensureProfileExists } from "@/utils/profile";
import BottomNav from "@/components/BottomNav";
import { Switch } from "@/components/ui/switch";
import {
  Edit,
  Bell,
  Users,
  Mail,
  FileText,
  Shield,
  Trash2,
  LogOut,
  ChevronRight,
  User,
  Fingerprint,
  ArrowLeft,
} from "lucide-react";
import { toast } from "sonner";
import type { LucideIcon } from "lucide-react";

type MenuRowProps = {
  icon: LucideIcon;
  title: string;
  description: string;
  onClick?: () => void;
  right?: React.ReactNode;
  destructive?: boolean;
  showDivider?: boolean;
  disabled?: boolean;
};

function ProfileMenuRow({
  icon: Icon,
  title,
  description,
  onClick,
  right,
  destructive = false,
  showDivider = false,
  disabled = false,
}: MenuRowProps) {
  const content = (
    <>
      {showDivider ? <div className="ml-[68px] h-px bg-gray-100" /> : null}
      <div
        className={`flex items-center gap-3 px-4 py-3.5 ${disabled ? "opacity-50" : ""}`}
      >
        <div
          className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-full ${
            destructive ? "bg-red-50" : "bg-orange-50"
          }`}
        >
          <Icon className={`h-5 w-5 ${destructive ? "text-red-500" : "text-brand"}`} />
        </div>
        <div className="min-w-0 flex-1 text-left">
          <p className={`font-semibold ${destructive ? "text-red-500" : "text-gray-900"}`}>
            {title}
          </p>
          <p className={`text-xs mt-0.5 ${destructive ? "text-red-400" : "text-gray-500"}`}>
            {description}
          </p>
        </div>
        {right ?? (
          <ChevronRight className={`h-5 w-5 shrink-0 ${destructive ? "text-red-400" : "text-gray-300"}`} />
        )}
      </div>
    </>
  );

  if (onClick) {
    return (
      <button
        type="button"
        onClick={onClick}
        disabled={disabled}
        className="w-full hover:bg-gray-50/80 transition-colors disabled:pointer-events-none"
      >
        {content}
      </button>
    );
  }

  return <div>{content}</div>;
}

export default function UserProfile() {
  const navigate = useNavigate();
  const [loading, setLoading] = useState(true);
  const [userName, setUserName] = useState("");
  const [userEmail, setUserEmail] = useState("");
  const [userId, setUserId] = useState("");
  const [biometricEnabled, setBiometricEnabled] = useState(false);
  const [notificationsEnabled, setNotificationsEnabled] = useState(true);
  const [notificationsUpdating, setNotificationsUpdating] = useState(false);
  const [biometricUpdating, setBiometricUpdating] = useState(false);
  const [isSupportAdmin, setIsSupportAdmin] = useState(false);

  const NOTIFICATIONS_ENABLED_KEY = "@netpay_notifications_enabled";

  useEffect(() => {
    const checkAuth = async () => {
      try {
        setLoading(true);
        const {
          data: { session },
        } = await supabase.auth.getSession();
        if (!session) {
          navigate("/user/auth");
          return;
        }

        setUserEmail(session.user.email || "");
        setUserId(session.user.id);

        const profile = await ensureProfileExists(session.user);

        if (profile) {
          setUserName(profile.full_name || session.user.email?.split("@")[0] || "User");
          setBiometricEnabled(profile.biometric_enabled || false);
        } else {
          setUserName(session.user.email?.split("@")[0] || "User");
          toast.error("Failed to load profile. Please refresh the page.");
        }

        try {
          const storedNotificationPreference = window.localStorage.getItem(NOTIFICATIONS_ENABLED_KEY);
          if (storedNotificationPreference !== null) {
            setNotificationsEnabled(JSON.parse(storedNotificationPreference));
          }
        } catch (storageError) {
          console.error("Failed to load notifications preference:", storageError);
        }

        const { data: adminRole } = await supabase
          .from("user_roles")
          .select("id")
          .eq("user_id", session.user.id)
          .eq("role", "admin")
          .maybeSingle();

        setIsSupportAdmin(Boolean(adminRole));
      } catch (error: any) {
        console.error("Error loading profile:", error);
        toast.error(error.message || "Failed to load profile");
      } finally {
        setLoading(false);
      }
    };

    void checkAuth();
  }, [navigate]);

  const handleToggleBiometric = async (enabled: boolean) => {
    if (!userId || biometricUpdating) return;
    const previous = biometricEnabled;
    setBiometricEnabled(enabled);
    setBiometricUpdating(true);
    try {
      const { error } = await supabase
        .from("profiles")
        .update({ biometric_enabled: enabled })
        .eq("id", userId);

      if (error) throw error;
      toast.success(enabled ? "Biometric enabled" : "Biometric disabled");
    } catch (error: any) {
      setBiometricEnabled(previous);
      toast.error(error.message || "Failed to update biometric setting");
    } finally {
      setBiometricUpdating(false);
    }
  };

  const handleToggleNotifications = async (enabled: boolean) => {
    if (notificationsUpdating) return;
    setNotificationsUpdating(true);
    const previousValue = notificationsEnabled;
    setNotificationsEnabled(enabled);

    try {
      window.localStorage.setItem(NOTIFICATIONS_ENABLED_KEY, JSON.stringify(enabled));
      toast.success(enabled ? "Notifications enabled" : "Notifications disabled");
    } catch (error: any) {
      setNotificationsEnabled(previousValue);
      toast.error(error?.message || "Failed to update notifications setting");
    } finally {
      setNotificationsUpdating(false);
    }
  };

  const handleLogout = async () => {
    await supabase.auth.signOut();
    toast.success("Logged out successfully");
    navigate("/user/auth");
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-gray-50 pb-20 flex items-center justify-center">
        <div className="flex flex-col items-center gap-3">
          <div className="relative h-12 w-12">
            <div className="absolute inset-0 rounded-full border-4 border-orange-100" />
            <div className="absolute inset-0 rounded-full border-4 border-transparent border-t-brand animate-spin" />
          </div>
          <p className="text-sm text-gray-600">Loading profile...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-50 pb-24">
      <div className="bg-white px-4 py-4 border-b border-gray-100 flex items-center">
        <button
          type="button"
          onClick={() => (window.history.length > 1 ? navigate(-1) : navigate("/user/dashboard"))}
          className="flex h-10 w-10 items-center justify-center rounded-full hover:bg-gray-50"
          aria-label="Go back"
        >
          <ArrowLeft className="h-5 w-5 text-gray-900" />
        </button>
        <h1 className="flex-1 text-center text-lg font-bold text-gray-900">My Profile</h1>
        <div className="w-10" />
      </div>

      <div className="px-4 pt-4 space-y-4">
        <div className="flex items-center gap-3.5 rounded-2xl bg-brand p-4 shadow-sm">
          <div className="flex h-14 w-14 shrink-0 items-center justify-center rounded-full bg-white">
            <User className="h-8 w-8 text-gray-300" />
          </div>
          <div className="min-w-0 flex-1">
            <p className="truncate text-lg font-bold text-white">{userName || "User"}</p>
            <p className="truncate text-sm text-white/90">{userEmail || ""}</p>
          </div>
        </div>

        <div className="overflow-hidden rounded-2xl bg-white shadow-sm">
          <ProfileMenuRow
            icon={Edit}
            title="Edit Profile"
            description="Update your personal account information"
            onClick={() => navigate("/user/edit-profile")}
          />

          <ProfileMenuRow
            icon={Bell}
            title="Notifications"
            description={
              notificationsEnabled
                ? "Notifications are enabled"
                : "Enable notifications for updates and alerts"
            }
            showDivider
            disabled={notificationsUpdating || !userId}
            right={
              <div
                onClick={(e) => e.stopPropagation()}
                onKeyDown={(e) => e.stopPropagation()}
              >
                <Switch
                  checked={notificationsEnabled}
                  onCheckedChange={handleToggleNotifications}
                  disabled={notificationsUpdating || !userId}
                />
              </div>
            }
            onClick={() => {
              if (notificationsUpdating || !userId) return;
              void handleToggleNotifications(!notificationsEnabled);
            }}
          />

          <ProfileMenuRow
            icon={Users}
            title="Referral"
            description="Invite friends and earn referral rewards"
            showDivider
            onClick={() => navigate("/user/referrals")}
          />

          <ProfileMenuRow
            icon={Mail}
            title="Contact us"
            description="Reach our team for help and feedback"
            showDivider
            onClick={() => navigate("/user/contact")}
          />

          <ProfileMenuRow
            icon={FileText}
            title="Statement"
            description="View, download or email your transaction statement"
            showDivider
            onClick={() => navigate("/user/statement-of-account")}
          />

          <ProfileMenuRow
            icon={Shield}
            title="Security"
            description="Manage change PIN and change password"
            showDivider
            onClick={() => navigate("/user/security")}
          />

          <ProfileMenuRow
            icon={Fingerprint}
            title="Biometric Login"
            description={
              biometricEnabled
                ? "Use fingerprint or Face ID to sign in"
                : "Enable fingerprint or Face ID sign in"
            }
            showDivider
            disabled={biometricUpdating || !userId}
            right={
              <div
                onClick={(e) => e.stopPropagation()}
                onKeyDown={(e) => e.stopPropagation()}
              >
                <Switch
                  checked={biometricEnabled}
                  onCheckedChange={handleToggleBiometric}
                  disabled={biometricUpdating || !userId}
                />
              </div>
            }
            onClick={() => {
              if (biometricUpdating || !userId) return;
              void handleToggleBiometric(!biometricEnabled);
            }}
          />

          <ProfileMenuRow
            icon={FileText}
            title="Terms & Conditions"
            description="Read the rules and terms for using NetPay"
            showDivider
            onClick={() => navigate("/user/terms")}
          />

          <ProfileMenuRow
            icon={FileText}
            title="Privacy Policy"
            description="See how your personal data is collected and used"
            showDivider
            onClick={() => navigate("/user/privacy")}
          />

          {isSupportAdmin ? (
            <ProfileMenuRow
              icon={Mail}
              title="Support Center"
              description="Open the admin support inbox"
              showDivider
              onClick={() => navigate("/support-admin")}
            />
          ) : null}

          <ProfileMenuRow
            icon={Trash2}
            title="Delete Account"
            description="Permanently delete your account and all data"
            destructive
            showDivider
            onClick={() => navigate("/user/delete-account")}
          />
        </div>

        <button
          type="button"
          onClick={handleLogout}
          className="flex w-full items-center justify-center gap-2 rounded-2xl border-2 border-red-500 bg-white px-4 py-4 font-semibold text-red-500 hover:bg-red-50 transition-colors"
        >
          <LogOut className="h-5 w-5" />
          Logout
        </button>
      </div>

      <BottomNav />
    </div>
  );
}
