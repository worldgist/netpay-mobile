import AsyncStorage from '@react-native-async-storage/async-storage';

import { router } from 'expo-router';

import * as WebBrowser from 'expo-web-browser';

import { supabase } from '@/lib/supabase';

import { clearCachedWalletBalance, writeCachedWalletBalance } from '@/utils/wallet-balance-cache';



const VERIFY_DONE_PREFIX = '@netpay_verify_done:';

const FUNDING_NOTICE_SHOWN_PREFIX = '@netpay_funding_notice_shown:';



export type VerifyFundingResult = {

  credited: number;

  balanceAfter: number;

  alreadyProcessed: boolean;

};



type FundingFinalizeHandlers = {

  refreshDashboard?: () => Promise<void>;

  refreshTransactions?: () => Promise<void>;

};



export type PendingFundingNotice = {

  userId: string;

  txRef: string;

  credited: number;

  balanceAfter: number;

  alreadyProcessed: boolean;

};



const inFlightVerifications = new Map<string, Promise<VerifyFundingResult>>();

let handlers: FundingFinalizeHandlers = {};

let pendingNotice: PendingFundingNotice | null = null;

let onFundingComplete: ((notice: PendingFundingNotice) => void) | null = null;



function fundingNoticeShownKey(userId: string, txRef: string): string {

  return `${FUNDING_NOTICE_SHOWN_PREFIX}${userId}:${txRef.trim()}`;

}



function shouldShowFundingNotice(result: VerifyFundingResult): boolean {
  return !result.alreadyProcessed && Number.isFinite(result.credited) && result.credited > 0;
}



async function hasFundingNoticeBeenShown(userId: string, txRef: string): Promise<boolean> {

  const key = fundingNoticeShownKey(userId, txRef);

  return (await AsyncStorage.getItem(key)) === '1';

}



async function markFundingNoticeShown(userId: string, txRef: string): Promise<void> {

  await AsyncStorage.setItem(fundingNoticeShownKey(userId, txRef), '1');

}



export async function presentFundingNoticeIfNeeded(

  notice: PendingFundingNotice,

  present: (notice: PendingFundingNotice) => void,

): Promise<boolean> {

  if (notice.alreadyProcessed || !Number.isFinite(notice.credited) || notice.credited <= 0) {
    pendingNotice = null;

    return false;

  }



  if (await hasFundingNoticeBeenShown(notice.userId, notice.txRef)) {

    pendingNotice = null;

    return false;

  }



  await markFundingNoticeShown(notice.userId, notice.txRef);

  pendingNotice = null;

  present(notice);

  return true;

}



export function clearPendingFundingNotice(): void {

  pendingNotice = null;

}



export function registerFundingFinalizeHandlers(next: FundingFinalizeHandlers): void {

  handlers = next;

}



export function setFundingCompleteHandler(

  handler: ((notice: PendingFundingNotice) => void) | null,

): void {

  onFundingComplete = handler;

}



export async function consumePendingFundingNotice(

  userId: string | undefined,

  present: (notice: PendingFundingNotice) => void,

): Promise<void> {

  const notice = pendingNotice;

  if (!notice) {

    return;

  }



  if (userId && notice.userId !== userId) {

    pendingNotice = null;

    return;

  }



  await presentFundingNoticeIfNeeded(notice, present);

}



export function isSuccessfulFundingStatus(status: string): boolean {

  const normalized = status.trim().toLowerCase();

  return !normalized || normalized === 'successful' || normalized === 'completed';

}



/** Return to the app immediately; verify payment in the background. */

export function returnToAppAfterFunding(txRef: string, status = 'successful'): void {

  const normalizedRef = txRef.trim();

  if (!normalizedRef || !isSuccessfulFundingStatus(status)) {

    router.replace('/add-money');

    return;

  }



  void WebBrowser.dismissBrowser();

  router.replace('/(tabs)');

  void finalizeFundingPayment(normalizedRef);

}



export async function finalizeFundingPayment(txRef: string): Promise<VerifyFundingResult> {

  const normalizedRef = txRef.trim();

  const result = await verifyFlutterwaveFundingOnce(normalizedRef);



  await clearCachedWalletBalance();

  const { data: sessionData } = await supabase.auth.getSession();

  const userId = sessionData.session?.user.id;



  if (userId && Number.isFinite(result.balanceAfter) && result.balanceAfter > 0) {

    await writeCachedWalletBalance(userId, result.balanceAfter);

  }



  await Promise.all([

    handlers.refreshDashboard?.(),

    handlers.refreshTransactions?.(),

  ]);



  if (shouldShowFundingNotice(result) && userId) {
    const notice: PendingFundingNotice = {
      userId,
      txRef: normalizedRef,
      credited: Number(result.credited) || 0,
      balanceAfter: Number(result.balanceAfter) || 0,
      alreadyProcessed: result.alreadyProcessed,
    };

    pendingNotice = notice;



    if (onFundingComplete) {

      void presentFundingNoticeIfNeeded(notice, onFundingComplete);

    }

  } else {

    pendingNotice = null;

  }



  return result;

}



export async function verifyFlutterwaveFundingOnce(txRef: string): Promise<VerifyFundingResult> {

  const normalizedRef = txRef.trim();

  if (!normalizedRef) {

    throw new Error('Transaction reference is required');

  }



  const doneKey = `${VERIFY_DONE_PREFIX}${normalizedRef}`;

  const alreadyDone = await AsyncStorage.getItem(doneKey);

  if (alreadyDone === '1') {

    return {

      credited: 0,

      balanceAfter: 0,

      alreadyProcessed: true,

    };

  }



  const existing = inFlightVerifications.get(normalizedRef);

  if (existing) {

    return existing;

  }



  const run = (async () => {

    const { data, error } = await supabase.functions.invoke('verify-flutterwave-payment', {

      body: { txRef: normalizedRef },

    });



    if (error) throw error;

    if (!data?.success) {

      throw new Error(data?.error || 'Payment verification failed');

    }



    const credited = Number(data.data?.netCreditAmount || 0);

    const balanceAfter = Number(data.data?.balanceAfter || 0);

    const alreadyProcessed = Boolean(data.data?.alreadyProcessed);



    await AsyncStorage.setItem(doneKey, '1');



    return { credited, balanceAfter, alreadyProcessed };

  })();



  inFlightVerifications.set(normalizedRef, run);



  try {

    return await run;

  } finally {

    inFlightVerifications.delete(normalizedRef);

  }

}

