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
import { InsufficientBalanceModal } from "@/components/InsufficientBalanceModal";
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
  const [transactionStatus, setTransactionStatus] = useState<string>('completed');
  const [validatingCard, setValidatingCard] = useState(false);
  const [dueDateInfo, setDueDateInfo] = useState<{
    due_date: string | null;
    due_amount: number | null;
    account_status: string | null;
    customer_type: string | null;
  } | null>(null);
  const [loadingDueDate, setLoadingDueDate] = useState(false);
  const [showRenewalOption, setShowRenewalOption] = useState(false);
  const [renewing, setRenewing] = useState(false);
  const [changing, setChanging] = useState(false);
  const [subscriptionAction, setSubscriptionAction] = useState<'purchase' | 'renew' | 'change'>('purchase');
  const [validatedCustomer, setValidatedCustomer] = useState<{
    customer_name: string;
    card_number: string;
    customer_number?: string | null;
  } | null>(null);
  const [validationError, setValidationError] = useState<string | null>(null);
  const [openPackageSelect, setOpenPackageSelect] = useState(false);
  const [showInsufficientBalance, setShowInsufficientBalance] = useState(false);
  const [showWrongCardModal, setShowWrongCardModal] = useState(false);

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
        // Get the active cable vending provider setting
        const { data: providerSetting } = await supabase
          .from('app_settings')
          .select('setting_value')
          .eq('setting_key', 'cable_provider')
          .maybeSingle();

        const vendingProvider = providerSetting?.setting_value?.provider || 'smeplug';
        console.log('Fetching cable plans for provider:', selectedProvider, 'from vending provider:', vendingProvider);

        // Fetch plans directly from database table
        let query = supabase
          .from('cable_tv_plans')
          .select('id, provider, package_name, price, api_code, custom_price, is_active, vending_provider')
          .eq('provider', selectedProvider)
          .eq('is_active', true)
          .order('price', { ascending: true });

        // Try to filter by vending_provider if column exists
        try {
          query = query.eq('vending_provider', vendingProvider);
        } catch (e) {
          console.warn('Vending provider column may not exist, fetching all plans');
        }

        const { data, error } = await query;

        if (error) {
          // If error is about missing column, try without vending_provider filter
          if (error.code === '42703' || error.message?.includes('vending_provider')) {
            console.warn('Vending provider column not found, fetching all active plans');
            const { data: allData, error: allError } = await supabase
              .from('cable_tv_plans')
              .select('id, provider, package_name, price, api_code, custom_price, is_active, vending_provider')
              .eq('provider', selectedProvider)
              .eq('is_active', true)
              .order('price', { ascending: true });

            if (allError) throw allError;

            // Filter by vending_provider in memory
            const filtered = (allData || []).filter((plan: any) => 
              !plan.vending_provider || plan.vending_provider === vendingProvider
            );

            // Deduplicate by package name (case-insensitive)
            const seenPackages = new Set<string>();
            const plans = filtered
              .filter((p: any) => {
                const packageName = (p.package_name || '').trim().toLowerCase();
                if (seenPackages.has(packageName)) {
                  return false;
                }
                seenPackages.add(packageName);
                return true;
              })
              .map((p: any, idx: number) => ({
                id: p.id || p.api_code || `${p.provider}-${p.package_name}-${idx}`,
                provider: p.provider,
                package_name: p.package_name,
                price: p.custom_price || p.price,
                api_code: p.api_code,
              }));

            setCablePlans(plans);
            if (selectedPlan && !plans.find((pl) => pl.id === selectedPlan)) {
              setSelectedPlan("");
            }
            return;
          }
          throw error;
        }

        // Deduplicate by package name (case-insensitive) and map plans to the expected format
        const seenPackages = new Set<string>();
        const plans = (data || [])
          .filter((p: any) => {
            const packageName = (p.package_name || '').trim().toLowerCase();
            if (seenPackages.has(packageName)) {
              return false;
            }
            seenPackages.add(packageName);
            return true;
          })
          .map((p: any, idx: number) => ({
            id: p.id || p.api_code || `${p.provider}-${p.package_name}-${idx}`,
            provider: p.provider,
            package_name: p.package_name,
            price: p.custom_price || p.price,
            api_code: p.api_code,
          }));

        console.log(`Loaded ${plans.length} cable plans for ${selectedProvider}`);
        setCablePlans(plans);
        
        if (selectedPlan && !plans.find((pl) => pl.id === selectedPlan)) {
          setSelectedPlan("");
        }
      } catch (error: any) {
        console.error('Error fetching cable plans:', error);
        const errorMessage = error?.message || error?.error || (typeof error === 'string' ? error : "Failed to load cable packages");
        toast({
          title: "Error",
          description: errorMessage,
          variant: "destructive",
        });
        setCablePlans([]);
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
    setShowWrongCardModal(false);

    // Client-side validation: Check for obviously invalid card numbers
    if (cardNumber && cardNumber.length > 0) {
      // Check if card number is too short (less than 10 digits)
      const digitsOnly = cardNumber.replace(/\D/g, '');
      if (digitsOnly.length > 0 && digitsOnly.length < 10) {
        // Don't show modal for incomplete numbers, just return
        return;
      }
      
      // Check if card number contains only non-numeric characters (after removing spaces/dashes)
      if (digitsOnly.length === 0 && cardNumber.trim().length > 0) {
        setShowWrongCardModal(true);
        return;
      }
    }

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
    setShowWrongCardModal(false);

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
        const errorMessage = data?.error || error?.message || 'Invalid card number. Please check and try again.';
        const errorType = data?.errorType || '';
        const errorLower = errorMessage.toLowerCase();
        
        // Network error detection
        const isNetworkError = errorMessage.includes('Network request failed') ||
                              errorMessage.includes('network') ||
                              errorMessage.includes('fetch') ||
                              errorMessage.includes('Failed to fetch') ||
                              errorMessage.includes('ERR_INTERNET_DISCONNECTED') ||
                              errorMessage.includes('ERR_NETWORK_CHANGED') ||
                              error?.code === 'NETWORK_ERROR' ||
                              error?.name === 'TypeError';
        
        if (isNetworkError) {
          setValidationError("Network connection failed. Please check your internet connection and try again.");
          return;
        }
        
        // Check if it's an invalid card number error
        const isInvalidCard = errorType === 'invalid_card' ||
                             errorType === 'INVALID_CARD' ||
                             errorLower.includes('invalid') || 
                             errorLower.includes('card number') ||
                             errorLower.includes('smart card') ||
                             errorLower.includes('customer not found') ||
                             errorLower.includes('not found') ||
                             errorLower.includes('wrong') ||
                             errorLower.includes('incorrect') ||
                             errorLower.includes('does not exist') ||
                             errorLower.includes('unable to verify') ||
                             errorLower.includes('verification failed');
        
        if (isInvalidCard) {
          // Show wrong card modal
          setShowWrongCardModal(true);
          setValidatedCustomer(null);
          setCustomerName('');
          setValidationError(null);
        } else {
          // Show inline error for other issues (network, server errors, etc.)
          const friendlyMessage = error?.message?.includes('non-2xx status code') 
            ? "Could not verify card number. Please try again."
            : errorMessage || "Could not verify card number";
          setValidationError(friendlyMessage);
        }
        return;
      }

      // Success: Store validated customer data
      setValidatedCustomer(data.data);
      setCustomerName(data.data.customer_name);
      setShowWrongCardModal(false);
      setValidationError(null);

      // Fetch due date information after successful validation
      await fetchDueDateInfo(cardNumber, selectedProvider);

    } catch (error: any) {
      console.error('Error validating card number:', error);
      
      // Check for network errors
      const errorMessage = error?.message || error?.data?.error || error?.error || (typeof error === 'string' ? error : "Could not verify card number");
      const errorLower = errorMessage.toLowerCase();
      
      // Network error detection
      const isNetworkError = errorMessage.includes('Network request failed') ||
                            errorMessage.includes('network') ||
                            errorMessage.includes('fetch') ||
                            errorMessage.includes('Failed to fetch') ||
                            errorMessage.includes('ERR_INTERNET_DISCONNECTED') ||
                            errorMessage.includes('ERR_NETWORK_CHANGED') ||
                            error?.code === 'NETWORK_ERROR' ||
                            error?.name === 'TypeError';
      
      if (isNetworkError) {
        setValidationError("Network connection failed. Please check your internet connection and try again.");
        return;
      }
      
      // Check if it's an invalid card error
      const isInvalidCard = errorLower.includes('invalid') || 
                           errorLower.includes('card number') ||
                           errorLower.includes('smart card') ||
                           errorLower.includes('customer not found') ||
                           errorLower.includes('not found') ||
                           errorLower.includes('wrong') ||
                           errorLower.includes('incorrect') ||
                           errorLower.includes('does not exist') ||
                           errorLower.includes('unable to verify') ||
                           errorLower.includes('verification failed');
      
      if (isInvalidCard) {
        setShowWrongCardModal(true);
        setValidatedCustomer(null);
        setCustomerName('');
        setValidationError(null);
      } else {
        const friendlyMessage = errorMessage.includes('non-2xx status code') 
          ? "Could not verify card number. Please try again."
          : errorMessage;
        setValidationError(friendlyMessage);
      }
    } finally {
      setValidatingCard(false);
    }
  };

  const fetchDueDateInfo = async (smartCard: string, provider: string) => {
    if (!smartCard || !provider) return;

    try {
      setLoadingDueDate(true);
      const { data, error } = await supabase.functions.invoke('get-cable-due-date', {
        body: {
          card_number: smartCard,
          provider: provider,
        },
      });

      if (error) {
        console.error('Error fetching due date:', error);
        return;
      }

      if (data?.success && data?.data) {
        setDueDateInfo({
          due_date: data.data.due_date,
          due_amount: data.data.due_amount,
          account_status: data.data.account_status,
          customer_type: data.data.customer_type,
        });
        // Show renewal option if due date exists
        if (data.data.due_date) {
          setShowRenewalOption(true);
        }
      }
    } catch (error: any) {
      console.error('Error fetching due date info:', error);
      // Silently fail for due date - it's not critical for purchase
      // Network errors are handled gracefully
    } finally {
      setLoadingDueDate(false);
    }
  };

  const handleRenewal = async () => {
    if (!validatedCustomer || !dueDateInfo?.due_amount) {
      toast({
        title: "Error",
        description: "Unable to process renewal. Please verify your card number first.",
        variant: "destructive",
      });
      return;
    }

    if (balance < dueDateInfo.due_amount) {
      setShowInsufficientBalance(true);
      return;
    }

    setRenewing(true);
    try {
      const { data: session } = await supabase.auth.getSession();
      if (!session?.session) {
        throw new Error('Please sign in to continue');
      }

      const { data, error } = await supabase.functions.invoke('renew-cable-subscription', {
        body: {
          card_number: cardNumber,
          provider: selectedProvider,
          customer_number: validatedCustomer.customer_number,
          customer_name: validatedCustomer.customer_name,
          amount: dueDateInfo.due_amount,
        },
        headers: {
          Authorization: `Bearer ${session.session.access_token}`,
        },
      });

      if (error) throw error;

      // Handle pending transactions
      if (data?.pending === true || (data?.success === false && data?.error?.includes('pending'))) {
        toast({
          title: "Transaction Pending",
          description: data?.error || "Transaction is pending confirmation. Your wallet has not been debited.",
          variant: "default",
        });
        setRenewing(false);
        return;
      }

      if (!data?.success) {
        throw new Error(data?.error || 'Renewal failed');
      }

      setTransactionDetails(data.data);
      setShowSuccess(true);

      // Refresh balance
      if (session.session) {
        const { data: profile } = await supabase
          .from('profiles')
          .select('balance')
          .eq('id', session.session.user.id)
          .single();

        if (profile) {
          setBalance(profile.balance || 0);
        }
      }

      toast({
        title: "Success",
        description: "Cable TV subscription renewed successfully",
      });
    } catch (error: any) {
      console.error('Error renewing subscription:', error);
      
      const errorMessage = error?.message || error?.error || "Failed to renew subscription. Please try again.";
      const errorLower = errorMessage.toLowerCase();
      
      // Network error detection
      const isNetworkError = errorMessage.includes('Network request failed') ||
                            errorMessage.includes('network') ||
                            errorMessage.includes('fetch') ||
                            errorMessage.includes('Failed to fetch') ||
                            errorMessage.includes('ERR_INTERNET_DISCONNECTED') ||
                            errorMessage.includes('ERR_NETWORK_CHANGED') ||
                            errorMessage.includes('timeout') ||
                            error?.code === 'NETWORK_ERROR' ||
                            error?.name === 'TypeError';
      
      const friendlyMessage = isNetworkError
        ? "Network connection failed. Please check your internet connection and try again."
        : errorMessage;
      
      toast({
        title: isNetworkError ? "Connection Error" : "Renewal Failed",
        description: friendlyMessage,
        variant: "destructive",
      });
    } finally {
      setRenewing(false);
    }
  };

  const handleChangeSubscription = async () => {
    if (!validatedCustomer || !selectedPlan) {
      toast({
        title: "Error",
        description: "Please verify your card number and select a package to change to.",
        variant: "destructive",
      });
      return;
    }

    const plan = cablePlans.find(p => p.id === selectedPlan);
    if (!plan) {
      toast({
        title: "Error",
        description: "Selected package not found",
        variant: "destructive",
      });
      return;
    }

    if (balance < plan.price) {
      setShowInsufficientBalance(true);
      return;
    }

    setChanging(true);
    try {
      const { data: session } = await supabase.auth.getSession();
      if (!session?.session) {
        throw new Error('Please sign in to continue');
      }

      const { data, error } = await supabase.functions.invoke('change-cable-subscription', {
        body: {
          card_number: cardNumber,
          provider: selectedProvider,
          customer_number: validatedCustomer.customer_number,
          customer_name: validatedCustomer.customer_name,
          amount: plan.price,
          plan_id: plan.id,
          product_code: plan.api_code,
        },
        headers: {
          Authorization: `Bearer ${session.session.access_token}`,
        },
      });

      if (error) throw error;

      // Handle pending transactions
      if (data?.pending === true || (data?.success === false && data?.error?.includes('pending'))) {
        toast({
          title: "Transaction Pending",
          description: data?.error || "Transaction is pending confirmation. Your wallet has not been debited.",
          variant: "default",
        });
        setChanging(false);
        return;
      }

      if (!data?.success) {
        throw new Error(data?.error || 'Change subscription failed');
      }

      setTransactionDetails(data.data);
      setShowSuccess(true);

      // Refresh balance
      if (session.session) {
        const { data: profile } = await supabase
          .from('profiles')
          .select('balance')
          .eq('id', session.session.user.id)
          .single();

        if (profile) {
          setBalance(profile.balance || 0);
        }
      }

      toast({
        title: "Success",
        description: "Cable TV subscription changed successfully",
      });
    } catch (error: any) {
      console.error('Error changing subscription:', error);
      
      const errorMessage = error?.message || error?.error || "Failed to change subscription. Please try again.";
      const errorLower = errorMessage.toLowerCase();
      
      // Network error detection
      const isNetworkError = errorMessage.includes('Network request failed') ||
                            errorMessage.includes('network') ||
                            errorMessage.includes('fetch') ||
                            errorMessage.includes('Failed to fetch') ||
                            errorMessage.includes('ERR_INTERNET_DISCONNECTED') ||
                            errorMessage.includes('ERR_NETWORK_CHANGED') ||
                            errorMessage.includes('timeout') ||
                            error?.code === 'NETWORK_ERROR' ||
                            error?.name === 'TypeError';
      
      const friendlyMessage = isNetworkError
        ? "Network connection failed. Please check your internet connection and try again."
        : errorMessage;
      
      toast({
        title: isNetworkError ? "Connection Error" : "Change Failed",
        description: friendlyMessage,
        variant: "destructive",
      });
    } finally {
      setChanging(false);
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
      setShowInsufficientBalance(true);
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

      // Get session to ensure we have a valid token
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) {
        throw new Error('Please sign in to continue');
      }

      // Add timeout wrapper for the function call
      const functionCall = supabase.functions.invoke('purchase-cable-tv', {
        body: {
          card_number: cardNumber,
          plan_id: plan.id,
          provider: selectedProvider,
          customer_number: validatedCustomer?.customer_number,
          customer_name: validatedCustomer?.customer_name,
        },
        headers: {
          Authorization: `Bearer ${session.access_token}`,
        },
      });

      // Add timeout (60 seconds)
      const timeoutPromise = new Promise((_, reject) => {
        setTimeout(() => reject(new Error('Request timeout - The function took too long to respond')), 60000);
      });

      const { data, error } = await Promise.race([functionCall, timeoutPromise]) as any;

      if (error) {
        console.error('Edge function error:', error);
        throw error;
      }

      // Handle pending transactions
      if (data?.pending === true || (data?.success === false && data?.error?.includes('pending'))) {
        toast({
          title: "Transaction Pending",
          description: data?.error || "Transaction is pending confirmation from MobileNig. Your wallet has not been debited. Please try again in a few moments.",
          variant: "default",
        });
        setPurchasing(false);
        return;
      }

      if (!data?.success) {
        throw new Error(data?.error || 'Purchase failed');
      }

      setTransactionDetails(data.data);
      setShowSuccess(true);

      // Refresh balance (reuse existing session)
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

      // Check if transaction is pending
      const isPending = data.data?.is_pending || data.data?.status?.toLowerCase().includes('pending') || data.data?.status?.toLowerCase().includes('processing');
      const status = data.data?.status || 'Completed';
      
      setTransactionStatus(isPending ? 'pending' : 'completed');
      
      if (isPending) {
        toast({
          title: "Transaction Pending",
          description: "Your transaction is being processed. Please check back in a few moments.",
          variant: "default",
        });
      } else {
        toast({
          title: "Success",
          description: "Cable TV subscription successful",
        });
      }
      
      // Clear form after successful purchase (but keep success dialog open)
      // Form will be fully cleared when user closes success dialog
    } catch (error: any) {
      console.error('Error purchasing cable TV:', error);
      
      const errorMessage = error?.message || error?.error || (typeof error === 'string' ? error : "Failed to purchase cable TV. Please try again.");
      const errorLower = errorMessage.toLowerCase();
      
      // Network error detection
      const isNetworkError = errorMessage.includes('Network request failed') ||
                            errorMessage.includes('network') ||
                            errorMessage.includes('fetch') ||
                            errorMessage.includes('Failed to fetch') ||
                            errorMessage.includes('ERR_INTERNET_DISCONNECTED') ||
                            errorMessage.includes('ERR_NETWORK_CHANGED') ||
                            errorMessage.includes('timeout') ||
                            error?.code === 'NETWORK_ERROR' ||
                            error?.name === 'TypeError';
      
      const friendlyMessage = isNetworkError
        ? "Network connection failed. Please check your internet connection and try again."
        : errorMessage;
      
      toast({
        title: isNetworkError ? "Connection Error" : "Purchase Failed",
        description: friendlyMessage,
        variant: "destructive",
      });
    } finally {
      setPurchasing(false);
    }
  };

  const clearForm = () => {
    setCardNumber('');
    setSelectedPlan('');
    setValidatedCustomer(null);
    setDueDateInfo(null);
    setValidationError(null);
    setShowSummary(false);
    setSubscriptionAction('purchase');
    setTransactionDetails(null);
    setTransactionStatus('completed');
    setPurchasing(false);
    setRenewing(false);
    setChanging(false);
    setValidatingCard(false);
    setLoadingDueDate(false);
    setOpenPackageSelect(false);
    setShowWrongCardModal(false);
    setShowInsufficientBalance(false);
  };

  const handleDone = () => {
    setShowSuccess(false);
    clearForm();
    navigate('/user/transactions');
  };

  const handleSuccessDialogClose = (open: boolean) => {
    if (!open) {
      clearForm();
    }
    setShowSuccess(open);
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
                    <div className="space-y-3">
                      <div className="p-4 bg-green-50 dark:bg-green-950 border-2 border-green-300 dark:border-green-700 rounded-lg shadow-sm">
                        <div className="flex items-center gap-2 mb-2">
                          <svg className="w-5 h-5 text-green-600 dark:text-green-400" fill="currentColor" viewBox="0 0 20 20">
                          <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z" clipRule="evenodd" />
                        </svg>
                          <span className="text-sm text-green-600 dark:text-green-400 font-semibold">Card Verified Successfully</span>
                        </div>
                        <div className="space-y-1">
                          <p className="text-xs text-green-600 dark:text-green-400 font-medium uppercase tracking-wide">Customer Full Name</p>
                          <p className="text-base font-bold text-green-800 dark:text-green-200 break-words">
                            {validatedCustomer.customer_name || 'N/A'}
                          </p>
                        </div>
                      </div>

                      {/* Due Date Information */}
                      {loadingDueDate && (
                        <div className="p-3 bg-muted border rounded-lg">
                          <div className="flex items-center gap-2">
                            <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-primary"></div>
                            <span className="text-sm text-muted-foreground">Loading subscription details...</span>
                          </div>
                        </div>
                      )}

                      {dueDateInfo && !loadingDueDate && (
                        <div className="p-4 bg-blue-50 dark:bg-blue-950 border-2 border-blue-300 dark:border-blue-700 rounded-lg shadow-sm">
                          <div className="flex items-center gap-2 mb-3">
                            <svg className="w-5 h-5 text-blue-600 dark:text-blue-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" />
                            </svg>
                            <span className="text-sm text-blue-600 dark:text-blue-400 font-semibold">Subscription Information</span>
                          </div>
                          <div className="space-y-2">
                            {dueDateInfo.due_date && (
                              <div className="flex justify-between items-center">
                                <span className="text-xs text-blue-600 dark:text-blue-400 font-medium uppercase tracking-wide">Due Date</span>
                                <span className="text-sm font-bold text-blue-800 dark:text-blue-200">
                                  {new Date(dueDateInfo.due_date).toLocaleDateString('en-US', { 
                                    year: 'numeric', 
                                    month: 'long', 
                                    day: 'numeric' 
                                  })}
                                </span>
                              </div>
                            )}
                            {dueDateInfo.due_amount && (
                              <div className="flex justify-between items-center pt-2 border-t border-blue-200 dark:border-blue-800">
                                <span className="text-xs text-blue-600 dark:text-blue-400 font-medium uppercase tracking-wide">Due Amount</span>
                                <span className="text-base font-bold text-blue-800 dark:text-blue-200">
                                  {formatNaira(dueDateInfo.due_amount)}
                                </span>
                              </div>
                            )}
                            {dueDateInfo.account_status && (
                              <div className="flex justify-between items-center pt-1">
                                <span className="text-xs text-muted-foreground">Account Status</span>
                                <span className={`text-xs font-semibold ${
                                  dueDateInfo.account_status.toLowerCase() === 'active' 
                                    ? 'text-green-600 dark:text-green-400' 
                                    : 'text-yellow-600 dark:text-yellow-400'
                                }`}>
                                  {dueDateInfo.account_status}
                                </span>
                              </div>
                            )}
                          </div>
                          {dueDateInfo.due_amount && (
                            <div className="space-y-2 mt-3">
                              <Button
                                className="w-full"
                                onClick={handleRenewal}
                                disabled={renewing || balance < dueDateInfo.due_amount}
                                variant="default"
                              >
                                {renewing ? "Renewing..." : `Renew Subscription - ${formatNaira(dueDateInfo.due_amount)}`}
                              </Button>
                              <p className="text-xs text-center text-muted-foreground">
                                Or select a package below to change subscription
                              </p>
                            </div>
                          )}
                        </div>
                      )}
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

                <div className="space-y-2">
                  {dueDateInfo?.due_date && (
                    <div className="p-3 bg-muted rounded-lg border">
                      <p className="text-xs text-muted-foreground mb-2">Subscription Action:</p>
                      <div className="flex gap-2">
                        <Button
                          variant={subscriptionAction === 'purchase' ? 'default' : 'outline'}
                          size="sm"
                          className="flex-1"
                          onClick={() => setSubscriptionAction('purchase')}
                        >
                          New Purchase
                        </Button>
                        <Button
                          variant={subscriptionAction === 'change' ? 'default' : 'outline'}
                          size="sm"
                          className="flex-1"
                          onClick={() => setSubscriptionAction('change')}
                          disabled={!selectedPlan}
                        >
                          Change Package
                        </Button>
                      </div>
                    </div>
                  )}

                <Button 
                  className="w-full" 
                    onClick={subscriptionAction === 'change' ? handleChangeSubscription : handlePurchase}
                    disabled={
                      !cardNumber || 
                      !validatedCustomer || 
                      validatingCard || 
                      purchasing || 
                      changing ||
                      loadingPlans ||
                      (subscriptionAction === 'purchase' && !selectedPlan) ||
                      (subscriptionAction === 'change' && !selectedPlan)
                    }
                  >
                    {changing ? "Changing..." : purchasing ? "Processing..." : validatingCard ? "Verifying card..." : 
                     subscriptionAction === 'change' ? "Change Subscription" : "Continue"}
                </Button>
                </div>
              </>
            )}
          </CardContent>
        </Card>
      </div>

      {/* Purchase Summary Dialog */}
      <Dialog open={showSummary} onOpenChange={setShowSummary}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle className="text-xl font-bold">
              {subscriptionAction === 'change' ? 'Confirm Subscription Change' : 'Confirm Purchase'}
            </DialogTitle>
            <DialogDescription>
              {subscriptionAction === 'change' 
                ? 'Please review the package change details before confirming'
                : 'Please review your subscription details before proceeding'}
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
                  <div className="flex justify-between items-start pt-2 border-t">
                    <span className="text-sm text-muted-foreground">Customer Full Name</span>
                    <span className="font-bold text-green-600 dark:text-green-400 text-right max-w-[200px] break-words">
                      {validatedCustomer.customer_name || 'N/A'}
                    </span>
                  </div>
                )}
              </div>
              
              <div className="rounded-lg bg-primary/10 p-4 border border-primary/20">
                <div className="flex justify-between items-center">
                  <span className="font-medium">Total Amount</span>
                  <span className="text-2xl font-bold text-primary">{formatNaira(selectedPlanData.price)}</span>
                </div>
              </div>

              {subscriptionAction === 'change' && (
                <div className="p-3 bg-blue-50 dark:bg-blue-950 border border-blue-200 dark:border-blue-800 rounded-lg">
                  <p className="text-xs text-blue-600 dark:text-blue-400 font-medium mb-1">
                    Changing Subscription
                  </p>
                  <p className="text-sm text-blue-800 dark:text-blue-200">
                    Your subscription will be changed to the selected package. The current subscription will be replaced.
                  </p>
                </div>
              )}

              <div className="flex gap-3 pt-2">
                <Button 
                  variant="outline" 
                  onClick={() => setShowSummary(false)} 
                  className="flex-1"
                  disabled={purchasing || changing}
                >
                  Cancel
                </Button>
                <Button 
                  onClick={subscriptionAction === 'change' ? handleChangeSubscription : handleConfirmPayment} 
                  className="flex-1" 
                  disabled={purchasing || changing}
                >
                  {changing ? (
                    <>
                      <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-white mr-2"></div>
                      Changing...
                    </>
                  ) : purchasing ? (
                    <>
                      <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-white mr-2"></div>
                      Processing...
                    </>
                  ) : (
                    subscriptionAction === 'change' ? "Confirm Change" : "Confirm Payment"
                  )}
                </Button>
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>

      {/* Success Dialog */}
      <Dialog open={showSuccess} onOpenChange={handleSuccessDialogClose}>
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
                  <div className="flex justify-between items-start pt-2 border-t">
                    <span className="text-sm text-muted-foreground">Customer Full Name</span>
                    <span className="font-bold text-green-600 dark:text-green-400 text-right max-w-[200px] break-words">
                      {validatedCustomer.customer_name || 'N/A'}
                    </span>
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

      <InsufficientBalanceModal
        open={showInsufficientBalance}
        onOpenChange={setShowInsufficientBalance}
        currentBalance={balance}
        requiredAmount={cablePlans.find(p => p.id === selectedPlan)?.price}
      />

      {/* Wrong Card Number Modal */}
      <Dialog open={showWrongCardModal} onOpenChange={setShowWrongCardModal}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <div className="flex justify-center mb-4">
              <div className="rounded-full bg-orange-100 dark:bg-orange-900/30 p-4">
              <svg
                xmlns="http://www.w3.org/2000/svg"
                  className="h-16 w-16 text-orange-600 dark:text-orange-500"
                fill="none"
                viewBox="0 0 24 24"
                stroke="currentColor"
                strokeWidth={2}
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                    d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z"
                />
              </svg>
            </div>
          </div>
            <DialogTitle className="text-center text-2xl font-bold text-orange-600 dark:text-orange-500">
              Invalid Smart Card Number
            </DialogTitle>
            <DialogDescription className="text-center text-base mt-2">
              The smart card number you entered is incorrect or invalid. Please check the number on your decoder and try again.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-4">
            <div className="bg-orange-50 dark:bg-orange-900/20 border border-orange-200 dark:border-orange-800 rounded-lg p-4">
              <p className="text-sm text-orange-800 dark:text-orange-200 font-medium mb-2">Tips:</p>
              <ul className="text-sm text-orange-700 dark:text-orange-300 space-y-1 list-disc list-inside">
                <li>Make sure you're entering the correct smart card number</li>
                <li>Check that the number matches your {selectedProvider} decoder</li>
                <li>Remove any spaces or special characters</li>
                <li>The card number should be at least 10 digits long</li>
              </ul>
            </div>
          <div className="flex gap-3">
            <Button
              variant="outline"
              className="flex-1"
              onClick={() => {
                setShowWrongCardModal(false);
                setCardNumber('');
                  setValidationError(null);
                }}
              >
                Try Again
              </Button>
              <Button
                className="flex-1 bg-orange-600 hover:bg-orange-700"
                onClick={() => {
                  setShowWrongCardModal(false);
                  setCardNumber('');
                  setValidationError(null);
              }}
            >
              OK
            </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
};

export default PurchaseCableTv;
