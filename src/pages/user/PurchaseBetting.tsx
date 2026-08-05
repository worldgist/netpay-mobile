import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { ensureProfileExists } from "@/utils/profile";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { useToast } from "@/hooks/use-toast";
import { formatNaira } from "@/lib/currency";
import { InsufficientBalanceModal } from "@/components/InsufficientBalanceModal";
import { z } from "zod";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";

const bettingSchema = z.object({
  account_number: z.string().min(1, "Account number is required"),
  amount: z.string().min(1, "Amount is required"),
  phone_number: z.string().min(11, "Phone number must be at least 11 digits").max(11, "Phone number must be 11 digits").optional(),
});

interface BettingProvider {
  id: string;
  name: string;
  logo: string;
  providerCode: string;
}

const ALL_PROVIDERS: BettingProvider[] = [
  { id: 'bet9ja', name: 'Bet9ja', logo: '/bet9ja.png', providerCode: 'BET9JA' },
  { id: 'nairabet', name: 'Nairabet', logo: '/nairabet.png', providerCode: 'NAIRABET' },
  { id: '1xbet', name: '1xBet', logo: '/1xbet.png', providerCode: '1XBET' },
  { id: 'betking', name: 'BetKing', logo: '/betking.png', providerCode: 'BETKING' },
  { id: 'betway', name: 'Betway', logo: '/betway.png', providerCode: 'BETWAY' },
  { id: 'merrybet', name: 'MerryBet', logo: '/merrybet.png', providerCode: 'MERRYBET' },
  { id: 'bangbet', name: 'BangBet', logo: '/bangbet.png', providerCode: 'BANGBET' },
  { id: 'betland', name: 'BetLand', logo: '/betland.png', providerCode: 'BETLAND' },
  { id: 'betlion', name: 'BetLion', logo: '/betlion.png', providerCode: 'BETLION' },
  { id: 'cloudbet', name: 'CloudBet', logo: '/cloudbet.png', providerCode: 'CLOUDBET' },
  { id: 'livescorebet', name: 'LiveScoreBet', logo: '/livescorebet.png', providerCode: 'LIVESCOREBET' },
  { id: 'naijabet', name: 'NaijaBet', logo: '/naijabet.png', providerCode: 'NAIJABET' },
  { id: 'supabet', name: 'SupaBet', logo: '/supabet.png', providerCode: 'SUPABET' },
];

const EBILLS_SUPPORTED_PROVIDERS = [
  '1XBET',
  'BANGBET',
  'BET9JA',
  'BETKING',
  'BETLAND',
  'BETLION',
  'BETWAY',
  'CLOUDBET',
  'LIVESCOREBET',
  'MERRYBET',
  'NAIJABET',
  'NAIRABET',
  'SUPABET',
];

const providers = ALL_PROVIDERS.filter((provider) =>
  EBILLS_SUPPORTED_PROVIDERS.includes(provider.providerCode),
);

const normalizePhoneNumber = (value: string) => {
  let normalized = value.trim().replace(/\s+/g, "");

  if (normalized.startsWith("+234")) {
    normalized = `0${normalized.slice(4)}`;
  } else if (normalized.startsWith("234") && normalized.length === 13) {
    normalized = `0${normalized.slice(3)}`;
  }

  normalized = normalized.replace(/[^0-9]/g, "");
  return normalized;
};

const isValidNigerianPhone = (value: string) => /^0\d{10}$/.test(value);

