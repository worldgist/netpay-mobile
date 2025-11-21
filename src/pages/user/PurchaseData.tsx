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
import { InsufficientBalanceModal } from "@/components/InsufficientBalanceModal";
import { z } from "zod";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";

const NETWORK_DISPLAY_NAMES: Record<string, string> = {
  MTN: "MTN",
  AIRTEL: "Airtel",
  GLO: "Glo",
  "9MOBILE": "9Mobile",
};

const normalizeNetwork = (value?: string | null) => {
  if (!value) return null;
  const upper = value.toUpperCase().trim();
  if (upper.includes("MTN")) return "MTN";
  if (upper.includes("AIRTEL")) return "AIRTEL";
  if (upper.includes("GLO") || upper.includes("GLOBACOM")) return "GLO";
  if (upper.includes("9MOBILE") || upper.includes("9 MOBILE") || upper.includes("ETISALAT")) return "9MOBILE";
  return upper;
};

const getNetworkDisplayName = (networkId: string) => {
  return NETWORK_DISPLAY_NAMES[networkId] || networkId;
};

const generateVtpassRequestId = () => {
  const lagos = new Date(
    new Date().toLocaleString("en-US", { timeZone: "Africa/Lagos" })
  );
  const pad = (value: number) => `${value}`.padStart(2, "0");
  const timestamp =
    lagos.getFullYear().toString() +
    pad(lagos.getMonth() + 1) +
    pad(lagos.getDate()) +
    pad(lagos.getHours()) +
    pad(lagos.getMinutes());
  const random = Math.random().toString(36).slice(2, 10).toUpperCase();
  return `${timestamp}${random}`;
};

const dataSchema = z.object({
  phone_number: z.string().min(11, "Phone number must be at least 11 digits").max(11, "Phone number must be 11 digits"),
});

interface DataPlan {
  id: string;
  network: string;
  plan_name: string;
  price: number;
  validity: string;
  api_code: string;
  custom_price?: number | null;
  original_price?: number | null;
}

// Helper function to get effective price (custom_price || original_price || price)
const getEffectivePrice = (plan: DataPlan): number => {
  return plan.custom_price ?? plan.original_price ?? plan.price;
};

interface Network {
  id: string;
  name: string;
  network_id: string;
}

