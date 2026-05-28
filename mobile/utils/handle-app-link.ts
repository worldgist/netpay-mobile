import * as Linking from 'expo-linking';
import { router } from 'expo-router';
import { NETPAY_SITE_URL } from '@/constants/site';

const PAY_ROUTES: Record<string, string> = {
  data_purchase: '/data-purchase',
  airtime: '/airtime-purchase',
  electricity: '/electricity',
  cable_tv: '/cable-tv',
  education: '/education',
  betting: '/betting',
  flight_booking: '/flight-booking',
  pay_bills: '/(tabs)/pay-bills',
  support_chat: '/support-chat',
  support_admin: '/support-admin',
  add_money: '/add-money',
  transfer: '/transfer',
};

function resolvePath(parsed: Linking.ParsedURL, rawUrl: string): string {
  let path = String(parsed.path || '').replace(/^\/+/, '').replace(/\/+$/, '');

  if (!path && rawUrl.startsWith('http')) {
    try {
      const url = new URL(rawUrl);
      path = url.pathname.replace(/^\/+/, '').replace(/\/+$/, '');
    } catch {
      // ignore
    }
  }

  if (!path && parsed.hostname && parsed.hostname !== NETPAY_SITE_URL.replace(/^https?:\/\//, '')) {
    path = String(parsed.hostname).replace(/\/+$/, '');
  }

  return path;
}

/**
 * Routes netpay:// and https://netpayy.ng/... links into the mobile app.
 */
export function handleAppLink(url: string): void {
  if (!url?.trim()) return;

  const parsed = Linking.parse(url);
  const query = parsed.queryParams ?? {};
  const path = resolvePath(parsed, url);

  let accessToken: string | undefined;
  let refreshToken: string | undefined;
  let type: string | undefined;

  if (typeof query.access_token === 'string') accessToken = query.access_token;
  if (typeof query.refresh_token === 'string') refreshToken = query.refresh_token;
  if (typeof query.type === 'string') type = query.type;

  if (url.includes('#')) {
    try {
      const hashPart = url.split('#')[1];
      if (hashPart) {
        const hashParams = new URLSearchParams(hashPart);
        accessToken = accessToken || hashParams.get('access_token') || undefined;
        refreshToken = refreshToken || hashParams.get('refresh_token') || undefined;
        type = type || hashParams.get('type') || undefined;
      }
    } catch {
      // ignore hash parse errors
    }
  }

  if (path === 'pay') {
    const screen = typeof query.screen === 'string' ? query.screen.trim() : '';
    const target = PAY_ROUTES[screen];
    if (target) {
      router.push(target as import('expo-router').Href);
      return;
    }
  }

  if (path === 'open/signup' || path.startsWith('open/signup')) {
    const ref = typeof query.ref === 'string' ? query.ref : '';
    router.push({
      pathname: '/auth/signup',
      params: ref ? { ref } : {},
    });
    return;
  }

  if (path === 'open/verify-email' || path.startsWith('open/verify-email')) {
    const email = typeof query.email === 'string' ? query.email : '';
    router.push({
      pathname: '/email-verification',
      params: email ? { email } : {},
    });
    return;
  }

  if (path === 'open/app' || path === 'open') {
    router.replace('/splash');
    return;
  }

  if (path === 'reset-password' || path.includes('reset-password')) {
    const params: Record<string, string> = {};
    if (accessToken) params.access_token = accessToken;
    if (refreshToken) params.refresh_token = refreshToken;
    if (type) params.type = type;
    router.push({
      pathname: '/reset-password',
      params,
    });
  }
}
