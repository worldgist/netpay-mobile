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
  providerCode: string;
  meterType: "prepaid" | "postpaid";
}

const providers: ElectricityProvider[] = [
  { id: 'IKEJA_PREPAID', name: 'Ikeja Electricity Token Purchase', logo: '/IKEDC.png', providerCode: 'IKEJA', meterType: 'prepaid' },
  { id: 'IKEJA_POSTPAID', name: 'Ikeja Electricity Bills', logo: '/IKEDC.png', providerCode: 'IKEJA', meterType: 'postpaid' },
  { id: 'EKO_PREPAID', name: 'Eko Electricity Prepaid', logo: '/EKEDC.png', providerCode: 'EKO', meterType: 'prepaid' },
  { id: 'EKO_POSTPAID', name: 'Eko Electricity Postpaid', logo: '/EKEDC.png', providerCode: 'EKO', meterType: 'postpaid' },
  { id: 'ABUJA_PREPAID', name: 'Abuja Electricity Prepaid', logo: '/AEDC.png', providerCode: 'ABUJA', meterType: 'prepaid' },
  { id: 'ABUJA_POSTPAID', name: 'Abuja Electricity Postpaid', logo: '/AEDC.png', providerCode: 'ABUJA', meterType: 'postpaid' },
  { id: 'KADUNA_PREPAID', name: 'Kaduna Electricity Prepaid', logo: '/KAEDCO.png', providerCode: 'KADUNA', meterType: 'prepaid' },
  { id: 'KADUNA_POSTPAID', name: 'Kaduna Electricity Postpaid', logo: '/KAEDCO.png', providerCode: 'KADUNA', meterType: 'postpaid' },
  { id: 'IBADAN_PREPAID', name: 'Ibadan Electricity Prepaid', logo: '/IBEDC.png', providerCode: 'IBADAN', meterType: 'prepaid' },
  { id: 'IBADAN_POSTPAID', name: 'Ibadan Electricity Postpaid', logo: '/IBEDC.png', providerCode: 'IBADAN', meterType: 'postpaid' },
  { id: 'KANO_PREPAID', name: 'Kano Electricity Distribution Prepaid', logo: '/KEDCO.png', providerCode: 'KANO', meterType: 'prepaid' },
  { id: 'KANO_POSTPAID', name: 'Kano Electricity Distribution Postpaid', logo: '/KEDCO.png', providerCode: 'KANO', meterType: 'postpaid' },
  { id: 'PORTHARCOURT_PREPAID', name: 'Port-Harcourt Electricity Prepaid', logo: '/PHEDC.png', providerCode: 'PORTHARCOURT', meterType: 'prepaid' },
  { id: 'PORTHARCOURT_POSTPAID', name: 'Port-Harcourt Electricity Postpaid', logo: '/PHEDC.png', providerCode: 'PORTHARCOURT', meterType: 'postpaid' },
  { id: 'JOS_PREPAID', name: 'Jos Electricity Prepaid', logo: '/JED.png', providerCode: 'JOS', meterType: 'prepaid' },
  { id: 'JOS_POSTPAID', name: 'Jos Electricity Postpaid', logo: '/JED.png', providerCode: 'JOS', meterType: 'postpaid' },
  { id: 'BENIN_PREPAID', name: 'Benin Electricity Prepaid', logo: '/BEDC.png', providerCode: 'BENIN', meterType: 'prepaid' },
  { id: 'BENIN_POSTPAID', name: 'Benin Electricity Postpaid', logo: '/BEDC.png', providerCode: 'BENIN', meterType: 'postpaid' },
  { id: 'YOLA_PREPAID', name: 'Yola Electricity Prepaid', logo: '/YEDC.png', providerCode: 'YOLA', meterType: 'prepaid' },
  { id: 'YOLA_POSTPAID', name: 'Yola Electricity Postpaid', logo: '/YEDC.png', providerCode: 'YOLA', meterType: 'postpaid' },
];

