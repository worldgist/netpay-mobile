/** Admin / marketing Vite host (app.netppay.com). Customer Expo web is netppay.com. */
export const NETPAY_SITE_URL = (
  import.meta.env.VITE_SITE_URL || "https://app.netppay.com"
).replace(/\/$/, "");

/** Customer Expo web app URL. */
export const NETPAY_EXPO_WEB_URL = (
  import.meta.env.VITE_EXPO_WEB_URL || "https://netppay.com"
).replace(/\/$/, "");

export const NETPAY_APP_SCHEME = "netpay";

export function siteUrl(path = ""): string {
  if (!path) return NETPAY_SITE_URL;
  const normalized = path.startsWith("/") ? path : `/${path}`;
  return `${NETPAY_SITE_URL}${normalized}`;
}

export function expoWebUrl(path = ""): string {
  if (!path) return NETPAY_EXPO_WEB_URL;
  const normalized = path.startsWith("/") ? path : `/${path}`;
  return `${NETPAY_EXPO_WEB_URL}${normalized}`;
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
  passwordReset: (email?: string) =>
    email
      ? expoWebUrl(`/reset-password?email=${encodeURIComponent(email)}`)
      : expoWebUrl("/reset-password"),
  emailVerification: (email: string) =>
    expoWebUrl(`/open/verify-email?email=${encodeURIComponent(email)}`),
  signupWithReferral: (referralCode: string) =>
    expoWebUrl(`/open/signup?ref=${encodeURIComponent(referralCode)}`),
  payScreen: (screen: string) => expoWebUrl(`/pay?screen=${encodeURIComponent(screen)}`),
  openApp: () => expoWebUrl("/open/app"),
};
