import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { ensureProfileExists } from "@/utils/profile";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { useToast } from "@/hooks/use-toast";
import { formatNaira } from "@/lib/currency";
import { z } from "zod";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { CheckCircle, Loader2 } from "lucide-react";

const electricitySchema = z.object({
  meter_number: z.string().min(10, "Meter number must be at least 10 digits"),
  amount: z.string().min(1, "Amount is required"),
  phone: z.string().min(11, "Phone number must be at least 11 digits").max(11, "Phone number must be 11 digits"),
});

interface ElectricityProvider {
  id: string;
  name: string;
  logo: string;
}

const providers: ElectricityProvider[] = [
  { id: 'IKEDC', name: 'Ikeja Electric', logo: '/IKEDC.png' },
  { id: 'EKEDC', name: 'Eko Electric', logo: '/EKEDC.png' },
  { id: 'AEDC', name: 'Abuja Electric', logo: '/AEDC.png' },
  { id: 'KAEDCO', name: 'Kaduna Electric', logo: '/KAEDCO.png' },
  { id: 'IBEDC', name: 'Ibadan Electric', logo: '/IBEDC.png' },
  { id: 'KEDCO', name: 'Kano Electric', logo: '/KEDCO.png' },
  { id: 'PHEDC', name: 'Port Harcourt Electric', logo: '/PHEDC.png' },
  { id: 'JED', name: 'Jos Electric', logo: '/JED.png' },
  { id: 'BEDC', name: 'Benin Electric', logo: '/BEDC.png' },
  { id: 'YEDC', name: 'Yola Electric', logo: '/YEDC.png' },
];

