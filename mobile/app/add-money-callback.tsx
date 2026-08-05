import { useEffect, useRef } from 'react';
import { StyleSheet, View, Alert } from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { ThemedView } from '@/components/themed-view';
import { ThemedText } from '@/components/themed-text';
import { NetpayLoadingAnimation } from '@/components/netpay-loading-animation';
import { supabase } from '@/lib/supabase';
import { useTransactions } from '@/contexts/transactions-context';

export default function AddMoneyCallbackScreen() {
  const router = useRouter();
  const { refresh: refreshTransactions } = useTransactions();
  const params = useLocalSearchParams<{ tx_ref?: string; status?: string }>();
  const hasHandled = useRef(false);

  useEffect(() => {
    if (hasHandled.current) return;
    hasHandled.current = true;

    const verifyPayment = async () => {
      const txRef = typeof params.tx_ref === 'string' ? params.tx_ref : '';
      const status = typeof params.status === 'string' ? params.status.toLowerCase() : '';

      if (!txRef || (status && status !== 'successful' && status !== 'completed')) {
        Alert.alert('Payment Cancelled', 'Your payment was not completed.');
        router.replace('/add-money');
        return;
      }

      try {
        const { data, error } = await supabase.functions.invoke('verify-flutterwave-payment', {
          body: { txRef },
        });

        if (error) throw error;

        if (!data?.success) {
          throw new Error(data?.error || 'Payment verification failed');
        }

        const credited = Number(data.data?.netCreditAmount || 0);
        const balanceAfter = Number(data.data?.balanceAfter || 0);

        await refreshTransactions();

        router.replace('/(tabs)');

        Alert.alert(
          'Wallet Funded',
          credited > 0
            ? `₦${credited.toLocaleString()} has been added to your wallet. New balance: ₦${balanceAfter.toLocaleString()}.`
            : 'Your wallet has been funded successfully.'
        );
      } catch (err) {
        console.error('Payment verification failed:', err);
        const errorMessage = err instanceof Error ? err.message : 'Unable to verify payment';
        Alert.alert('Verification Failed', errorMessage);
        router.replace('/add-money');
      }
    };

    void verifyPayment();
  }, [params.status, params.tx_ref, refreshTransactions, router]);

  return (
    <ThemedView style={styles.container}>
      <View style={styles.content}>
        <NetpayLoadingAnimation size={56} variant="onBrand" strokeWidth={2.5} />
        <ThemedText style={styles.message}>Confirming your payment...</ThemedText>
      </View>
    </ThemedView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#fff',
    justifyContent: 'center',
    alignItems: 'center',
  },
  content: {
    alignItems: 'center',
    paddingHorizontal: 32,
  },
  message: {
    marginTop: 20,
    fontSize: 15,
    color: '#444',
    textAlign: 'center',
  },
});
