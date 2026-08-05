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
import { InsufficientBalanceModal } from "@/components/InsufficientBalanceModal";
import { IncorrectMeterNumberModal } from "@/components/IncorrectMeterNumberModal";
import { electricityService } from "@/services/electricityService";
import { useVendingSettings } from "@/contexts/VendingSettingsContext";

const electricitySchema = z.object({
  meter_number: z.string().min(10, "Meter number must be at least 10 digits"),
  amount: z.string().min(1, "Amount is required"),
  phone: z.string().min(11, "Phone number must be at least 11 digits").max(11, "Phone number must be 11 digits"),
});

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
  const { providers: vendingSettings } = useVendingSettings();
  const vendingProvider = vendingSettings.electricity as "vtpass" | "mobilenig" | "ebills" | "smeplug";
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
  const [showInsufficientBalance, setShowInsufficientBalance] = useState(false);
  const [showWrongMeterModal, setShowWrongMeterModal] = useState(false);

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
      const { data: { session } } = await supabase.auth.getSession();
      
      if (!session) {
        throw new Error('Please sign in to continue');
      }

      let responseData: any = null;
      let useDirectFetch = false;

      // Try supabase.functions.invoke first
      try {
        const { data, error } = await supabase.functions.invoke('validate-meter-number', {
          body: {
            meter_number: meterNumber,
            provider: selectedProvider,
            meter_type: meterType,
            vending_provider: vendingProvider
          },
        });

        if (error) {
          throw error;
        }

        if (data) {
          responseData = data;
        }
      } catch (invokeError: any) {
        console.log('Supabase invoke failed, trying direct fetch:', invokeError);
        useDirectFetch = true;

        // Fallback to direct fetch
        const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
        if (!supabaseUrl) {
          throw new Error('Configuration error: Supabase URL not set');
      }

      const response = await fetch(`${supabaseUrl}/functions/v1/validate-meter-number`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${session.access_token}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          meter_number: meterNumber,
          provider: selectedProvider,
          meter_type: meterType,
            vending_provider: vendingProvider
        }),
      });

      const responseText = await response.text();
      
      if (!responseText || responseText.trim().length === 0) {
        console.error('Empty response from validate-meter-number');
        throw new Error('No response from server. Please try again.');
      }
      
      try {
        responseData = JSON.parse(responseText);
      } catch (parseError) {
        console.error('Failed to parse validation response:', parseError, 'Response:', responseText);
        if (response.status >= 500) {
          throw new Error('Server error. Please try again later.');
        }
        throw new Error(`Invalid response from server: ${responseText.substring(0, 200)}`);
      }

      if (!response.ok) {
        const errorMsg = responseData?.error || responseData?.message || `HTTP ${response.status}: ${response.statusText}`;
        throw new Error(errorMsg);
      }
      }

      if (!responseData) {
        throw new Error('No data received from server');
      }

      console.log('Meter validation response:', responseData);

      if (responseData?.success) {
        setMeterInfo(responseData.data);
        toast({
          title: "Meter Validated",
          description: `Customer: ${responseData.data?.customer_name || 'Verified'}`,
        });
      } else {
        // Extract error message from various possible locations
        const errorMsg = 
          responseData?.error || 
          responseData?.details?.details ||
          responseData?.details?.message ||
          responseData?.message || 
          'Validation failed';
        
        // Check errorType from response (set by backend function)
        const errorType = responseData?.errorType;
        
        // Check status code for EXC010 (data not found)
        const statusCode = responseData?.details?.statusCode || responseData?.statusCode;
        const isEXC010 = statusCode === 'EXC010';
        
        // Check if it's an invalid meter error
        const errorDetails = responseData?.details || {};
        const detailsText = typeof errorDetails === 'string' 
          ? errorDetails 
          : (errorDetails?.message || errorDetails?.error || errorDetails?.response_description || JSON.stringify(errorDetails) || '');
        const fullErrorText = `${errorMsg} ${detailsText}`.toLowerCase();
        
        const isInvalidMeter = 
          errorType === 'invalid_meter' ||
          isEXC010 ||
          fullErrorText.includes('invalid meter') ||
          fullErrorText.includes('invalid meter number') ||
          fullErrorText.includes('invalid customer') ||
          fullErrorText.includes('invalid customer_id') ||
          fullErrorText.includes('cannot be found') ||
          fullErrorText.includes('data you are looking for') ||
          fullErrorText.includes('meter not found') ||
          fullErrorText.includes('customer not found') ||
          fullErrorText.includes('wrong meter') ||
          fullErrorText.includes('incorrect meter') ||
          errorDetails?.code === 'invalid_customer_id' ||
          errorDetails?.errorCode === 'invalid_customer_id' ||
          responseData?.errorCode === 'invalid_customer_id' ||
          statusCode === 'invalid_customer_id';
        
        console.error('Validation failed:', errorMsg, responseData);
        
        if (isInvalidMeter) {
          setShowWrongMeterModal(true);
          return;
        }
        
        throw new Error(errorMsg);
      }
    } catch (error: any) {
      console.error('Error validating meter:', error);
      
      let errorMessage = "Could not validate meter number";
      
      if (error?.message) {
        errorMessage = error.message;
      } else if (typeof error === 'string') {
        errorMessage = error;
      } else if (error?.error) {
        errorMessage = error.error;
      }

      // Check if this is an invalid meter error from the error message
      const errorDetails = error?.details || {};
      const detailsText = typeof errorDetails === 'string' 
        ? errorDetails 
        : (errorDetails?.message || errorDetails?.error || errorDetails?.response_description || JSON.stringify(errorDetails) || '');
      const fullErrorText = `${errorMessage} ${detailsText}`.toLowerCase();
      
      const isInvalidMeterError = 
        fullErrorText.includes('invalid meter') ||
        fullErrorText.includes('invalid meter number') ||
        fullErrorText.includes('invalid customer') ||
        fullErrorText.includes('invalid customer_id') ||
        fullErrorText.includes('meter number') ||
        fullErrorText.includes('meter not found') ||
        fullErrorText.includes('customer not found') ||
        fullErrorText.includes('wrong meter') ||
        fullErrorText.includes('incorrect meter') ||
        fullErrorText.includes('cannot be found') ||
        fullErrorText.includes('data you are looking for') ||
        errorDetails?.code === 'invalid_customer_id' ||
        errorDetails?.errorCode === 'invalid_customer_id' ||
        error?.code === 'invalid_customer_id' ||
        error?.errorCode === 'invalid_customer_id';

      if (isInvalidMeterError) {
        setShowWrongMeterModal(true);
        return;
      }

      // Handle network errors
      if (errorMessage.includes('Failed to fetch') || 
          errorMessage.includes('NetworkError') ||
          errorMessage.includes('Network request failed') ||
          error?.name === 'TypeError') {
        errorMessage = 'Connection error. Please check your internet connection and try again.';
      }

      toast({
        title: "Validation Failed",
        description: errorMessage,
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

    const normalizedPhone = normalizePhoneNumber(phone);
    if (!isValidNigerianPhone(normalizedPhone)) {
      toast({
        title: "Error",
        description: "Please enter a valid 11-digit phone number (e.g. 08012345678)",
        variant: "destructive",
      });
      return;
    }

    if (normalizedPhone !== phone) {
      setPhone(normalizedPhone);
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

    const chargeFee = Math.round(purchaseAmount * 0.02 * 100) / 100;
    const totalAmount = purchaseAmount + chargeFee;

    if (balance < totalAmount) {
      setShowInsufficientBalance(true);
      return;
    }

    setShowSummary(true);
  };

  const handleConfirmPayment = async () => {
    setPurchasing(true);
    setShowSummary(false);

    try {
      const result = await electricityService.purchaseElectricity({
          meter_number: meterNumber,
          provider: selectedProvider,
          meter_type: meterType,
          amount: Number(amount),
          phone: normalizePhoneNumber(phone),
        vending_provider: vendingProvider,
        customer_name: meterInfo?.customer_name,
        customer_address: meterInfo?.address,
        tariff: meterInfo?.tariff,
        minimum_vend: meterInfo?.minimum_vend,
        outstanding_amount: meterInfo?.outstanding_amount,
        customer_category: meterInfo?.customer_category,
        business_unit: meterInfo?.business_unit,
      });

      if (result.success) {
        setTransactionDetails(result.data);
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
      } else {
        throw new Error(result.error || 'Purchase failed');
      }
    } catch (error: any) {
      console.error('Error purchasing electricity:', error);
      
      // Check if this is an invalid meter error
      const errorMessage = error?.message || error?.error || String(error || '');
      const errorDetails = error?.details || error?.responseData?.details || {};
      const detailsText = typeof errorDetails === 'string' 
        ? errorDetails 
        : (errorDetails?.message || errorDetails?.error || errorDetails?.response_description || JSON.stringify(errorDetails) || '');
      const fullErrorText = `${errorMessage} ${detailsText}`.toLowerCase();
      
      const isInvalidMeter = 
        fullErrorText.includes('invalid meter') ||
        fullErrorText.includes('invalid meter number') ||
        fullErrorText.includes('invalid customer') ||
        fullErrorText.includes('invalid customer_id') ||
        fullErrorText.includes('meter number') ||
        fullErrorText.includes('meter not found') ||
        fullErrorText.includes('customer not found') ||
        fullErrorText.includes('wrong meter') ||
        fullErrorText.includes('incorrect meter') ||
        fullErrorText.includes('cannot be found') ||
        fullErrorText.includes('data you are looking for') ||
        error?.errorCode === '018' ||
        error?.code === '018' ||
        error?.errorCode === 'invalid_customer_id' ||
        error?.code === 'invalid_customer_id' ||
        errorDetails?.code === 'invalid_customer_id' ||
        errorDetails?.errorCode === 'invalid_customer_id';
      
      if (isInvalidMeter) {
        setShowWrongMeterModal(true);
        return;
      }
      
      toast({
        title: "Purchase Failed",
        description: errorMessage || "Failed to purchase electricity. Please try again.",
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
                    <Card className="bg-green-50 border-green-200">
                      <CardHeader className="pb-3">
                  <div className="flex items-center gap-2">
                          <CheckCircle className="h-5 w-5 text-green-600" />
                          <CardTitle className="text-lg text-green-900">Meter Verified</CardTitle>
                        </div>
                      </CardHeader>
                      <CardContent className="space-y-4">
                        <div className="space-y-3">
                          <div>
                            <Label className="text-xs text-green-700 font-medium">Customer Name</Label>
                            <p className="text-sm font-semibold text-green-900 mt-1">{meterInfo?.customer_name || 'N/A'}</p>
                          </div>
                          
                          <div>
                            <Label className="text-xs text-green-700 font-medium">Meter Number</Label>
                            <p className="text-sm font-mono text-green-900 mt-1">{meterInfo?.meter_number || meterNumber || 'N/A'}</p>
                          </div>
                          
                          {(meterInfo?.address && meterInfo.address.trim()) && (
                            <div>
                              <Label className="text-xs text-green-700 font-medium">Address</Label>
                              <p className="text-sm text-green-900 mt-1">{meterInfo.address}</p>
                            </div>
                          )}
                          
                          <div className="grid grid-cols-2 gap-3 pt-2 border-t border-green-200">
                            {(meterInfo?.tariff && meterInfo.tariff.trim()) && (
                              <div>
                                <Label className="text-xs text-green-700 font-medium">Tariff</Label>
                                <p className="text-sm text-green-900 mt-1">{meterInfo.tariff}</p>
                              </div>
                            )}
                            
                            <div>
                              <Label className="text-xs text-green-700 font-medium">Meter Type</Label>
                              <p className="text-sm text-green-900 mt-1 capitalize">{meterInfo?.meter_type?.toLowerCase() || meterType}</p>
                            </div>
                            
                            {(meterInfo?.minimum_vend !== undefined && meterInfo.minimum_vend !== null) && (
                              <div>
                                <Label className="text-xs text-green-700 font-medium">Minimum Purchase</Label>
                                <p className="text-sm font-semibold text-green-900 mt-1">
                                  ₦{Number(meterInfo.minimum_vend).toLocaleString('en-NG', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                                </p>
                              </div>
                            )}
                            
                            {(meterInfo?.outstanding_amount !== undefined && meterInfo.outstanding_amount !== null && Number(meterInfo.outstanding_amount) > 0) && (
                              <div>
                                <Label className="text-xs text-green-700 font-medium">Outstanding Amount</Label>
                                <p className="text-sm font-semibold text-orange-600 mt-1">
                                  ₦{Number(meterInfo.outstanding_amount).toLocaleString('en-NG', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                                </p>
                              </div>
                            )}
                            
                            {(meterInfo?.customer_category && meterInfo.customer_category.trim()) && (
                              <div>
                                <Label className="text-xs text-green-700 font-medium">Customer Category</Label>
                                <p className="text-sm text-green-900 mt-1">{meterInfo.customer_category}</p>
                              </div>
                            )}
                            
                            {(meterInfo?.business_unit && meterInfo.business_unit.trim()) && (
                              <div>
                                <Label className="text-xs text-green-700 font-medium">Business Unit</Label>
                                <p className="text-sm text-green-900 mt-1">{meterInfo.business_unit}</p>
                              </div>
                            )}
                            
                            {(meterInfo?.utility_account && meterInfo.utility_account.trim()) && (
                              <div className="col-span-2">
                                <Label className="text-xs text-green-700 font-medium">Utility Account</Label>
                                <p className="text-sm text-green-900 mt-1">{meterInfo.utility_account}</p>
                  </div>
                    )}
                  </div>
                </div>
                      </CardContent>
                    </Card>
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
              <Card className="bg-green-50 border-green-200">
                <CardHeader className="pb-3">
                  <div className="flex items-center gap-2">
                    <CheckCircle className="h-5 w-5 text-green-600" />
                    <CardTitle className="text-lg text-green-900">Customer Details</CardTitle>
                  </div>
                </CardHeader>
                <CardContent className="space-y-4">
                  <div className="space-y-3">
                    <div>
                      <Label className="text-xs text-green-700 font-medium">Customer Name</Label>
                      <p className="text-sm font-semibold text-green-900 mt-1">{meterInfo?.customer_name || 'N/A'}</p>
                    </div>
                    
                    <div>
                      <Label className="text-xs text-green-700 font-medium">Meter Number</Label>
                      <p className="text-sm font-mono text-green-900 mt-1">{meterInfo?.meter_number || meterNumber || 'N/A'}</p>
                    </div>
                    
                    {(meterInfo?.address && meterInfo.address.trim()) && (
                      <div>
                        <Label className="text-xs text-green-700 font-medium">Address</Label>
                        <p className="text-sm text-green-900 mt-1">{meterInfo.address}</p>
                      </div>
                    )}
                    
                    <div className="grid grid-cols-2 gap-3 pt-2 border-t border-green-200">
                      {(meterInfo?.tariff && meterInfo.tariff.trim()) && (
                        <div>
                          <Label className="text-xs text-green-700 font-medium">Tariff</Label>
                          <p className="text-sm text-green-900 mt-1">{meterInfo.tariff}</p>
                  </div>
                )}
                      
                      <div>
                        <Label className="text-xs text-green-700 font-medium">Meter Type</Label>
                        <p className="text-sm text-green-900 mt-1 capitalize">{meterInfo?.meter_type?.toLowerCase() || meterType}</p>
                      </div>
                      
                      {(meterInfo?.minimum_vend !== undefined && meterInfo.minimum_vend !== null) && (
                        <div>
                          <Label className="text-xs text-green-700 font-medium">Minimum Purchase</Label>
                          <p className="text-sm font-semibold text-green-900 mt-1">
                            ₦{Number(meterInfo.minimum_vend).toLocaleString('en-NG', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                          </p>
                </div>
                      )}
                      
                      {(meterInfo?.outstanding_amount !== undefined && meterInfo.outstanding_amount !== null && Number(meterInfo.outstanding_amount) > 0) && (
                        <div>
                          <Label className="text-xs text-green-700 font-medium">Outstanding Amount</Label>
                          <p className="text-sm font-semibold text-orange-600 mt-1">
                            ₦{Number(meterInfo.outstanding_amount).toLocaleString('en-NG', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                          </p>
                </div>
                      )}
                      
                      {(meterInfo?.customer_category && meterInfo.customer_category.trim()) && (
                        <div>
                          <Label className="text-xs text-green-700 font-medium">Customer Category</Label>
                          <p className="text-sm text-green-900 mt-1">{meterInfo.customer_category}</p>
                  </div>
                )}
                      
                      {(meterInfo?.business_unit && meterInfo.business_unit.trim()) && (
                        <div>
                          <Label className="text-xs text-green-700 font-medium">Business Unit</Label>
                          <p className="text-sm text-green-900 mt-1">{meterInfo.business_unit}</p>
                  </div>
                )}
                      
                      {(meterInfo?.utility_account && meterInfo.utility_account.trim()) && (
                        <div className="col-span-2">
                          <Label className="text-xs text-green-700 font-medium">Utility Account</Label>
                          <p className="text-sm text-green-900 mt-1">{meterInfo.utility_account}</p>
                  </div>
                )}
              </div>
                  </div>
                </CardContent>
              </Card>
            )}
            <div className="flex justify-between">
              <span>Amount:</span>
              <span className="font-semibold">{formatNaira(Number(amount))}</span>
            </div>
            <div className="flex justify-between text-sm text-muted-foreground">
              <span>Service Charge (2%):</span>
              <span>{formatNaira(Math.round(Number(amount) * 0.02 * 100) / 100)}</span>
            </div>
            <div className="flex justify-between border-t pt-2 font-semibold">
              <span>Total Amount:</span>
              <span className="text-primary">
                {formatNaira(Number(amount) + Math.round(Number(amount) * 0.02 * 100) / 100)}
              </span>
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
                <div className="bg-orange-50 border-2 border-orange-200 p-4 rounded-lg">
                  <p className="text-sm font-semibold text-orange-600 mb-2 uppercase tracking-wide">Electricity Token</p>
                  <p className="text-xl font-mono font-bold text-center text-gray-900 tracking-wider break-all">{transactionDetails.token}</p>
                  <p className="text-xs text-gray-500 mt-2 text-center">Keep this token safe. You'll need it to recharge your meter.</p>
                </div>
              )}
              <div className="grid grid-cols-2 gap-x-4 gap-y-2 text-sm">
                <span className="text-muted-foreground">Provider:</span>
                <span className="font-semibold text-foreground">
                  {transactionDetails.service_name ||
                   providers.find(p => p.providerCode === transactionDetails.provider && p.meterType === transactionDetails.meter_type)?.name ||
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
              <div className="space-y-2 text-sm">
                <div className="flex justify-between">
                  <span>Reference:</span>
                  <span className="font-semibold">{transactionDetails.reference}</span>
                </div>
                {transactionDetails.mobile_nig_reference && (
                  <div className="flex justify-between">
                    <span>MobileNig Reference:</span>
                    <span className="font-semibold text-foreground font-mono text-xs">{transactionDetails.mobile_nig_reference}</span>
                  </div>
                )}
                {transactionDetails.receipt_number && (
                  <div className="flex justify-between">
                    <span>Receipt Number:</span>
                    <span className="font-semibold text-foreground font-mono text-xs">{transactionDetails.receipt_number}</span>
                  </div>
                )}
                {transactionDetails.trans_id && (
                  <div className="flex justify-between">
                    <span>Transaction ID:</span>
                    <span className="font-semibold text-foreground font-mono text-xs">{transactionDetails.trans_id}</span>
                  </div>
                )}
                <div className="flex justify-between">
                  <span>Amount:</span>
                  <span className="font-semibold">{formatNaira(transactionDetails.amount)}</span>
                </div>
                <div className="flex justify-between">
                  <span>New Balance:</span>
                  <span className="font-semibold">{formatNaira(transactionDetails.balance_after)}</span>
                </div>
                {transactionDetails.wallet_balance && (
                  <div className="flex justify-between text-xs text-muted-foreground">
                    <span>Provider Wallet Balance:</span>
                    <span className="font-semibold">{formatNaira(Number(transactionDetails.wallet_balance))}</span>
                  </div>
                )}
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
        requiredAmount={Number(amount) + Math.round(Number(amount) * 0.02 * 100) / 100}
      />

      <IncorrectMeterNumberModal
        open={showWrongMeterModal}
        onOpenChange={setShowWrongMeterModal}
        meterNumber={meterNumber}
        onRetry={() => {
          setMeterNumber("");
          setMeterInfo(null);
        }}
      />
    </div>
  );
};

export default PurchaseElectricity;
