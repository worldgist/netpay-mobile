import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
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

const Auth = () => {
  const navigate = useNavigate();
  const [loading, setLoading] = useState(false);
  const [initializing, setInitializing] = useState(true);
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [isSignUp, setIsSignUp] = useState(false);
  const [validationError, setValidationError] = useState<string | null>(null);

  useEffect(() => {
    let mounted = true;
    
    // Set a timeout to ensure the component always renders
    const timeoutId = setTimeout(() => {
      if (mounted) {
        setInitializing(false);
      }
    }, 3000); // Max 3 seconds for initialization

    const checkUser = async () => {
      try {
        const { data: { session: currentSession }, error: sessionError } = await supabase.auth.getSession();
        
        if (sessionError) {
          console.error('Error getting session:', sessionError);
          if (mounted) setInitializing(false);
          return;
        }
        
        if (currentSession) {
          // Check if user has admin role
          try {
            const { data: roles, error: rolesError } = await supabase
              .from('user_roles')
              .select('role')
              .eq('user_id', currentSession.user.id)
              .eq('role', 'admin')
              .maybeSingle();

            if (!mounted) return;

            if (rolesError) {
              console.error('Error checking user role:', rolesError);
              // Don't sign out on query errors, just log and show the form
              setInitializing(false);
            } else if (roles) {
              clearTimeout(timeoutId);
              navigate("/dashboard");
              return; // Don't set initializing to false if navigating
            } else {
              await supabase.auth.signOut();
              toast.error("Admin access required");
              setInitializing(false);
            }
          } catch (error: any) {
            console.error('Error in role check:', error);
            // If there's an error, just show the form
            if (mounted) setInitializing(false);
          }
        } else {
          if (mounted) setInitializing(false);
        }
      } catch (error) {
        console.error('Error in checkUser:', error);
        if (mounted) setInitializing(false);
      }
    };
    
    checkUser();

    const { data: { subscription } } = supabase.auth.onAuthStateChange(async (event, session) => {
      if (session && event === 'SIGNED_IN') {
        // Defer admin check with setTimeout to prevent deadlock
        setTimeout(async () => {
          if (!mounted) return;
          
          try {
            const { data: roles, error: rolesError } = await supabase
              .from('user_roles')
              .select('role')
              .eq('user_id', session.user.id)
              .eq('role', 'admin')
              .maybeSingle();

            if (rolesError) {
              // Handle 406 Not Acceptable errors gracefully
              if (rolesError.code === '406' || rolesError.message?.includes('406')) {
                console.warn('406 error checking user role (likely Accept header issue), trying alternative query:', rolesError);
                // Try alternative query without maybeSingle
                const { data: altRoles } = await supabase
                  .from('user_roles')
                  .select('role')
                  .eq('user_id', session.user.id)
                  .eq('role', 'admin');
                
                if (altRoles && altRoles.length > 0) {
                  navigate("/dashboard");
                } else {
                  await supabase.auth.signOut();
                  toast.error("Admin access required. Contact administrator.");
                }
              } else {
                console.error('Error checking user role:', rolesError);
                // Don't sign out on query errors, just log
              }
            } else if (roles) {
              navigate("/dashboard");
            } else {
              await supabase.auth.signOut();
              toast.error("Admin access required. Contact administrator.");
            }
          } catch (error) {
            console.error('Error in auth state change handler:', error);
          }
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

    try {
      // Validate input
      const validation = authSchema.safeParse({ email: email.trim(), password });
      if (!validation.success) {
        setValidationError(validation.error.errors[0].message);
        return;
      }

      const trimmedEmail = email.trim().toLowerCase();

      if (isSignUp) {
        const { data: signUpData, error } = await supabase.auth.signUp({
          email: trimmedEmail,
          password,
          options: {
            emailRedirectTo: `${window.location.origin}/dashboard`,
          },
        });

        if (error) {
          if (error.message.includes("already registered")) {
            throw new Error("This email is already registered. Please sign in instead.");
          }
          throw error;
        }

        // Ensure profile is created (fallback if trigger doesn't fire)
        if (signUpData.user) {
          try {
            const { error: profileError } = await supabase
              .from('profiles')
              .upsert({
                id: signUpData.user.id,
                email: trimmedEmail,
                full_name: trimmedEmail.split('@')[0],
                balance: 0,
                status: 'active'
              }, {
                onConflict: 'id'
              });

            if (profileError) {
              console.error('Profile creation error:', profileError);
              // Don't fail signup if profile creation fails - trigger should handle it
            }
          } catch (profileErr) {
            console.error('Error ensuring profile exists:', profileErr);
            // Continue anyway - trigger should have created it
          }
        }
        
        toast.success("Account created! Check your email to verify your account.");
        setIsSignUp(false);
        setEmail("");
        setPassword("");
      } else {
        const { error } = await supabase.auth.signInWithPassword({
          email: trimmedEmail,
          password,
        });

        if (error) {
          if (error.message.includes("Invalid login credentials")) {
            throw new Error("Invalid email or password. Please try again.");
          }
          throw error;
        }
        
        toast.success("Signed in successfully!");
      }
    } catch (error: any) {
      setValidationError(error.message || "An error occurred during authentication");
    } finally {
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
            {isSignUp ? "Create your admin account" : "Sign in to your account"}
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
                placeholder="admin@netpayy.ng"
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
                autoComplete={isSignUp ? "new-password" : "current-password"}
              />
              {isSignUp && (
                <p className="text-xs text-muted-foreground">
                  Password must be at least 6 characters long
                </p>
              )}
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
                <>{isSignUp ? "Create Admin Account" : "Sign In to Dashboard"}</>
              )}
            </Button>
            <Button
              type="button"
              variant="ghost"
              className="w-full"
              onClick={() => {
                setIsSignUp(!isSignUp);
                setValidationError(null);
              }}
              disabled={loading}
            >
              {isSignUp ? "Already have an account? Sign in" : "Need an account? Sign up"}
            </Button>
          </form>
        </CardContent>
      </Card>
    </div>
  );
};

export default Auth;
