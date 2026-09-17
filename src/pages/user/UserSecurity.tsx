import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import BottomNav from "@/components/BottomNav";
import { ArrowLeft, ChevronRight, Lock, KeyRound } from "lucide-react";
import { toast } from "sonner";

export default function UserSecurity() {
  const navigate = useNavigate();
  const [pinEnabled, setPinEnabled] = useState(false);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const load = async () => {
      try {
        const {
          data: { session },
        } = await supabase.auth.getSession();
        if (!session) {
          navigate("/user/auth");
          return;
        }

        const { data: profile, error } = await supabase
          .from("profiles")
          .select("pin_enabled")
          .eq("id", session.user.id)
          .maybeSingle();

        if (error) throw error;
        setPinEnabled(Boolean(profile?.pin_enabled));
      } catch (error: any) {
        console.error("Failed to load security state:", error);
        toast.error(error?.message || "Failed to load security settings");
      } finally {
        setLoading(false);
      }
    };

    void load();
  }, [navigate]);

  return (
    <div className="min-h-screen bg-gray-50 pb-24">
      <div className="bg-white px-4 py-4 border-b border-gray-100 flex items-center">
        <button
          type="button"
          onClick={() => navigate("/user/profile")}
          className="flex h-10 w-10 items-center justify-center rounded-full hover:bg-gray-50"
          aria-label="Go back"
        >
          <ArrowLeft className="h-5 w-5 text-gray-900" />
        </button>
        <h1 className="flex-1 text-center text-lg font-bold text-gray-900">Security</h1>
        <div className="w-10" />
      </div>

      <div className="px-4 pt-4 space-y-3">
        {loading ? (
          <div className="rounded-2xl bg-white p-6 text-center text-sm text-gray-500 shadow-sm">
            Loading security settings...
          </div>
        ) : (
          <>
            <button
              type="button"
              onClick={() => navigate("/user/setup-pin")}
              className="flex w-full items-center gap-3 rounded-2xl bg-white p-4 shadow-sm hover:bg-gray-50 transition-colors"
            >
              <div className="flex h-10 w-10 items-center justify-center rounded-full bg-orange-50">
                <Lock className="h-5 w-5 text-brand" />
              </div>
              <div className="min-w-0 flex-1 text-left">
                <p className="font-semibold text-gray-900">
                  {pinEnabled ? "Change PIN" : "Set up PIN"}
                </p>
                <p className="text-xs text-gray-500 mt-0.5">
                  {pinEnabled ? "Change your transaction PIN" : "Set up your transaction PIN"}
                </p>
              </div>
              <ChevronRight className="h-5 w-5 text-gray-300" />
            </button>

            <button
              type="button"
              onClick={() => navigate("/user/forgot-password")}
              className="flex w-full items-center gap-3 rounded-2xl bg-white p-4 shadow-sm hover:bg-gray-50 transition-colors"
            >
              <div className="flex h-10 w-10 items-center justify-center rounded-full bg-orange-50">
                <KeyRound className="h-5 w-5 text-brand" />
              </div>
              <div className="min-w-0 flex-1 text-left">
                <p className="font-semibold text-gray-900">Change Password</p>
                <p className="text-xs text-gray-500 mt-0.5">
                  Update your login password for better security
                </p>
              </div>
              <ChevronRight className="h-5 w-5 text-gray-300" />
            </button>
          </>
        )}
      </div>

      <BottomNav />
    </div>
  );
}
