import { useState, useEffect } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { toast } from "sonner";
import { Loader2, Mail, ArrowLeft } from "lucide-react";

export default function VerifyEmail() {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const [loading, setLoading] = useState(false);
  const [resending, setResending] = useState(false);
  const [code, setCode] = useState(["", "", "", "", "", ""]);
  const [email, setEmail] = useState("");

  useEffect(() => {
    const emailParam = searchParams.get("email");
    if (!emailParam) {
      toast.error("Email parameter missing");
      navigate("/user/auth");
      return;
    }
    setEmail(emailParam);

    // Check if already verified
    const checkAuth = async () => {
      const { data: { session } } = await supabase.auth.getSession();
      if (session) {
        navigate("/user/setup-pin");
      }
    };
    checkAuth();
  }, [navigate, searchParams]);

  // Auto-resend code on mount (optional - can be removed if not desired)
  useEffect(() => {
    if (email) {
      // Optionally auto-resend on page load
      // handleResend();
    }
  }, [email]);

  const handleCodeInput = (index: number, value: string) => {
    if (!/^\d*$/.test(value)) return;

    const newCode = [...code];
    newCode[index] = value.slice(-1);
    setCode(newCode);

    // Auto-focus next input
    if (value && index < 5) {
      const nextInput = document.getElementById(`code-${index + 1}`);
      nextInput?.focus();
    }
  };

  const handleKeyDown = (index: number, e: React.KeyboardEvent) => {
    if (e.key === "Backspace" && !code[index] && index > 0) {
      const prevInput = document.getElementById(`code-${index - 1}`);
      prevInput?.focus();
    }
  };

  const handleVerify = async (e: React.FormEvent) => {
    e.preventDefault();
    const verificationCode = code.join("");

    if (verificationCode.length !== 6) {
      toast.error("Please enter the complete 6-digit code");
      return;
    }

    setLoading(true);
    try {
      // Try verifying with OTP code
      const { data, error } = await supabase.auth.verifyOtp({
        email,
        token: verificationCode,
        type: 'email'
      });

      if (error) {
        // If OTP verification fails, try with 'signup' type
        const { data: signupData, error: signupError } = await supabase.auth.verifyOtp({
          email,
          token: verificationCode,
          type: 'signup'
        });

        if (signupError) throw signupError;
        
        if (signupData.session) {
          toast.success("Email verified successfully!");
          navigate("/user/setup-pin");
        }
      } else if (data.session) {
        toast.success("Email verified successfully!");
        navigate("/user/setup-pin");
      }
    } catch (error: any) {
      console.error('Verification error:', error);
      toast.error(error.message || "Invalid verification code. Please check your email and try again.");
    } finally {
      setLoading(false);
    }
  };

  const handleResend = async () => {
    setResending(true);
    try {
      console.log('Resending verification code to:', email);
      
      // Method 1: Try resending with signup type (most common)
      let success = false;
      let lastError: any = null;

      const { error: resendError } = await supabase.auth.resend({
        type: 'signup',
        email: email,
      });

      if (!resendError) {
        success = true;
      } else {
        console.error('Resend error (signup):', resendError);
        lastError = resendError;
        
        // Method 2: Try resending with email type
        const { error: emailError } = await supabase.auth.resend({
          type: 'email',
          email: email,
        });

        if (!emailError) {
          success = true;
        } else {
          console.error('Resend error (email):', emailError);
          lastError = emailError;
        }
      }

      if (!success) {
        // If resend fails, provide helpful error message
        const errorMsg = lastError?.message || 'Failed to resend code';
        throw new Error(`${errorMsg}. Please ensure email confirmation is enabled in Supabase settings.`);
      }
      
      toast.success("Verification code sent! Please check your email inbox and spam folder.");
    } catch (error: any) {
      console.error('Resend error:', error);
      const errorMessage = error.message || "Failed to resend code. Please try signing up again or check Supabase email settings.";
      toast.error(errorMessage);
    } finally {
      setResending(false);
    }
  };

  return (
    <div className="min-h-screen bg-white flex flex-col items-center justify-center p-6">
      <div className="w-full max-w-md space-y-8">
        <button
          onClick={() => navigate("/user/auth")}
          className="text-gray-600 hover:text-gray-900 transition-colors mb-4"
        >
          <ArrowLeft className="w-6 h-6" />
        </button>

        <div className="text-center">
          <div className="bg-[#FF6B00]/10 w-20 h-20 rounded-full flex items-center justify-center mx-auto mb-6">
            <Mail className="w-10 h-10 text-[#FF6B00]" />
          </div>
          <h1 className="text-3xl font-bold text-gray-900 mb-2">Verify Your Email</h1>
          <p className="text-gray-600 mb-2">
            We've sent a 6-digit verification code to
          </p>
          <p className="font-semibold text-gray-900">{email}</p>
        </div>

        <form onSubmit={handleVerify} className="space-y-6">
          {/* 6-Digit Code Input */}
          <div className="flex gap-2 justify-center">
            {code.map((digit, index) => (
              <input
                key={index}
                id={`code-${index}`}
                type="text"
                inputMode="numeric"
                maxLength={1}
                value={digit}
                onChange={(e) => handleCodeInput(index, e.target.value)}
                onKeyDown={(e) => handleKeyDown(index, e)}
                className="w-12 h-14 text-center text-2xl font-bold border-2 border-gray-300 rounded-lg focus:border-[#FF6B00] focus:outline-none bg-gray-50"
                autoFocus={index === 0}
              />
            ))}
          </div>

          <Button
            type="submit"
            className="w-full bg-[#FF6B00] hover:bg-[#FF8533] text-white h-14 rounded-lg font-medium text-lg"
            disabled={loading || code.some(d => !d)}
          >
            {loading ? (
              <Loader2 className="w-5 h-5 animate-spin" />
            ) : (
              "Verify Email"
            )}
          </Button>

          <div className="text-center space-y-2">
            <p className="text-gray-600 text-sm">Didn't receive the code?</p>
            <Button
              type="button"
              variant="ghost"
              onClick={handleResend}
              disabled={resending}
              className="text-[#FF6B00] hover:text-[#FF8533] font-medium"
            >
              {resending ? (
                <Loader2 className="w-4 h-4 animate-spin" />
              ) : (
                "Resend Code"
              )}
            </Button>
          </div>
        </form>
      </div>
    </div>
  );
}
