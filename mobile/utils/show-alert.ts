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
