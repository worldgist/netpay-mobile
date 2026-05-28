import { type ReactNode } from "react";
import { useLocation, Link } from "react-router-dom";
import { Smartphone, Home } from "lucide-react";
import {
  isWebAppPathBlockedOnHost,
  WEB_APP_BLOCKED_ON_HOST_MESSAGE,
} from "@/utils/web-host-access";
import { Button } from "@/components/ui/button";

type Props = {
  children: ReactNode;
};

export function WebHostAccessGuard({ children }: Props) {
  const { pathname } = useLocation();
  const blocked = isWebAppPathBlockedOnHost(pathname);

  if (!blocked) {
    return <>{children}</>;
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-background px-6">
      <div className="max-w-md w-full text-center space-y-5">
        <div className="mx-auto w-14 h-14 rounded-full bg-primary/10 flex items-center justify-center">
          <Smartphone className="w-7 h-7 text-primary" />
        </div>
        <h1 className="text-xl font-bold text-foreground">Use the NetPay mobile app</h1>
        <p className="text-sm text-muted-foreground leading-relaxed">
          {WEB_APP_BLOCKED_ON_HOST_MESSAGE}
        </p>
        <p className="text-xs text-muted-foreground">
          Wallet and admin features on the website are disabled. Use the NetPay mobile app for your account.
        </p>
        <Button asChild variant="default" className="mx-auto">
          <Link to="/">
            <Home className="w-4 h-4 mr-2" />
            Back to homepage
          </Link>
        </Button>
      </div>
    </div>
  );
}
