import { useEffect, useState } from "react";
import { Share, PlusSquare, X, Smartphone } from "lucide-react";
import { Button } from "@/components/ui/button";

const DISMISS_KEY = "netpay_ios_a2hs_dismissed";

function isIosDevice(): boolean {
  if (typeof navigator === "undefined") return false;
  const ua = navigator.userAgent.toLowerCase();
  const iOS = /iphone|ipad|ipod/.test(ua);
  const iPadOs =
    navigator.platform === "MacIntel" && (navigator.maxTouchPoints || 0) > 1;
  return iOS || iPadOs;
}

function isStandaloneDisplay(): boolean {
  if (typeof window === "undefined") return false;
  const mediaStandalone = window.matchMedia("(display-mode: standalone)").matches;
  const iosStandalone = Boolean((navigator as Navigator & { standalone?: boolean }).standalone);
  return mediaStandalone || iosStandalone;
}

/**
 * iOS Safari does not support beforeinstallprompt.
 * This banner walks users through Share → Add to Home Screen.
 */
export function IosAddToHomeScreen() {
  const [visible, setVisible] = useState(false);
  const [showSteps, setShowSteps] = useState(false);

  useEffect(() => {
    if (!isIosDevice() || isStandaloneDisplay()) return;
    try {
      if (window.localStorage.getItem(DISMISS_KEY) === "1") return;
    } catch {
      // ignore
    }
    setVisible(true);
  }, []);

  if (!visible) return null;

  const dismiss = () => {
    setVisible(false);
    try {
      window.localStorage.setItem(DISMISS_KEY, "1");
    } catch {
      // ignore
    }
  };

  return (
    <div className="fixed inset-x-0 bottom-0 z-[60] p-3 sm:p-4 pointer-events-none">
      <div className="pointer-events-auto mx-auto max-w-lg rounded-2xl border border-orange-200 bg-white shadow-xl shadow-orange-500/10 overflow-hidden">
        <div className="flex items-start gap-3 p-4">
          <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-orange-50">
            <Smartphone className="h-5 w-5 text-brand" />
          </div>
          <div className="min-w-0 flex-1">
            <p className="font-semibold text-gray-900">Install NetPay on your iPhone</p>
            <p className="mt-1 text-sm text-gray-600">
              Add NetPay to your Home Screen for quick access like an app.
            </p>
            {showSteps ? (
              <ol className="mt-3 space-y-2 text-sm text-gray-700">
                <li className="flex items-start gap-2">
                  <span className="mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-brand text-[11px] font-bold text-white">
                    1
                  </span>
                  <span className="inline-flex flex-wrap items-center gap-1">
                    Tap <Share className="inline h-4 w-4 text-brand" aria-hidden />{" "}
                    <strong>Share</strong> in Safari
                  </span>
                </li>
                <li className="flex items-start gap-2">
                  <span className="mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-brand text-[11px] font-bold text-white">
                    2
                  </span>
                  <span className="inline-flex flex-wrap items-center gap-1">
                    Scroll and tap <PlusSquare className="inline h-4 w-4 text-brand" aria-hidden />{" "}
                    <strong>Add to Home Screen</strong>
                  </span>
                </li>
                <li className="flex items-start gap-2">
                  <span className="mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-brand text-[11px] font-bold text-white">
                    3
                  </span>
                  <span>
                    Tap <strong>Add</strong> — NetPay appears on your Home Screen
                  </span>
                </li>
              </ol>
            ) : null}
            <div className="mt-3 flex flex-wrap gap-2">
              <Button
                type="button"
                size="sm"
                className="bg-brand text-white hover:bg-brand/90"
                onClick={() => setShowSteps((v) => !v)}
              >
                {showSteps ? "Hide steps" : "Show me how"}
              </Button>
              <Button type="button" size="sm" variant="ghost" onClick={dismiss}>
                Not now
              </Button>
            </div>
          </div>
          <button
            type="button"
            onClick={dismiss}
            className="rounded-full p-1 text-gray-400 hover:bg-gray-100 hover:text-gray-600"
            aria-label="Dismiss"
          >
            <X className="h-4 w-4" />
          </button>
        </div>
      </div>
    </div>
  );
}
