import { NETPAY_SITE_URL } from "./site-url.ts";

/** Public NetPay logo used in push notification rich content (expanded notification image). */
export const NETPAY_LOGO_URL = Deno.env.get("NETPAY_LOGO_URL") || `${NETPAY_SITE_URL}/logo.png`;

/** Attach brand logo to an Expo push message when no image is already set. */
export function withNetpayPushBrand(
  message: Record<string, unknown>,
): Record<string, unknown> {
  const rich = message.richContent;
  if (rich && typeof rich === "object" && !Array.isArray(rich)) {
    const existing = rich as Record<string, unknown>;
    if (existing.image) return message;
    return {
      ...message,
      richContent: { ...existing, image: NETPAY_LOGO_URL },
    };
  }
  return {
    ...message,
    richContent: { image: NETPAY_LOGO_URL },
  };
}
