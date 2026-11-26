import { Platform } from 'react-native';

/**
 * True when the Expo web app is running as an installed PWA
 * (Add to Home Screen / standalone display mode).
 */
export function isStandalonePwa(): boolean {
  if (Platform.OS !== 'web' || typeof window === 'undefined') return false;

  try {
    const mediaStandalone = window.matchMedia('(display-mode: standalone)').matches;
    const mediaMinimal = window.matchMedia('(display-mode: minimal-ui)').matches;
    const iosStandalone = Boolean((navigator as Navigator & { standalone?: boolean }).standalone);
    const androidTwa = document.referrer.startsWith('android-app://');
    return mediaStandalone || mediaMinimal || iosStandalone || androidTwa;
  } catch {
    return false;
  }
}
