import { useLayoutEffect, useRef } from 'react';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { shouldHandleFundingCallback } from '@/utils/funding-callback-guard';
import {
  isSuccessfulFundingStatus,
  returnToAppAfterFunding,
} from '@/utils/verify-flutterwave-funding';

export default function AddMoneyCallbackScreen() {
  const router = useRouter();
  const params = useLocalSearchParams<{ tx_ref?: string; status?: string }>();
  const hasHandled = useRef(false);

  useLayoutEffect(() => {
    if (hasHandled.current) return;
    hasHandled.current = true;

    const txRef = typeof params.tx_ref === 'string' ? params.tx_ref : '';
    const status = typeof params.status === 'string' ? params.status : 'successful';

    if (!txRef || !isSuccessfulFundingStatus(status)) {
      router.replace('/add-money');
      return;
    }

    void (async () => {
      if (!(await shouldHandleFundingCallback(txRef))) {
        router.replace('/(tabs)');
        return;
      }
      returnToAppAfterFunding(txRef, status);
    })();
  }, [params.status, params.tx_ref, router]);

  return null;
}
