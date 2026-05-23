import { useState, useEffect, useCallback } from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { ensureProfileExists } from "@/utils/profile";
import { Button } from "@/components/ui/button";
import { ArrowLeft, Copy, Loader2, Building2, User, Info, CheckCircle2, Landmark, CreditCard } from "lucide-react";
import { toast } from "@/hooks/use-toast";

const PAYVESSEL_BUSINESS_ID = "5EE89DA992424C6DA0234577E7E4ECAA";
const DEFAULT_BANK_CODE = "999991";
const DEFAULT_BANK_NAME = "PalmPay";
const ALTERNATE_BANK_CODE = "120001";
const ALTERNATE_BANK_NAME = "9 Payment Service Bank";
const FLUTTERWAVE_BANK_CODE = "FLW";
const FLUTTERWAVE_BANK_NAME = "Flutterwave";

type FundingProvider = "payvessel" | "flutterwave";
type FlutterwaveIdType = "bvn" | "nin";

interface VirtualAccount {
  account_number: string;
  bank_name: string;
  account_name: string;
  bank_code: string;
  tracking_reference?: string | null;
}

export default function AddMoney() {
  const navigate = useNavigate();
  const [selectedFundingProvider, setSelectedFundingProvider] = useState<FundingProvider | null>(null);
  const [virtualAccount, setVirtualAccount] = useState<VirtualAccount | null>(null);
  const [selectedBank, setSelectedBank] = useState<typeof DEFAULT_BANK_CODE | typeof ALTERNATE_BANK_CODE>(DEFAULT_BANK_CODE);
  const [nin, setNin] = useState("");
  const [flutterwaveIdentityNumber, setFlutterwaveIdentityNumber] = useState("");
  const [flutterwaveIdType, setFlutterwaveIdType] = useState<FlutterwaveIdType>("bvn");
  const [loading, setLoading] = useState(true);
  const [creating, setCreating] = useState(false);
  const [showCreateForm, setShowCreateForm] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [isCheckingBalance, setIsCheckingBalance] = useState(false);

  const resolveDefaultFundingProvider = useCallback(async () => {
    if (selectedFundingProvider) return;

    try {
      const { data: sessionData, error: sessionError } = await supabase.auth.getSession();
      if (sessionError) throw sessionError;

      const session = sessionData.session;
      if (!session) {
        navigate("/user/auth");
        return;
      }

      const { data: defaultAccount, error: defaultAccountError } = await supabase
        .from("virtual_accounts")
        .select("bank_code")
        .eq("user_id", session.user.id)
        .order("updated_at", { ascending: false })
        .limit(1)
        .maybeSingle();

      if (defaultAccountError && defaultAccountError.code !== "PGRST116") {
        throw defaultAccountError;
      }

      if (!defaultAccount) {
        setSelectedFundingProvider("payvessel");
        return;
      }

      const defaultBankCode = defaultAccount.bank_code;
      const provider: FundingProvider = defaultBankCode === FLUTTERWAVE_BANK_CODE ? "flutterwave" : "payvessel";

      if (provider === "payvessel" && (defaultBankCode === DEFAULT_BANK_CODE || defaultBankCode === ALTERNATE_BANK_CODE)) {
        setSelectedBank(defaultBankCode as typeof DEFAULT_BANK_CODE | typeof ALTERNATE_BANK_CODE);
      }

      setSelectedFundingProvider(provider);
    } catch (err) {
      console.error("Failed to resolve default funding provider:", err);
      setSelectedFundingProvider("payvessel");
    }
  }, [navigate, selectedFundingProvider]);

  const fetchVirtualAccount = useCallback(async () => {
    if (!selectedFundingProvider) {
      setLoading(false);
      return;
    }

    setLoading(true);
    try {
      setError(null);

      const { data: sessionData, error: sessionError } = await supabase.auth.getSession();
      if (sessionError) throw sessionError;

      const session = sessionData.session;
      if (!session) {
        navigate("/user/auth");
        return;
      }

      await ensureProfileExists(session.user);

      const activeBankCode = selectedFundingProvider === "flutterwave" ? FLUTTERWAVE_BANK_CODE : selectedBank;

      const { data: existingAccount, error: accountError } = await supabase
        .from("virtual_accounts")
        .select("account_number, bank_name, account_name, bank_code, tracking_reference")
        .eq("user_id", session.user.id)
        .eq("bank_code", activeBankCode)
        .maybeSingle();

      if (accountError && accountError.code !== "PGRST116") throw accountError;

      if (existingAccount) {
        setVirtualAccount(existingAccount as VirtualAccount);
        setShowCreateForm(false);
      } else {
        setVirtualAccount(null);
        setShowCreateForm(true);
      }
    } catch (err) {
      console.error("Error checking virtual account:", err);
      setVirtualAccount(null);
      setShowCreateForm(true);
      setError(err instanceof Error ? err.message : "Failed to load account information");
      toast({
        title: "Error",
        description: err instanceof Error ? err.message : "Failed to load account information",
        variant: "destructive",
      });
    } finally {
      setLoading(false);
    }
  }, [navigate, selectedBank, selectedFundingProvider]);

  useEffect(() => {
    resolveDefaultFundingProvider();
  }, [resolveDefaultFundingProvider]);

  useEffect(() => {
    fetchVirtualAccount();
  }, [fetchVirtualAccount]);

  const handleCreateVirtualAccount = async () => {
    if (!selectedFundingProvider) {
      toast({
        title: "Provider Required",
        description: "Please select a funding provider first.",
        variant: "destructive",
      });
      return;
    }

    if (selectedFundingProvider === "payvessel" && nin.trim().length !== 11) {
      toast({
        title: "NIN Required",
        description: "Please enter your 11-digit NIN to create a virtual account.",
        variant: "destructive",
      });
      return;
    }

    if (selectedFundingProvider === "flutterwave" && flutterwaveIdentityNumber.trim().length !== 11) {
      toast({
        title: `${flutterwaveIdType.toUpperCase()} Required`,
        description: `Please enter your 11-digit ${flutterwaveIdType.toUpperCase()} to create a Flutterwave virtual account.`,
        variant: "destructive",
      });
      return;
    }

    setCreating(true);
    try {
      setError(null);

      const { data: sessionData, error: sessionError } = await supabase.auth.getSession();
      if (sessionError) throw sessionError;

      const session = sessionData.session;
      if (!session) {
        navigate("/user/auth");
        return;
      }

      const profile = await ensureProfileExists(session.user);
      const userId = session.user.id;
      const fullName = profile?.full_name || session.user.email?.split("@")[0] || "User";
      const phoneNumber = profile?.phone || "07067398399";
      const emailAddress = profile?.email || session.user.email || "";

      const functionName = selectedFundingProvider === "payvessel" ? "get-virtual-account" : "get-flutterwave-virtual-account";
      const requestBody =
        selectedFundingProvider === "payvessel"
          ? {
              email: emailAddress,
              name: fullName,
              phoneNumber,
              bankcode: [selectedBank],
              account_type: "STATIC",
              nin: nin.trim(),
            }
          : {
              email: emailAddress,
              name: fullName,
              phoneNumber,
              bvn: flutterwaveIdType === "bvn" ? flutterwaveIdentityNumber.trim() : undefined,
              nin: flutterwaveIdType === "nin" ? flutterwaveIdentityNumber.trim() : undefined,
              idType: flutterwaveIdType,
            };

      const { data, error: invokeError } = await supabase.functions.invoke(functionName, {
        body: requestBody,
      });

      if (invokeError) throw invokeError;

      if (!data?.success || !data.data) {
        throw new Error(data?.error || "Failed to create virtual account. Please try again later.");
      }

      const account = data.data;
      const bankName =
        account.bank_name ||
        (selectedFundingProvider === "payvessel"
          ? selectedBank === DEFAULT_BANK_CODE
            ? DEFAULT_BANK_NAME
            : ALTERNATE_BANK_NAME
          : FLUTTERWAVE_BANK_NAME);
      const bankCode = selectedFundingProvider === "payvessel" ? selectedBank : FLUTTERWAVE_BANK_CODE;
      const businessId = selectedFundingProvider === "payvessel" ? PAYVESSEL_BUSINESS_ID : "FLUTTERWAVE";

      const { error: upsertError } = await supabase.from("virtual_accounts").upsert(
        {
          user_id: userId,
          business_id: businessId,
          bank_code: bankCode,
          bank_name: bankName,
          account_number: account.account_number,
          account_name: account.account_name,
          tracking_reference: account.trackingReference || account.tracking_reference || null,
          nin:
            selectedFundingProvider === "payvessel"
              ? nin.trim()
              : flutterwaveIdType === "nin"
                ? flutterwaveIdentityNumber.trim()
                : null,
          bvn:
            selectedFundingProvider === "flutterwave" && flutterwaveIdType === "bvn"
              ? flutterwaveIdentityNumber.trim()
              : null,
          updated_at: new Date().toISOString(),
        } as never,
        { onConflict: "user_id,bank_code" }
      );

      if (upsertError) throw upsertError;

      setVirtualAccount({
        account_number: account.account_number,
        account_name: account.account_name,
        bank_name: bankName,
        bank_code: bankCode,
        tracking_reference: account.trackingReference || account.tracking_reference || null,
      });
      setShowCreateForm(false);
      setNin("");
      setFlutterwaveIdentityNumber("");

      toast({
        title: "Success!",
        description: `${selectedFundingProvider === "payvessel" ? "PayVessel" : "Flutterwave"} virtual account created successfully`,
      });
    } catch (err) {
      console.error("Error creating virtual account:", err);
      const message = err instanceof Error ? err.message : "Failed to create virtual account";
      setError(message);
      toast({
        title: "Error",
        description: message,
        variant: "destructive",
      });
    } finally {
      setCreating(false);
    }
  };

  const copyToClipboard = async (text: string, label: string) => {
    await navigator.clipboard.writeText(text);
    toast({
      title: "Copied!",
      description: `${label} copied to clipboard`,
    });
  };

  const handleCheckBalance = async () => {
    setIsCheckingBalance(true);
    try {
      const { data: { session }, error: sessionError } = await supabase.auth.getSession();

      if (sessionError) {
        throw new Error(`Authentication error: ${sessionError.message || "Unable to verify session"}`);
      }

      if (!session || !session.user) {
        navigate("/user/auth");
        return;
      }

      const isDemoUser = session.user.email === "demo@netpayy.ng";
      if (isDemoUser) {
        try {
          const { data, error: creditError } = await supabase.functions.invoke("demo-auto-credit", { body: {} });
          if (!creditError && data?.success) {
            navigate("/user/dashboard");
            toast({
              title: "Demo Wallet Credited!",
              description: `₦50,000 has been credited to your demo wallet. Current balance: ₦${data.balanceAfter?.toLocaleString() || "50,000"}`,
            });
            return;
          }
        } catch (demoError) {
          console.warn("Demo auto-credit error:", demoError);
        }
      }

      const { data: profile, error: profileError } = await supabase
        .from("profiles")
        .select("balance")
        .eq("id", session.user.id)
        .single();

      if (profileError) {
        throw new Error(`Failed to fetch balance: ${profileError.message || "Unable to load profile"}`);
      }

      const newBalance = Number(profile?.balance || 0);
      navigate("/user/dashboard");
      toast({
        title: "Checking...",
        description: `Your current balance is ₦${newBalance.toLocaleString()}. If you just transferred, it may take a few moments to reflect.`,
      });
    } catch (err) {
      navigate("/user/dashboard");
      toast({
        title: "Error",
        description: err instanceof Error ? err.message : "Failed to check balance. Please try again.",
        variant: "destructive",
      });
    } finally {
      setIsCheckingBalance(false);
    }
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <div className="text-center">
          <Loader2 className="w-12 h-12 text-primary animate-spin mx-auto mb-4" />
          <p className="text-muted-foreground">Loading your funding options...</p>
        </div>
      </div>
    );
  }

  const activeBankLabel =
    selectedFundingProvider === "flutterwave"
      ? FLUTTERWAVE_BANK_NAME
      : selectedBank === DEFAULT_BANK_CODE
        ? DEFAULT_BANK_NAME
        : ALTERNATE_BANK_NAME;

  return (
    <div className="min-h-screen bg-background">
      <div className="bg-card border-b sticky top-0 z-10">
        <div className="flex items-center justify-center px-6 py-4 relative">
          <button
            onClick={() => navigate("/user/dashboard")}
            className="absolute left-6 text-foreground hover:text-primary transition-colors"
          >
            <ArrowLeft className="w-6 h-6" />
          </button>
          <h1 className="text-xl font-bold text-foreground">Add Money</h1>
        </div>
      </div>

      <div className="px-6 py-6 max-w-md mx-auto space-y-6">
        <div className="bg-primary/10 rounded-xl p-4 flex items-start gap-3">
          <Info className="w-5 h-5 text-primary shrink-0 mt-0.5" />
          <div className="text-sm text-foreground">
            <p className="font-semibold mb-1">Choose a funding provider</p>
            <p>Create a dedicated virtual account and transfer into it to fund your wallet.</p>
          </div>
        </div>

        <div className="grid grid-cols-2 gap-3">
          <Button
            variant={selectedFundingProvider === "payvessel" ? "default" : "outline"}
            className="h-14"
            onClick={() => setSelectedFundingProvider("payvessel")}
          >
            <Landmark className="w-4 h-4 mr-2" />
            PayVessel
          </Button>
          <Button
            variant={selectedFundingProvider === "flutterwave" ? "default" : "outline"}
            className="h-14"
            onClick={() => setSelectedFundingProvider("flutterwave")}
          >
            <CreditCard className="w-4 h-4 mr-2" />
            Flutterwave
          </Button>
        </div>

        {selectedFundingProvider === "payvessel" && (
          <div className="flex items-center gap-3">
            <Button
              variant={selectedBank === DEFAULT_BANK_CODE ? "default" : "outline"}
              onClick={() => setSelectedBank(DEFAULT_BANK_CODE)}
              size="sm"
            >
              PalmPay
            </Button>
            <Button
              variant={selectedBank === ALTERNATE_BANK_CODE ? "default" : "outline"}
              onClick={() => setSelectedBank(ALTERNATE_BANK_CODE)}
              size="sm"
            >
              9PSB
            </Button>
          </div>
        )}

        {selectedFundingProvider === "flutterwave" && (
          <div className="flex items-center gap-3">
            <Button
              variant={flutterwaveIdType === "bvn" ? "default" : "outline"}
              onClick={() => {
                setFlutterwaveIdType("bvn");
                setFlutterwaveIdentityNumber("");
              }}
              size="sm"
            >
              BVN
            </Button>
            <Button
              variant={flutterwaveIdType === "nin" ? "default" : "outline"}
              onClick={() => {
                setFlutterwaveIdType("nin");
                setFlutterwaveIdentityNumber("");
              }}
              size="sm"
            >
              NIN
            </Button>
          </div>
        )}

        {showCreateForm ? (
          <div className="space-y-6">
            <div className="bg-card rounded-2xl border shadow-sm p-6 space-y-4">
              {selectedFundingProvider === "payvessel" ? (
                <div className="space-y-2">
                  <label className="text-sm font-medium text-foreground">NIN (National Identity Number)</label>
                  <input
                    type="text"
                    value={nin}
                    onChange={(e) => setNin(e.target.value.replace(/\D/g, "").slice(0, 11))}
                    placeholder="Enter your 11-digit NIN"
                    className="w-full px-4 py-3 rounded-lg border bg-background text-foreground focus:outline-none focus:ring-2 focus:ring-primary"
                    maxLength={11}
                  />
                  <p className="text-xs text-muted-foreground">Required for PayVessel account verification</p>
                </div>
              ) : (
                <div className="space-y-2">
                  <label className="text-sm font-medium text-foreground">{flutterwaveIdType.toUpperCase()}</label>
                  <input
                    type="text"
                    value={flutterwaveIdentityNumber}
                    onChange={(e) => setFlutterwaveIdentityNumber(e.target.value.replace(/\D/g, "").slice(0, 11))}
                    placeholder={`Enter your 11-digit ${flutterwaveIdType.toUpperCase()}`}
                    className="w-full px-4 py-3 rounded-lg border bg-background text-foreground focus:outline-none focus:ring-2 focus:ring-primary"
                    maxLength={11}
                  />
                  <p className="text-xs text-muted-foreground">Required for Flutterwave account verification</p>
                </div>
              )}

              <Button
                onClick={handleCreateVirtualAccount}
                disabled={creating}
                className="w-full h-12"
              >
                {creating ? (
                  <>
                    <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                    Creating Account...
                  </>
                ) : (
                  `Create ${selectedFundingProvider === "payvessel" ? "PayVessel" : "Flutterwave"} Account`
                )}
              </Button>
            </div>

            <div className="bg-green-50 dark:bg-green-950/20 border border-green-200 dark:border-green-800 rounded-lg p-4">
              <p className="text-sm text-green-800 dark:text-green-200">
                <strong>Secure:</strong> Your identity information is encrypted and only used for account verification.
              </p>
            </div>

            <Button
              variant="outline"
              onClick={handleCheckBalance}
              disabled={isCheckingBalance}
              className="w-full"
            >
              {isCheckingBalance ? (
                <>
                  <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                  Checking balance...
                </>
              ) : (
                "I have added the money"
              )}
            </Button>
          </div>
        ) : null}

        {virtualAccount ? (
          <div className="space-y-6">
            <div className="bg-amber-50 dark:bg-amber-950/20 border border-amber-200 dark:border-amber-800 rounded-xl p-4">
              <div className="flex items-start gap-3">
                <Info className="w-5 h-5 text-amber-600 dark:text-amber-400 shrink-0 mt-0.5" />
                <div className="flex-1">
                  <p className="text-sm font-semibold text-amber-900 dark:text-amber-100 mb-1">Funding Fee Notice</p>
                  <p className="text-xs text-amber-800 dark:text-amber-200">
                    A 5% processing fee (minimum ₦10) will be deducted from your transfer amount before wallet credit.
                  </p>
                </div>
              </div>
            </div>

            <div className="bg-card rounded-2xl border shadow-sm divide-y">
              <div className="p-4 flex items-center gap-4">
                <div className="w-12 h-12 rounded-full bg-primary/10 flex items-center justify-center shrink-0">
                  <Building2 className="w-6 h-6 text-primary" />
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-sm text-muted-foreground mb-1">{activeBankLabel} Account Number</p>
                  <p className="text-lg font-semibold text-foreground">{virtualAccount.account_number || "N/A"}</p>
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

              <div className="p-4 flex items-center gap-4">
                <div className="w-12 h-12 rounded-full bg-primary/10 flex items-center justify-center shrink-0">
                  <Building2 className="w-6 h-6 text-primary" />
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-sm text-muted-foreground mb-1">Bank Name</p>
                  <p className="text-lg font-semibold text-foreground">{virtualAccount.bank_name || "N/A"}</p>
                </div>
                <div className="shrink-0 flex items-center gap-1 text-green-600 bg-green-50 dark:bg-green-950/20 px-3 py-1.5 rounded-full">
                  <CheckCircle2 className="w-4 h-4" />
                  <span className="text-xs font-medium">Ready</span>
                </div>
              </div>

              <div className="p-4 flex items-center gap-4">
                <div className="w-12 h-12 rounded-full bg-primary/10 flex items-center justify-center shrink-0">
                  <User className="w-6 h-6 text-primary" />
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-sm text-muted-foreground mb-1">Account Name</p>
                  <p className="text-lg font-semibold text-foreground break-words">{virtualAccount.account_name || "N/A"}</p>
                </div>
              </div>
            </div>

            <div className="bg-accent rounded-xl p-4 space-y-3">
              <h3 className="font-semibold text-accent-foreground">How to add money:</h3>
              <ol className="space-y-2 text-sm text-muted-foreground">
                <li className="flex gap-2"><span className="font-bold text-primary">1.</span><span>Copy the account number above</span></li>
                <li className="flex gap-2"><span className="font-bold text-primary">2.</span><span>Open your bank app and make a transfer</span></li>
                <li className="flex gap-2"><span className="font-bold text-primary">3.</span><span>Your wallet will be credited automatically</span></li>
              </ol>
            </div>

            <div className="bg-yellow-50 dark:bg-yellow-950/20 border border-yellow-200 dark:border-yellow-800 rounded-lg p-4">
              <p className="text-sm text-yellow-800 dark:text-yellow-200">
                <strong>Note:</strong> This is your dedicated virtual account. All transfers to this account will be automatically credited to your wallet.
              </p>
            </div>

            <Button
              onClick={handleCheckBalance}
              disabled={isCheckingBalance}
              className="w-full h-12"
            >
              {isCheckingBalance ? (
                <>
                  <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                  Checking balance...
                </>
              ) : (
                "I have added the money"
              )}
            </Button>
          </div>
        ) : null}

        {!virtualAccount && !showCreateForm && error && (
          <div className="space-y-4">
            <div className="bg-destructive/10 text-destructive border border-destructive/20 rounded-xl p-4">
              <p className="font-semibold mb-2">{error}</p>
              <p className="text-sm opacity-90">Unable to load or create a virtual account right now. Please try again.</p>
            </div>
            <div className="flex gap-3">
              <Button onClick={fetchVirtualAccount} className="flex-1">Retry</Button>
              <Button variant="outline" onClick={() => navigate("/user/dashboard")} className="flex-1">Back</Button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
