import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { useToast } from "@/hooks/use-toast";
import { formatNaira } from "@/lib/currency";
import { z } from "zod";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { cn } from "@/lib/utils";
import { Check, ChevronDown } from "lucide-react";

const cableTvSchema = z.object({
  card_number: z.string().min(10, "Card number must be at least 10 digits"),
  customer_name: z.string().optional(),
});

interface CablePlan {
  id: string;
  provider: string;
  package_name: string;
  price: number;
  api_code: string;
}

const PROVIDERS = [
  { id: 'DSTV', name: 'DSTV', logo: '/dstv.png' },
  { id: 'GOTV', name: 'GOTV', logo: '/gotv.png' },
  { id: 'STARTIMES', name: 'StarTimes', logo: '/startimes.png' },
];

const PurchaseCableTv = () => {
  const navigate = useNavigate();
  const { toast } = useToast();
  const [loading, setLoading] = useState(true);
  const [balance, setBalance] = useState(0);
  const [cablePlans, setCablePlans] = useState<CablePlan[]>([]);
  const [selectedProvider, setSelectedProvider] = useState("");
  const [selectedPlan, setSelectedPlan] = useState("");
  const [cardNumber, setCardNumber] = useState("");
  const [customerName, setCustomerName] = useState("");
  const [showSummary, setShowSummary] = useState(false);
  const [showSuccess, setShowSuccess] = useState(false);
  const [purchasing, setPurchasing] = useState(false);
  const [loadingPlans, setLoadingPlans] = useState(false);
  const [transactionDetails, setTransactionDetails] = useState<any>(null);
  const [validatingCard, setValidatingCard] = useState(false);
  const [validatedCustomer, setValidatedCustomer] = useState<{
    customer_name: string;
    card_number: string;
  } | null>(null);
  const [validationError, setValidationError] = useState<string | null>(null);
  const [openPackageSelect, setOpenPackageSelect] = useState(false);

  const { register, formState: { errors } } = useForm({
    resolver: zodResolver(cableTvSchema)
  });

  useEffect(() => {
    const fetchInitialData = async () => {
      try {
        const { data: { session } } = await supabase.auth.getSession();
        
        if (!session) {
          navigate('/user/auth');
          return;
        }

        // Fetch balance
        const { data: profile } = await supabase
          .from('profiles')
          .select('balance')
          .eq('id', session.user.id)
          .single();

        if (profile) {
          setBalance(profile.balance || 0);
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

  useEffect(() => {
    const fetchCablePlans = async () => {
      if (!selectedProvider) {
        setCablePlans([]);
        return;
      }

      setLoadingPlans(true);
      try {
        const { data, error } = await supabase.functions.invoke('fetch-cable-packages', {
          body: { provider: selectedProvider }
        });

        if (error) throw error;

        if (data?.success && data?.data) {
          const plans = (data.data as any[]).map((p: any, idx: number) => ({
            ...p,
            id: p.api_code || `${p.provider}-${p.package_name}-${idx}`,
          }));
          setCablePlans(plans);
          if (selectedPlan && !plans.find((pl) => pl.id === selectedPlan)) {
            setSelectedPlan("");
          }
        } else {
          toast({
            title: "Error",
            description: "Failed to load cable packages",
            variant: "destructive",
          });
        }
      } catch (error) {
        console.error('Error fetching cable plans:', error);
        toast({
          title: "Error",
          description: "Failed to load cable packages",
          variant: "destructive",
        });
      } finally {
        setLoadingPlans(false);
      }
    };

    fetchCablePlans();
  }, [selectedProvider, toast]);

  // Auto-validation effect with debounce
  useEffect(() => {
    // Clear previous validation when card number changes
    setValidatedCustomer(null);
    setValidationError(null);

    // Only validate if card number is 10+ digits and provider is selected
    if (!cardNumber || cardNumber.length < 10 || !selectedProvider) {
      return;
    }

    // Debounce: Wait 1.5 seconds after user stops typing
    const timeoutId = setTimeout(() => {
      validateCardNumber();
    }, 1500);

    // Cleanup: Cancel timeout if user continues typing
    return () => clearTimeout(timeoutId);
  }, [cardNumber, selectedProvider]);

  const validateCardNumber = async () => {
    setValidatingCard(true);
    setValidationError(null);

    try {
      const { data, error } = await supabase.functions.invoke('validate-cable-customer', {
        body: {
          card_number: cardNumber,
          provider: selectedProvider,
        }
      });

      // Check if there's an error or unsuccessful response
      if (error || !data?.success) {
        // Use the error message from the edge function response if available
        const errorMessage = data?.error || 'Invalid card number. Please check and try again.';
        throw new Error(errorMessage);
      }

      // Success: Store validated customer data
      setValidatedCustomer(data.data);
      setCustomerName(data.data.customer_name);

    } catch (error: any) {
      // Show user-friendly error message
      const friendlyMessage = error.message.includes('non-2xx status code') 
        ? "Invalid card number. Please check and try again."
        : error.message || "Could not verify card number";
      
      setValidationError(friendlyMessage);
    } finally {
      setValidatingCard(false);
    }
  };

  const handlePurchase = () => {
    if (!cardNumber || !selectedPlan) {
      toast({
        title: "Error",
        description: "Please fill in all fields",
        variant: "destructive",
      });
      return;
    }

    // Check if card is validated
    if (!validatedCustomer) {
      toast({
        title: "Verification Required",
        description: validatingCard 
          ? "Please wait for card verification to complete" 
          : "Card verification failed. Please check the card number and try again",
        variant: "destructive",
      });
      return;
    }

    const plan = cablePlans.find(p => p.id === selectedPlan);
    if (!plan) return;

    if (balance < plan.price) {
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
      const plan = cablePlans.find(p => p.id === selectedPlan);
      
      if (!plan) throw new Error("Invalid plan");

      const { data, error } = await supabase.functions.invoke('purchase-cable-tv', {
        body: {
          card_number: cardNumber,
          plan_id: plan.id,
          provider: selectedProvider,
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
        description: "Cable TV subscription successful",
      });
    } catch (error: any) {
      console.error('Error purchasing cable TV:', error);
      toast({
        title: "Purchase Failed",
        description: error.message || "Failed to purchase cable TV. Please try again.",
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

  const selectedPlanData = cablePlans.find(p => p.id === selectedPlan);

  return (
    <div className="min-h-screen bg-background p-4 pb-20">
      <div className="max-w-md mx-auto space-y-6">
        <div className="flex items-center justify-between">
          <h1 className="text-2xl font-bold">Cable TV Subscription</h1>
          <Button variant="ghost" onClick={() => navigate('/user/paybills')}>
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
            <CardTitle>Select Provider</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid grid-cols-3 gap-3">
              {PROVIDERS.map((provider) => (
                <Button
                  key={provider.id}
                  variant={selectedProvider === provider.id ? "default" : "outline"}
                  className="h-20 flex flex-col items-center gap-2"
                  onClick={() => {
                    setSelectedProvider(provider.id);
                    setSelectedPlan("");
                    setValidatedCustomer(null);
                    setValidationError(null);
                  }}
                >
                  <img 
                    src={provider.logo} 
                    alt={provider.name}
                    className="w-12 h-12 object-contain"
                  />
                  <span className="text-xs">{provider.name}</span>
                </Button>
              ))}
            </div>

            {selectedProvider && (
              <>
                <div className="space-y-2">
                  <Label htmlFor="plan">Select Package</Label>
                  <Popover open={openPackageSelect} onOpenChange={setOpenPackageSelect}>
                    <PopoverTrigger asChild>
                      <Button
                        variant="outline"
                        role="combobox"
                        disabled={loadingPlans}
                        className={cn(
                          "w-full justify-between font-normal h-auto min-h-[40px] py-2",
                          !selectedPlan && "text-muted-foreground"
                        )}
                      >
                        <div className="flex items-center justify-between w-full gap-2">
                          {loadingPlans ? (
                            <span>Loading packages...</span>
                          ) : selectedPlan ? (
                            <>
                              <span className="truncate text-left flex-1">
                                {cablePlans.find((plan) => plan.id === selectedPlan)?.package_name}
                              </span>
                              <span className="font-semibold text-primary whitespace-nowrap">
                                {formatNaira(cablePlans.find((plan) => plan.id === selectedPlan)?.price || 0)}
                              </span>
                            </>
                          ) : (
                            <span>Choose a package</span>
                          )}
                          <ChevronDown className="h-4 w-4 shrink-0 opacity-50" />
                        </div>
                      </Button>
                    </PopoverTrigger>
                    <PopoverContent className="w-[var(--radix-popover-trigger-width)] p-0 max-h-[400px] overflow-y-auto" align="start">
                      <div className="space-y-1 p-2">
                        {cablePlans.length === 0 ? (
                          <div className="p-4 text-center text-sm text-muted-foreground">
                            No packages available
                          </div>
                        ) : (
                          cablePlans.map((plan) => {
                            const isSelected = selectedPlan === plan.id;
                            return (
                              <button
                                key={plan.id}
                                type="button"
                                onClick={(e) => {
                                  e.preventDefault();
                                  e.stopPropagation();
                                  setSelectedPlan(plan.id);
                                  setOpenPackageSelect(false);
                                }}
                                className={cn(
                                  "w-full flex items-start justify-between p-3 rounded-lg border-2 transition-all",
                                  isSelected
                                    ? "border-primary bg-primary/5"
                                    : "border-border bg-card hover:bg-accent hover:border-primary/50"
                                )}
                              >
                                <div className="flex-1 text-left space-y-1">
                                  <div className="font-medium text-sm leading-tight">
                                    {plan.package_name}
                                  </div>
                                  <div className="text-xs text-muted-foreground">
                                    {selectedProvider}
                                  </div>
                                </div>
                                <div className="flex items-center gap-2 ml-3">
                                  <span className="font-bold text-primary whitespace-nowrap">
                                    {formatNaira(plan.price)}
                                  </span>
                                  {isSelected && (
                                    <Check className="h-4 w-4 text-primary flex-shrink-0" />
                                  )}
                                </div>
                              </button>
                            );
                          })
                        )}
                      </div>
                    </PopoverContent>
                  </Popover>
                </div>

                <div className="space-y-2">
                  <Label htmlFor="cardNumber">Smart Card Number / IUC Number</Label>
                  <div className="relative">
                    <Input
                      id="cardNumber"
                      type="text"
                      placeholder="Enter card number"
                      value={cardNumber}
                      {...register("card_number")}
                      onChange={(e) => setCardNumber(e.target.value)}
                      className={cn(
                        validatedCustomer && "border-green-500 focus-visible:ring-green-500",
                        validationError && "border-red-500 focus-visible:ring-red-500"
                      )}
                    />
                    {validatingCard && (
                      <div className="absolute right-3 top-1/2 -translate-y-1/2">
                        <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-primary"></div>
                      </div>
                    )}
                  </div>
                  
                  {/* Validation Status Messages */}
                  {validatingCard && (
                    <p className="text-sm text-muted-foreground flex items-center gap-2">
                      <span className="animate-pulse">Verifying card number...</span>
                    </p>
                  )}
                  
                  {validatedCustomer && (
                    <div className="p-3 bg-green-50 dark:bg-green-950 border border-green-200 dark:border-green-800 rounded-md">
                      <p className="text-sm text-green-700 dark:text-green-300 flex items-center gap-2">
                        <svg className="w-5 h-5" fill="currentColor" viewBox="0 0 20 20">
                          <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z" clipRule="evenodd" />
                        </svg>
                        <span className="font-medium">{validatedCustomer.customer_name}</span>
                      </p>
                    </div>
                  )}
                  
                  {validationError && (
                    <div className="p-3 bg-red-50 dark:bg-red-950 border border-red-200 dark:border-red-800 rounded-md">
                      <p className="text-sm text-red-700 dark:text-red-300 flex items-center gap-2">
                        <svg className="w-5 h-5" fill="currentColor" viewBox="0 0 20 20">
                          <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zM8.707 7.293a1 1 0 00-1.414 1.414L8.586 10l-1.293 1.293a1 1 0 101.414 1.414L10 11.414l1.293 1.293a1 1 0 001.414-1.414L11.414 10l1.293-1.293a1 1 0 00-1.414-1.414L10 8.586 8.707 7.293z" clipRule="evenodd" />
                        </svg>
                        <span>{validationError}</span>
                      </p>
                    </div>
                  )}
                  
                  {errors.card_number && (
                    <p className="text-sm text-destructive">{String(errors.card_number.message)}</p>
                  )}
                </div>

                <Button 
                  className="w-full" 
                  onClick={handlePurchase}
                  disabled={!selectedPlan || !cardNumber || !validatedCustomer || validatingCard || purchasing || loadingPlans}
                >
                  {purchasing ? "Processing..." : validatingCard ? "Verifying card..." : "Continue"}
                </Button>
              </>
            )}
          </CardContent>
        </Card>
      </div>

      {/* Purchase Summary Dialog */}
      <Dialog open={showSummary} onOpenChange={setShowSummary}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle className="text-xl font-bold">Confirm Purchase</DialogTitle>
            <DialogDescription>
              Please review your subscription details before proceeding
            </DialogDescription>
          </DialogHeader>
          {selectedPlanData && (
            <div className="space-y-4 py-4">
              <div className="rounded-lg bg-muted p-4 space-y-3">
                <div className="flex justify-between items-center">
                  <span className="text-sm text-muted-foreground">Provider</span>
                  <div className="flex items-center gap-2">
                    <img 
                      src={PROVIDERS.find(p => p.id === selectedProvider)?.logo} 
                      alt={selectedProvider}
                      className="w-6 h-6 object-contain"
                    />
                    <span className="font-semibold">{selectedProvider}</span>
                  </div>
                </div>
                <div className="flex justify-between items-start">
                  <span className="text-sm text-muted-foreground">Package</span>
                  <span className="font-semibold text-right max-w-[200px]">{selectedPlanData.package_name}</span>
                </div>
                <div className="flex justify-between items-center">
                  <span className="text-sm text-muted-foreground">Card Number</span>
                  <span className="font-mono font-semibold">{cardNumber}</span>
                </div>
                {validatedCustomer && (
                  <div className="flex justify-between items-center pt-2 border-t">
                    <span className="text-sm text-muted-foreground">Customer Name</span>
                    <span className="font-semibold text-green-600 dark:text-green-400">{validatedCustomer.customer_name}</span>
                  </div>
                )}
              </div>
              
              <div className="rounded-lg bg-primary/10 p-4 border border-primary/20">
                <div className="flex justify-between items-center">
                  <span className="font-medium">Total Amount</span>
                  <span className="text-2xl font-bold text-primary">{formatNaira(selectedPlanData.price)}</span>
                </div>
              </div>

              <div className="flex gap-3 pt-2">
                <Button 
                  variant="outline" 
                  onClick={() => setShowSummary(false)} 
                  className="flex-1"
                  disabled={purchasing}
                >
                  Cancel
                </Button>
                <Button 
                  onClick={handleConfirmPayment} 
                  className="flex-1" 
                  disabled={purchasing}
                >
                  {purchasing ? (
                    <>
                      <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-white mr-2"></div>
                      Processing...
                    </>
                  ) : (
                    "Confirm Payment"
                  )}
                </Button>
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>

      {/* Success Dialog */}
      <Dialog open={showSuccess} onOpenChange={setShowSuccess}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <div className="mx-auto mb-4 flex h-16 w-16 items-center justify-center rounded-full bg-green-100 dark:bg-green-900">
              <svg className="h-8 w-8 text-green-600 dark:text-green-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
              </svg>
            </div>
            <DialogTitle className="text-center text-xl font-bold">Subscription Successful!</DialogTitle>
            <DialogDescription className="text-center">
              Your cable TV subscription has been activated
            </DialogDescription>
          </DialogHeader>
          {transactionDetails && (
            <div className="space-y-4 py-4">
              <div className="rounded-lg bg-muted p-4 space-y-3">
                <div className="flex justify-between items-center">
                  <span className="text-sm text-muted-foreground">Provider</span>
                  <span className="font-semibold">{selectedProvider}</span>
                </div>
                <div className="flex justify-between items-start">
                  <span className="text-sm text-muted-foreground">Package</span>
                  <span className="font-semibold text-right max-w-[200px]">
                    {cablePlans.find(p => p.id === selectedPlan)?.package_name}
                  </span>
                </div>
                <div className="flex justify-between items-center">
                  <span className="text-sm text-muted-foreground">Card Number</span>
                  <span className="font-mono font-semibold">{cardNumber}</span>
                </div>
                {validatedCustomer && (
                  <div className="flex justify-between items-center">
                    <span className="text-sm text-muted-foreground">Customer</span>
                    <span className="font-semibold">{validatedCustomer.customer_name}</span>
                  </div>
                )}
                <div className="flex justify-between items-center">
                  <span className="text-sm text-muted-foreground">Reference</span>
                  <span className="font-mono text-sm">{transactionDetails.reference}</span>
                </div>
                <div className="flex justify-between items-center pt-2 border-t">
                  <span className="text-sm text-muted-foreground">Amount Paid</span>
                  <span className="text-lg font-bold text-primary">
                    {formatNaira(transactionDetails.amount)}
                  </span>
                </div>
                <div className="flex justify-between items-center">
                  <span className="text-sm text-muted-foreground">New Balance</span>
                  <span className="font-semibold">{formatNaira(transactionDetails.balance_after)}</span>
                </div>
              </div>

              <Button onClick={handleDone} className="w-full">
                View Transactions
              </Button>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
};

export default PurchaseCableTv;
