import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { AlertCircle, Wallet, ArrowRight } from "lucide-react";
import { formatNaira } from "@/lib/currency";
import { goExpoWeb, expoWebRoutes } from "@/config/site";

interface InsufficientBalanceModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  currentBalance: number;
  requiredAmount?: number;
  message?: string;
}

export function InsufficientBalanceModal({
  open,
  onOpenChange,
  currentBalance,
  requiredAmount,
  message,
}: InsufficientBalanceModalProps) {
  const handleFundWallet = () => {
    onOpenChange(false);
    goExpoWeb(expoWebRoutes.addMoney, "/user/auth");
  };

  const defaultMessage = requiredAmount && requiredAmount > 0
    ? `Your wallet balance is ${formatNaira(currentBalance)}. You need ${formatNaira(requiredAmount)} to complete this transaction.`
    : `Your wallet balance is ${formatNaira(currentBalance)}. Please fund your wallet to continue.`;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[425px]">
        <DialogHeader>
          <div className="mx-auto mb-4 flex h-12 w-12 items-center justify-center rounded-full bg-destructive/10">
            <Wallet className="h-6 w-6 text-destructive" />
          </div>
          <DialogTitle className="text-center text-xl">Insufficient Balance</DialogTitle>
          <DialogDescription className="text-center">
            {message || defaultMessage}
          </DialogDescription>
        </DialogHeader>
        
        {requiredAmount && requiredAmount > 0 && (
          <div className="space-y-2">
            <div className="flex items-center justify-between rounded-lg border bg-muted/50 p-4">
              <div className="flex items-center gap-2">
                <AlertCircle className="h-5 w-5 text-muted-foreground" />
                <span className="text-sm text-muted-foreground">Current Balance</span>
              </div>
              <span className="text-lg font-semibold">{formatNaira(currentBalance)}</span>
            </div>
            <div className="flex items-center justify-between rounded-lg border border-destructive/20 bg-destructive/5 p-4">
              <div className="flex items-center gap-2">
                <Wallet className="h-5 w-5 text-destructive" />
                <span className="text-sm font-medium">Required Amount</span>
              </div>
              <span className="text-lg font-semibold text-destructive">{formatNaira(requiredAmount)}</span>
            </div>
            <div className="flex items-center justify-between rounded-lg border bg-muted p-4">
              <span className="text-sm font-medium">Shortfall</span>
              <span className="text-lg font-semibold text-destructive">
                {formatNaira(Math.max(0, requiredAmount - currentBalance))}
              </span>
            </div>
          </div>
        )}

        <DialogFooter className="flex-col gap-2 sm:flex-row">
          <Button
            variant="outline"
            onClick={() => onOpenChange(false)}
            className="w-full sm:w-auto"
          >
            Close
          </Button>
          <Button
            onClick={handleFundWallet}
            className="w-full sm:w-auto gradient-primary"
          >
            <Wallet className="mr-2 h-4 w-4" />
            Fund Wallet
            <ArrowRight className="ml-2 h-4 w-4" />
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

