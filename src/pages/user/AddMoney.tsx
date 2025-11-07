import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { ArrowLeft, Copy, Loader2, Building2, User, Info, CheckCircle2 } from "lucide-react";
import { toast } from "@/hooks/use-toast";

export default function AddMoney() {
  const navigate = useNavigate();
  const [virtualAccount, setVirtualAccount] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [selectedBank, setSelectedBank] = useState<'999991' | '120001'>('999991');
  const [lastError, setLastError] = useState<string | null>(null);
  const [showBvnForm, setShowBvnForm] = useState(false);
  const [nin, setNin] = useState('');

  useEffect(() => {
    checkExistingAccount();
  }, [selectedBank]);

  const checkExistingAccount = async () => {
    setLoading(true);
    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) {
        navigate("/user/auth");
        return;
      }

      // Check if user already has a virtual account for this bank
      const { data: existingAccount, error } = await supabase
        .from('virtual_accounts')
        .select('*')
        .eq('user_id', session.user.id)
        .eq('bank_code', selectedBank)
        .maybeSingle();

      if (error) throw error;

      if (existingAccount) {
        // User already has an account, display it
        setVirtualAccount({
          account_number: existingAccount.account_number,
          bank_name: existingAccount.bank_name,
          account_name: existingAccount.account_name,
          account_type: 'STATIC',
        });
        setShowBvnForm(false);
      } else {
        // No account exists, show BVN form
        setShowBvnForm(true);
        setVirtualAccount(null);
      }
    } catch (error: any) {
      console.error("Error checking virtual account:", error);
      toast({
        title: "Error",
        description: "Failed to load account information",
        variant: "destructive",
      });
    } finally {
      setLoading(false);
    }
  };

  const fetchVirtualAccount = async () => {
    if (!nin) {
      toast({
        title: "Required Information",
        description: "Please enter your NIN to create a virtual account",
        variant: "destructive",
      });
      return;
    }

    setLoading(true);
    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) {
        navigate("/user/auth");
        return;
      }

      // Get user profile for phone number
      const { data: profile } = await supabase
        .from('profiles')
        .select('full_name, email, phone')
        .eq('id', session.user.id)
        .single();

      const { data, error } = await supabase.functions.invoke('get-virtual-account', {
        body: {
          email: session.user.email,
          name: profile?.full_name || session.user.email?.split('@')[0] || 'User',
          phoneNumber: profile?.phone || '0000000000',
          bankcode: [selectedBank],
          account_type: 'STATIC',
          nin: nin,
        }
      });

      if (error) throw error;

      if (data?.success) {
        // Save to database
        const { error: insertError } = await supabase
          .from('virtual_accounts')
          .upsert({
            user_id: session.user.id,
            business_id: '5EE89DA992424C6DA0234577E7E4ECAA',
            bank_code: selectedBank,
            account_number: data.data.account_number,
            bank_name: data.data.bank_name,
            account_name: data.data.account_name,
            tracking_reference: data.data.trackingReference,
          }, {
            onConflict: 'user_id,bank_code'
          });

        if (insertError) {
          console.error('Error saving virtual account:', insertError);
        }

        setVirtualAccount(data.data);
        setLastError(null);
        setShowBvnForm(false);
        toast({
          title: "Success!",
          description: "Virtual account created successfully",
        });
      } else {
        setVirtualAccount(null);
        setLastError(data?.error || "Failed to create virtual account");
        toast({
          title: "Virtual account unavailable",
          description: data?.error || "Please check your BVN/NIN and try again.",
          variant: "destructive",
        });
      }
    } catch (error: any) {
      console.error("Error creating virtual account:", error);
      toast({
        title: "Error",
        description: error.message || "Failed to create virtual account",
        variant: "destructive",
      });
    } finally {
      setLoading(false);
    }
  };

  const copyToClipboard = (text: string, label: string) => {
    navigator.clipboard.writeText(text);
    toast({
      title: "Copied!",
      description: `${label} copied to clipboard`,
    });
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <div className="text-center">
          <Loader2 className="w-12 h-12 text-primary animate-spin mx-auto mb-4" />
          <p className="text-muted-foreground">Creating your virtual account...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background">
      {/* Header */}
      <div className="bg-card border-b sticky top-0 z-10">
        <div className="flex items-center justify-center px-6 py-4 relative">
          <button
            onClick={() => navigate("/user/dashboard")}
            className="absolute left-6 text-foreground hover:text-primary transition-colors"
          >
            <ArrowLeft className="w-6 h-6" />
          </button>
          <h1 className="text-xl font-bold text-foreground">Account Details</h1>
        </div>
      </div>

      {/* Content */}
      <div className="px-6 py-6 max-w-md mx-auto">
        {showBvnForm && (
          <div className="space-y-6">
            {/* Info Banner */}
            <div className="bg-primary/10 rounded-xl p-4 flex items-start gap-3">
              <Info className="w-5 h-5 text-primary shrink-0 mt-0.5" />
              <div className="text-sm text-foreground">
                <p className="font-semibold mb-1">Create Your Virtual Account</p>
                <p>To create a permanent virtual account, we need your NIN for verification.</p>
              </div>
            </div>

            {/* Bank selector */}
            <div className="flex items-center gap-3">
              <Button
                variant={selectedBank === '999991' ? 'default' : 'outline'}
                onClick={() => setSelectedBank('999991')}
                size="sm"
              >
                PalmPay
              </Button>
              <Button
                variant={selectedBank === '120001' ? 'default' : 'outline'}
                onClick={() => setSelectedBank('120001')}
                size="sm"
              >
                9PSB
              </Button>
            </div>

            {/* NIN Form */}
            <div className="bg-card rounded-2xl border shadow-sm p-6 space-y-4">
              <div className="space-y-2">
                <label className="text-sm font-medium text-foreground">NIN (National Identity Number)</label>
                <input
                  type="text"
                  value={nin}
                  onChange={(e) => setNin(e.target.value.replace(/\D/g, '').slice(0, 11))}
                  placeholder="Enter your 11-digit NIN"
                  className="w-full px-4 py-3 rounded-lg border bg-background text-foreground focus:outline-none focus:ring-2 focus:ring-primary"
                  maxLength={11}
                />
                <p className="text-xs text-muted-foreground">Required for account verification</p>
              </div>

              <Button
                onClick={fetchVirtualAccount}
                disabled={loading || nin.length !== 11}
                className="w-full h-12"
              >
                {loading ? (
                  <>
                    <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                    Creating Account...
                  </>
                ) : (
                  'Create Virtual Account'
                )}
              </Button>
            </div>

            {/* Security Note */}
            <div className="bg-green-50 dark:bg-green-950/20 border border-green-200 dark:border-green-800 rounded-lg p-4">
              <p className="text-sm text-green-800 dark:text-green-200">
                <strong>Secure:</strong> Your NIN is encrypted and only used for account verification. We never store or share your information.
              </p>
            </div>

            <Button
              variant="outline"
              onClick={() => navigate("/user/dashboard")}
              className="w-full"
            >
              Back to Dashboard
            </Button>
          </div>
        )}

        {!showBvnForm && virtualAccount && (
          <div className="space-y-6">
            {/* Info Banner */}
            <div className="bg-primary/10 rounded-xl p-4 flex items-start gap-3">
              <Info className="w-5 h-5 text-primary shrink-0 mt-0.5" />
              <p className="text-sm text-foreground">
                Transfer to the virtual account number below
              </p>
            </div>

            {/* Account Details Card */}
            <div className="bg-card rounded-2xl border shadow-sm divide-y">
              {/* Account Number */}
              <div className="p-4 flex items-center gap-4">
                <div className="w-12 h-12 rounded-full bg-primary/10 flex items-center justify-center shrink-0">
                  <Building2 className="w-6 h-6 text-primary" />
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-sm text-muted-foreground mb-1">
                    {selectedBank === '999991' ? 'PalmPay' : '9PSB'} Account Number
                  </p>
                  <p className="text-lg font-semibold text-foreground">
                    {virtualAccount.account_number || "N/A"}
                  </p>
                </div>
                {virtualAccount.account_number && (
                  <Button
                    onClick={() => copyToClipboard(virtualAccount.account_number, "Account number")}
                    variant="ghost"
                    size="sm"
                    className="shrink-0 text-primary hover:text-primary"
                  >
                    <Copy className="w-4 h-4 mr-1" />
                    Copy
                  </Button>
                )}
              </div>

              {/* Bank Name */}
              <div className="p-4 flex items-center gap-4">
                <div className="w-12 h-12 rounded-full bg-primary/10 flex items-center justify-center shrink-0">
                  <Building2 className="w-6 h-6 text-primary" />
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-sm text-muted-foreground mb-1">Bank Name</p>
                  <p className="text-lg font-semibold text-foreground">
                    {virtualAccount.bank_name || "N/A"}
                  </p>
                </div>
                <div className="shrink-0 flex items-center gap-1 text-green-600 bg-green-50 dark:bg-green-950/20 px-3 py-1.5 rounded-full">
                  <CheckCircle2 className="w-4 h-4" />
                  <span className="text-xs font-medium">Recommended</span>
                </div>
              </div>

              {/* Account Name */}
              <div className="p-4 flex items-center gap-4">
                <div className="w-12 h-12 rounded-full bg-primary/10 flex items-center justify-center shrink-0">
                  <User className="w-6 h-6 text-primary" />
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-sm text-muted-foreground mb-1">Account Name</p>
                  <p className="text-lg font-semibold text-foreground break-words">
                    {virtualAccount.account_name || "N/A"}
                  </p>
                </div>
              </div>
            </div>

            {/* Instructions */}
            <div className="bg-accent rounded-xl p-4 space-y-3">
              <h3 className="font-semibold text-accent-foreground">
                How to add money:
              </h3>
              <ol className="space-y-2 text-sm text-muted-foreground">
                <li className="flex gap-2">
                  <span className="font-bold text-primary">1.</span>
                  <span>Copy the account number above</span>
                </li>
                <li className="flex gap-2">
                  <span className="font-bold text-primary">2.</span>
                  <span>Open your bank app and make a transfer</span>
                </li>
                <li className="flex gap-2">
                  <span className="font-bold text-primary">3.</span>
                  <span>Your wallet will be credited automatically</span>
                </li>
              </ol>
            </div>

            {/* Warning */}
            <div className="bg-yellow-50 dark:bg-yellow-950/20 border border-yellow-200 dark:border-yellow-800 rounded-lg p-4">
              <p className="text-sm text-yellow-800 dark:text-yellow-200">
                <strong>Note:</strong> This is your dedicated virtual account. 
                All transfers to this account will be automatically credited to your wallet.
              </p>
            </div>

            {/* Action Button */}
            <Button
              onClick={() => navigate("/user/dashboard")}
              className="w-full h-12"
            >
              Back to Dashboard
            </Button>
          </div>
        )}

        {!showBvnForm && lastError && (
          <div className="space-y-4">
            <div className="bg-destructive/10 text-destructive border border-destructive/20 rounded-xl p-4">
              <p className="font-semibold mb-2">{lastError}</p>
              <div className="text-sm space-y-1 opacity-90">
                <p className="font-medium">Payvessel API Configuration Issue:</p>
                <ul className="list-disc list-inside ml-2 space-y-1">
                  <li>Business ID may not be activated</li>
                  <li>API credentials need virtual account permissions</li>
                  <li>Selected bank not enabled for your business</li>
                  <li>Service temporarily unavailable</li>
                </ul>
                <p className="mt-2 font-medium">Contact Payvessel support to verify account settings.</p>
              </div>
            </div>
            <div className="flex gap-3">
              <Button onClick={fetchVirtualAccount} className="flex-1">Retry</Button>
              <Button variant="outline" onClick={() => navigate('/user/dashboard')} className="flex-1">Back</Button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
