import { Alert, Platform } from 'react-native';

/** Alert.alert button callbacks often never fire on web — use window.alert there. */
export function showAlert(title: string, message?: string): void {
  const text = message ? `${title}\n\n${message}` : title;
  if (Platform.OS === 'web') {
    if (typeof window !== 'undefined') {
      window.alert(text);
    }
    return;
  }
  Alert.alert(title, message);
}

/**
 * Confirm dialog that works on web (window.confirm) and native (Alert.alert).
 * Resolves true when the user confirms.
 */
export function showConfirm(
  title: string,
  message: string,
  options?: { confirmText?: string; cancelText?: string },
): Promise<boolean> {
  const confirmText = options?.confirmText || 'OK';
  const cancelText = options?.cancelText || 'Cancel';

  if (Platform.OS === 'web') {
    if (typeof window === 'undefined') return Promise.resolve(false);
    return Promise.resolve(window.confirm(`${title}\n\n${message}`));
  }

  return new Promise((resolve) => {
    Alert.alert(title, message, [
      { text: cancelText, style: 'cancel', onPress: () => resolve(false) },
      { text: confirmText, style: 'destructive', onPress: () => resolve(true) },
    ]);
  });
}
