import { useState, useEffect, useRef } from "react";
import { useNavigate } from "react-router-dom";
import type { User } from "@supabase/supabase-js";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { toast } from "sonner";
import { Loader2, DollarSign, AlertCircle } from "lucide-react";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { z } from "zod";

const authSchema = z.object({
  email: z.string().trim().email("Invalid email address").max(255, "Email too long"),
  password: z.string().min(6, "Password must be at least 6 characters").max(100, "Password too long"),
});

type AdminAccessResult = {
  allowed: boolean;
  queryFailed: boolean;
};

function isStaffEmail(email?: string | null): boolean {
  return (email ?? "").trim().toLowerCase().endsWith("@netppay.com");
}

function authErrorMessage(error: { message?: string } | null | undefined): string {
  const message = error?.message ?? "";
  const lower = message.toLowerCase();
  if (lower.includes("invalid login credentials")) {
    return "Invalid email or password. Please try again.";
  }
  if (lower.includes("email not confirmed")) {
    return "This email is not confirmed yet. Confirm the account or ask an admin to verify it.";
  }
  if (lower.includes("too many requests")) {
    return "Too many login attempts. Please wait a moment and try again.";
  }
  if (
    lower.includes("failed to fetch") ||
    lower.includes("networkerror") ||
    lower.includes("network request failed") ||
    lower.includes("load failed")
  ) {
    return "Could not reach NetPay sign-in. Check your connection and try again.";
  }
  return message || "Sign in failed. Please try again.";
}

/**
 * Do not use maybeSingle() here. The shared client sets Accept: application/json,
 * which makes PostgREST return 406 / PGRST116 and look like a failed admin login.
 */
async function resolveAdminAccess(user: User): Promise<AdminAccessResult> {
  if (isStaffEmail(user.email)) {
    return { allowed: true, queryFailed: false };
  }

  const { data: hasRole, error: rpcError } = await supabase.rpc("has_role", {
    _user_id: user.id,
    _role: "admin",
  });
  if (!rpcError && hasRole === true) {
    return { allowed: true, queryFailed: false };
  }

  const { data, error } = await supabase
    .from("user_roles")
    .select("role")
    .eq("user_id", user.id)
    .eq("role", "admin")
    .limit(1);

  if (!error && data && data.length > 0) {
    return { allowed: true, queryFailed: false };
  }

  if (rpcError && error) {
    console.error("Error checking admin role:", rpcError, error);
    return { allowed: false, queryFailed: true };
  }

  if (error) {
    console.error("Error checking admin role:", error);
    return { allowed: false, queryFailed: true };
  }

  return { allowed: false, queryFailed: false };
}

