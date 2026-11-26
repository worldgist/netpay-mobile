import { Platform } from 'react-native';
import { isStandalonePwa } from '@/utils/pwa';

export type BeforeInstallPromptEvent = Event & {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed' }>;
};

type Listener = (event: BeforeInstallPromptEvent | null) => void;

let deferredPrompt: BeforeInstallPromptEvent | null = null;
let captureStarted = false;
const listeners = new Set<Listener>();

function notify() {
  for (const listener of listeners) {
    listener(deferredPrompt);
  }
}

/**
 * Capture beforeinstallprompt as early as possible (root layout).
 * If we only listen on Landing, the event can fire before that screen mounts.
 */
export function initPwaInstallCapture(): void {
  if (Platform.OS !== 'web' || typeof window === 'undefined') return;
  if (captureStarted || isStandalonePwa()) return;
  captureStarted = true;

  window.addEventListener('beforeinstallprompt', (event) => {
    event.preventDefault();
    deferredPrompt = event as BeforeInstallPromptEvent;
    notify();
  });

  window.addEventListener('appinstalled', () => {
    deferredPrompt = null;
    notify();
  });
}

export function getDeferredInstallPrompt(): BeforeInstallPromptEvent | null {
  return deferredPrompt;
}

export function subscribeInstallPrompt(listener: Listener): () => void {
  listeners.add(listener);
  listener(deferredPrompt);
  return () => {
    listeners.delete(listener);
  };
}

export async function promptPwaInstall(): Promise<'accepted' | 'dismissed' | 'unavailable'> {
  const promptEvent = deferredPrompt;
  if (!promptEvent) return 'unavailable';

  await promptEvent.prompt();
  try {
    const choice = await promptEvent.userChoice;
    deferredPrompt = null;
    notify();
    return choice.outcome;
  } catch {
    deferredPrompt = null;
    notify();
    return 'dismissed';
  }
}

export function isIosSafariInstallable(): boolean {
  if (typeof navigator === 'undefined') return false;
  const ua = navigator.userAgent.toLowerCase();
  const iOS = /iphone|ipad|ipod/.test(ua);
  const iPadOs = navigator.platform === 'MacIntel' && (navigator.maxTouchPoints || 0) > 1;
  return (iOS || iPadOs) && !isStandalonePwa();
}
