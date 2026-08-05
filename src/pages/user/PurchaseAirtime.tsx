import { useState, useEffect, useMemo, useRef, useCallback } from "react";
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
import { useVendingSettings } from "@/contexts/VendingSettingsContext";

const NETWORK_KEY_MAP: Record<string, string> = {
  MTN: "MTN",
  "MTN NIGERIA": "MTN",
  AIRTEL: "AIRTEL",
  "AIRTEL NIGERIA": "AIRTEL",
  GLO: "GLO",
  GLOBACOM: "GLO",
  "9MOBILE": "9MOBILE",
  "9 MOBILE": "9MOBILE",
  ETISALAT: "9MOBILE",
};

const NETWORK_DISPLAY_NAMES: Record<string, string> = {
  MTN: "MTN",
  AIRTEL: "Airtel",
  GLO: "Glo",
  "9MOBILE": "9Mobile",
};

const SMEPLUG_NETWORK_IDS: Record<string, string> = {
  MTN: "1",
  AIRTEL: "2",
  "9MOBILE": "3",
  GLO: "4",
};

const EBILLS_SERVICE_IDS: Record<string, string> = {
  MTN: "mtn",
  AIRTEL: "airtel",
  GLO: "glo",
  "9MOBILE": "9mobile",
};

type ProviderDetails = {
  id: string;
  network: string;
  displayName: string;
  minAmount: number;
  maxAmount: number;
  apiCode: string;
  identifierLabel: string;
  placeholder?: string;
};

