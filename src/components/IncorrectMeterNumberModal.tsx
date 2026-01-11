import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { AlertCircle, Edit } from "lucide-react";

interface IncorrectMeterNumberModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  meterNumber?: string;
  message?: string;
  onRetry?: () => void;
}

export function IncorrectMeterNumberModal({
  open,
  onOpenChange,
  meterNumber,
  message,
  onRetry,
}: IncorrectMeterNumberModalProps) {
  const handleRetry = () => {
    onOpenChange(false);
    if (onRetry) {
      onRetry();
    }
  };

  const defaultMessage = meterNumber
    ? `The meter number "${meterNumber}" is incorrect or cannot be found. Please verify the meter number and try again.`
    : "The meter number entered is incorrect or cannot be found. Please verify the meter number and try again.";

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[425px]">
        <DialogHeader>
          <div className="mx-auto mb-4 flex h-12 w-12 items-center justify-center rounded-full bg-destructive/10">
            <AlertCircle className="h-6 w-6 text-destructive" />
          </div>
          <DialogTitle className="text-center text-xl">Incorrect Meter Number</DialogTitle>
          <DialogDescription className="text-center">
            {message || defaultMessage}
          </DialogDescription>
        </DialogHeader>
        
        <div className="space-y-4">
          <div className="rounded-lg border border-destructive/20 bg-destructive/5 p-4">
            <div className="flex items-center gap-2 mb-2">
              <AlertCircle className="h-5 w-5 text-destructive" />
              <span className="text-sm font-medium text-destructive">What to check:</span>
            </div>
            <ul className="text-sm text-muted-foreground space-y-1 ml-7 list-disc">
              <li>Verify the meter number matches your electricity meter</li>
              <li>Ensure you've selected the correct provider and meter type</li>
              <li>Check for any typos or missing digits</li>
              <li>Meter numbers are typically 10-13 digits long</li>
            </ul>
          </div>

          {meterNumber && (
            <div className="rounded-lg border bg-muted/50 p-4">
              <div className="flex items-center gap-2 mb-1">
                <Edit className="h-4 w-4 text-muted-foreground" />
                <span className="text-sm text-muted-foreground">Entered Meter Number:</span>
              </div>
              <p className="text-sm font-mono font-semibold text-foreground">{meterNumber}</p>
            </div>
          )}
        </div>

        <DialogFooter className="flex-col gap-2 sm:flex-row">
          <Button
            variant="outline"
            onClick={() => onOpenChange(false)}
            className="w-full sm:w-auto"
          >
            Close
          </Button>
          <Button
            onClick={handleRetry}
            className="w-full sm:w-auto gradient-primary"
          >
            <Edit className="mr-2 h-4 w-4" />
            Try Again
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}