const PurchaseElectricity = () => {
  const navigate = useNavigate();
  const { toast } = useToast();
  const [loading, setLoading] = useState(true);
  const [balance, setBalance] = useState(0);
  const [selectedProvider, setSelectedProvider] = useState("");
  const [meterType, setMeterType] = useState<"prepaid" | "postpaid">("prepaid");
  const [meterNumber, setMeterNumber] = useState("");
  const [amount, setAmount] = useState("");
  const [phone, setPhone] = useState("");
  const [validating, setValidating] = useState(false);
  const [meterInfo, setMeterInfo] = useState<any>(null);
  const [showSummary, setShowSummary] = useState(false);
  const [showSuccess, setShowSuccess] = useState(false);
  const [purchasing, setPurchasing] = useState(false);
  const [transactionDetails, setTransactionDetails] = useState<any>(null);

  const { register, formState: { errors } } = useForm({
    resolver: zodResolver(electricitySchema)
  });

  useEffect(() => {
    const fetchInitialData = async () => {
      try {
        const { data: { session } } = await supabase.auth.getSession();
        
        if (!session) {
          navigate('/user/auth');
          return;
        }

        const profile = await ensureProfileExists(session.user);

        // Fetch balance and phone
        if (profile) {
          setBalance(profile.balance || 0);
          setPhone(profile.phone || '');
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

  const getProviderLogo = (providerId: string) => {
    return providers.find(p => p.id === providerId)?.logo || '';
  };

  const handleValidateMeter = async () => {
    if (!meterNumber || !selectedProvider) {
      toast({
        title: "Error",
        description: "Please select provider and enter meter number",
        variant: "destructive",
      });
      return;
    }

    setValidating(true);
    setMeterInfo(null);

    try {
      const { data, error } = await supabase.functions.invoke('validate-meter-number', {
        body: {
          meter_number: meterNumber,
          provider: selectedProvider,
          meter_type: meterType
        }
      });

      if (error) throw error;

      if (data?.success) {
        setMeterInfo(data.data);
        toast({
          title: "Meter Validated",
          description: `Customer: ${data.data.customer_name}`,
        });
      } else {
        throw new Error(data?.error || 'Validation failed');
      }
    } catch (error: any) {
      console.error('Error validating meter:', error);
      toast({
        title: "Validation Failed",
        description: error.message || "Could not validate meter number",
        variant: "destructive",
      });
    } finally {
      setValidating(false);
    }
  };

  const handlePurchase = () => {
    if (!meterNumber || !amount || !selectedProvider || !phone) {
      toast({
        title: "Error",
        description: "Please fill in all fields",
        variant: "destructive",
      });
      return;
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

    if (balance < purchaseAmount) {
      toast({
        title: "Insufficient Balance",
        description: "Please fund your wallet to continue",
        variant: "destructive",
      });
      return;
    }

    setShowSummary(true);
  };

  const handleConfirmPayment = async () => {
    setPurchasing(true);
    setShowSummary(false);

    try {
      const { data, error } = await supabase.functions.invoke('purchase-electricity', {
        body: {
          meter_number: meterNumber,
          provider: selectedProvider,
          meter_type: meterType,
          amount: Number(amount),
          phone: phone
        }
      });

      if (error) throw error;

      if (!data?.success) {
        throw new Error(data?.error || 'Purchase failed');
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
        description: "Electricity token purchased successfully",
      });
    } catch (error: any) {
      console.error('Error purchasing electricity:', error);
      toast({
        title: "Purchase Failed",
        description: error.message || "Failed to purchase electricity. Please try again.",
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
          <h1 className="text-2xl font-bold">Buy Electricity</h1>
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
            <CardTitle>Electricity Details</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="space-y-2">
              <Label>Select Provider</Label>
              <Select value={selectedProvider} onValueChange={(value) => {
                setSelectedProvider(value);
                setMeterInfo(null);
              }}>
                <SelectTrigger>
                  <SelectValue placeholder="Choose electricity provider" />
                </SelectTrigger>
                <SelectContent>
                  {providers.map((provider) => (
                    <SelectItem key={provider.id} value={provider.id}>
                      <div className="flex items-center gap-2">
                        <img 
                          src={provider.logo} 
                          alt={provider.name}
                          className="w-6 h-6 object-contain"
                        />
                        <span>{provider.name}</span>
                      </div>
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            {selectedProvider && (
              <>
                <div className="space-y-2">
                  <Label>Meter Type</Label>
                  <Select value={meterType} onValueChange={(value) => {
                    setMeterType(value as "prepaid" | "postpaid");
                    setMeterInfo(null);
                  }}>
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="prepaid">Prepaid</SelectItem>
                      <SelectItem value="postpaid">Postpaid</SelectItem>
                    </SelectContent>
                  </Select>
                </div>

                <div className="space-y-2">
                  <Label htmlFor="meter">Meter Number</Label>
                  <div className="flex gap-2">
                    <Input
                      id="meter"
                      type="text"
                      placeholder="Enter meter number"
                      value={meterNumber}
                      {...register("meter_number")}
                      onChange={(e) => {
                        setMeterNumber(e.target.value);
                        setMeterInfo(null);
                      }}
                    />
                    <Button 
                      type="button"
                      onClick={handleValidateMeter}
                      disabled={validating || !meterNumber}
                      size="sm"
                    >
                      {validating ? <Loader2 className="h-4 w-4 animate-spin" /> : "Verify"}
                    </Button>
                  </div>
                  {errors.meter_number && (
                    <p className="text-sm text-destructive">{String(errors.meter_number.message)}</p>
                  )}
                  {meterInfo && (
                    <div className="flex items-center gap-2 text-sm text-green-600 bg-green-50 p-2 rounded">
                      <CheckCircle className="h-4 w-4" />
                      <span>{meterInfo.customer_name}</span>
                    </div>
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
                </div>

                <div className="space-y-2">
                  <Label htmlFor="phone">Phone Number</Label>
                  <Input
                    id="phone"
                    type="tel"
                    placeholder="08012345678"
                    value={phone}
                    {...register("phone")}
                    onChange={(e) => setPhone(e.target.value)}
                  />
                  {errors.phone && (
                    <p className="text-sm text-destructive">{String(errors.phone.message)}</p>
                  )}
                </div>

                <Button 
                  className="w-full" 
                  onClick={handlePurchase}
                  disabled={!selectedProvider || !meterNumber || !amount || !phone || purchasing}
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
                  src={getProviderLogo(selectedProvider)} 
                  alt={providers.find(p => p.id === selectedProvider)?.name}
                  className="w-14 h-14 object-contain"
                />
              </div>
            </div>
            <div className="flex justify-between">
              <span>Provider:</span>
              <span className="font-semibold">{providers.find(p => p.id === selectedProvider)?.name}</span>
            </div>
            <div className="flex justify-between">
              <span>Meter Type:</span>
              <span className="font-semibold capitalize">{meterType}</span>
            </div>
            <div className="flex justify-between">
              <span>Meter Number:</span>
              <span className="font-semibold">{meterNumber}</span>
            </div>
            {meterInfo && (
              <div className="flex justify-between">
                <span>Customer:</span>
                <span className="font-semibold">{meterInfo.customer_name}</span>
              </div>
            )}
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
              Your electricity token has been purchased successfully
            </DialogDescription>
          </DialogHeader>
          {transactionDetails && (
            <div className="space-y-4">
              {transactionDetails.token && (
                <div className="bg-muted p-4 rounded-lg">
                  <p className="text-sm text-muted-foreground mb-1">Token</p>
                  <p className="text-lg font-mono font-bold">{transactionDetails.token}</p>
                </div>
              )}
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
    </div>
  );
};

export default PurchaseElectricity;