const PurchaseData = () => {
  const navigate = useNavigate();
  const { toast } = useToast();
  const [loading, setLoading] = useState(true);
  const [accessToken, setAccessToken] = useState<string | null>(null);
  const [balance, setBalance] = useState(0);
  const [networks, setNetworks] = useState<Network[]>([]);
  const [dataPlans, setDataPlans] = useState<DataPlan[]>([]);
  const [allPlans, setAllPlans] = useState<DataPlan[]>([]);
  const [dataProvider, setDataProvider] = useState<'smeplug' | 'vtpass' | 'anyone' | 'mobilenig' | 'ebills.africa'>('smeplug');
  const [selectedNetwork, setSelectedNetwork] = useState("");
  const [selectedPlan, setSelectedPlan] = useState("");
  const [phoneNumber, setPhoneNumber] = useState("");
  const [showSummary, setShowSummary] = useState(false);
  const [showSuccess, setShowSuccess] = useState(false);
  const [purchasing, setPurchasing] = useState(false);
  const [transactionDetails, setTransactionDetails] = useState<any>(null);
  const [showInsufficientBalance, setShowInsufficientBalance] = useState(false);

  const { register, formState: { errors } } = useForm({
    resolver: zodResolver(dataSchema)
  });

  useEffect(() => {
    const fetchInitialData = async () => {
      try {
        setLoading(true);
        const { data: { session } } = await supabase.auth.getSession();
        
        if (!session) {
          setLoading(false);
          navigate('/user/auth');
          return;
        }

        await ensureProfileExists(session.user);

        const sessionAccessToken = session.access_token;
        if (!sessionAccessToken) {
          setLoading(false);
          navigate('/user/auth');
          return;
        }

        const providerResponse = await supabase.functions.invoke('get-data-provider', {
          headers: { Authorization: `Bearer ${sessionAccessToken}` },
        });

        let resolvedProvider =
          typeof providerResponse.data?.provider === 'string'
            ? providerResponse.data.provider
            : (providerResponse.data as string) || 'smeplug';

        if (!['smeplug', 'vtpass', 'anyone', 'mobilenig', 'ebills.africa'].includes(resolvedProvider)) {
          resolvedProvider = 'smeplug';
        }

        setDataProvider(resolvedProvider as typeof dataProvider);

        const { data: profile } = await supabase
          .from('profiles')
          .select('balance')
          .eq('id', session.user.id)
          .single();

        if (profile) {
          setBalance(profile.balance || 0);
        }

        let plansQuery = supabase
          .from('data_plans')
          .select('id, network, plan_name, price, validity, api_code, provider, custom_price, original_price')
          .order('network', { ascending: true })
          .order('price', { ascending: true });

        if (resolvedProvider) {
          plansQuery = plansQuery.eq('provider', resolvedProvider);
        }

        const plansRes = await plansQuery;
        let plansData = plansRes.data || [];

        if (plansRes.error) {
          if (plansRes.error.code === '42703') {
            const fallback = await supabase
              .from('data_plans')
              .select('id, network, plan_name, price, validity, api_code, custom_price, original_price')
              .order('network', { ascending: true })
              .order('price', { ascending: true });
            if (fallback.error) throw fallback.error;
            plansData = fallback.data || [];
          } else {
            throw plansRes.error;
          }
        }

        setAllPlans(plansData);

        let networkOptions: Network[] = [];
        if (resolvedProvider === 'smeplug') {
          const { data: networksData } = await supabase.functions.invoke('fetch-smeplug-networks', {
            headers: { Authorization: `Bearer ${sessionAccessToken}` },
          });
          if (networksData?.success && Array.isArray(networksData?.data)) {
            networkOptions = networksData.data.map((item: any) => ({
              id: normalizeNetwork(item.name || item.id) || item.id,
              name: item.name,
              network_id: item.network_id,
            }));
          }
        }

        if (networkOptions.length === 0) {
          const uniqueNetworks = Array.from(
            new Set(plansData.map((plan) => normalizeNetwork(plan.network)).filter(Boolean))
          ) as string[];
          networkOptions = uniqueNetworks.map((key) => ({
            id: key,
            name: getNetworkDisplayName(key),
            network_id: key,
          }));
        }

        const defaultNetwork = networkOptions[0]?.id || "";
        setNetworks(networkOptions);
        setSelectedNetwork((prev) => (prev && networkOptions.some((n) => n.id === prev) ? prev : defaultNetwork));
        setAccessToken(sessionAccessToken);

        setLoading(false);

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

  useEffect(() => {
    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((_event, session) => {
      setAccessToken(session?.access_token ?? null);
    });

    return () => {
      subscription.unsubscribe();
    };
  }, []);

  useEffect(() => {
    if (!selectedNetwork) {
      setDataPlans([]);
      setSelectedPlan('');
      return;
    }

    const filtered = allPlans.filter(
      (plan) => normalizeNetwork(plan.network) === selectedNetwork
    );
    setDataPlans(filtered);

    if (!filtered.some((plan) => plan.id === selectedPlan)) {
      setSelectedPlan(filtered[0]?.id || '');
    }
  }, [selectedNetwork, allPlans, selectedPlan]);

  const getNetworkColor = (networkName: string) => {
    const colors: Record<string, string> = {
      'MTN': 'bg-yellow-500',
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
    if (!phoneNumber || !selectedPlan) {
      toast({
        title: "Error",
        description: "Please fill in all fields",
        variant: "destructive",
      });
      return;
    }

    const plan = dataPlans.find(p => p.id === selectedPlan);
    if (!plan) return;

    const effectivePrice = getEffectivePrice(plan);
    if (balance < effectivePrice) {
      setShowInsufficientBalance(true);
      return;
    }

    setShowSummary(true);
  };

  const handleConfirmPayment = async () => {
    setPurchasing(true);
    setShowSummary(false);

    try {
      const {
        data: { session },
      } = await supabase.auth.getSession();

      const activeToken = session?.access_token;

      if (!activeToken) {
        toast({
          title: "Session Expired",
          description: "Please sign in again to continue.",
          variant: "destructive",
        });
        setPurchasing(false);
        navigate('/user/auth');
        return;
      }

      if (accessToken !== activeToken) {
        setAccessToken(activeToken);
      }

      const plan = dataPlans.find(p => p.id === selectedPlan);
      const network = networks.find(n => n.id === selectedNetwork);
      
      if (!plan || !network) throw new Error("Invalid plan or network");

      const requestId = dataProvider === 'vtpass' ? generateVtpassRequestId() : undefined;
      const functionName = dataProvider === 'vtpass' ? 'purchase-vtpass-data' : 'purchase-smeplug-data';
      const requestBody: Record<string, any> = {
        phone_number: phoneNumber,
        plan_id: plan.id,
        network_id: network.network_id,
        network_name: network.name,
      };
      if (requestId) {
        requestBody.request_id = requestId;
      }

      // Direct fetch call for better error handling
      const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
      const functionUrl = `${supabaseUrl}/functions/v1/${functionName}`;

      const response = await fetch(functionUrl, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${activeToken}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(requestBody),
      });

      const responseData = await response.json();

      if (!response.ok) {
        // Extract error message from response
        const errorMessage = responseData?.error || responseData?.message || `HTTP ${response.status}: ${response.statusText}`;
        throw new Error(errorMessage);
      }

      if (!responseData?.success) {
        throw new Error(responseData?.error || responseData?.message || 'Purchase failed');
      }

      const effectivePrice = getEffectivePrice(plan);
      setTransactionDetails(responseData.data || { reference: responseData.request_id || requestId, amount: effectivePrice });
      setShowSuccess(true);

      // Refresh balance
      const { data: { session: refreshedSession } } = await supabase.auth.getSession();
      if (refreshedSession) {
        const { data: profile } = await supabase
          .from('profiles')
          .select('balance')
          .eq('id', refreshedSession.user.id)
          .single();

        if (profile) {
          setBalance(profile.balance || 0);
        }
      }

      toast({
        title: "Success",
        description: "Data purchased successfully",
      });
    } catch (error: any) {
      console.error('Error purchasing data:', error);

      // Extract error message - now we have direct access to the response
      let message = error?.message || "Failed to purchase data. Please try again.";

      toast({
        title: "Purchase Failed",
        description: message,
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

  const selectedPlanData = dataPlans.find(p => p.id === selectedPlan);

  return (
    <div className="min-h-screen bg-background p-4 pb-20">
      <div className="max-w-md mx-auto space-y-6">
        <div className="flex items-center justify-between">
          <h1 className="text-2xl font-bold">Buy Data</h1>
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
            <CardTitle>Select Network</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid grid-cols-2 gap-3">
              {networks.map((network) => (
                <Button
                  key={network.id}
                  variant={selectedNetwork === network.id ? "default" : "outline"}
                  className={`h-20 flex items-center gap-3 ${selectedNetwork === network.id ? getNetworkColor(network.name) : ''}`}
                  onClick={() => {
                    setSelectedNetwork(network.id);
                    setSelectedPlan("");
                  }}
                >
                  <img 
                    src={getNetworkLogo(network.name)} 
                    alt={network.name}
                    className="w-10 h-10 object-contain"
                  />
                  <span>{network.name}</span>
                </Button>
              ))}
            </div>

            {selectedNetwork && (
              <>
                <div className="space-y-2">
                  <Label htmlFor="plan">Select Data Plan</Label>
                  <Select value={selectedPlan} onValueChange={setSelectedPlan}>
                    <SelectTrigger>
                      <SelectValue placeholder="Choose a plan" />
                    </SelectTrigger>
                    <SelectContent>
                      {dataPlans.map((plan) => {
                        const effectivePrice = getEffectivePrice(plan);
                        return (
                          <SelectItem key={plan.id} value={plan.id}>
                            {plan.plan_name} - {formatNaira(effectivePrice)}{plan.validity && plan.validity !== 'N/A' ? ` (${plan.validity})` : ''}
                          </SelectItem>
                        );
                      })}
                    </SelectContent>
                  </Select>
                </div>

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

                <Button 
                  className="w-full" 
                  onClick={handlePurchase}
                  disabled={!selectedPlan || !phoneNumber || purchasing}
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
          {selectedPlanData && (
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
                <span>Plan:</span>
                <span className="font-semibold">{selectedPlanData.plan_name}</span>
              </div>
              <div className="flex justify-between">
                <span>Phone Number:</span>
                <span className="font-semibold">{phoneNumber}</span>
              </div>
              <div className="flex justify-between">
                <span>Amount:</span>
                <span className="font-semibold">{formatNaira(getEffectivePrice(selectedPlanData))}</span>
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
          )}
        </DialogContent>
      </Dialog>

      {/* Success Dialog */}
      <Dialog open={showSuccess} onOpenChange={setShowSuccess}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Purchase Successful!</DialogTitle>
            <DialogDescription>
              Your data has been purchased successfully
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
        requiredAmount={(() => {
          const plan = dataPlans.find(p => p.id === selectedPlan);
          return plan ? getEffectivePrice(plan) : undefined;
        })()}
      />
    </div>
  );
};

export default PurchaseData;
