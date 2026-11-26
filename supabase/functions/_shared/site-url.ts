/** Canonical public website (also used in auth email redirect URLs). */
export const NETPAY_SITE_URL =
  (Deno.env.get("NETPAY_SITE_URL") || Deno.env.get("SITE_URL") || "https://netppay.com").replace(
    /\/$/,
    "",
  );

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

export function emailFooterAppLinkHtml(label = "Open NetPay app"): string {
  const href = authRedirectUrls.openApp();
  return `<p style="margin:16px 0 0;font-size:14px;"><a href="${href}" style="color:#ff7f00;font-weight:600;text-decoration:none;">${label}</a></p>`;
}
