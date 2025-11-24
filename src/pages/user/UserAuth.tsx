import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { ensureProfileExists } from "@/utils/profile";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { toast } from "sonner";
import { Loader2, Phone, Lock, Eye, EyeOff, User, Mail, ArrowLeft, Fingerprint } from "lucide-react";
import { z } from "zod";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";

const signUpSchema = z.object({
  firstName: z.string().trim().min(2, "First name must be at least 2 characters"),
  lastName: z.string().trim().min(2, "Last name must be at least 2 characters"),
  email: z.string().trim().email("Invalid email address"),
  phone: z.string().trim().regex(/^[0-9]{11}$/, "Phone number must be 11 digits"),
  password: z.string().min(6, "Password must be at least 6 characters"),
  confirmPassword: z.string(),
  referralCode: z.string().optional(),
}).refine((data) => data.password === data.confirmPassword, {
  message: "Passwords don't match",
  path: ["confirmPassword"],
});

const signInSchema = z.object({
  email: z.string().trim().email("Invalid email address"),
  password: z.string().min(1, "Password is required"),
});

const pinSchema = z.object({
  email: z.string().trim().email("Invalid email address"),
  pin: z.string().length(4, "PIN must be 4 digits"),
});

export default function UserAuth() {
  const navigate = useNavigate();
  const [loading, setLoading] = useState(false);
  const [isSignUp, setIsSignUp] = useState(false);
  const [showPassword, setShowPassword] = useState(false);
  const [showConfirmPassword, setShowConfirmPassword] = useState(false);
  const [showPinLogin, setShowPinLogin] = useState(false);
  
  // Sign In fields
  const [loginEmail, setLoginEmail] = useState("");
  const [password, setPassword] = useState("");
  const [pinDigits, setPinDigits] = useState(["", "", "", ""]);
  
  // Sign Up fields
  const [firstName, setFirstName] = useState("");
  const [lastName, setLastName] = useState("");
  const [email, setEmail] = useState("");
  const [signUpPhone, setSignUpPhone] = useState("");
  const [signUpPassword, setSignUpPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [referralCode, setReferralCode] = useState("");

  useEffect(() => {
    const checkUser = async () => {
      const { data: { session } } = await supabase.auth.getSession();
      if (session) {
        const profile = await ensureProfileExists(session.user);

        if (profile && !profile.pin_enabled) {
          navigate("/user/setup-pin");
        } else {
          navigate("/user/dashboard");
        }
      }
    };
    checkUser();

    const { data: { subscription } } = supabase.auth.onAuthStateChange(async (event, session) => {
      if (session && event === 'SIGNED_IN') {
        const profile = await ensureProfileExists(session.user);

        if (profile && !profile.pin_enabled) {
          navigate("/user/setup-pin");
        } else {
          navigate("/user/dashboard");
        }
      }
    });

    return () => subscription.unsubscribe();
  }, [navigate]);

  const handleSignIn = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);

    try {
      const normalizedEmail = loginEmail.trim().toLowerCase();

      const validation = signInSchema.safeParse({ email: normalizedEmail, password });
      if (!validation.success) {
        toast.error(validation.error.errors[0].message);
        return;
      }

      // Clear any corrupted session before attempting sign in
      try {
        await supabase.auth.signOut();
      } catch (signOutError) {
        // Ignore sign out errors, just try to clear the session
        console.warn('Error clearing session:', signOutError);
      }

      const { data, error } = await supabase.auth.signInWithPassword({
        email: normalizedEmail,
        password,
      });

      if (error) {
        // Handle connection errors
        if (error.message?.includes('Failed to fetch') || 
            error.message?.includes('ERR_CONNECTION') ||
            error.message?.includes('ERR_TIMED_OUT') ||
            error.message?.includes('network')) {
          toast.error("Connection error. Please check your internet connection and try again.");
          return;
        }
        throw error;
      }

      const {
        data: { session },
      } = await supabase.auth.getSession();

      if (session) {
        await ensureProfileExists(session.user);
      }

      toast.success("Signed in successfully!");
    } catch (error: any) {
      let errorMessage = "An error occurred during sign in";
      
      if (error?.message) {
        if (error.message === "Invalid login credentials") {
          errorMessage = "Invalid email or password";
        } else if (error.message.includes("Failed to fetch") || 
                   error.message.includes("ERR_CONNECTION") ||
                   error.message.includes("ERR_TIMED_OUT")) {
          errorMessage = "Connection error. Please check your internet connection and try again.";
        } else {
          errorMessage = error.message;
        }
      }
      
      toast.error(errorMessage);
    } finally {
      setLoading(false);
    }
  };

  const handleSignUp = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);

    try {
      const validation = signUpSchema.safeParse({
        firstName,
        lastName,
        email: email.trim().toLowerCase(),
        phone: signUpPhone.replace(/[^0-9]/g, ""),
        password: signUpPassword,
        confirmPassword,
        referralCode,
      });

      if (!validation.success) {
        toast.error(validation.error.errors[0].message);
        return;
      }

      const normalizedEmail = email.trim().toLowerCase();
      const sanitizedPhone = signUpPhone.replace(/[^0-9]/g, "");

      const { data: availability, error: availabilityError } = await supabase.functions.invoke(
        'check-signup-availability',
        {
          body: {
            email: normalizedEmail,
            phone: sanitizedPhone || null,
          },
        }
      );

      if (availabilityError) {
        throw availabilityError;
      }

      if (availability?.emailExists) {
        toast.error("An account with this email already exists. Please sign in instead.");
        return;
      }

      if (sanitizedPhone && availability?.phoneExists) {
        toast.error("This phone number is already linked to an account.");
        return;
      }

      const { data: signUpData, error } = await supabase.auth.signUp({
        email: normalizedEmail,
        password: signUpPassword,
        options: {
          emailRedirectTo: `${window.location.origin}/user/verify-email?email=${encodeURIComponent(normalizedEmail)}`,
          data: {
            first_name: firstName,
            last_name: lastName,
            phone: sanitizedPhone,
            referral_code: referralCode || null,
          },
        },
      });

      if (error) throw error;

      // Check if email confirmation is required
      if (signUpData.user && !signUpData.session) {
        // User needs to verify email - OTP should be sent automatically
        console.log('User created, verification email should be sent');
      } else if (signUpData.session) {
        // User is already confirmed (email confirmation might be disabled)
        console.log('User created and confirmed immediately');
      }

      if (signUpData.user) {
        await ensureProfileExists(signUpData.user, {
          email: normalizedEmail,
          full_name: `${firstName} ${lastName}`.trim(),
          phone: sanitizedPhone || null,
          balance: 0,
          status: 'active',
          referral_code: referralCode || null,
          biometric_enabled: false,
          pin_enabled: false,
        });
      }
      
      toast.success("Account created! Please check your email for verification code.");
      navigate(`/user/verify-email?email=${encodeURIComponent(normalizedEmail)}`);
    } catch (error: any) {
      toast.error(error.message || "Failed to create account");
    } finally {
      setLoading(false);
    }
  };

  const handlePinLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);

    try {
      const pinValue = pinDigits.join("");
      const validation = pinSchema.safeParse({ email: loginEmail, pin: pinValue });
      if (!validation.success) {
        toast.error(validation.error.errors[0].message);
        return;
      }

      // Get user profile by email to verify PIN
      const { data: profile, error: profileError } = await supabase
        .from('profiles')
        .select('id, pin_hash, pin_enabled')
        .eq('email', loginEmail)
        .single();

      if (profileError || !profile || !profile.pin_enabled) {
        throw new Error("Invalid email or PIN not set up");
      }

      // Hash the input PIN and verify
      const encoder = new TextEncoder();
      const data = encoder.encode(pinValue);
      const hashBuffer = await crypto.subtle.digest('SHA-256', data);
      const hashArray = Array.from(new Uint8Array(hashBuffer));
      const inputPinHash = hashArray.map(b => b.toString(16).padStart(2, '0')).join('');

      if (profile.pin_hash !== inputPinHash) {
        throw new Error("Invalid PIN");
      }

      toast.info("PIN login currently requires password authentication. Please use password login.");
      setShowPinLogin(false);

      toast.success("Signed in with PIN!");
    } catch (error: any) {
      toast.error(error.message || "Invalid email or PIN");
    } finally {
      setLoading(false);
    }
  };

  const handlePinInput = (index: number, value: string) => {
    if (!/^\d*$/.test(value)) return;

    const newPin = [...pinDigits];
    newPin[index] = value.slice(-1);
    setPinDigits(newPin);

    // Auto-focus next input
    if (value && index < 3) {
      const nextInput = document.getElementById(`pin-digit-${index + 1}`);
      nextInput?.focus();
    }
  };

  const handleResendVerification = async () => {
    setLoading(true);
    try {
      const { error } = await supabase.auth.resend({
        type: 'signup',
        email: email,
      });

      if (error) throw error;
      toast.success("Verification email sent!");
    } catch (error: any) {
      toast.error(error.message || "Failed to resend email");
    } finally {
      setLoading(false);
    }
  };

  if (isSignUp) {
    return (
      <div className="min-h-screen bg-gray-50 p-6">
        <div className="max-w-md mx-auto">
          <button
            onClick={() => setIsSignUp(false)}
            className="mb-6 text-gray-600 hover:text-gray-900 transition-colors"
          >
            <ArrowLeft className="w-6 h-6" />
          </button>

          <div className="text-center mb-8">
            <div className="mb-4">
              <svg viewBox="0 0 100 40" className="h-10 mx-auto">
                <text x="50" y="28" textAnchor="middle" className="font-bold text-2xl fill-brand">
                  NETPAY
                </text>
              </svg>
            </div>
            <h1 className="text-3xl font-bold text-gray-900 mb-2">Create Account</h1>
            <p className="text-gray-600">Sign up to get started</p>
          </div>

          <form onSubmit={handleSignUp} className="space-y-4">
            <div className="grid grid-cols-2 gap-4">
              <div className="relative">
                <User className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-gray-400" />
                <Input
                  type="text"
                  placeholder="First name"
                  value={firstName}
                  onChange={(e) => setFirstName(e.target.value)}
                  className="bg-gray-100 border-0 pl-10 h-12"
                  required
                />
              </div>
              <div className="relative">
                <User className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-gray-400" />
                <Input
                  type="text"
                  placeholder="Last name"
                  value={lastName}
                  onChange={(e) => setLastName(e.target.value)}
                  className="bg-gray-100 border-0 pl-10 h-12"
                  required
                />
              </div>
            </div>

            <div className="relative">
              <Mail className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-gray-400" />
              <Input
                type="email"
                placeholder="Email address"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                className="bg-gray-100 border-0 pl-10 h-12"
                required
              />
            </div>

            <div className="relative">
              <Phone className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-gray-400" />
              <Input
                type="tel"
                placeholder="Phone number"
                value={signUpPhone}
                onChange={(e) => setSignUpPhone(e.target.value)}
                className="bg-gray-100 border-0 pl-10 h-12"
                maxLength={11}
                required
              />
            </div>

            <div className="relative">
              <Lock className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-gray-400" />
              <Input
                type={showPassword ? "text" : "password"}
                placeholder="Password"
                value={signUpPassword}
                onChange={(e) => setSignUpPassword(e.target.value)}
                className="bg-gray-100 border-0 pl-10 pr-10 h-12"
                minLength={6}
                required
              />
              <button
                type="button"
                onClick={() => setShowPassword(!showPassword)}
                className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400"
              >
                {showPassword ? <EyeOff className="w-5 h-5" /> : <Eye className="w-5 h-5" />}
              </button>
            </div>

            <div className="relative">
              <Lock className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-gray-400" />
              <Input
                type={showConfirmPassword ? "text" : "password"}
                placeholder="Confirm password"
                value={confirmPassword}
                onChange={(e) => setConfirmPassword(e.target.value)}
                className="bg-gray-100 border-0 pl-10 pr-10 h-12"
                minLength={6}
                required
              />
              <button
                type="button"
                onClick={() => setShowConfirmPassword(!showConfirmPassword)}
                className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400"
              >
                {showConfirmPassword ? <EyeOff className="w-5 h-5" /> : <Eye className="w-5 h-5" />}
              </button>
            </div>

            <div className="relative">
              <User className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-gray-400" />
              <Input
                type="text"
                placeholder="Referral code (optional)"
                value={referralCode}
                onChange={(e) => setReferralCode(e.target.value)}
                className="bg-gray-100 border-0 pl-10 h-12"
              />
            </div>

            <Button
              type="submit"
              className="w-full bg-brand hover:bg-brand-light text-white h-12 rounded-lg font-medium"
              disabled={loading}
            >
              {loading ? (
                <Loader2 className="w-5 h-5 animate-spin" />
              ) : (
                "Create Account"
              )}
            </Button>

            <p className="text-center text-gray-600">
              Already have an account?{" "}
              <button
                type="button"
                onClick={() => setIsSignUp(false)}
                className="text-brand font-medium hover:underline"
              >
                Sign in
              </button>
            </p>
          </form>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-white flex flex-col items-center justify-center p-6">
      <div className="w-full max-w-md space-y-8">
        <div className="text-center">
          <svg viewBox="0 0 100 40" className="h-12 mx-auto mb-8">
            <text x="50" y="28" textAnchor="middle" className="font-bold text-2xl fill-brand">
              NETPAY
            </text>
          </svg>
          <h1 className="text-3xl font-bold text-gray-900 mb-2">Welcome Back</h1>
          <p className="text-gray-600">Sign in to your account</p>
        </div>

        <form onSubmit={handleSignIn} className="space-y-4">
          <div className="relative">
            <Mail className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-gray-400" />
            <Input
              type="email"
              placeholder="Email address"
              value={loginEmail}
              onChange={(e) => setLoginEmail(e.target.value)}
              className="bg-gray-100 border-0 pl-10 h-14"
              required
            />
          </div>

          <div className="relative">
            <Lock className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-gray-400" />
            <Input
              type={showPassword ? "text" : "password"}
              placeholder="Password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              className="bg-gray-100 border-0 pl-10 pr-10 h-14"
              required
            />
            <button
              type="button"
              onClick={() => setShowPassword(!showPassword)}
              className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400"
            >
              {showPassword ? <EyeOff className="w-5 h-5" /> : <Eye className="w-5 h-5" />}
            </button>
          </div>

          <Button
            type="submit"
            className="w-full bg-brand hover:bg-brand-light text-white h-14 rounded-lg font-medium text-lg"
            disabled={loading}
          >
            {loading ? (
              <Loader2 className="w-5 h-5 animate-spin" />
            ) : (
              "Sign In"
            )}
          </Button>

          <Button
            type="button"
            variant="outline"
            className="w-full h-14 rounded-lg font-medium border-2 border-brand text-brand hover:bg-brand/5"
            disabled={loading}
          >
            <Fingerprint className="w-5 h-5 mr-2" />
            Sign in with Biometric
          </Button>

          <button
            type="button"
            onClick={() => navigate("/user/forgot-password")}
            className="w-full text-center text-brand font-medium hover:underline"
          >
            Forgot Password?
          </button>

          <Button
            type="button"
            onClick={() => setShowPinLogin(true)}
            variant="ghost"
            className="w-full text-gray-600 hover:text-gray-900"
          >
            Sign in with PIN instead
          </Button>

          <p className="text-center text-gray-600">
            Don't have an account?{" "}
            <button
              type="button"
              onClick={() => setIsSignUp(true)}
              className="text-brand font-medium hover:underline"
            >
              Sign Up
            </button>
          </p>
        </form>
      </div>

      {/* PIN Login Dialog */}
      <Dialog open={showPinLogin} onOpenChange={setShowPinLogin}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Sign in with PIN</DialogTitle>
            <DialogDescription>Enter your email and 4-digit PIN</DialogDescription>
          </DialogHeader>
          <form onSubmit={handlePinLogin} className="space-y-4">
            <div className="relative">
              <Mail className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-gray-400" />
              <Input
                type="email"
                placeholder="Email address"
                value={loginEmail}
                onChange={(e) => setLoginEmail(e.target.value)}
                className="bg-gray-100 border-0 pl-10 h-12"
                required
              />
            </div>

            <div className="flex gap-2 justify-center">
              {pinDigits.map((digit, index) => (
                <input
                  key={index}
                  id={`pin-digit-${index}`}
                  type="password"
                  inputMode="numeric"
                  maxLength={1}
                  value={digit}
                  onChange={(e) => handlePinInput(index, e.target.value)}
                  className="w-12 h-12 text-center text-xl font-bold border-2 border-gray-300 rounded-lg focus:border-brand focus:outline-none bg-gray-100"
                  autoFocus={index === 0}
                />
              ))}
            </div>

            <Button
              type="submit"
              className="w-full bg-brand hover:bg-brand-light text-white h-12"
              disabled={loading || pinDigits.some(d => !d)}
            >
              {loading ? <Loader2 className="w-5 h-5 animate-spin" /> : "Sign In"}
            </Button>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  );
}
