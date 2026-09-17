import { useEffect, useState } from 'react';
import { Modal, StyleSheet, View } from 'react-native';
import { NetpayLoadingAnimation } from '@/components/netpay-loading-animation';
import { ThemedText } from '@/components/themed-text';

type PurchaseProgressOverlayProps = {
  visible: boolean;
};

export function PurchaseProgressOverlay({ visible }: PurchaseProgressOverlayProps) {
  const [phase, setPhase] = useState<'submitting' | 'verifying'>('submitting');

  useEffect(() => {
    if (!visible) {
      setPhase('submitting');
      return;
    }
    const timer = setTimeout(() => setPhase('verifying'), 2000);
    return () => clearTimeout(timer);
  }, [visible]);

  const title = phase === 'submitting' ? 'Payment submitted' : 'Verifying transaction';
  const subtitle =
    phase === 'submitting'
      ? 'Sending your payment securely…'
      : '⏳ Confirming status with the provider…';

  return (
    <Modal visible={visible} transparent animationType="fade" statusBarTranslucent>
      <View style={styles.overlay}>
        <View style={styles.card}>
          <NetpayLoadingAnimation message={title} />
          <ThemedText style={styles.subtitle}>{subtitle}</ThemedText>
          <ThemedText style={styles.hint}>Please keep the app open until we finish.</ThemedText>
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  overlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.45)',
    justifyContent: 'center',
    alignItems: 'center',
    padding: 24,
  },
  card: {
    width: '100%',
    maxWidth: 340,
    backgroundColor: '#fff',
    borderRadius: 16,
    paddingVertical: 28,
    paddingHorizontal: 20,
    alignItems: 'center',
  },
  subtitle: {
    marginTop: 8,
    fontSize: 15,
    textAlign: 'center',
    color: '#333',
    lineHeight: 22,
  },
  hint: {
    marginTop: 12,
    fontSize: 13,
    textAlign: 'center',
    color: '#777',
    lineHeight: 18,
  },
});
