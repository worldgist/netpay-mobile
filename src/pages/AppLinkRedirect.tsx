import { useEffect, useMemo, useState } from "react";
import { useLocation, useSearchParams } from "react-router-dom";
import { Smartphone } from "lucide-react";
import { authRedirectUrls, appDeepLink, NETPAY_SITE_URL, siteUrl } from "@/config/site";
import { Button } from "@/components/ui/button";

/**
 * Fallback page when a user opens https://netpayy.ng/... in the browser.
 * Attempts to open the native app via custom scheme; universal links open the app directly when configured.
 */
export default function AppLinkRedirect() {
  const { pathname } = useLocation();
  const [searchParams] = useSearchParams();
  const [attempted, setAttempted] = useState(false);

  const customSchemeUrl = useMemo(() => {
    const path = pathname.replace(/^\//, "");
    const query: Record<string, string> = {};
    searchParams.forEach((value, key) => {
      query[key] = value;
    });
    return appDeepLink(path, query);
  }, [pathname, searchParams]);

  const webUrl = useMemo(() => {
    const qs = searchParams.toString();
    return qs ? `${siteUrl(pathname)}?${qs}` : siteUrl(pathname);
  }, [pathname, searchParams]);

  useEffect(() => {
    if (attempted) return;
    setAttempted(true);
    const timer = window.setTimeout(() => {
      window.location.href = customSchemeUrl;
    }, 100);
    return () => window.clearTimeout(timer);
  }, [attempted, customSchemeUrl]);

  const title = pathname.includes("reset-password")
    ? "Reset your password in the app"
    : pathname.includes("signup")
      ? "Continue signup in the app"
      : pathname.includes("verify-email")
        ? "Verify your email in the app"
        : "Open NetPay";

  return (
    <div className="min-h-screen flex items-center justify-center bg-background px-6">
      <div className="max-w-md w-full text-center space-y-4">
        <div className="mx-auto w-14 h-14 rounded-full bg-primary/10 flex items-center justify-center">
          <Smartphone className="w-7 h-7 text-primary" />
        </div>
        <h1 className="text-xl font-bold text-foreground">{title}</h1>
        <p className="text-sm text-muted-foreground leading-relaxed">
          NetPay account actions open in the mobile app. If nothing happens, tap the button below.
        </p>
        <div className="flex flex-col gap-3 pt-2">
          <Button asChild>
            <a href={customSchemeUrl}>Open NetPay app</a>
          </Button>
          <Button asChild variant="outline">
            <a href={authRedirectUrls.openApp()}>Continue on {new URL(NETPAY_SITE_URL).hostname}</a>
          </Button>
        </div>
        <p className="text-xs text-muted-foreground break-all">{webUrl}</p>
      </div>
    </div>
  );
}