const Auth = () => {
  const navigate = useNavigate();
  const [loading, setLoading] = useState(false);
  const [initializing, setInitializing] = useState(true);
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [validationError, setValidationError] = useState<string | null>(null);
  const handlingAuthRef = useRef(false);

  useEffect(() => {
    let mounted = true;

    const timeoutId = setTimeout(() => {
      if (mounted) {
        setInitializing(false);
      }
    }, 3000);

    const applyAdminAccess = async (user: User, signOutIfDenied: boolean) => {
      const access = await resolveAdminAccess(user);
      if (!mounted) return access;

      if (access.allowed) {
        clearTimeout(timeoutId);
        navigate("/dashboard");
        return access;
      }

      if (access.queryFailed) {
        setInitializing(false);
        return access;
      }

      if (signOutIfDenied) {
        await supabase.auth.signOut();
        toast.error("Admin access required. Contact administrator.");
      }
      setInitializing(false);
      return access;
    };

    const checkUser = async () => {
      try {
        const { data: { session: currentSession }, error: sessionError } = await supabase.auth.getSession();

        if (sessionError) {
          console.error("Error getting session:", sessionError);
          if (mounted) setInitializing(false);
          return;
        }

        if (currentSession) {
          await applyAdminAccess(currentSession.user, true);
          return;
        }

        if (mounted) setInitializing(false);
      } catch (error) {
        console.error("Error in checkUser:", error);
        if (mounted) setInitializing(false);
      }
    };

    void checkUser();

    const { data: { subscription } } = supabase.auth.onAuthStateChange((event, session) => {
      if (handlingAuthRef.current) return;
      if (session && event === "SIGNED_IN") {
        setTimeout(() => {
          if (!mounted || handlingAuthRef.current) return;
          void applyAdminAccess(session.user, true);
        }, 0);
      }
    });

    return () => {
      mounted = false;
      clearTimeout(timeoutId);
      subscription.unsubscribe();
    };
  }, [navigate]);

  const handleAuth = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setValidationError(null);
    handlingAuthRef.current = true;

    try {
      const validation = authSchema.safeParse({ email: email.trim(), password });
      if (!validation.success) {
        setValidationError(validation.error.errors[0].message);
        return;
      }

      const trimmedEmail = email.trim().toLowerCase();

      const signInOnce = () =>
        supabase.auth.signInWithPassword({
          email: trimmedEmail,
          password,
        });

      let { data, error } = await signInOnce();
      if (error?.message?.toLowerCase().includes("failed to fetch")) {
        ({ data, error } = await signInOnce());
      }

      if (error) {
        throw new Error(authErrorMessage(error));
      }

      const user = data.user ?? data.session?.user;
      if (!user) {
        throw new Error("Sign in failed. Please try again.");
      }

      const access = await resolveAdminAccess(user);
      if (access.allowed) {
        toast.success("Signed in successfully!");
        navigate("/dashboard");
        return;
      }

      if (access.queryFailed) {
        throw new Error("Could not verify admin access. Please try again.");
      }

      await supabase.auth.signOut();
      throw new Error("Admin access required. Contact administrator.");
    } catch (error: any) {
      setValidationError(error.message || "An error occurred during authentication");
    } finally {
      handlingAuthRef.current = false;
      setLoading(false);
    }
  };

  // Show loading state while checking session
  if (initializing) {
    return (
      <div className="min-h-screen flex items-center justify-center p-4 bg-gradient-to-br from-background via-muted/30 to-background">
        <Card className="w-full max-w-md shadow-elegant border-border/50">
          <CardContent className="flex items-center justify-center p-8">
            <Loader2 className="h-8 w-8 animate-spin text-primary" />
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="min-h-screen flex items-center justify-center p-4 bg-gradient-to-br from-background via-muted/30 to-background">
      <Card className="w-full max-w-md shadow-elegant border-border/50">
        <CardHeader className="space-y-3 text-center">
          <div className="mx-auto w-16 h-16 bg-primary/10 rounded-2xl flex items-center justify-center">
            <DollarSign className="w-8 h-8 text-primary" />
          </div>
          <CardTitle className="text-3xl font-bold bg-gradient-to-r from-primary to-accent bg-clip-text text-transparent">
            NetPay Admin
          </CardTitle>
          <CardDescription className="text-base">
            Sign in to your account
          </CardDescription>
        </CardHeader>
        <CardContent>
          <form onSubmit={handleAuth} className="space-y-4">
            {validationError && (
              <Alert variant="destructive">
                <AlertCircle className="h-4 w-4" />
                <AlertDescription>{validationError}</AlertDescription>
              </Alert>
            )}
            <div className="space-y-2">
              <Label htmlFor="email">Email Address</Label>
              <Input
                id="email"
                type="email"
                placeholder="admin@netppay.com"
                value={email}
                onChange={(e) => {
                  setEmail(e.target.value);
                  setValidationError(null);
                }}
                required
                disabled={loading}
                className="transition-smooth"
                autoComplete="email"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="password">Password</Label>
              <Input
                id="password"
                type="password"
                placeholder="••••••••"
                value={password}
                onChange={(e) => {
                  setPassword(e.target.value);
                  setValidationError(null);
                }}
                required
                disabled={loading}
                minLength={6}
                className="transition-smooth"
                autoComplete="current-password"
              />
            </div>
            <Button
              type="submit"
              className="w-full gradient-primary shadow-glow transition-smooth hover:scale-[1.02]"
              disabled={loading}
            >
              {loading ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  Processing...
                </>
              ) : (
                <>Sign In to Dashboard</>
              )}
            </Button>
          </form>
        </CardContent>
      </Card>
    </div>
  );
};

export default Auth;
