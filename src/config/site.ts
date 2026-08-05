/** Canonical NetPay website URL (auth emails, share links, deep-link fallbacks). */
export const NETPAY_SITE_URL = (
  import.meta.env.VITE_SITE_URL || "https://netppay.com"
).replace(/\/$/, "");

export const NETPAY_APP_SCHEME = "netpay";

export function siteUrl(path = ""): string {
  if (!path) return NETPAY_SITE_URL;
  const normalized = path.startsWith("/") ? path : `/${path}`;
  return `${NETPAY_SITE_URL}${normalized}`;
}

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
  passwordReset: () => siteUrl("/reset-password"),
  emailVerification: (email: string) =>
    siteUrl(`/open/verify-email?email=${encodeURIComponent(email)}`),
  signupWithReferral: (referralCode: string) =>
    siteUrl(`/open/signup?ref=${encodeURIComponent(referralCode)}`),
  payScreen: (screen: string) => siteUrl(`/pay?screen=${encodeURIComponent(screen)}`),
  openApp: () => siteUrl("/open/app"),
};
