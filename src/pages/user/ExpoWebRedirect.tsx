import { useEffect, useMemo } from "react";
import { Navigate, useSearchParams } from "react-router-dom";
import { expoWebUrl, isExpoWebConfigured } from "@/config/site";

type ExpoWebRedirectProps = {
  /** Expo Router path, e.g. /pay-bills or /auth/login */
  path: string;
  /** Vite path when Expo web URL is not configured */
  viteFallbackPath?: string;
  /** Forward current Vite query string to Expo (default true) */
  forwardQuery?: boolean;
};

/**
 * Sends the browser to Expo web when configured.
 * If not configured, stays on Vite (viteFallbackPath) instead of /open/app.
 */
export default function ExpoWebRedirect({
  path,
  viteFallbackPath = "/user/auth",
  forwardQuery = true,
}: ExpoWebRedirectProps) {
  const [searchParams] = useSearchParams();

  const target = useMemo(() => {
    if (!isExpoWebConfigured) return null;
    let url = expoWebUrl(path);
    if (!url) return null;
    if (forwardQuery) {
      const qs = searchParams.toString();
      if (qs) {
        url += (url.includes("?") ? "&" : "?") + qs;
      }
    }
    return url;
  }, [path, forwardQuery, searchParams]);

  useEffect(() => {
    if (target) {
      window.location.replace(target);
    }
  }, [target]);

  if (!isExpoWebConfigured || !target) {
    return <Navigate to={viteFallbackPath} replace />;
  }

  return (
    <div className="min-h-screen bg-white flex flex-col items-center justify-center gap-3 px-6">
      <div className="relative h-12 w-12">
        <div className="absolute inset-0 rounded-full border-4 border-orange-100" />
        <div className="absolute inset-0 rounded-full border-4 border-transparent border-t-[#FF7F00] animate-spin" />
      </div>
      <p className="text-sm text-gray-600">Opening NetPay…</p>
      <a href={target} className="text-sm font-medium text-[#FF7F00] hover:underline">
        Continue
      </a>
    </div>
  );
}
