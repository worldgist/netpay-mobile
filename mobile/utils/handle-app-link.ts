import * as Linking from 'expo-linking';
import { router } from 'expo-router';
import { NETPAY_SITE_URL } from '@/constants/site';
import {
  isSuccessfulFundingStatus,
  returnToAppAfterFunding,
} from '@/utils/verify-flutterwave-funding';
import { shouldHandleFundingCallback } from '@/utils/funding-callback-guard';
import { parseAuthLinkParams } from '@/utils/parse-auth-link-params';
import { buildRouteHref } from '@/utils/router-href';

const PAY_ROUTES: Record<string, string> = {
  data_purchase: '/data-purchase',
  airtime: '/airtime-purchase',
  electricity: '/electricity',
  cable_tv: '/cable-tv',
  education: '/education',
  betting: '/betting',
  flight_booking: '/flight-booking',
  pay_bills: '/(tabs)/pay-bills',
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
 * Routes netpay:// and https://netppay.com/... links into the mobile app.
 */
export function handleAppLink(url: string): void {
  if (!url?.trim()) return;

  const parsed = Linking.parse(url);
  const query = parsed.queryParams ?? {};
  const path = resolvePath(parsed, url);
  const authParams = parseAuthLinkParams(url, query);
  const {
    email: authEmail,
    accessToken,
    refreshToken,
    tokenHash,
    type,
    code,
  } = authParams;

  if (path === 'add-money-callback' || path.startsWith('add-money-callback')) {
    const txRef = typeof query.tx_ref === 'string' ? query.tx_ref : '';
    const status = typeof query.status === 'string' ? query.status : 'successful';
    void (async () => {
      if (!txRef || !(await shouldHandleFundingCallback(txRef))) {
        return;
      }
      if (!isSuccessfulFundingStatus(status)) {
        router.replace('/add-money');
        return;
      }
      returnToAppAfterFunding(txRef, status);
    })();
    return;
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
    router.push(buildRouteHref('/auth/signup', ref ? { ref } : undefined));
    return;
  }

  if (path === 'open/verify-email' || path.startsWith('open/verify-email') || path === 'email-verification') {
    const email = authEmail || (typeof query.email === 'string' ? query.email : '');

    if (accessToken || refreshToken || tokenHash || code) {
      void (async () => {
        const { completeEmailVerificationFromLink } = await import('@/utils/email-verification');
        const { data, error } = await completeEmailVerificationFromLink({
          accessToken,
          refreshToken,
          tokenHash,
          type,
          code,
        });
        if (!error && data.session) {
          router.replace('/setup-pin');
          return;
        }
        router.push(buildRouteHref('/email-verification', {
          ...(email ? { email } : {}),
          ...(accessToken ? { access_token: accessToken } : {}),
          ...(refreshToken ? { refresh_token: refreshToken } : {}),
          ...(tokenHash ? { token_hash: tokenHash } : {}),
          ...(type ? { type } : {}),
          ...(code ? { code } : {}),
        }));
      })();
      return;
    }

    router.push(buildRouteHref('/email-verification', email ? { email } : undefined));
    return;
  }

  if (path === 'open/app' || path === 'open') {
    router.replace('/splash');
    return;
  }

  if (path === 'reset-password' || path.includes('reset-password')) {
    const params: Record<string, string> = {};
    const email = authEmail || (typeof query.email === 'string' ? query.email : '');
    if (email) params.email = email;
    if (accessToken) params.access_token = accessToken;
    if (refreshToken) params.refresh_token = refreshToken;
    if (type) params.type = type;
    if (tokenHash) params.token_hash = tokenHash;
    if (code) params.code = code;

    if (accessToken || refreshToken || tokenHash || code) {
      void (async () => {
        router.push(buildRouteHref('/reset-password', params));
      })();
      return;
    }

    router.push(buildRouteHref('/reset-password', Object.keys(params).length ? params : undefined));
    return;
  }
}
