import { useEffect, useMemo } from "react";
import { useSearchParams } from "react-router-dom";
import { expoWebUrl } from "@/config/site";

type ExpoWebRedirectProps = {
  /** Expo Router path, e.g. /pay-bills or /auth/login */
  path: string;
  /** Optional marketing-site deep-link fallback when Expo web URL is unset */
  fallbackSitePath?: string;
  /** Forward current Vite query string to Expo (default true) */
  forwardQuery?: boolean;
};

/**
 * Sends the browser to the Expo customer web app (not Vite user pages).
 */
export default function ExpoWebRedirect({
  path,
  fallbackSitePath,
  forwardQuery = true,
}: ExpoWebRedirectProps) {
  const [searchParams] = useSearchParams();

  const target = useMemo(() => {
    let url = expoWebUrl(path, fallbackSitePath);
    if (forwardQuery) {
      const qs = searchParams.toString();
      if (qs) {
        url += (url.includes("?") ? "&" : "?") + qs;
      }
    }
    return url;
  }, [path, fallbackSitePath, forwardQuery, searchParams]);

  useEffect(() => {
    window.location.replace(target);
  }, [target]);

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
