import { useEffect, useState } from 'react';
import { Platform, Pressable, StyleSheet, View } from 'react-native';
import { MaterialIcons } from '@expo/vector-icons';
import { ThemedText } from '@/components/themed-text';
import { isStandalonePwa } from '@/utils/pwa';

const DISMISS_KEY = 'netpay_a2hs_dismissed';

type BeforeInstallPromptEvent = Event & {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed' }>;
};

function isIosDevice(): boolean {
  if (typeof navigator === 'undefined') return false;
  const ua = navigator.userAgent.toLowerCase();
  const iOS = /iphone|ipad|ipod/.test(ua);
  const iPadOs = navigator.platform === 'MacIntel' && (navigator.maxTouchPoints || 0) > 1;
  return iOS || iPadOs;
}

function wasDismissed(): boolean {
  try {
    return window.localStorage.getItem(DISMISS_KEY) === '1';
  } catch {
    return false;
  }
}

function dismissBanner() {
  try {
    window.localStorage.setItem(DISMISS_KEY, '1');
  } catch {
    // ignore
  }
}

/**
 * Chrome/Edge: native install via beforeinstallprompt.
 * iOS Safari: show Share → Add to Home Screen steps.
 */
export function AddToHomeScreenBanner() {
  const [visible, setVisible] = useState(false);
  const [showIosSteps, setShowIosSteps] = useState(false);
  const [isIos, setIsIos] = useState(false);
  const [deferredPrompt, setDeferredPrompt] = useState<BeforeInstallPromptEvent | null>(null);

  useEffect(() => {
    if (Platform.OS !== 'web' || typeof window === 'undefined') return;
    if (isStandalonePwa() || wasDismissed()) return;

    const ios = isIosDevice();
    setIsIos(ios);
    if (ios) {
      setVisible(true);
      return;
    }

    const onBeforeInstall = (event: Event) => {
      event.preventDefault();
      setDeferredPrompt(event as BeforeInstallPromptEvent);
      setVisible(true);
    };

    window.addEventListener('beforeinstallprompt', onBeforeInstall);
    return () => window.removeEventListener('beforeinstallprompt', onBeforeInstall);
  }, []);

  if (Platform.OS !== 'web' || !visible) return null;

  const close = () => {
    setVisible(false);
    dismissBanner();
  };

  const install = async () => {
    if (!deferredPrompt) return;
    await deferredPrompt.prompt();
    try {
      await deferredPrompt.userChoice;
    } catch {
      // ignore
    }
    setDeferredPrompt(null);
    setVisible(false);
    dismissBanner();
  };

  return (
    <View style={styles.wrap} pointerEvents="box-none">
      <View style={styles.card}>
        <View style={styles.iconWrap}>
          <MaterialIcons name="smartphone" size={22} color="#FF7F00" />
        </View>
        <View style={styles.copy}>
          <ThemedText style={styles.title}>
            {isIos ? 'Install NetPay on your iPhone' : 'Install NetPay on your device'}
          </ThemedText>
          <ThemedText style={styles.desc}>
            {isIos
              ? 'Add NetPay to your Home Screen for quick access like an app.'
              : 'Install NetPay for a faster, app-like experience on your home screen.'}
          </ThemedText>

          {isIos && showIosSteps ? (
            <View style={styles.steps}>
              <ThemedText style={styles.step}>1. Tap Share in Safari</ThemedText>
              <ThemedText style={styles.step}>2. Tap “Add to Home Screen”</ThemedText>
              <ThemedText style={styles.step}>3. Tap Add — NetPay appears on your Home Screen</ThemedText>
            </View>
          ) : null}

          <View style={styles.actions}>
            {isIos ? (
              <Pressable style={styles.primaryBtn} onPress={() => setShowIosSteps((v) => !v)}>
                <ThemedText style={styles.primaryText}>
                  {showIosSteps ? 'Hide steps' : 'Show me how'}
                </ThemedText>
              </Pressable>
            ) : (
              <Pressable style={styles.primaryBtn} onPress={() => void install()} disabled={!deferredPrompt}>
                <MaterialIcons name="get-app" size={16} color="#fff" />
                <ThemedText style={styles.primaryText}>Install app</ThemedText>
              </Pressable>
            )}
            <Pressable style={styles.ghostBtn} onPress={close}>
              <ThemedText style={styles.ghostText}>Not now</ThemedText>
            </Pressable>
          </View>
        </View>
        <Pressable style={styles.closeBtn} onPress={close} accessibilityLabel="Dismiss">
          <MaterialIcons name="close" size={18} color="#98A2B3" />
        </Pressable>
      </View>
    </View>
  );
}

export function registerNetpayServiceWorker() {
  if (Platform.OS !== 'web' || typeof window === 'undefined') return;
  if (!('serviceWorker' in navigator)) return;
  if (typeof location !== 'undefined' && /localhost|127\.0\.0\.1/.test(location.hostname)) {
    // Keep local Expo web uncached during development.
    return;
  }

  const register = () => {
    navigator.serviceWorker.register('/sw.js').catch(() => {
      // best-effort
    });
  };

  if (document.readyState === 'complete') {
    register();
  } else {
    window.addEventListener('load', register, { once: true });
  }
}

const styles = StyleSheet.create({
  wrap: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 0,
    zIndex: 60,
    padding: 12,
  },
  card: {
    maxWidth: 520,
    width: '100%',
    alignSelf: 'center',
    backgroundColor: '#fff',
    borderRadius: 18,
    borderWidth: 1,
    borderColor: '#FFE0C2',
    padding: 14,
    flexDirection: 'row',
    gap: 12,
    shadowColor: '#FF7F00',
    shadowOpacity: 0.12,
    shadowRadius: 16,
    shadowOffset: { width: 0, height: 8 },
    elevation: 8,
  },
  iconWrap: {
    width: 44,
    height: 44,
    borderRadius: 12,
    backgroundColor: '#FFF3E8',
    alignItems: 'center',
    justifyContent: 'center',
  },
  copy: {
    flex: 1,
    gap: 6,
  },
  title: {
    color: '#1A2B4A',
    fontSize: 15,
    fontWeight: '800',
  },
  desc: {
    color: '#667085',
    fontSize: 13,
    lineHeight: 19,
  },
  steps: {
    marginTop: 4,
    gap: 4,
  },
  step: {
    color: '#334155',
    fontSize: 13,
    lineHeight: 18,
  },
  actions: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
    marginTop: 6,
  },
  primaryBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    backgroundColor: '#FF7F00',
    borderRadius: 999,
    paddingHorizontal: 14,
    paddingVertical: 9,
  },
  primaryText: {
    color: '#fff',
    fontWeight: '700',
    fontSize: 13,
  },
  ghostBtn: {
    borderRadius: 999,
    paddingHorizontal: 12,
    paddingVertical: 9,
  },
  ghostText: {
    color: '#667085',
    fontWeight: '600',
    fontSize: 13,
  },
  closeBtn: {
    padding: 2,
  },
});