const PurchaseElectricity = () => {
  const navigate = useNavigate();
  const { toast } = useToast();
  const [loading, setLoading] = useState(true);
  const [balance, setBalance] = useState(0);
  const [selectedProvider, setSelectedProvider] = useState("");
  const [selectedProviderOption, setSelectedProviderOption] = useState("");
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

  const getProviderLogo = () => {
    return providers.find(p => p.id === selectedProviderOption)?.logo || '';
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
          phone: phone,
          customer_name: meterInfo?.customer_name ?? null,
          customer_address: meterInfo?.address ?? null,
          tariff: meterInfo?.tariff ?? null,
          minimum_vend: meterInfo?.minimum_vend ?? null,
          outstanding_amount: meterInfo?.outstanding_amount ?? null,
          customer_category: meterInfo?.customer_category ?? null,
          business_unit: meterInfo?.business_unit ?? null,
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
              <Select
                value={selectedProviderOption}
                onValueChange={(value) => {
                  const providerOption = providers.find(p => p.id === value);
                  if (providerOption) {
                    setSelectedProviderOption(providerOption.id);
                    setSelectedProvider(providerOption.providerCode);
                    setMeterType(providerOption.meterType);
                    setMeterInfo(null);
                  }
                }}
              >
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
                  <Select
                    value={meterType}
                    onValueChange={(value) => {
                      const newType = value as "prepaid" | "postpaid";
                      setMeterType(newType);
                      setMeterInfo(null);
                      const matchingOption = providers.find(
                        (option) => option.providerCode === selectedProvider && option.meterType === newType
                      );
                      if (matchingOption) {
                        setSelectedProviderOption(matchingOption.id);
                      }
                    }}
                  >
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
                <div className="bg-green-50 border border-green-200 p-3 rounded-lg space-y-1 text-sm text-green-700">
                  <div className="flex items-center gap-2">
                    <CheckCircle className="h-4 w-4" />
                    <span className="font-semibold">{meterInfo.customer_name}</span>
                  </div>
                  {meterInfo.address && <p>{meterInfo.address}</p>}
                  <div className="grid grid-cols-2 gap-2 text-xs text-green-600">
                    <span>Tariff: {meterInfo.tariff || '—'}</span>
                    <span>Min Vend: ₦{meterInfo.minimum_vend?.toLocaleString?.() ?? meterInfo.minimum_vend ?? '0'}</span>
                    <span>Category: {meterInfo.customer_category || '—'}</span>
                    <span>Business Unit: {meterInfo.business_unit || '—'}</span>
                    {meterInfo.outstanding_amount !== undefined && (
                      <span className="col-span-2">
                        Outstanding: ₦{Number(meterInfo.outstanding_amount).toLocaleString()}
                      </span>
                    )}
                  </div>
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
                  src={getProviderLogo()} 
                  alt={providers.find(p => p.id === selectedProviderOption)?.name}
                  className="w-14 h-14 object-contain"
                />
              </div>
            </div>
            <div className="flex justify-between">
              <span>Provider:</span>
              <span className="font-semibold">{providers.find(p => p.id === selectedProviderOption)?.name}</span>
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
              <div className="space-y-2 text-sm">
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Customer:</span>
                  <span className="font-semibold text-foreground">{meterInfo.customer_name}</span>
                </div>
                {meterInfo.address && (
                  <div className="text-muted-foreground">
                    <span className="font-semibold text-foreground">Address:</span> {meterInfo.address}
                  </div>
                )}
                <div className="flex justify-between text-muted-foreground">
                  <span>Tariff:</span>
                  <span className="font-medium text-foreground">{meterInfo.tariff || '—'}</span>
                </div>
                <div className="flex justify-between text-muted-foreground">
                  <span>Minimum Vend:</span>
                  <span className="font-medium text-foreground">
                    ₦{Number(meterInfo.minimum_vend ?? 0).toLocaleString()}
                  </span>
                </div>
                {meterInfo.outstanding_amount !== undefined && (
                  <div className="flex justify-between text-muted-foreground">
                    <span>Outstanding:</span>
                    <span className="font-medium text-foreground">
                      ₦{Number(meterInfo.outstanding_amount ?? 0).toLocaleString()}
                    </span>
                  </div>
                )}
                {meterInfo.customer_category && (
                  <div className="flex justify-between text-muted-foreground">
                    <span>Category:</span>
                    <span className="font-medium text-foreground">{meterInfo.customer_category}</span>
                  </div>
                )}
                {meterInfo.business_unit && (
                  <div className="flex justify-between text-muted-foreground">
                    <span>Business Unit:</span>
                    <span className="font-medium text-foreground">{meterInfo.business_unit}</span>
                  </div>
                )}
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
              <div className="grid grid-cols-2 gap-x-4 gap-y-2 text-sm">
                <span className="text-muted-foreground">Provider:</span>
                <span className="font-semibold text-foreground">
                  {providers.find(p => p.providerCode === transactionDetails.provider && p.meterType === transactionDetails.meter_type)?.name ||
                    transactionDetails.provider}
                </span>
                <span className="text-muted-foreground">Meter Type:</span>
                <span className="font-semibold text-foreground capitalize">{transactionDetails.meter_type}</span>
                <span className="text-muted-foreground">Meter Number:</span>
                <span className="font-semibold text-foreground">{transactionDetails.meter_number}</span>
                {transactionDetails.customer_name && (
                  <>
                    <span className="text-muted-foreground">Customer:</span>
                    <span className="font-semibold text-foreground">{transactionDetails.customer_name}</span>
                  </>
                )}
                {transactionDetails.customer_address && (
                  <>
                    <span className="text-muted-foreground">Address:</span>
                    <span className="text-foreground">{transactionDetails.customer_address}</span>
                  </>
                )}
              </div>
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
