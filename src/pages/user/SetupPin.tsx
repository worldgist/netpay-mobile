import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { toast } from "sonner";
import { Loader2, Lock, Fingerprint } from "lucide-react";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";

export default function SetupPin() {
  const navigate = useNavigate();
  const [loading, setLoading] = useState(false);
  const [pin, setPin] = useState(["", "", "", ""]);
  const [confirmPin, setConfirmPin] = useState(["", "", "", ""]);
  const [step, setStep] = useState<"create" | "confirm">("create");
  const [showBiometricDialog, setShowBiometricDialog] = useState(false);

  useEffect(() => {
    const checkAuth = async () => {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) {
        navigate("/user/auth");
      }
    };
    checkAuth();
  }, [navigate]);

  const handlePinInput = (index: number, value: string, isConfirm: boolean = false) => {
    if (!/^\d*$/.test(value)) return;

    const newPin = isConfirm ? [...confirmPin] : [...pin];
    newPin[index] = value.slice(-1);
    
    if (isConfirm) {
      setConfirmPin(newPin);
    } else {
      setPin(newPin);
    }

    // Auto-focus next input
    if (value && index < 3) {
      const nextInput = document.getElementById(
        `${isConfirm ? "confirm-" : ""}pin-${index + 1}`
      );
      nextInput?.focus();
    }
  };

  const handleKeyDown = (index: number, e: React.KeyboardEvent, isConfirm: boolean = false) => {
    if (e.key === "Backspace" && !((isConfirm ? confirmPin : pin)[index]) && index > 0) {
      const prevInput = document.getElementById(
        `${isConfirm ? "confirm-" : ""}pin-${index - 1}`
      );
      prevInput?.focus();
    }
  };

  const handleCreatePin = () => {
    const pinValue = pin.join("");
    if (pinValue.length !== 4) {
      toast.error("Please enter a 4-digit PIN");
      return;
    }
    setStep("confirm");
  };

  const handleConfirmPin = async () => {
    const pinValue = pin.join("");
    const confirmPinValue = confirmPin.join("");

    if (confirmPinValue.length !== 4) {
      toast.error("Please enter a 4-digit PIN");
      return;
    }

    if (pinValue !== confirmPinValue) {
      toast.error("PINs don't match");
      setConfirmPin(["", "", "", ""]);
      return;
    }

    setLoading(true);
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) throw new Error("Not authenticated");

      // Hash the PIN on the client side and store it
      const encoder = new TextEncoder();
      const data = encoder.encode(pinValue);
      const hashBuffer = await crypto.subtle.digest('SHA-256', data);
      const hashArray = Array.from(new Uint8Array(hashBuffer));
      const pinHash = hashArray.map(b => b.toString(16).padStart(2, '0')).join('');

      // Store the hashed PIN in the profiles table
      const { error } = await supabase
        .from('profiles')
        .update({ 
          pin_hash: pinHash,
          pin_enabled: true 
        })
        .eq('id', user.id);

      if (error) throw error;

      toast.success("PIN set up successfully!");
      setShowBiometricDialog(true);
    } catch (error: any) {
      toast.error(error.message || "Failed to set up PIN");
    } finally {
      setLoading(false);
    }
  };

  const renderPinInputs = (isConfirm: boolean = false) => {
    const currentPin = isConfirm ? confirmPin : pin;
    
    return (
      <div className="flex gap-4 justify-center mb-8">
        {currentPin.map((digit, index) => (
          <input
            key={index}
            id={`${isConfirm ? "confirm-" : ""}pin-${index}`}
            type="password"
            inputMode="numeric"
            maxLength={1}
            value={digit}
            onChange={(e) => handlePinInput(index, e.target.value, isConfirm)}
            onKeyDown={(e) => handleKeyDown(index, e, isConfirm)}
            className="w-16 h-16 text-center text-2xl font-bold border-2 border-gray-300 rounded-lg focus:border-[#FF6B00] focus:outline-none bg-gray-100"
            autoFocus={index === 0}
          />
        ))}
      </div>
    );
  };

  const handleSetupBiometric = async () => {
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) throw new Error("Not authenticated");

      const { error } = await supabase
        .from('profiles')
        .update({ biometric_enabled: true })
        .eq('id', user.id);

      if (error) throw error;

      toast.success("Biometric authentication enabled!");
      navigate("/user/dashboard");
    } catch (error: any) {
      toast.error(error.message || "Failed to enable biometric");
      navigate("/user/dashboard");
    }
  };

  const handleSkipBiometric = () => {
    navigate("/user/dashboard");
  };

  return (
    <div className="min-h-screen bg-white flex flex-col items-center justify-center p-6">
      <div className="w-full max-w-md space-y-8">
        <div className="text-center">
          <div className="bg-[#FF6B00]/10 w-20 h-20 rounded-full flex items-center justify-center mx-auto mb-6">
            <Lock className="w-10 h-10 text-[#FF6B00]" />
          </div>
          <h1 className="text-3xl font-bold text-gray-900 mb-2">
            {step === "create" ? "Set Up Your PIN" : "Confirm Your PIN"}
          </h1>
          <p className="text-gray-600">
            {step === "create" 
              ? "Create a 4-digit PIN for quick access" 
              : "Enter your PIN again to confirm"}
          </p>
        </div>

        <div>
          {step === "create" ? renderPinInputs() : renderPinInputs(true)}

          <Button
            onClick={step === "create" ? handleCreatePin : handleConfirmPin}
            className="w-full bg-[#FF6B00] hover:bg-[#FF8533] text-white h-14 rounded-lg font-medium text-lg"
            disabled={loading || (step === "create" ? pin.some(d => !d) : confirmPin.some(d => !d))}
          >
            {loading ? (
              <Loader2 className="w-5 h-5 animate-spin" />
            ) : (
              step === "create" ? "Continue" : "Confirm PIN"
            )}
          </Button>

          <button
            onClick={() => navigate("/user/dashboard")}
            className="w-full text-center text-gray-600 font-medium hover:underline mt-4"
          >
            Skip for now
          </button>
        </div>
      </div>

      {/* Biometric Setup Dialog */}
      <Dialog open={showBiometricDialog} onOpenChange={setShowBiometricDialog}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Fingerprint className="w-6 h-6 text-[#FF6B00]" />
              Setup Biometric Login
            </DialogTitle>
            <DialogDescription>
              Would you like to enable biometric authentication for faster login?
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4 pt-4">
            <Button
              onClick={handleSetupBiometric}
              className="w-full bg-[#FF6B00] hover:bg-[#FF8533] text-white h-12"
            >
              <Fingerprint className="w-5 h-5 mr-2" />
              Enable Biometric
            </Button>
            <Button
              onClick={handleSkipBiometric}
              variant="outline"
              className="w-full h-12"
            >
              Skip for Now
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
