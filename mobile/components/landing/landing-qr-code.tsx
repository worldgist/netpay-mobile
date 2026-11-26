import { StyleSheet, View } from 'react-native';
import { Image } from 'expo-image';
import { ThemedText } from '@/components/themed-text';
import { NETPAY_SITE_URL, siteUrl } from '@/constants/site';

/** Canonical landing URL encoded in the QR (opens marketing landing when scanned). */
export const LANDING_QR_URL = siteUrl('/landing');

type LandingQrCodeProps = {
  size?: number;
  label?: string;
};

/**
 * Real scannable QR pointing at the NetPay landing page
 * (`https://netppay.com/landing` in production).
 */
export function LandingQrCode({
  size = 168,
  label = 'Scan to open NetPay',
}: LandingQrCodeProps) {
  return (
    <View
      style={styles.wrap}
      accessibilityRole="image"
      accessibilityLabel={`QR code linking to ${NETPAY_SITE_URL}/landing`}>
      <View style={[styles.frame, { width: size + 16, height: size + 16 }]}>
        <Image
          source={require('@/assets/images/landing-qr.png')}
          style={{ width: size, height: size }}
          contentFit="contain"
        />
      </View>
      {label ? <ThemedText style={styles.label}>{label}</ThemedText> : null}
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    alignItems: 'center',
  },
  frame: {
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#FFFFFF',
    borderRadius: 12,
  },
  label: {
    color: '#667085',
    fontSize: 12,
    marginTop: 8,
    textAlign: 'center',
  },
});
