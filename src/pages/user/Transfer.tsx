import { useState, useEffect, useCallback } from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { ArrowLeft, Mail, User, DollarSign, CheckCircle, AlertCircle, Send, X, Copy } from "lucide-react";
import { toast } from "sonner";
import { InsufficientBalanceModal } from "@/components/InsufficientBalanceModal";

// Transfer fee configuration (must match backend)
const TRANSFER_FEE_PERCENTAGE = 0.05; // 5% fee (e.g., ₦50 for ₦1000 transfer)
const MIN_TRANSFER_FEE = 10; // Minimum fee of ₦10

// Calculate transfer fee based on amount
const calculateTransferFee = (amount: number): number => {
  const percentageFee = amount * TRANSFER_FEE_PERCENTAGE;
  return Math.max(MIN_TRANSFER_FEE, Math.round(percentageFee * 100) / 100);
};

export default function Transfer() {
  const navigate = useNavigate();
  const [currentBalance, setCurrentBalance] = useState(0);
  const [recipientEmail, setRecipientEmail] = useState("");
  const [amount, setAmount] = useState("");
  const [description, setDescription] = useState("");
  const [loading, setLoading] = useState(false);
  const [verifying, setVerifying] = useState(false);
  const [recipientDetails, setRecipientDetails] = useState<any>(null);
  const [showConfirmation, setShowConfirmation] = useState(false);
  const [showSuccess, setShowSuccess] = useState(false);
  const [transferData, setTransferData] = useState<any>(null);
  const [currentUserEmail, setCurrentUserEmail] = useState("");
  const [showInsufficientBalance, setShowInsufficientBalance] = useState(false);
  const [isDemoUser, setIsDemoUser] = useState(false);

  const fetchBalance = useCallback(async () => {
    const { data: { session }, error: sessionError } = await supabase.auth.getSession();

    if (sessionError) {
      throw sessionError;
    }

    if (!session) {
      navigate("/user/auth");
      return null;
    }

    const userEmail = session.user.email || "";
    setCurrentUserEmail(userEmail);
    setIsDemoUser(userEmail === "demo@netpayy.ng");

    const { data: profile, error: profileError } = await supabase
      .from("profiles")
      .select("balance")
      .eq("id", session.user.id)
      .single();

    if (profileError) {
      throw profileError;
    }

    setCurrentBalance(Number(profile?.balance) || 0);
    return session;
  }, [navigate]);

  useEffect(() => {
    fetchBalance().catch((error) => {
      console.error("Failed to load transfer balance:", error);
      toast.error(error instanceof Error ? error.message : "Unable to load balance");
    });
  }, [fetchBalance]);

  const verifyRecipient = async () => {
    const trimmedEmail = recipientEmail.trim().toLowerCase();

    if (!trimmedEmail || !trimmedEmail.includes('@')) {
      toast.error("Please enter a valid email address");
      return;
    }

    if (trimmedEmail === currentUserEmail.toLowerCase()) {
      toast.error("You cannot transfer to yourself");
      return;
    }

    if (isDemoUser && trimmedEmail === "demo-recipient@netpayy.ng") {
      setRecipientDetails({
        email: "demo-recipient@netpayy.ng",
        full_name: "Demo Recipient",
      });
      toast.success("Demo recipient ready");
      return;
    }

    setVerifying(true);
    try {
      const { data: { session }, error: sessionError } = await supabase.auth.getSession();
      if (sessionError) throw sessionError;
      if (!session) {
        navigate("/user/auth");
        return;
      }

      const { data: verifyResponse, error } = await supabase.functions.invoke('verify-transfer-recipient', {
        body: {
          email: trimmedEmail,
        },
        headers: session.access_token
          ? {
              Authorization: `Bearer ${session.access_token}`,
            }
          : undefined,
      });

      if (error) {
        throw error;
      }

      if (!verifyResponse?.success) {
        toast.error(verifyResponse?.error || "Recipient not found. Please check the email address.");
        setRecipientDetails(null);
        return;
      }

      setRecipientDetails(verifyResponse.data);
      toast.success("Recipient verified successfully!");
    } catch (error) {
      console.error("Error verifying recipient:", error);
      toast.error(error instanceof Error ? error.message : "Error verifying recipient");
      setRecipientDetails(null);
    } finally {
      setVerifying(false);
    }
  };

  const handleTransfer = async () => {
    const trimmedEmail = recipientEmail.trim().toLowerCase();

    if (!recipientDetails && !(isDemoUser && trimmedEmail === "demo-recipient@netpayy.ng")) {
      toast.error("Please verify recipient first");
      return;
    }

    if (!recipientDetails && isDemoUser && trimmedEmail === "demo-recipient@netpayy.ng") {
      setRecipientDetails({
        email: "demo-recipient@netpayy.ng",
        full_name: "Demo Recipient",
      });
    }

    if (!amount || Number(amount) <= 0) {
      toast.error("Please enter a valid amount");
      return;
    }

    const transferAmount = Number(amount);
    const transferFee = calculateTransferFee(transferAmount);
    const totalAmount = transferAmount + transferFee;

    if (totalAmount > currentBalance) {
      setShowInsufficientBalance(true);
      return;
    }

    setShowConfirmation(true);
  };

  const confirmTransfer = async () => {
    setLoading(true);
    try {
      const { data: { session }, error: sessionError } = await supabase.auth.getSession();
      if (sessionError) throw sessionError;
      if (!session) {
        toast.error("Session expired. Please login again.");
        navigate("/user/auth");
        return;
      }

      const finalRecipientEmail =
        isDemoUser && recipientEmail.trim().toLowerCase() === "demo-recipient@netpayy.ng"
          ? "demo-recipient@netpayy.ng"
          : recipientDetails?.email?.toLowerCase();

      if (!finalRecipientEmail) {
        toast.error("Recipient details are missing");
        return;
      }

      const { data, error } = await supabase.functions.invoke('transfer-funds', {
        body: {
          recipientEmail: finalRecipientEmail,
          amount: Number(amount),
          description: description || undefined,
        },
        headers: session.access_token
          ? {
              Authorization: `Bearer ${session.access_token}`,
            }
          : undefined,
      });

      if (error) throw error;

      if (data.success) {
        // Store transfer data
        setTransferData(data.data);
        
        // Update balance
        setCurrentBalance(data.data.senderBalanceAfter);
        await fetchBalance();
        
        // Close confirmation and show success
        setShowConfirmation(false);
        setShowSuccess(true);
      } else {
        toast.error(data.error || "Transfer failed");
      }
    } catch (error: any) {
      console.error('Transfer error:', error);
      const message = error?.message || "Transfer failed. Please try again.";
      const isNetworkError =
        message.includes("Network request failed") ||
        message.includes("Failed to send a request to the Edge Function") ||
        message.includes("Failed to fetch") ||
        error?.name === "FunctionsFetchError" ||
        error?.name === "TypeError";

      toast.error(isNetworkError ? "Network connection failed. Please check your internet connection and try again." : message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Header */}
      <div className="bg-white px-6 py-4 sticky top-0 z-10 shadow-sm">
        <div className="flex items-center gap-4">
          <button
            onClick={() => navigate("/user/dashboard")}
            className="text-gray-600 hover:text-gray-900"
          >
            <ArrowLeft className="w-6 h-6" />
          </button>
          <h1 className="text-2xl font-bold text-gray-900">Transfer Money</h1>
        </div>
      </div>

      <div className="px-6 py-6 space-y-6">
        {/* Balance Card */}
        <div className="bg-gradient-to-r from-brand to-brand-light rounded-2xl p-6 text-white">
          <p className="text-white/90 text-sm mb-2">Available Balance</p>
          <p className="text-3xl font-bold">₦{currentBalance.toLocaleString()}</p>
        </div>

        {isDemoUser && (
          <div className="bg-amber-50 border border-amber-200 rounded-2xl p-4 space-y-3">
            <div className="flex items-start gap-3">
              <AlertCircle className="w-5 h-5 text-amber-600 shrink-0 mt-0.5" />
              <div>
                <p className="font-semibold text-amber-900">Demo transfer recipient</p>
                <p className="text-sm text-amber-800">Use the test recipient below for demo transfers and app review.</p>
              </div>
            </div>
            <div className="flex items-center justify-between gap-3 bg-white rounded-xl border px-4 py-3">
              <span className="text-sm font-medium text-gray-900 break-all">demo-recipient@netpayy.ng</span>
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={async () => {
                  await navigator.clipboard.writeText("demo-recipient@netpayy.ng");
                  setRecipientEmail("demo-recipient@netpayy.ng");
                  setRecipientDetails(null);
                  toast.success("Demo recipient copied and filled");
                }}
              >
                <Copy className="w-4 h-4 mr-1" />
                Use
              </Button>
            </div>
          </div>
        )}

        {/* Transfer Form */}
        <div className="bg-white rounded-2xl border shadow-sm p-6 space-y-6">
          {/* Recipient Email */}
          <div className="space-y-2">
            <label className="text-sm font-medium text-gray-900 flex items-center gap-2">
              <Mail className="w-4 h-4" />
              Recipient Email Address
            </label>
            <div className="flex gap-2">
              <input
                type="email"
                value={recipientEmail}
                onChange={(e) => {
                  setRecipientEmail(e.target.value);
                  setRecipientDetails(null);
                }}
                placeholder="Enter recipient's email"
                className="flex-1 px-4 py-3 rounded-lg border bg-background text-foreground focus:outline-none focus:ring-2 focus:ring-primary"
                disabled={loading}
              />
              <Button
                onClick={verifyRecipient}
                disabled={verifying || !recipientEmail}
                variant="outline"
              >
                {verifying ? "Verifying..." : "Verify"}
              </Button>
            </div>
            {isDemoUser && recipientEmail.trim().toLowerCase() === "demo-recipient@netpayy.ng" && !recipientDetails && (
              <p className="text-xs text-amber-700">Demo recipient can be used directly, even before verification.</p>
            )}
          </div>

          {/* Recipient Details */}
          {recipientDetails && (
            <div className="bg-green-50 dark:bg-green-950/20 border border-green-200 dark:border-green-800 rounded-lg p-4">
              <div className="flex items-start gap-3">
                <CheckCircle className="w-5 h-5 text-green-600 shrink-0 mt-0.5" />
                <div className="flex-1">
                  <p className="font-semibold text-green-900 dark:text-green-100">
                    Recipient Verified
                  </p>
                  <div className="mt-2 space-y-1">
                    <div className="flex items-center gap-2 text-sm">
                      <User className="w-4 h-4 text-green-700 dark:text-green-300" />
                      <span className="text-green-800 dark:text-green-200">
                        {recipientDetails.full_name || "NetPay User"}
                      </span>
                    </div>
                    <div className="flex items-center gap-2 text-sm">
                      <Mail className="w-4 h-4 text-green-700 dark:text-green-300" />
                      <span className="text-green-800 dark:text-green-200">
                        {recipientDetails.email}
                      </span>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* Amount */}
          <div className="space-y-2">
            <label className="text-sm font-medium text-gray-900 flex items-center gap-2">
              <DollarSign className="w-4 h-4" />
              Amount
            </label>
            <input
              type="number"
              value={amount}
              onChange={(e) => setAmount(e.target.value)}
              placeholder="Enter amount"
              className="w-full px-4 py-3 rounded-lg border bg-background text-foreground focus:outline-none focus:ring-2 focus:ring-primary"
              min="1"
              disabled={loading || !recipientDetails}
            />
            {amount && Number(amount) > 0 && (() => {
              const fee = calculateTransferFee(Number(amount));
              const total = Number(amount) + fee;
              return (
                <>
                  {total > currentBalance && (
                    <div className="flex items-start gap-2 text-sm text-red-600">
                      <AlertCircle className="w-4 h-4 shrink-0 mt-0.5" />
                      <span>Insufficient balance (including ₦{fee.toLocaleString()} transfer fee)</span>
                    </div>
                  )}
                  <div className="text-xs text-gray-500 mt-1">
                    Transfer fee (5%): ₦{fee.toLocaleString()} • Total: ₦{total.toLocaleString()}
                  </div>
                </>
              );
            })()}
          </div>

          {/* Description (Optional) */}
          <div className="space-y-2">
            <label className="text-sm font-medium text-gray-900">
              Description (Optional)
            </label>
            <input
              type="text"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="What's this for?"
              className="w-full px-4 py-3 rounded-lg border bg-background text-foreground focus:outline-none focus:ring-2 focus:ring-primary"
              disabled={loading}
              maxLength={100}
            />
          </div>

          {/* Transfer Button */}
          <Button
            onClick={handleTransfer}
            disabled={loading || !recipientDetails || !amount || Number(amount) <= 0 || (() => {
              if (!amount) return true;
              const fee = calculateTransferFee(Number(amount));
              return (Number(amount) + fee) > currentBalance;
            })()}
            className="w-full h-12 text-base"
          >
            {loading ? (
              <span className="flex items-center gap-2">
                <span className="animate-spin">⏳</span>
                Processing...
              </span>
            ) : (
              <span className="flex items-center gap-2">
                <Send className="w-5 h-5" />
                Transfer ₦{amount ? Number(amount).toLocaleString() : "0"}
              </span>
            )}
          </Button>
        </div>

        {/* Security Note */}
        <div className="bg-blue-50 dark:bg-blue-950/20 border border-blue-200 dark:border-blue-800 rounded-lg p-4">
          <p className="text-sm text-blue-800 dark:text-blue-200">
            <strong>Note:</strong> Transfers are instant and cannot be reversed. Please verify recipient details before confirming.
          </p>
        </div>
      </div>

      {/* Confirmation Modal */}
      {showConfirmation && (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center z-50 p-6 animate-fade-in">
          <div className="bg-white rounded-3xl max-w-md w-full shadow-2xl animate-scale-in">
            {/* Header */}
            <div className="bg-gradient-to-r from-brand to-brand-light rounded-t-3xl p-6 relative">
              <button
                onClick={() => setShowConfirmation(false)}
                className="absolute top-4 right-4 text-white/80 hover:text-white transition-colors"
                disabled={loading}
              >
                <X className="w-6 h-6" />
              </button>
              <div className="flex items-center gap-3 text-white">
                <div className="w-12 h-12 bg-white/20 rounded-full flex items-center justify-center">
                  <AlertCircle className="w-6 h-6" />
                </div>
                <div>
                  <h2 className="text-xl font-bold">Confirm Transfer</h2>
                  <p className="text-white/90 text-sm">Please review the details</p>
                </div>
              </div>
            </div>

            {/* Content */}
            <div className="p-6 space-y-4">
              <div className="bg-gray-50 rounded-xl p-4 space-y-3">
                <div className="flex items-center justify-between py-2">
                  <span className="text-gray-600 text-sm">Recipient</span>
                  <span className="font-semibold text-gray-900">{recipientDetails?.full_name || "NetPay User"}</span>
                </div>
                <div className="flex items-center justify-between py-2 border-t border-gray-200">
                  <span className="text-gray-600 text-sm">Email</span>
                  <span className="font-medium text-gray-700 text-sm">{recipientDetails?.email}</span>
                </div>
                <div className="flex items-center justify-between py-2 border-t border-gray-200">
                  <span className="text-gray-600 text-sm">Transfer Amount</span>
                  <span className="font-bold text-brand text-xl">₦{Number(amount).toLocaleString()}</span>
                </div>
                <div className="flex items-center justify-between py-2 border-t border-gray-200">
                  <span className="text-gray-600 text-sm">Transfer Fee (5%)</span>
                  <span className="font-medium text-gray-700">₦{calculateTransferFee(Number(amount)).toLocaleString()}</span>
                </div>
                <div className="flex items-center justify-between py-2 border-t-2 border-gray-300 pt-3">
                  <span className="text-gray-900 font-semibold">Total Amount</span>
                  <span className="font-bold text-brand text-xl">₦{(Number(amount) + calculateTransferFee(Number(amount))).toLocaleString()}</span>
                </div>
                {description && (
                  <div className="flex items-start justify-between py-2 border-t border-gray-200">
                    <span className="text-gray-600 text-sm">Description</span>
                    <span className="font-medium text-gray-700 text-sm text-right max-w-[60%]">{description}</span>
                  </div>
                )}
              </div>

              <div className="bg-amber-50 border border-amber-200 rounded-lg p-3">
                <p className="text-sm text-amber-800">
                  <strong>Note:</strong> This transaction cannot be reversed once confirmed.
                </p>
              </div>
            </div>

            {/* Actions */}
            <div className="p-6 pt-0 flex gap-3">
              <Button
                onClick={() => setShowConfirmation(false)}
                variant="outline"
                className="flex-1 h-12"
                disabled={loading}
              >
                Cancel
              </Button>
              <Button
                onClick={confirmTransfer}
                className="flex-1 h-12 bg-gradient-to-r from-brand to-brand-light hover:from-brand-dark hover:to-brand-light"
                disabled={loading}
              >
                {loading ? (
                  <span className="flex items-center gap-2">
                    <span className="animate-spin">⏳</span>
                    Processing...
                  </span>
                ) : (
                  "Confirm Transfer"
                )}
              </Button>
            </div>
          </div>
        </div>
      )}

      {/* Success Screen */}
      {showSuccess && transferData && (
        <div className="fixed inset-0 bg-white z-50 flex items-center justify-center p-6 animate-fade-in">
          <div className="max-w-md w-full text-center space-y-6">
            {/* Success Icon */}
            <div className="flex justify-center">
              <div className="w-24 h-24 bg-green-100 rounded-full flex items-center justify-center animate-scale-in">
                <CheckCircle className="w-16 h-16 text-green-600 animate-[scale-in_0.5s_ease-out]" />
              </div>
            </div>

            {/* Success Message */}
            <div className="space-y-2">
              <h1 className="text-3xl font-bold text-gray-900">Transfer Successful!</h1>
              <p className="text-gray-600">Your money has been sent successfully</p>
            </div>

            {/* Transfer Details */}
            <div className="bg-gray-50 rounded-2xl p-6 space-y-4">
              <div className="space-y-3">
                <div className="flex justify-between py-2">
                  <span className="text-gray-600">Amount Sent</span>
                  <span className="font-bold text-2xl text-brand">₦{Number(transferData.amount).toLocaleString()}</span>
                </div>
                {transferData.transferFee && (
                  <div className="flex justify-between py-2 border-t border-gray-200">
                    <span className="text-gray-600">Transfer Fee</span>
                    <span className="font-medium text-gray-700">₦{Number(transferData.transferFee).toLocaleString()}</span>
                  </div>
                )}
                {transferData.totalAmount && (
                  <div className="flex justify-between py-2 border-t-2 border-gray-300 pt-3">
                    <span className="text-gray-900 font-semibold">Total Deducted</span>
                    <span className="font-bold text-gray-900">₦{Number(transferData.totalAmount).toLocaleString()}</span>
                  </div>
                )}
                <div className="flex justify-between py-2 border-t border-gray-200">
                  <span className="text-gray-600">Recipient</span>
                  <span className="font-semibold text-gray-900">{transferData.recipientName}</span>
                </div>
                <div className="flex justify-between py-2 border-t border-gray-200">
                  <span className="text-gray-600">Email</span>
                  <span className="font-medium text-gray-700 text-sm">{transferData.recipientEmail}</span>
                </div>
                <div className="flex justify-between py-2 border-t border-gray-200">
                  <span className="text-gray-600">Reference</span>
                  <span className="font-mono text-sm text-gray-700">{transferData.reference}</span>
                </div>
                <div className="flex justify-between py-2 border-t border-gray-200">
                  <span className="text-gray-600">New Balance</span>
                  <span className="font-bold text-gray-900">₦{Number(transferData.senderBalanceAfter).toLocaleString()}</span>
                </div>
              </div>
            </div>

            {/* Actions */}
            <div className="space-y-3">
              <Button
                onClick={() => {
                  setShowSuccess(false);
                  setRecipientEmail("");
                  setAmount("");
                  setDescription("");
                  setRecipientDetails(null);
                  setTransferData(null);
                }}
                className="w-full h-12 bg-gradient-to-r from-brand to-brand-light hover:from-brand-dark hover:to-brand-light"
              >
                Make Another Transfer
              </Button>
              <Button
                onClick={() => navigate("/user/dashboard")}
                variant="outline"
                className="w-full h-12"
              >
                Done
              </Button>
            </div>
          </div>
        </div>
      )}

      {/* Insufficient Balance Modal */}
      <InsufficientBalanceModal
        open={showInsufficientBalance}
        onOpenChange={setShowInsufficientBalance}
        currentBalance={currentBalance}
        requiredAmount={amount ? (Number(amount) + calculateTransferFee(Number(amount))) : undefined}
      />
    </div>
  );
}
