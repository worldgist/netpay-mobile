import { useCallback, useEffect, useState, type ReactNode } from "react";
import { ShieldAlert, RefreshCw } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { checkNetworkAccess, VPN_PROXY_BLOCK_MESSAGE } from "@/utils/network-access";
import { Button } from "@/components/ui/button";

type Props = {
  children: ReactNode;
};

export function NetworkAccessGuard({ children }: Props) {
  const [loading, setLoading] = useState(true);
  const [blocked, setBlocked] = useState(false);
  const [message, setMessage] = useState(VPN_PROXY_BLOCK_MESSAGE);

  const runCheck = useCallback(async () => {
    setLoading(true);
    const status = await checkNetworkAccess(supabase);
    setBlocked(status.blocked || !status.allowed);
    setMessage(status.reason || VPN_PROXY_BLOCK_MESSAGE);
    setLoading(false);
  }, []);

  useEffect(() => {
    runCheck();

    const onFocus = () => {
      runCheck();
    };
    window.addEventListener("focus", onFocus);
    return () => window.removeEventListener("focus", onFocus);
  }, [runCheck]);

  useEffect(() => {
    if (!blocked) return;

    supabase.auth.signOut().catch((err) => {
      console.warn("Sign out after VPN/proxy block:", err);
    });
  }, [blocked]);

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background">
        <p className="text-sm text-muted-foreground">Verifying network connection…</p>
      </div>
    );
  }

  if (blocked) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background px-6">
        <div className="max-w-md w-full text-center space-y-4">
          <div className="mx-auto w-14 h-14 rounded-full bg-destructive/10 flex items-center justify-center">
            <ShieldAlert className="w-7 h-7 text-destructive" />
          </div>
          <h1 className="text-xl font-bold text-foreground">Connection blocked</h1>
          <p className="text-sm text-muted-foreground leading-relaxed">{message}</p>
          <Button type="button" variant="outline" onClick={runCheck} className="gap-2">
            <RefreshCw className="w-4 h-4" />
            Check again
          </Button>
        </div>
      </div>
    );
  }

  return <>{children}</>;
}
