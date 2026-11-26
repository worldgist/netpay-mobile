import { StyleSheet, TouchableOpacity, View, Platform } from 'react-native';
import { Image } from 'expo-image';
import { ThemedText } from '@/components/themed-text';
import { NetpayLoadingAnimation } from '@/components/netpay-loading-animation';

type GoogleAuthButtonProps = {
  onPress: () => void;
  loading?: boolean;
  disabled?: boolean;
  label?: string;
};

export function GoogleAuthButton({
  onPress,
  loading = false,
  disabled = false,
  label = 'Continue with Google',
}: GoogleAuthButtonProps) {
  return (
    <TouchableOpacity
      style={[styles.button, (loading || disabled) && styles.buttonDisabled]}
      onPress={onPress}
      disabled={loading || disabled}
      activeOpacity={0.85}>
      {loading ? (
        <NetpayLoadingAnimation size={22} strokeWidth={2} />
      ) : (
        <View style={styles.content}>
          <Image
            source={require('../assets/images/google-logo.png')}
            style={styles.googleLogo}
            contentFit="contain"
            accessibilityLabel="Google"
          />
          <ThemedText style={styles.label}>{label}</ThemedText>
        </View>
      )}
    </TouchableOpacity>
  );
}

export function AuthDivider({ label = 'or' }: { label?: string }) {
  return (
    <View style={styles.dividerRow}>
      <View style={styles.dividerLine} />
      <ThemedText style={styles.dividerText}>{label}</ThemedText>
      <View style={styles.dividerLine} />
    </View>
  );
}

const styles = StyleSheet.create({
  button: {
    height: Platform.OS === 'web' ? 64 : 56,
    borderRadius: 12,
    borderWidth: 1.5,
    borderColor: '#E0E0E0',
    backgroundColor: '#fff',
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 8,
  },
  buttonDisabled: {
    opacity: 0.7,
  },
  content: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 10,
  },
  googleLogo: {
    width: Platform.OS === 'web' ? 24 : 22,
    height: Platform.OS === 'web' ? 24 : 22,
  },
  label: {
    fontSize: Platform.OS === 'web' ? 18 : 16,
    fontWeight: '600',
    color: '#333',
    ...(Platform.OS === 'android' ? { includeFontPadding: false } : null),
  },
  dividerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginVertical: 12,
    gap: 12,
  },
  dividerLine: {
    flex: 1,
    height: StyleSheet.hairlineWidth,
    backgroundColor: '#E0E0E0',
  },
  dividerText: {
    fontSize: 13,
    color: '#888',
    textTransform: 'lowercase',
  },
});
