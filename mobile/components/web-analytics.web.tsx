import { Analytics } from '@vercel/analytics/react';

/** Vercel Web Analytics. Loaded only in the Expo web bundle. */
export function WebAnalytics() {
  return <Analytics />;
}