const resolveAirtimeNetworkId = (
  provider: ProviderDetails,
  vendingProvider: "smeplug" | "ebills",
): string | null => {
  if (vendingProvider === "ebills") {
    const fromApiCode = provider.apiCode?.trim().toLowerCase();
    if (fromApiCode && !/^\d+$/.test(fromApiCode)) {
      return fromApiCode;
    }
    if (provider.network && EBILLS_SERVICE_IDS[provider.network]) {
      return EBILLS_SERVICE_IDS[provider.network];
    }
    return null;
  }

  const smeplugId = provider.network ? SMEPLUG_NETWORK_IDS[provider.network] : null;
  return (smeplugId || provider.apiCode)?.trim() || null;
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

interface Network {
  id: string;
  name: string;
  network_id?: string;
  min_amount?: number;
  max_amount?: number;
  identifier_label?: string;
  placeholder?: string;
  item_code?: string | null;
}

const normalizeNetwork = (value?: string | null) => {
  if (!value) return null;
  const upper = value.toUpperCase().trim();
  return NETWORK_KEY_MAP[upper] || upper;
};

const getNetworkDisplayName = (networkId: string) =>
  NETWORK_DISPLAY_NAMES[networkId] ||
  networkId.replace(/_/g, " ").replace(/\s+/g, " ").replace(/\b\w/g, (char) => char.toUpperCase());

const PurchaseAirtime = () => {
  const navigate = useNavigate();
  const { toast } = useToast();
  const [loading, setLoading] = useState(true);
  const [balance, setBalance] = useState(0);
  const [providers, setProviders] = useState<ProviderDetails[]>([]);
  const [selectedNetwork, setSelectedNetwork] = useState("");
  const [phoneNumber, setPhoneNumber] = useState("");
  const [amount, setAmount] = useState("");
  const [showSummary, setShowSummary] = useState(false);
  const [showSuccess, setShowSuccess] = useState(false);
  const [purchasing, setPurchasing] = useState(false);
  const [transactionDetails, setTransactionDetails] = useState<any>(null);
  const [showInsufficientBalance, setShowInsufficientBalance] = useState(false);
  const [showInvalidPhoneModal, setShowInvalidPhoneModal] = useState(false);
  const [invalidPhoneMessage, setInvalidPhoneMessage] = useState("Please enter a valid 11-digit phone number.");
  const { providers: vendingSettings } = useVendingSettings();
  const airtimeVendingProvider = vendingSettings.airtime === 'ebills' ? 'ebills' : 'smeplug';
  const providerRef = useRef<string | null>(null);

  useEffect(() => {
    providerRef.current = selectedNetwork || null;
  }, [selectedNetwork]);

  const fetchInitialData = useCallback(async () => {
    try {
      setLoading(true);
      const { data: { session }, error: sessionError } = await supabase.auth.getSession();

      if (sessionError) throw sessionError;
      if (!session) {
        navigate('/user/auth');
        return;
      }

      await ensureProfileExists(session.user);

      const [profileRes, providersRes] = await Promise.all([
        supabase
          .from('profiles')
          .select('balance')
          .eq('id', session.user.id)
          .single(),
        supabase.functions.invoke('fetch-airtime-purchase-options'),
      ]);

      if (profileRes.error && profileRes.error.code !== 'PGRST116') {
        throw profileRes.error;
      }

      if (providersRes.error) {
        throw providersRes.error;
      }

      if (!providersRes.data?.success) {
        throw new Error(providersRes.data?.error || 'Unable to load airtime providers.');
      }

      const mappedProviders: ProviderDetails[] = ((providersRes.data?.data || []) as Network[])
        .map((provider) => {
          const normalized = normalizeNetwork(provider.name);
          if (!normalized) return null;

          return {
            id: provider.id,
            network: normalized,
            displayName: getNetworkDisplayName(normalized),
            minAmount: Number(provider.min_amount) || 0,
            maxAmount: Number(provider.max_amount) || 0,
            apiCode: provider.network_id
              ? String(provider.network_id).trim()
              : SMEPLUG_NETWORK_IDS[normalized] || '1',
            identifierLabel: provider.identifier_label || 'Phone Number',
            placeholder: provider.placeholder,
          } as ProviderDetails;
        })
        .filter((item): item is ProviderDetails => Boolean(item));

      const dedupedProviders = Array.from(
        mappedProviders.reduce((acc, provider) => {
          const existing = acc.get(provider.network);
          if (!existing) {
            acc.set(provider.network, provider);
            return acc;
          }

          const shouldReplace =
            provider.maxAmount > existing.maxAmount ||
            (provider.maxAmount === existing.maxAmount && provider.minAmount < existing.minAmount);

          if (shouldReplace) {
            acc.set(provider.network, provider);
          }

          return acc;
        }, new Map<string, ProviderDetails>())
        .values()
      );

      const order: Record<string, number> = { MTN: 0, AIRTEL: 1, '9MOBILE': 2, GLO: 3 };
      const sortedProviders = dedupedProviders.sort((a, b) => {
        const orderA = order[a.network] ?? 99;
        const orderB = order[b.network] ?? 99;
        if (orderA !== orderB) return orderA - orderB;
        return a.displayName.localeCompare(b.displayName);
      });

      const previousProvider = providerRef.current;
      const effectiveProvider =
        previousProvider && sortedProviders.some((provider) => provider.id === previousProvider)
          ? previousProvider
          : sortedProviders[0]?.id ?? '';

      setProviders(sortedProviders);
      setSelectedNetwork(effectiveProvider);
      setBalance(Number(profileRes.data?.balance) || 0);
    } catch (error) {
      console.error('Error fetching initial data:', error);
      toast({
        title: 'Error',
        description: 'Failed to load data. Please refresh the page.',
        variant: 'destructive',
      });
      setProviders([]);
      setSelectedNetwork('');
      setBalance(0);
    } finally {
      setLoading(false);
    }
  }, [navigate, toast]);

  useEffect(() => {
    fetchInitialData();
  }, [fetchInitialData]);

  const selectedNetworkDetails = useMemo(
    () => providers.find((provider) => provider.id === selectedNetwork),
    [providers, selectedNetwork]
  );

  const identifierLabel = selectedNetworkDetails?.identifierLabel || 'Phone Number';
  const identifierPlaceholder = selectedNetworkDetails?.placeholder === 'Mobile Number'
    ? '08012345678'
    : selectedNetworkDetails?.placeholder
      ? `Enter ${selectedNetworkDetails.placeholder.toLowerCase()}`
      : '08012345678';

  const parsedAmount = useMemo(() => {
    if (!amount) return NaN;
    const sanitized = amount.replace(/,/g, '');
    const parsed = Number.parseFloat(sanitized);
    return Number.isFinite(parsed) ? parsed : NaN;
  }, [amount]);

  const amountValue = Number.isNaN(parsedAmount) ? 0 : parsedAmount;
  const minAmount = selectedNetworkDetails?.minAmount ?? 0;
  const maxAmount = selectedNetworkDetails?.maxAmount ?? 0;

  const amountHint = selectedNetworkDetails
    ? `Min: ${formatNaira(minAmount)} • Max: ${formatNaira(maxAmount)}`
    : 'Select a network to view limits';

  const handleAmountChange = (value: string) => {
    let sanitized = value.replace(/[^0-9.]/g, '');
    const parts = sanitized.split('.');
    if (parts.length > 2) {
      sanitized = `${parts[0]}.${parts.slice(1).join('')}`;
    }
    if (sanitized.startsWith('.')) {
      sanitized = `0${sanitized}`;
    }
    setAmount(sanitized);
  };

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
    if (!phoneNumber || !amount || !selectedNetworkDetails) {
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

    if (Number.isNaN(parsedAmount) || parsedAmount <= 0) {
      toast({
        title: "Error",
        description: "Please enter a valid amount",
        variant: "destructive",
      });
      return;
    }

    if (parsedAmount < minAmount) {
      toast({
        title: 'Error',
        description: `Minimum amount for ${selectedNetworkDetails.displayName} is ${formatNaira(minAmount)}`,
        variant: 'destructive',
      });
      return;
    }

    if (parsedAmount > maxAmount) {
      toast({
        title: 'Error',
        description: `Maximum amount for ${selectedNetworkDetails.displayName} is ${formatNaira(maxAmount)}`,
        variant: 'destructive',
      });
      return;
    }

    if (balance < parsedAmount) {
      setShowInsufficientBalance(true);
      return;
    }

    setShowSummary(true);
  };

  const handleConfirmPayment = async () => {
    setPurchasing(true);
    setShowSummary(false);

    try {
      const network = providers.find(n => n.id === selectedNetwork);
      if (!network) throw new Error("Invalid network");

      const normalizedNetworkId = resolveAirtimeNetworkId(network, airtimeVendingProvider);

      if (!normalizedNetworkId) {
        throw new Error('Unable to determine network code for this provider. Please try again.');
      }

      const submissionAmount = Number.parseFloat(amount.replace(/,/g, '').trim());
      if (!Number.isFinite(submissionAmount) || submissionAmount <= 0) {
        throw new Error('Unable to determine the amount to charge. Please re-enter the amount.');
      }

      const { data: sessionData } = await supabase.auth.getSession();
      const accessToken = sessionData?.session?.access_token;

      const purchaseFunction =
        airtimeVendingProvider === 'ebills' ? 'purchase-ebills-airtime' : 'purchase-smeplug-airtime';

      const purchaseBody =
        airtimeVendingProvider === 'ebills'
          ? {
              phone_number: normalizePhoneNumber(phoneNumber),
              amount: submissionAmount,
              network_name: network.network,
              service_id: normalizedNetworkId,
            }
          : {
              phone_number: normalizePhoneNumber(phoneNumber),
              amount: submissionAmount,
              network_id: normalizedNetworkId,
              network_name: network.network,
            };

      const { data, error } = await supabase.functions.invoke(purchaseFunction, {
        body: purchaseBody,
        headers: accessToken
          ? {
              Authorization: `Bearer ${accessToken}`,
            }
          : undefined,
      });

      if (error) {
        const errorMessage = error?.message || String(error);
        const errorName = error?.name || error?.constructor?.name || '';
        const isNetworkError =
          errorMessage.includes('Network request failed') ||
          errorMessage.includes('Failed to send a request to the Edge Function') ||
          errorMessage.includes('Failed to fetch') ||
          errorMessage.includes('ERR_INTERNET_DISCONNECTED') ||
          errorMessage.includes('ERR_NETWORK_CHANGED') ||
          errorMessage.includes('TypeError') ||
          errorName === 'FunctionsFetchError' ||
          errorName === 'TypeError' ||
          (error as any)?.code === 'NETWORK_ERROR';

        if (isNetworkError) {
          throw new Error('Network connection failed. Please check your internet connection and try again.');
        }

        throw new Error(error.message || 'Failed to connect to server');
      }

      if (!data?.success) {
        const detailMessage =
          data?.details?.message ||
          data?.details?.error ||
          data?.details?.response_description ||
          data?.details?.data?.message ||
          data?.details?.data?.error;
        const errorMessage = detailMessage || data?.error || data?.message || 'Airtime purchase failed';
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
              {providers.map((network) => (
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
                    src={getNetworkLogo(network.network)} 
                    alt={network.displayName}
                    className="w-12 h-12 object-contain"
                  />
                  <span className="text-xs font-medium">{network.displayName}</span>
                </button>
              ))}
            </div>

            {selectedNetwork && (
              <>
                <div className="space-y-2">
                  <Label htmlFor="phone">{identifierLabel}</Label>
                  <Input
                    id="phone"
                    type="tel"
                    placeholder={identifierPlaceholder}
                    value={phoneNumber}
                    onChange={(e) => setPhoneNumber(e.target.value)}
                  />
                </div>

                <div className="space-y-2">
                  <Label htmlFor="amount">Amount (₦)</Label>
                  <Input
                    id="amount"
                    type="text"
                    placeholder="100"
                    value={amount}
                    onChange={(e) => handleAmountChange(e.target.value)}
                  />
                  <p className="text-sm text-muted-foreground">{amountHint}</p>
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
                  src={getNetworkLogo(providers.find(n => n.id === selectedNetwork)?.network || '')} 
                  alt={providers.find(n => n.id === selectedNetwork)?.displayName}
                  className="w-14 h-14 object-contain"
                />
              </div>
            </div>
            <div className="flex justify-between">
              <span>Network:</span>
              <span className="font-semibold">{providers.find(n => n.id === selectedNetwork)?.displayName}</span>
            </div>
            <div className="flex justify-between">
              <span>{identifierLabel}:</span>
              <span className="font-semibold">{phoneNumber}</span>
            </div>
            <div className="flex justify-between">
              <span>Amount:</span>
              <span className="font-semibold">{formatNaira(amountValue)}</span>
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

      <Dialog open={showInvalidPhoneModal} onOpenChange={setShowInvalidPhoneModal}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Invalid Phone Number</DialogTitle>
            <DialogDescription>
              {invalidPhoneMessage}
            </DialogDescription>
          </DialogHeader>
          <Button onClick={() => setShowInvalidPhoneModal(false)} className="w-full">
            Okay
          </Button>
        </DialogContent>
      </Dialog>

      <InsufficientBalanceModal
        open={showInsufficientBalance}
        onOpenChange={setShowInsufficientBalance}
        currentBalance={balance}
        requiredAmount={amountValue}
      />
    </div>
  );
};

export default PurchaseAirtime;
