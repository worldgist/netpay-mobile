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

const airtimeSchema = z.object({
  phone_number: z.string().min(11, "Phone number must be at least 11 digits").max(11, "Phone number must be 11 digits"),
  amount: z.string().min(1, "Amount is required"),
});

interface Network {
  id: string;
  name: string;
  network_id: string;
}

const PurchaseAirtime = () => {
  const navigate = useNavigate();
  const { toast } = useToast();
  const [loading, setLoading] = useState(true);
  const [balance, setBalance] = useState(0);
  const [networks, setNetworks] = useState<Network[]>([]);
  const [selectedNetwork, setSelectedNetwork] = useState("");
  const [phoneNumber, setPhoneNumber] = useState("");
  const [amount, setAmount] = useState("");
  const [showSummary, setShowSummary] = useState(false);
  const [showSuccess, setShowSuccess] = useState(false);
  const [purchasing, setPurchasing] = useState(false);
  const [transactionDetails, setTransactionDetails] = useState<any>(null);
  const [showInsufficientBalance, setShowInsufficientBalance] = useState(false);

  const { register, formState: { errors } } = useForm({
    resolver: zodResolver(airtimeSchema)
  });

  useEffect(() => {
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
          .select('balance')
          .eq('id', session.user.id)
          .single();

        if (profile) {
          setBalance(profile.balance || 0);
        }

        // Fetch networks from SMEPLUG
        const { data: networksData, error: networksError } = await supabase.functions.invoke('fetch-smeplug-networks');
        
        if (networksError) throw networksError;
        
        if (networksData?.success && networksData?.data) {
          setNetworks(networksData.data);
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

  const getNetworkColor = (networkName: string) => {
    const colors: Record<string, string> = {
      'MTN': 'bg-yellow-400',
      'AIRTEL': 'bg-red-500',
      'GLO': 'bg-green-500',
      '9MOBILE': 'bg-emerald-600'
    };
    return colors[networkName.toUpperCase()] || 'bg-primary';
  };

  const getNetworkLogo = (networkName: string) => {
    const logos: Record<string, string> = {
      'MTN': '/mtn.png',
      'AIRTEL': '/airtel.png',
      'GLO': '/glo.png',
      '9MOBILE': '/9mobile.png'
    };
    return logos[networkName.toUpperCase()] || '';
  };

  const handlePurchase = () => {
    if (!phoneNumber || !amount || !selectedNetwork) {
      toast({
        title: "Error",
        description: "Please fill in all fields",
        variant: "destructive",
      });
      return;
    }

    const purchaseAmount = Number(amount);
    if (isNaN(purchaseAmount) || purchaseAmount <= 0) {
      toast({
        title: "Error",
        description: "Please enter a valid amount",
        variant: "destructive",
      });
      return;
    }

    if (balance < purchaseAmount) {
      setShowInsufficientBalance(true);
      return;
    }

    setShowSummary(true);
  };

  const handleConfirmPayment = async () => {
    setPurchasing(true);
    setShowSummary(false);

    try {
      const network = networks.find(n => n.id === selectedNetwork);
      if (!network) throw new Error("Invalid network");

      const { data, error } = await supabase.functions.invoke('purchase-smeplug-airtime', {
        body: {
          phone_number: phoneNumber,
          amount: Number(amount),
          network_id: network.network_id
        }
      });

      if (error) {
        console.error('Supabase function error:', error);
        throw new Error(error.message || 'Failed to connect to server');
      }

      if (!data?.success) {
        const errorMessage = data?.error || data?.message || 'Airtime purchase failed';
        console.error('Purchase failed response:', data);
        throw new Error(errorMessage);
      }

      setTransactionDetails(data.data);
      setShowSuccess(true);

      // Refresh balance
      const { data: { session } } = await supabase.auth.getSession();
      if (session) {
        const { data: profile } = await supabase
          .from('profiles')
          .select('balance')
          .eq('id', session.user.id)
          .single();

        if (profile) {
          setBalance(profile.balance || 0);
        }
      }

      toast({
        title: "Success",
        description: "Airtime purchased successfully",
      });
    } catch (error: any) {
      console.error('Error purchasing airtime:', error);
      const errorMessage = error?.message || error?.error || "Failed to purchase airtime. Please try again.";
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
          <h1 className="text-2xl font-bold">Buy Airtime</h1>
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
            <CardTitle>Select Service Provider</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid grid-cols-4 gap-3">
              {networks.map((network) => (
                <button
                  key={network.id}
                  type="button"
                  className={`aspect-square rounded-lg border-2 p-2 transition-all hover:scale-105 flex flex-col items-center justify-center gap-1 ${
                    selectedNetwork === network.id 
                      ? 'border-primary ring-2 ring-primary ring-offset-2' 
                      : 'border-border hover:border-primary/50'
                  }`}
                  onClick={() => setSelectedNetwork(network.id)}
                >
                  <img 
                    src={getNetworkLogo(network.name)} 
                    alt={network.name}
                    className="w-12 h-12 object-contain"
                  />
                  <span className="text-xs font-medium">{network.name}</span>
                </button>
              ))}
            </div>

            {selectedNetwork && (
              <>
                <div className="space-y-2">
                  <Label htmlFor="phone">Phone Number</Label>
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
                    placeholder="100"
                    value={amount}
                    {...register("amount")}
                    onChange={(e) => setAmount(e.target.value)}
                  />
                  {errors.amount && (
                    <p className="text-sm text-destructive">{String(errors.amount.message)}</p>
                  )}
                </div>

                <Button 
                  className="w-full" 
                  onClick={handlePurchase}
                  disabled={!selectedNetwork || !phoneNumber || !amount || purchasing}
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
                  src={getNetworkLogo(networks.find(n => n.id === selectedNetwork)?.name || '')} 
                  alt={networks.find(n => n.id === selectedNetwork)?.name}
                  className="w-14 h-14 object-contain"
                />
              </div>
            </div>
            <div className="flex justify-between">
              <span>Network:</span>
              <span className="font-semibold">{networks.find(n => n.id === selectedNetwork)?.name}</span>
            </div>
            <div className="flex justify-between">
              <span>Phone Number:</span>
              <span className="font-semibold">{phoneNumber}</span>
            </div>
            <div className="flex justify-between">
              <span>Amount:</span>
              <span className="font-semibold">{formatNaira(Number(amount))}</span>
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
              Your airtime has been purchased successfully
            </DialogDescription>
          </DialogHeader>
          {transactionDetails && (
            <div className="space-y-4">
              <div className="flex justify-between">
                <span>Reference:</span>
                <span className="font-semibold">{transactionDetails.reference}</span>
              </div>
              <div className="flex justify-between">
                <span>Amount:</span>
                <span className="font-semibold">{formatNaira(transactionDetails.amount)}</span>
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
        requiredAmount={Number(amount)}
      />
    </div>
  );
};

export default PurchaseAirtime;
