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
import { useVendingSettings } from "@/contexts/VendingSettingsContext";
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
  const { providers: vendingSettings } = useVendingSettings();
  const dataProvider = vendingSettings.data;
  const [loading, setLoading] = useState(true);
  const [accessToken, setAccessToken] = useState<string | null>(null);
  const [balance, setBalance] = useState(0);
  const [networks, setNetworks] = useState<Network[]>([]);
  const [dataPlans, setDataPlans] = useState<DataPlan[]>([]);
  const [allPlans, setAllPlans] = useState<DataPlan[]>([]);
  const [selectedNetwork, setSelectedNetwork] = useState("");
  const [selectedPlan, setSelectedPlan] = useState("");
  const [phoneNumber, setPhoneNumber] = useState("");
  const [showSummary, setShowSummary] = useState(false);
  const [showSuccess, setShowSuccess] = useState(false);
  const [purchasing, setPurchasing] = useState(false);
  const [transactionDetails, setTransactionDetails] = useState<any>(null);
  const [showInsufficientBalance, setShowInsufficientBalance] = useState(false);
  const [showInvalidPhoneModal, setShowInvalidPhoneModal] = useState(false);
  const [invalidPhoneMessage, setInvalidPhoneMessage] = useState("Please enter a valid 11-digit phone number (e.g. 08012345678).");

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

        const resolvedProvider = dataProvider || 'smeplug';

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
        let plansData: any[] = plansRes.data || [];

        if (plansRes.error) {
          const errorCode = String(plansRes.error.code || '');
          const errorMessage = typeof plansRes.error.message === 'string' 
            ? plansRes.error.message 
            : JSON.stringify(plansRes.error.message || plansRes.error);
          const statusCode = plansRes.error.status;
          const httpStatus = typeof statusCode === 'number' ? statusCode : parseInt(String(statusCode || '0'), 10);
          
          console.warn('Data plans query error:', { 
            code: errorCode, 
            message: errorMessage, 
            status: statusCode,
            error: plansRes.error 
          });
          
          // Handle column missing errors (42703) or 400 Bad Request (which can occur when columns don't exist)
          const errorMsgLower = errorMessage.toLowerCase();
          const isColumnError = errorCode === '42703' || 
                               errorCode === 'PGRST100' ||
                               httpStatus === 400 ||
                               (errorMessage && (
                                 errorMsgLower.includes('column') ||
                                 errorMsgLower.includes('does not exist') ||
                                 errorMsgLower.includes('custom_price') ||
                                 errorMsgLower.includes('original_price') ||
                                 errorMsgLower.includes('provider') ||
                                 errorMsgLower.includes('bad request')
                               ));
          
          if (isColumnError) {
            console.warn('Column missing from data_plans, using fallback query', {
              errorCode,
              errorMessage,
              isProviderColumnError: errorMsgLower.includes('provider') && errorMsgLower.includes('does not exist'),
              isCustomPriceError: errorMsgLower.includes('custom_price'),
              isOriginalPriceError: errorMsgLower.includes('original_price'),
            });
            
            // Check if the error is about specific columns
            const isProviderColumnError = errorMsgLower.includes('provider') && 
                                        errorMsgLower.includes('does not exist');
            const isCustomPriceError = errorMsgLower.includes('custom_price');
            const isOriginalPriceError = errorMsgLower.includes('original_price');
            
            // Start with absolute minimum columns that should always exist
            let fallbackSelect = 'id, network, plan_name, price, validity, api_code';
            
            // Only add provider if we know it exists (not the cause of error)
            if (!isProviderColumnError) {
              fallbackSelect += ', provider';
            }
            
            console.log('Fallback select:', fallbackSelect, 'resolvedProvider:', resolvedProvider);
            
            // Try fallback query with provider filter first
            let fallbackSuccess = false;
            let lastError = null;
            
            // Attempt 1: Try with provider filter if provider column exists
            if (!isProviderColumnError && resolvedProvider) {
              try {
                console.log('Attempt 1: Trying fallback with provider filter:', resolvedProvider);
                const fallbackWithProvider = await supabase
                  .from('data_plans')
                  .select(fallbackSelect)
                  .eq('provider', resolvedProvider)
                  .order('network', { ascending: true })
                  .order('price', { ascending: true });
                
                console.log('Fallback with provider result:', {
                  error: fallbackWithProvider.error,
                  dataCount: fallbackWithProvider.data?.length || 0
                });
                
                if (!fallbackWithProvider.error) {
                  plansData = fallbackWithProvider.data || [];
                  fallbackSuccess = true;
                  console.log('Fallback with provider succeeded, got', plansData.length, 'plans');
                } else {
                  lastError = fallbackWithProvider.error;
                  console.warn('Fallback with provider filter failed:', fallbackWithProvider.error, 'trying without filter');
                }
              } catch (e) {
                lastError = e;
                console.warn('Fallback with provider filter threw error:', e, 'trying without filter');
              }
            }
            
            // Attempt 2: Try without provider filter
            if (!fallbackSuccess) {
              try {
                console.log('Attempt 2: Trying fallback without provider filter');
                const fallbackWithoutProvider = await supabase
                  .from('data_plans')
                  .select(fallbackSelect)
                  .order('network', { ascending: true })
                  .order('price', { ascending: true });
                
                console.log('Fallback without provider result:', {
                  error: fallbackWithoutProvider.error,
                  dataCount: fallbackWithoutProvider.data?.length || 0
                });
                
                if (!fallbackWithoutProvider.error) {
                  plansData = fallbackWithoutProvider.data || [];
                  fallbackSuccess = true;
                  console.log('Fallback without provider succeeded, got', plansData.length, 'plans');
                } else {
                  lastError = fallbackWithoutProvider.error;
                  console.error('Fallback without provider filter also failed:', fallbackWithoutProvider.error);
                }
              } catch (e) {
                lastError = e;
                console.error('Fallback without provider filter threw error:', e);
              }
            }
            
            if (!fallbackSuccess) {
              console.error('All fallback attempts failed, throwing error');
              throw lastError || plansRes.error;
            }
            
            // Filter by provider in memory to ensure only the selected provider's plans are shown
            if (resolvedProvider && plansData.length > 0) {
              const hasProviderField = plansData.some((plan: any) => plan.provider !== undefined);
              if (hasProviderField) {
                const filteredPlans = plansData.filter((plan: any) => 
                  plan.provider === resolvedProvider
                );
                // Only use filtered results if we got matches, otherwise might be all same provider already
                if (filteredPlans.length > 0 || plansData.length === 0) {
                  plansData = filteredPlans;
                }
              }
            }
            
            // Map fallback data to include missing columns as null
            plansData = (plansData || []).map((plan: any) => ({
              ...plan,
              provider: plan.provider || resolvedProvider || 'smeplug',
              custom_price: plan.custom_price ?? null,
              original_price: plan.original_price ?? null,
            }));
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
  }, [navigate, toast, dataProvider]);

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

    const normalizedPhone = normalizePhoneNumber(phoneNumber);
    if (!isValidNigerianPhone(normalizedPhone)) {
      setInvalidPhoneMessage("Please enter a valid 11-digit phone number (e.g. 08012345678).");
      setShowInvalidPhoneModal(true);
      return;
    }

    if (normalizedPhone !== phoneNumber) {
      setPhoneNumber(normalizedPhone);
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
      
      if (!plan) throw new Error("Invalid plan");

      // Use the new unified purchase-data endpoint with automatic fallback

      const normalizedPhone = normalizePhoneNumber(phoneNumber);
      if (!isValidNigerianPhone(normalizedPhone)) {
        setInvalidPhoneMessage("Please enter a valid 11-digit phone number (e.g. 08012345678).");
        setShowInvalidPhoneModal(true);
        return;
      }

      if (normalizedPhone !== phoneNumber) {
        setPhoneNumber(normalizedPhone);
      }
      const requestBody = {
        phone_number: normalizedPhone,
        plan_id: plan.id,
      };

      // Direct fetch call for better error handling
      const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
      const functionUrl = `${supabaseUrl}/functions/v1/purchase-data`;

      const response = await fetch(functionUrl, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${activeToken}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(requestBody),
      });

      const responseData = await response.json();
      
      console.log('Purchase response:', {
        httpStatus: response.status,
        success: responseData?.success,
        error: responseData?.error,
        message: responseData?.message,
        data: responseData?.data,
        fullResponse: responseData
      });

      if (!response.ok) {
        // Extract error message from response
        const errorMessage = responseData?.error || responseData?.message || `HTTP ${response.status}: ${response.statusText}`;
        throw new Error(errorMessage);
      }

      // Check if transaction failed explicitly (success === false)
      if (responseData?.success === false) {
        // Extract detailed error information
        let errorMessage = responseData?.error || responseData?.message || responseData?.details?.message || 'Purchase failed';
        const errorSummary = responseData?.details?.error_summary;
        
        // Check if it's a configuration issue (missing credentials, missing plan codes)
        const isConfigError = errorMessage.includes('credentials not configured') ||
                            errorMessage.includes('not configured') ||
                            errorMessage.includes('missing') ||
                            errorMessage.includes('All vendors failed') ||
                            (errorSummary && (
                              errorSummary.includes('credentials not configured') ||
                              errorSummary.includes('missing') ||
                              errorSummary.includes('fallback unavailable')
                            ));
        
        // Log full details for debugging (but don't show to user)
        console.error('Purchase failed with details:', {
          error: errorMessage,
          details: responseData.details,
          fullResponse: responseData
        });
        
        // Show user-friendly message for configuration errors
        if (isConfigError) {
          throw new Error('Service temporarily unavailable. Please contact support or try again later.');
        }
        
        // For other errors, show a clean message without technical details
        // Extract the main error message without vendor details
        throw new Error(errorMessage);
      }

      // Handle successful transaction (success === true or truthy)
      // Check if transaction is pending
      const transactionStatus = responseData?.data?.status;
      const isPending = transactionStatus && (
        transactionStatus.toLowerCase() === 'pending' || 
        transactionStatus.toLowerCase() === 'processing' ||
        transactionStatus.toLowerCase() === 'queued'
      );

      const effectivePrice = getEffectivePrice(plan);
      const reference = responseData?.data?.reference;
      const vendor = responseData?.data?.vendor || 'vendor';
      
      setTransactionDetails(responseData.data || { reference, amount: effectivePrice });
      setShowSuccess(true);
      
      // Show appropriate message based on transaction status
      if (isPending) {
        toast({
          title: "Transaction Processing",
          description: `Your data purchase is being processed via ${vendor}. Reference: ${reference}. You will be notified when completed.`,
        });
      } else {
        toast({
          title: "Success",
          description: `Data purchased successfully via ${vendor}. Reference: ${reference}.`,
        });
      }

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

      // Only show generic success toast if not pending (pending already has its own toast)
      if (!isPending) {
        toast({
          title: "Success",
          description: "Data purchased successfully",
        });
      }
    } catch (error: any) {
      console.error('Error purchasing data:', error);
      console.error('Full error object:', error);

      // Extract error message
      let message = error?.message || "Failed to purchase data. Please try again.";
      
      // Check for network errors
      const errorMessage = message || String(error);
      const isNetworkError = errorMessage.includes('Network request failed') ||
                            errorMessage.includes('Failed to send a request to the Edge Function') ||
                            errorMessage.includes('Failed to fetch') ||
                            errorMessage.includes('ERR_INTERNET_DISCONNECTED') ||
                            errorMessage.includes('ERR_NETWORK_CHANGED') ||
                            errorMessage.includes('TypeError') ||
                            error?.name === 'FunctionsFetchError' ||
                            error?.name === 'TypeError' ||
                            error?.code === 'NETWORK_ERROR';
      
      // Check for configuration errors (already handled in the response check, but double-check here)
      const isConfigError = errorMessage.includes('Service temporarily unavailable') ||
                          errorMessage.includes('credentials not configured') ||
                          errorMessage.includes('not configured') ||
                          errorMessage.includes('missing') ||
                          errorMessage.includes('All vendors failed');
      
      // Show appropriate error message
      if (isNetworkError) {
        message = 'Network connection failed. Please check your internet connection and try again.';
        toast({
          title: "Connection Error",
          description: message,
          variant: "destructive",
        });
      } else if (isConfigError) {
        // Configuration errors already have user-friendly messages
        toast({
          title: "Service Unavailable",
          description: message,
          variant: "destructive",
        });
      } else {
        // For other errors, show the message but clean it up if it has technical details
        // Remove vendor failure details and error summaries from user-facing messages
        const cleanMessage = message.split('\n\nVendor failures:')[0]
                                   .split('\n\n- ')[0]
                                   .split('\n\n')[0]
                                   .trim();
        
        toast({
          title: "Purchase Failed",
          description: cleanMessage || message,
          variant: "destructive",
        });
      }
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

      <Dialog open={showInvalidPhoneModal} onOpenChange={setShowInvalidPhoneModal}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Invalid Phone Number</DialogTitle>
            <DialogDescription>{invalidPhoneMessage}</DialogDescription>
          </DialogHeader>
          <Button onClick={() => setShowInvalidPhoneModal(false)} className="w-full">
            Okay
          </Button>
        </DialogContent>
      </Dialog>
    </div>
  );
};

export default PurchaseData;
