/** Canonical NetPay website URL (auth emails, share links, deep-link fallbacks). */
export const NETPAY_SITE_URL = (
  import.meta.env.VITE_SITE_URL || "https://netppay.com"
).replace(/\/$/, "");

/**
 * Expo Router web base URL — customer web app (login, wallet, pay bills).
 * Local default: Metro on :8081. Override with VITE_EXPO_WEB_URL.
 * Admin stays on Vite (`/auth`, `/dashboard`, …).
 *
 * Production must set VITE_EXPO_WEB_URL (e.g. https://app.netppay.com).
 * If unset, landing Login falls back to Vite /user/auth — never /open/app.
 */
export const NETPAY_EXPO_WEB_URL = (
  import.meta.env.VITE_EXPO_WEB_URL ||
  (import.meta.env.DEV ? "http://localhost:8081" : "")
).replace(/\/$/, "");

export const isExpoWebConfigured = Boolean(NETPAY_EXPO_WEB_URL);

export const NETPAY_APP_SCHEME = "netpay";

export function siteUrl(path = ""): string {
  if (!path) return NETPAY_SITE_URL;
  const normalized = path.startsWith("/") ? path : `/${path}`;
  return `${NETPAY_SITE_URL}${normalized}`;
}

/** Absolute URL into the Expo web app. Returns null when Expo web is not configured. */
export function expoWebUrl(path: string): string | null {
  if (!NETPAY_EXPO_WEB_URL) return null;
  const normalized = path.startsWith("/") ? path : `/${path}`;
  return `${NETPAY_EXPO_WEB_URL}${normalized}`;
}

/** Navigate to Expo web when configured; otherwise stay on the given Vite path. */
export function goExpoWeb(path: string, viteFallbackPath = "/user/auth"): void {
  const expo = expoWebUrl(path);
  window.location.assign(expo || viteFallbackPath);
}

/**
 * Expo Router paths for the customer web app.
 * Vite must not render these UIs — only redirect here (or deep-link fallbacks).
 */
export const expoWebRoutes = {
  home: "/",
  payBills: "/pay-bills",
  transactions: "/transactions",
  profile: "/profile",
  airtime: "/airtime-purchase",
  data: "/data-purchase",
  cable: "/cable-tv",
  electricity: "/electricity",
  education: "/education",
  betting: "/betting",
  flight: "/flight-booking",
  transfer: "/transfer",
  addMoney: "/add-money",
  login: "/auth/login",
  signup: "/auth/signup",
  setupPin: "/setup-pin",
  forgetPassword: "/forget-password",
  emailVerification: "/email-verification",
  security: "/security",
  editProfile: "/edit-profile",
  notifications: "/notifications",
  referral: "/referral",
  contact: "/contact-us",
  terms: "/terms-and-conditions",
  privacy: "/privacy-policy",
  statement: "/statement-of-account",
  deleteAccount: "/delete-account",
  changePassword: "/change-password",
  changePin: "/change-pin",
} as const;

export function appDeepLink(path: string, query?: Record<string, string>): string {
  const base = path.replace(/^\//, "");
  const url = new URL(`${NETPAY_APP_SCHEME}://${base}`);
  if (query) {
    for (const [key, value] of Object.entries(query)) {
      if (value) url.searchParams.set(key, value);
    }
  }
  return url.toString();
}

export const authRedirectUrls = {
  passwordReset: (email?: string) =>
    email
      ? siteUrl(`/reset-password?email=${encodeURIComponent(email)}`)
      : siteUrl("/reset-password"),
  emailVerification: (email: string) =>
    siteUrl(`/open/verify-email?email=${encodeURIComponent(email)}`),
  signupWithReferral: (referralCode: string) =>
    siteUrl(`/open/signup?ref=${encodeURIComponent(referralCode)}`),
  payScreen: (screen: string) => siteUrl(`/pay?screen=${encodeURIComponent(screen)}`),
  openApp: () => siteUrl("/open/app"),
};