const PurchaseBetting = () => {
  const navigate = useNavigate();
  const { toast } = useToast();
  const [loading, setLoading] = useState(true);
  const [balance, setBalance] = useState(0);
  const [selectedProvider, setSelectedProvider] = useState("");
  const [accountNumber, setAccountNumber] = useState("");
  const [phoneNumber, setPhoneNumber] = useState("");
  const [amount, setAmount] = useState("");
  const [showSummary, setShowSummary] = useState(false);
  const [showSuccess, setShowSuccess] = useState(false);
  const [purchasing, setPurchasing] = useState(false);
  const [transactionDetails, setTransactionDetails] = useState<any>(null);
  const [showInsufficientBalance, setShowInsufficientBalance] = useState(false);
  const [verifiedCustomerName, setVerifiedCustomerName] = useState("");

  const { register, formState: { errors } } = useForm({
    resolver: zodResolver(bettingSchema)
  });

  useEffect(() => {
    // Debug: Log providers to ensure they're defined
    console.log('Betting providers:', providers);
    
    const fetchInitialData = async () => {
      try {
        const { data: { session } } = await supabase.auth.getSession();
        
        if (!session) {
          navigate('/user/auth');
          return;
        }

        await ensureProfileExists(session.user);

        // Fetch balance
        const { data: profile } = await supabase
          .from('profiles')
          .select('balance, phone')
          .eq('id', session.user.id)
          .single();

        if (profile) {
          setBalance(profile.balance || 0);
          setPhoneNumber(profile.phone || '');
        }

        setLoading(false);

        // Subscribe to balance updates
        const channel = supabase
          .channel('balance-changes')
          .on('postgres_changes', {
            event: 'UPDATE',
            schema: 'public',
            table: 'profiles',
            filter: `id=eq.${session.user.id}`
          }, (payload) => {
            setBalance(payload.new.balance || 0);
          })
          .subscribe();

        return () => {
          supabase.removeChannel(channel);
        };
      } catch (error) {
        console.error('Error fetching initial data:', error);
        toast({
          title: "Error",
          description: "Failed to load data. Please refresh the page.",
          variant: "destructive",
        });
        setLoading(false);
      }
    };

    fetchInitialData();
  }, [navigate, toast]);

  const handlePurchase = async () => {
    if (!accountNumber || !amount || !selectedProvider) {
      toast({
        title: "Error",
        description: "Please fill in all required fields",
        variant: "destructive",
      });
      return;
    }

    if (phoneNumber.trim()) {
      const normalizedPhone = normalizePhoneNumber(phoneNumber);
      if (!isValidNigerianPhone(normalizedPhone)) {
        toast({
          title: "Error",
          description: "Please enter a valid 11-digit phone number (e.g. 08012345678)",
          variant: "destructive",
        });
        return;
      }

      if (normalizedPhone !== phoneNumber) {
        setPhoneNumber(normalizedPhone);
      }
    }

    const purchaseAmount = Number(amount);
    if (isNaN(purchaseAmount) || purchaseAmount < 100) {
      toast({
        title: "Error",
        description: "Minimum amount is ₦100",
        variant: "destructive",
      });
      return;
    }

    const CHARGE_FEE_RATE = 0.1;
    const chargeFee = Math.round(purchaseAmount * CHARGE_FEE_RATE * 100) / 100;
    const totalAmount = purchaseAmount + chargeFee;

    if (balance < totalAmount) {
      setShowInsufficientBalance(true);
      return;
    }

    try {
      const provider = providers.find((p) => p.id === selectedProvider);
      if (!provider) {
        throw new Error('Invalid provider selected');
      }

      const { data, error } = await supabase.functions.invoke('verify-ebills-betting-customer', {
        body: {
          customer_id: accountNumber.trim(),
          betting_provider: provider.providerCode,
        },
      });

      if (error) {
        throw new Error(error.message || 'Unable to verify betting account');
      }

      if (data?.success === false || data?.error) {
        throw new Error(data?.error || data?.message || 'Unable to verify betting account');
      }

      setVerifiedCustomerName(data?.data?.customer_name || '');
    } catch (verifyError: any) {
      toast({
        title: 'Verification Failed',
        description: verifyError?.message || 'Unable to verify account. Please check your account and try again.',
        variant: 'destructive',
      });
      return;
    }

    setShowSummary(true);
  };

  const handleConfirmPayment = async () => {
    setPurchasing(true);
    setShowSummary(false);

    try {
      const provider = providers.find(p => p.id === selectedProvider);
      if (!provider) throw new Error("Invalid provider");

      // Calculate charge fee (10% for betting - consistent with eBills)
      const CHARGE_FEE_RATE = 0.1; // 10% charge fee
      const purchaseAmount = Number(amount);
      const chargeFee = Math.round(purchaseAmount * CHARGE_FEE_RATE * 100) / 100;
      const totalAmount = purchaseAmount + chargeFee;

      // Check balance again with total amount including fee
      if (balance < totalAmount) {
        setShowInsufficientBalance(true);
        setPurchasing(false);
        return;
      }

      const { data: { session } } = await supabase.auth.getSession();
      if (!session) throw new Error("Session expired");

      const requestId = `req_${Date.now()}_${session.user.id.substring(0, 8)}`;
      const { data, error } = await supabase.functions.invoke('purchase-ebills-betting', {
        body: {
          customer_id: accountNumber.trim(),
          betting_provider: provider.providerCode,
          amount: Number(purchaseAmount),
          request_id: requestId,
        },
      });

      if (error) {
        throw new Error(error.message || 'Unable to process betting purchase');
      }

      if (!data?.success) {
        throw new Error(data?.error || data?.message || 'Betting purchase failed');
      }

      const purchaseData = data.data || {};

      setTransactionDetails({
        provider_name: provider.name,
        account_number: purchaseData.account_number || accountNumber,
        reference: purchaseData.reference || purchaseData.request_id,
        purchase_amount: purchaseData.purchase_amount ?? purchaseAmount,
        charge_fee: purchaseData.charge_fee ?? chargeFee,
        amount: purchaseData.amount ?? totalAmount,
        balance_after: purchaseData.balance_after,
        customer_name: verifiedCustomerName,
      });

      const { data: profile } = await supabase
        .from('profiles')
        .select('balance')
        .eq('id', session.user.id)
        .single();

      if (profile) {
        setBalance(profile.balance || 0);
      }

      setShowSuccess(true);

      toast({
        title: 'Success',
        description: 'Betting purchase completed successfully',
      });
    } catch (error: any) {
      console.error('Error purchasing betting:', error);
      const errorMessage = error?.message || error?.error || "Failed to complete betting purchase. Please try again.";
      toast({
        title: "Purchase Failed",
        description: errorMessage,
        variant: "destructive",
      });
    } finally {
      setPurchasing(false);
    }
  };

  const handleDone = () => {
    setShowSuccess(false);
    navigate('/user/transactions');
  };

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary"></div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background p-4 pb-20">
      <div className="max-w-md mx-auto space-y-6">
        <div className="flex items-center justify-between">
          <h1 className="text-2xl font-bold">Betting Purchase</h1>
          <Button variant="ghost" onClick={() => navigate('/user/dashboard')}>
            Back
          </Button>
        </div>

        <Card>
          <CardHeader>
            <CardTitle>Available Balance</CardTitle>
            <CardDescription className="text-2xl font-bold text-primary">
              {formatNaira(balance)}
            </CardDescription>
          </CardHeader>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Select Betting Provider</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            {providers.length === 0 && (
              <p className="text-center text-muted-foreground py-4">No betting providers available</p>
            )}
            <div className="grid grid-cols-4 gap-3 min-h-[200px]">
              {providers.map((provider) => (
                <button
                  key={provider.id}
                  type="button"
                  className={`aspect-square rounded-lg border-2 p-2 transition-all hover:scale-105 flex flex-col items-center justify-center gap-1 min-h-[80px] ${
                    selectedProvider === provider.id 
                      ? 'border-primary ring-2 ring-primary ring-offset-2 bg-primary/5' 
                      : 'border-border hover:border-primary/50 bg-card'
                  }`}
                  onClick={() => {
                    console.log('Selected provider:', provider);
                    setSelectedProvider(provider.id);
                  }}
                >
                  <div className="w-12 h-12 flex items-center justify-center flex-shrink-0">
                    <img 
                      src={provider.logo} 
                      alt={provider.name}
                      className="w-full h-full object-contain max-w-full max-h-full"
                      onError={(e) => {
                        // Fallback if image doesn't load - show provider name instead
                        const target = e.target as HTMLImageElement;
                        const parent = target.parentElement;
                        if (parent) {
                          parent.innerHTML = `<span class="text-lg font-bold text-center text-primary">${provider.name.substring(0, 3)}</span>`;
                        }
                      }}
                      onLoad={() => console.log('Image loaded:', provider.logo)}
                    />
                  </div>
                  <span className="text-xs font-medium text-center leading-tight break-words">{provider.name}</span>
                </button>
              ))}
            </div>

            {selectedProvider && (
              <>
                <div className="space-y-2">
                  <Label htmlFor="account">Account Number/Username</Label>
                  <Input
                    id="account"
                    type="text"
                    placeholder="Enter account number or username"
                    value={accountNumber}
                    {...register("account_number")}
                    onChange={(e) => setAccountNumber(e.target.value)}
                  />
                  {errors.account_number && (
                    <p className="text-sm text-destructive">{String(errors.account_number.message)}</p>
                  )}
                </div>

                <div className="space-y-2">
                  <Label htmlFor="phone">Phone Number (Optional)</Label>
                  <Input
                    id="phone"
                    type="tel"
                    placeholder="08012345678"
                    value={phoneNumber}
                    {...register("phone_number")}
                    onChange={(e) => setPhoneNumber(e.target.value)}
                  />
                  {errors.phone_number && (
                    <p className="text-sm text-destructive">{String(errors.phone_number.message)}</p>
                  )}
                </div>

                <div className="space-y-2">
                  <Label htmlFor="amount">Amount (₦)</Label>
                  <Input
                    id="amount"
                    type="number"
                    placeholder="Minimum ₦100"
                    value={amount}
                    {...register("amount")}
                    onChange={(e) => setAmount(e.target.value)}
                  />
                  {errors.amount && (
                    <p className="text-sm text-destructive">{String(errors.amount.message)}</p>
                  )}
                  <p className="text-xs text-muted-foreground">
                    A 10% service charge will be applied
                  </p>
                </div>

                <Button 
                  className="w-full" 
                  onClick={handlePurchase}
                  disabled={!selectedProvider || !accountNumber || !amount || purchasing}
                >
                  {purchasing ? "Processing..." : "Continue"}
                </Button>
              </>
            )}
          </CardContent>
        </Card>
      </div>

      {/* Purchase Summary Dialog */}
      <Dialog open={showSummary} onOpenChange={setShowSummary}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Confirm Purchase</DialogTitle>
            <DialogDescription>
              Please review your purchase details
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <div className="flex justify-center py-4">
              <div className="w-20 h-20 rounded-full bg-muted flex items-center justify-center">
                <img 
                  src={providers.find(p => p.id === selectedProvider)?.logo} 
                  alt={providers.find(p => p.id === selectedProvider)?.name}
                  className="w-14 h-14 object-contain"
                  onError={(e) => {
                    const target = e.target as HTMLImageElement;
                    target.style.display = 'none';
                  }}
                />
              </div>
            </div>
            <div className="flex justify-between">
              <span>Provider:</span>
              <span className="font-semibold">{providers.find(p => p.id === selectedProvider)?.name}</span>
            </div>
            <div className="flex justify-between">
              <span>Account Number:</span>
              <span className="font-semibold">{accountNumber}</span>
            </div>
            {verifiedCustomerName && (
              <div className="flex justify-between">
                <span>Customer:</span>
                <span className="font-semibold">{verifiedCustomerName}</span>
              </div>
            )}
            {phoneNumber && (
              <div className="flex justify-between">
                <span>Phone Number:</span>
                <span className="font-semibold">{phoneNumber}</span>
              </div>
            )}
            <div className="flex justify-between">
              <span>Purchase Amount:</span>
              <span className="font-semibold">{formatNaira(Number(amount))}</span>
            </div>
            <div className="flex justify-between text-sm text-muted-foreground">
              <span>Service Charge (10%):</span>
              <span>{formatNaira(Math.round(Number(amount) * 0.1 * 100) / 100)}</span>
            </div>
            <div className="flex justify-between border-t pt-2 font-semibold">
              <span>Total Amount:</span>
              <span className="text-primary">{formatNaira(Number(amount) + Math.round(Number(amount) * 0.1 * 100) / 100)}</span>
            </div>
            <div className="flex gap-3 mt-4">
              <Button variant="outline" onClick={() => setShowSummary(false)} className="flex-1">
                Cancel
              </Button>
              <Button onClick={handleConfirmPayment} className="flex-1" disabled={purchasing}>
                {purchasing ? "Processing..." : "Confirm"}
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      {/* Success Dialog */}
      <Dialog open={showSuccess} onOpenChange={setShowSuccess}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Purchase Successful!</DialogTitle>
            <DialogDescription>
              Your betting purchase has been completed successfully
            </DialogDescription>
          </DialogHeader>
          {transactionDetails && (
            <div className="space-y-4">
              <div className="flex justify-between">
                <span>Provider:</span>
                <span className="font-semibold">{transactionDetails.provider_name}</span>
              </div>
              <div className="flex justify-between">
                <span>Account Number:</span>
                <span className="font-semibold">{transactionDetails.account_number}</span>
              </div>
              <div className="flex justify-between">
                <span>Reference:</span>
                <span className="font-semibold">{transactionDetails.reference}</span>
              </div>
              <div className="flex justify-between">
                <span>Purchase Amount:</span>
                <span className="font-semibold">{formatNaira(transactionDetails.purchase_amount)}</span>
              </div>
              <div className="flex justify-between text-sm text-muted-foreground">
                <span>Service Charge:</span>
                <span>{formatNaira(transactionDetails.charge_fee)}</span>
              </div>
              <div className="flex justify-between border-t pt-2 font-semibold">
                <span>Total Amount:</span>
                <span>{formatNaira(transactionDetails.amount)}</span>
              </div>
              <div className="flex justify-between">
                <span>New Balance:</span>
                <span className="font-semibold">{formatNaira(transactionDetails.balance_after)}</span>
              </div>
              <Button onClick={handleDone} className="w-full">
                Done
              </Button>
            </div>
          )}
        </DialogContent>
      </Dialog>

      <InsufficientBalanceModal
        open={showInsufficientBalance}
        onOpenChange={setShowInsufficientBalance}
        currentBalance={balance}
        requiredAmount={Number(amount) + Math.round(Number(amount) * 0.1 * 100) / 100}
      />
    </div>
  );
};

export default PurchaseBetting;

