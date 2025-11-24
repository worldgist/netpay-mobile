import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { ArrowLeft, Copy, Users, Gift, CheckCircle, Share2, Wallet, Link2, MessageCircle, Mail, Facebook, Twitter } from "lucide-react";
import { toast } from "sonner";
import BottomNav from "@/components/BottomNav";
import { formatNaira } from "@/lib/currency";

interface Referral {
  id: string;
  referral_code: string;
  status: string;
  reward_amount: number;
  reward_paid: boolean;
  referred_email: string | null;
  created_at: string;
  completed_at: string | null;
}

interface ReferralStats {
  totalReferrals: number;
  completedReferrals: number;
  pendingReferrals: number;
  totalEarnings: number;
  paidEarnings: number;
  pendingEarnings: number;
}

export default function UserReferrals() {
  const navigate = useNavigate();
  const [referralCode, setReferralCode] = useState("");
  const [referrals, setReferrals] = useState<Referral[]>([]);
  const [stats, setStats] = useState<ReferralStats>({
    totalReferrals: 0,
    completedReferrals: 0,
    pendingReferrals: 0,
    totalEarnings: 0,
    paidEarnings: 0,
    pendingEarnings: 0,
  });
  const [loading, setLoading] = useState(true);
  const [withdrawing, setWithdrawing] = useState(false);
  const [referralLink, setReferralLink] = useState("");

  useEffect(() => {
    const checkAuthAndFetch = async () => {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) {
        navigate("/user/auth");
        return;
      }

      await fetchReferralData(session.user.id);
    };

    checkAuthAndFetch();
  }, [navigate]);

  const fetchReferralData = async (userId: string) => {
    try {
      // Fetch user's referral code from profile
      const { data: profile } = await supabase
        .from("profiles")
        .select("id, referral_code")
        .eq("id", userId)
        .single();

      if (profile) {
        // Use existing referral code or generate one from user ID
        const code = profile.referral_code || `REF-${userId.slice(0, 8).toUpperCase()}`;
        setReferralCode(code);
        // Set referral link
        const link = `${window.location.origin}/user/auth?mode=signup&ref=${encodeURIComponent(code)}`;
        setReferralLink(link);
      }

      // Fetch user's referrals
      const { data: referralData, error } = await supabase
        .from("referrals")
        .select("*")
        .eq("referrer_id", userId)
        .order("created_at", { ascending: false });

      if (error) throw error;

      setReferrals(referralData || []);

      // Calculate stats
      const completed = referralData?.filter(r => r.status === 'completed').length || 0;
      const pending = referralData?.filter(r => r.status === 'pending').length || 0;
      const totalEarnings = referralData?.reduce((sum, r) => sum + Number(r.reward_amount || 0), 0) || 0;
      const paidEarnings = referralData?.filter(r => r.referrer_reward_paid).reduce((sum, r) => sum + Number(r.reward_amount || 0), 0) || 0;
      const pendingEarnings = referralData?.filter(r => r.status === 'completed' && !r.referrer_reward_paid).reduce((sum, r) => sum + Number(r.reward_amount || 0), 0) || 0;

      setStats({
        totalReferrals: referralData?.length || 0,
        completedReferrals: completed,
        pendingReferrals: pending,
        totalEarnings,
        paidEarnings,
        pendingEarnings,
      });
    } catch (error: any) {
      console.error("Error fetching referral data:", error);
      toast.error("Failed to load referral data");
    } finally {
      setLoading(false);
    }
  };

  const copyReferralCode = () => {
    navigator.clipboard.writeText(referralCode);
    toast.success("Referral code copied to clipboard!");
  };

  const copyReferralLink = () => {
    if (referralLink) {
      navigator.clipboard.writeText(referralLink);
      toast.success("Referral link copied to clipboard!");
    } else {
      const link = `${window.location.origin}/user/auth?mode=signup&ref=${encodeURIComponent(referralCode)}`;
      navigator.clipboard.writeText(link);
      toast.success("Referral link copied to clipboard!");
    }
  };

  const shareReferral = async () => {
    const link = referralLink || `${window.location.origin}/user/auth?mode=signup&ref=${encodeURIComponent(referralCode)}`;
    const shareData = {
      title: 'Join NetPay',
      text: `Join NetPay using my referral code ${referralCode} and earn rewards! Sign up now: ${link}`,
      url: link,
    };

    if (navigator.share) {
      try {
        await navigator.share(shareData);
      } catch (error: any) {
        // User cancelled or error occurred
        if (error.name !== 'AbortError') {
          console.error("Error sharing:", error);
          // Fallback to copy
          copyReferralLink();
        }
      }
    } else {
      // Fallback: copy link
      copyReferralLink();
    }
  };

  const shareViaWhatsApp = () => {
    const link = referralLink || `${window.location.origin}/user/auth?mode=signup&ref=${encodeURIComponent(referralCode)}`;
    const message = encodeURIComponent(`Join NetPay using my referral code ${referralCode} and earn rewards! Sign up now: ${link}`);
    window.open(`https://wa.me/?text=${message}`, '_blank');
  };

  const shareViaTwitter = () => {
    const link = referralLink || `${window.location.origin}/user/auth?mode=signup&ref=${encodeURIComponent(referralCode)}`;
    const text = encodeURIComponent(`Join NetPay using my referral code ${referralCode} and earn rewards!`);
    window.open(`https://twitter.com/intent/tweet?text=${text}&url=${encodeURIComponent(link)}`, '_blank');
  };

  const shareViaFacebook = () => {
    const link = referralLink || `${window.location.origin}/user/auth?mode=signup&ref=${encodeURIComponent(referralCode)}`;
    window.open(`https://www.facebook.com/sharer/sharer.php?u=${encodeURIComponent(link)}`, '_blank');
  };

  const shareViaEmail = () => {
    const link = referralLink || `${window.location.origin}/user/auth?mode=signup&ref=${encodeURIComponent(referralCode)}`;
    const subject = encodeURIComponent('Join NetPay with my referral code');
    const body = encodeURIComponent(`Hi!\n\nJoin NetPay using my referral code ${referralCode} and earn rewards!\n\nSign up here: ${link}\n\nThanks!`);
    window.location.href = `mailto:?subject=${subject}&body=${body}`;
  };

  const handleWithdraw = async () => {
    if (stats.pendingEarnings <= 0) {
      toast.error("No pending earnings to withdraw");
      return;
    }

    setWithdrawing(true);
    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) {
        toast.error("Please login to continue");
        navigate("/user/auth");
        return;
      }

      const { data, error } = await supabase.functions.invoke('withdraw-referral-earnings', {
        headers: {
          Authorization: `Bearer ${session.access_token}`,
        },
      });

      if (error) throw error;

      toast.success(data.message || "Earnings withdrawn successfully!");
      
      // Refresh data
      await fetchReferralData(session.user.id);
    } catch (error: any) {
      console.error("Error withdrawing earnings:", error);
      toast.error(error.message || "Failed to withdraw earnings");
    } finally {
      setWithdrawing(false);
    }
  };

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-brand"></div>
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
              <h1 className="text-xl font-bold">Referral Program</h1>
              <p className="text-sm text-muted-foreground">
                Invite friends and earn rewards
              </p>
            </div>
          </div>
        </div>
      </div>

      <div className="p-4 space-y-4">
        {/* Referral Code Card */}
        <Card className="bg-gradient-to-br from-brand to-brand-light">
          <CardHeader>
            <CardTitle className="text-white">Your Referral Code</CardTitle>
            <CardDescription className="text-white/80">
              Share this code with friends to earn rewards
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="space-y-3">
              <div>
                <label className="text-sm text-white/80 mb-1 block">Referral Code</label>
                <div className="flex gap-2">
                  <Input
                    value={referralCode}
                    readOnly
                    className="bg-white/20 border-white/30 text-white placeholder:text-white/60 font-mono text-lg"
                  />
                  <Button
                    onClick={copyReferralCode}
                    variant="secondary"
                    size="icon"
                    className="bg-white/20 hover:bg-white/30 border-white/30"
                  >
                    <Copy className="h-4 w-4" />
                  </Button>
                </div>
              </div>
              
              <div>
                <label className="text-sm text-white/80 mb-1 block">Referral Link</label>
                <div className="flex gap-2">
                  <Input
                    value={referralLink || `${window.location.origin}/user/auth?mode=signup&ref=${encodeURIComponent(referralCode)}`}
                    readOnly
                    className="bg-white/20 border-white/30 text-white placeholder:text-white/60 text-sm"
                  />
                  <Button
                    onClick={copyReferralLink}
                    variant="secondary"
                    size="icon"
                    className="bg-white/20 hover:bg-white/30 border-white/30"
                  >
                    <Link2 className="h-4 w-4" />
                  </Button>
                </div>
              </div>
            </div>

            <div className="space-y-2">
              <Button
                onClick={shareReferral}
                variant="secondary"
                className="w-full bg-white/20 hover:bg-white/30 border-white/30"
              >
                <Share2 className="h-4 w-4 mr-2" />
                Share via Native Share
              </Button>
              
              <div className="grid grid-cols-2 gap-2">
                <Button
                  onClick={shareViaWhatsApp}
                  variant="secondary"
                  size="sm"
                  className="bg-green-500/20 hover:bg-green-500/30 border-green-500/30 text-white"
                >
                  <MessageCircle className="h-4 w-4 mr-2" />
                  WhatsApp
                </Button>
                <Button
                  onClick={shareViaTwitter}
                  variant="secondary"
                  size="sm"
                  className="bg-blue-500/20 hover:bg-blue-500/30 border-blue-500/30 text-white"
                >
                  <Twitter className="h-4 w-4 mr-2" />
                  Twitter
                </Button>
                <Button
                  onClick={shareViaFacebook}
                  variant="secondary"
                  size="sm"
                  className="bg-blue-600/20 hover:bg-blue-600/30 border-blue-600/30 text-white"
                >
                  <Facebook className="h-4 w-4 mr-2" />
                  Facebook
                </Button>
                <Button
                  onClick={shareViaEmail}
                  variant="secondary"
                  size="sm"
                  className="bg-gray-500/20 hover:bg-gray-500/30 border-gray-500/30 text-white"
                >
                  <Mail className="h-4 w-4 mr-2" />
                  Email
                </Button>
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Pending Earnings Card */}
        {stats.pendingEarnings > 0 && (
          <Card className="bg-gradient-to-br from-green-500 to-green-600">
            <CardContent className="p-6">
              <div className="flex items-center justify-between">
                <div className="text-white">
                  <p className="text-sm opacity-90 mb-1">Available to Withdraw</p>
                  <p className="text-3xl font-bold">{formatNaira(stats.pendingEarnings)}</p>
                </div>
                <Wallet className="h-12 w-12 text-white opacity-80" />
              </div>
              <Button
                onClick={handleWithdraw}
                disabled={withdrawing}
                className="w-full mt-4 bg-white text-green-600 hover:bg-white/90"
              >
                {withdrawing ? "Processing..." : "Withdraw to Wallet"}
              </Button>
            </CardContent>
          </Card>
        )}

        {/* Stats Cards */}
        <div className="grid grid-cols-2 gap-3">
          <Card>
            <CardContent className="p-4 text-center">
              <Users className="h-8 w-8 mx-auto text-brand mb-2" />
              <p className="text-2xl font-bold">{stats.totalReferrals}</p>
              <p className="text-xs text-muted-foreground">Total Referrals</p>
            </CardContent>
          </Card>

          <Card>
            <CardContent className="p-4 text-center">
              <CheckCircle className="h-8 w-8 mx-auto text-green-500 mb-2" />
              <p className="text-2xl font-bold">{stats.completedReferrals}</p>
              <p className="text-xs text-muted-foreground">Completed</p>
            </CardContent>
          </Card>

          <Card>
            <CardContent className="p-4 text-center">
              <Gift className="h-8 w-8 mx-auto text-purple-500 mb-2" />
              <p className="text-2xl font-bold">{formatNaira(stats.totalEarnings)}</p>
              <p className="text-xs text-muted-foreground">Total Earnings</p>
            </CardContent>
          </Card>

          <Card>
            <CardContent className="p-4 text-center">
              <Gift className="h-8 w-8 mx-auto text-green-500 mb-2" />
              <p className="text-2xl font-bold">{formatNaira(stats.paidEarnings)}</p>
              <p className="text-xs text-muted-foreground">Withdrawn</p>
            </CardContent>
          </Card>
        </div>

        {/* Referrals List */}
        <Card>
          <CardHeader>
            <CardTitle className="text-lg">Your Referrals</CardTitle>
            <CardDescription>Track your referral progress</CardDescription>
          </CardHeader>
          <CardContent className="space-y-3">
            {referrals.length === 0 ? (
              <div className="py-8 text-center text-muted-foreground">
                <Users className="h-12 w-12 mx-auto mb-3 opacity-50" />
                <p>No referrals yet</p>
                <p className="text-sm">Start sharing your code to earn rewards!</p>
              </div>
            ) : (
              referrals.map((referral) => (
                <div
                  key={referral.id}
                  className="flex items-center justify-between p-3 bg-muted rounded-lg"
                >
                  <div className="flex-1">
                    <p className="font-medium">
                      {referral.referred_email || "User signing up..."}
                    </p>
                    <p className="text-xs text-muted-foreground">
                      {new Date(referral.created_at).toLocaleDateString('en-NG')}
                    </p>
                  </div>
                  <div className="text-right">
                    <Badge
                      variant={
                        referral.status === "completed"
                          ? "default"
                          : "secondary"
                      }
                    >
                      {referral.status}
                    </Badge>
                    <p className="text-sm font-medium mt-1">
                      {formatNaira(referral.reward_amount)}
                    </p>
                  </div>
                </div>
              ))
            )}
          </CardContent>
        </Card>

        {/* How it Works */}
        <Card>
          <CardHeader>
            <CardTitle className="text-lg">How It Works</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3 text-sm">
            <div className="flex gap-3">
              <div className="flex-shrink-0 w-6 h-6 rounded-full bg-brand text-white flex items-center justify-center text-xs font-bold">
                1
              </div>
              <div>
                <p className="font-medium">Share your code</p>
                <p className="text-muted-foreground">
                  Send your referral code to friends and family
                </p>
              </div>
            </div>
            <div className="flex gap-3">
              <div className="flex-shrink-0 w-6 h-6 rounded-full bg-brand text-white flex items-center justify-center text-xs font-bold">
                2
              </div>
              <div>
                <p className="font-medium">They sign up</p>
                <p className="text-muted-foreground">
                  Your friend creates an account using your code
                </p>
              </div>
            </div>
            <div className="flex gap-3">
              <div className="flex-shrink-0 w-6 h-6 rounded-full bg-brand text-white flex items-center justify-center text-xs font-bold">
                3
              </div>
              <div>
                <p className="font-medium">Earn rewards</p>
                <p className="text-muted-foreground">
                  Get rewarded when they complete their first transaction
                </p>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      <BottomNav />
    </div>
  );
}