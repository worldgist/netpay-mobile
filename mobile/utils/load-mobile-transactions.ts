import { supabase } from '@/lib/supabase';
import { readElectricityCustomerAddress } from '@/utils/electricity-customer';
import { parseEducationPurchaseMetadata } from '@/utils/education';
import { buildTransactionTimestampFields, formatBankDisplayName } from '@/utils/transaction-display';

export type MobileTransaction = {
  id: string;
  category: 'wallet' | 'airtime' | 'data' | 'electricity' | 'education' | 'betting' | 'transfer_sent' | 'transfer_received';
  type: 'credit' | 'debit';
  amount: number;
  status?: string | null;
  reference?: string | null;
  description?: string | null;
  serviceType?: string | null;
  provider?: string | null;
  createdAt: string;
  formattedDate: string;
  formattedTime: string;
  formattedDateTime: string;
  counterparty?: string | null;
  extra?: Record<string, any>;
};

const FUNDING_FEE_PERCENTAGE = 0.05;
const MIN_FUNDING_FEE = 10;
const TRANSFER_FEE_PERCENTAGE = 0.05;
const MIN_TRANSFER_FEE = 10;

const PURCHASE_LEDGER_TYPES = new Set([
  'airtime_purchase',
  'data_purchase',
  'electricity_purchase',
  'cable_purchase',
  'cable_tv',
  'education_purchase',
  'betting_purchase',
  'purchase',
]);

function calculateFundingFee(amount: number) {
  const percentageFee = amount * FUNDING_FEE_PERCENTAGE;
  return Math.max(MIN_FUNDING_FEE, Math.round(percentageFee * 100) / 100);
}

function calculateTransferFee(amount: number) {
  const percentageFee = amount * TRANSFER_FEE_PERCENTAGE;
  return Math.max(MIN_TRANSFER_FEE, Math.round(percentageFee * 100) / 100);
}

function buildFeeMaps(
  walletData: Array<{ transaction_type?: string | null; reference?: string | null; amount?: number | string }>,
) {
  const transferFees = new Map<string, number>();
  const fundingFees = new Map<string, number>();

  for (const txn of walletData) {
    const transactionType = (txn.transaction_type || '').toLowerCase();
    const reference = txn.reference || '';
    const amount = Number(txn.amount) || 0;

    if (!reference.endsWith('-FEE')) {
      continue;
    }

    const baseReference = reference.slice(0, -4);
    if (transactionType === 'transfer_fee') {
      transferFees.set(baseReference, amount);
    } else if (transactionType === 'funding_fee') {
      fundingFees.set(baseReference, amount);
    }
  }

  return { transferFees, fundingFees };
}

function collectPurchaseReferences(transactions: MobileTransaction[]) {
  const references = new Set<string>();
  for (const txn of transactions) {
    if (txn.reference) {
      references.add(txn.reference);
    }
  }
  return references;
}

function shouldHideWalletLedgerEntry(
  txn: { transaction_type?: string | null; reference?: string | null },
  purchaseReferences: Set<string>,
) {
  const transactionType = (txn.transaction_type || '').toLowerCase();
  if (transactionType === 'transfer_fee' || transactionType === 'funding_fee') {
    return true;
  }

  if (transactionType === 'credit' || transactionType === 'refund') {
    return false;
  }

  const reference = txn.reference || '';
  if (reference && purchaseReferences.has(reference)) {
    return true;
  }

  return PURCHASE_LEDGER_TYPES.has(transactionType);
}

export async function loadMobileTransactions(userId: string): Promise<MobileTransaction[]> {
  const [walletRes, fundingRes, airtimeRes, dataRes, electricityRes, educationRes, bettingRes, transfersSentRes, transfersReceivedRes] =
    await Promise.all([
      supabase
        .from('user_transactions')
        .select('id, amount, transaction_type, description, reference, created_at')
        .eq('user_id', userId)
        .order('created_at', { ascending: false })
        .limit(50),
      supabase
        .from('funding_transactions')
        .select('id, amount, status, reference, bank_name, account_name, account_number, created_at')
        .eq('user_id', userId)
        .eq('status', 'completed')
        .order('created_at', { ascending: false })
        .limit(50),
      supabase
        .from('airtime_transactions')
        .select('id, amount, network, status, reference, phone_number, created_at')
        .eq('user_id', userId)
        .order('created_at', { ascending: false })
        .limit(50),
      supabase
        .from('data_transactions')
        .select('id, amount, network, plan_name, plan_validity, status, reference, phone_number, created_at')
        .eq('user_id', userId)
        .order('created_at', { ascending: false })
        .limit(50),
      supabase
        .from('electricity_transactions')
        .select('id, amount, provider, status, reference, created_at, meter_number, meter_type, token, customer_name, customer_address, api_response, vending_provider')
        .eq('user_id', userId)
        .order('created_at', { ascending: false })
        .limit(50),
      supabase
        .from('education_transactions')
        .select('id, amount, exam_type, status, reference, created_at, phone_number, balance_before, balance_after, api_response, metadata, pin, serial_number, pins')
        .eq('user_id', userId)
        .order('created_at', { ascending: false })
        .limit(50),
      supabase
        .from('betting_transactions')
        .select('id, amount, betting_provider, status, reference, created_at, account_number, vending_provider')
        .eq('user_id', userId)
        .order('created_at', { ascending: false })
        .limit(50),
      supabase
        .from('transfer_transactions')
        .select('id, amount, status, reference, description, created_at, recipient_id')
        .eq('sender_id', userId)
        .order('created_at', { ascending: false })
        .limit(50),
      supabase
        .from('transfer_transactions')
        .select('id, amount, status, reference, description, created_at, sender_id')
        .eq('recipient_id', userId)
        .order('created_at', { ascending: false })
        .limit(50),
    ]);

  if (electricityRes.error) {
    console.error('Error fetching electricity transactions:', electricityRes.error);
  }

  const airtimeTransactions: MobileTransaction[] = (airtimeRes.data || []).map((txn) => {
    return {
      id: txn.id,
      category: 'airtime',
      type: 'debit',
      amount: Number(txn.amount) || 0,
      status: txn.status,
      reference: txn.reference,
      description: `Airtime purchase • ${txn.phone_number}`,
      serviceType: 'Airtime VTU',
      provider: txn.network,
      createdAt: txn.created_at,
      ...buildTransactionTimestampFields(txn.created_at),
      extra: { phone_number: txn.phone_number },
    };
  });

  const dataTransactions: MobileTransaction[] = (dataRes.data || []).map((txn) => {
    return {
      id: txn.id,
      category: 'data',
      type: 'debit',
      amount: Number(txn.amount) || 0,
      status: txn.status,
      reference: txn.reference,
      description: txn.plan_name,
      serviceType: 'Data Bundle',
      provider: txn.network,
      createdAt: txn.created_at,
      ...buildTransactionTimestampFields(txn.created_at),
      extra: { plan_validity: txn.plan_validity, phone_number: txn.phone_number },
    };
  });

  const electricityTransactions: MobileTransaction[] = (electricityRes.data || []).map((txn) => {
    let extractedToken = txn.token;
    const extractedAddress = readElectricityCustomerAddress(txn as any);

    if ((txn as any).api_response) {
      const apiResponse = (txn as any).api_response;

      if (!extractedToken) {
        extractedToken =
          apiResponse?.data?.token || apiResponse?.token || apiResponse?.details?.token || null;

        if (extractedToken) {
          extractedToken = String(extractedToken).trim();
          if (extractedToken === '' || extractedToken.toLowerCase() === 'null') {
            extractedToken = null;
          }
        }
      }
    }

    return {
      id: txn.id,
      category: 'electricity',
      type: 'debit',
      amount: Number(txn.amount) || 0,
      status: txn.status,
      reference: txn.reference,
      description: txn.meter_number,
      serviceType: txn.provider || 'Electricity',
      provider: txn.provider,
      createdAt: txn.created_at,
      ...buildTransactionTimestampFields(txn.created_at),
      extra: {
        meterType: txn.meter_type,
        token: extractedToken,
        meter_number: txn.meter_number,
        customerName: txn.customer_name,
        customerAddress: extractedAddress,
        vendingProvider: (txn as any).vending_provider,
      },
    };
  });

  const educationTransactions: MobileTransaction[] = (educationRes.data || []).map((txn) => {
    let finalPins: { Pin: string; Serial?: string }[] = [];
    let finalPin: string | undefined;
    let finalSerial: string | undefined;

    if ((txn as any).pins && Array.isArray((txn as any).pins)) {
      finalPins = (txn as any).pins;
      if (finalPins.length > 0) {
        finalPin = finalPins[0].Pin;
        finalSerial = finalPins[0].Serial;
      }
    } else if ((txn as any).pin) {
      finalPin = (txn as any).pin;
      finalSerial = (txn as any).serial_number;
      finalPins = [{ Pin: finalPin || '', Serial: finalSerial || '' }];
    }

    if (finalPins.length === 0) {
      const metadataObj = (txn as any)?.metadata || {};
      const pinsFromMetadata = metadataObj.pins || [];

      if (pinsFromMetadata.length > 0) {
        finalPins = pinsFromMetadata;
        if (finalPins.length > 0) {
          finalPin = finalPins[0].Pin;
          finalSerial = finalPins[0].Serial;
        }
      } else if (metadataObj.educationPin) {
        finalPin = metadataObj.educationPin;
        finalSerial = metadataObj.educationSerial;
        finalPins = [{ Pin: finalPin || '', Serial: finalSerial || '' }];
      }
    }

    if (finalPins.length === 0) {
      const parsedMetadata = parseEducationPurchaseMetadata((txn as any)?.api_response);
      if (parsedMetadata.pin) {
        finalPin = parsedMetadata.pin;
        finalSerial = parsedMetadata.serial;
        finalPins = [{ Pin: finalPin, Serial: finalSerial || '' }];
      }
    }

    const description = txn.phone_number
      ? `${txn.exam_type || 'Education'} purchase • ${txn.phone_number}`
      : `${txn.exam_type || 'Education'} purchase`;

    return {
      id: txn.id,
      category: 'education',
      type: 'debit',
      amount: Number(txn.amount) || 0,
      status: txn.status,
      reference: txn.reference,
      description,
      serviceType: txn.exam_type ? `Education • ${txn.exam_type}` : 'Education',
      provider: txn.exam_type,
      createdAt: txn.created_at,
      ...buildTransactionTimestampFields(txn.created_at),
      extra: {
        phone_number: txn.phone_number,
        examType: txn.exam_type,
        pins: finalPins,
        educationPin: finalPin,
        educationSerial: finalSerial,
        educationInstructions: parseEducationPurchaseMetadata((txn as any)?.api_response).instructions,
        balanceBefore: txn.balance_before,
        balanceAfter: txn.balance_after,
      },
    };
  });

  const { transferFees, fundingFees } = buildFeeMaps(walletRes.data || []);

  const transferSent: MobileTransaction[] = (transfersSentRes.data || []).map((txn) => {
    const amount = Number(txn.amount) || 0;
    const transferFee = transferFees.get(txn.reference || '') ?? calculateTransferFee(amount);
    return {
      id: txn.id,
      category: 'transfer_sent',
      type: 'debit',
      amount,
      status: txn.status,
      reference: txn.reference,
      description: txn.description || 'Transfer sent',
      serviceType: 'Transfer',
      provider: null,
      createdAt: txn.created_at,
      ...buildTransactionTimestampFields(txn.created_at),
      counterparty: 'Recipient',
      extra: {
        transferFee,
        totalDebited: amount + transferFee,
      },
    };
  });

  const transferReceived: MobileTransaction[] = (transfersReceivedRes.data || []).map((txn) => {
    return {
      id: txn.id,
      category: 'transfer_received',
      type: 'credit',
      amount: Number(txn.amount) || 0,
      status: txn.status,
      reference: txn.reference,
      description: txn.description || 'Transfer received',
      serviceType: 'Transfer',
      provider: null,
      createdAt: txn.created_at,
      ...buildTransactionTimestampFields(txn.created_at),
      counterparty: 'Sender',
    };
  });

  const bettingTransactions: MobileTransaction[] = (bettingRes.data || []).map((txn) => {
    return {
      id: txn.id,
      category: 'betting',
      type: 'debit',
      amount: Number(txn.amount) || 0,
      status: txn.status,
      reference: txn.reference,
      description: txn.account_number ? `Betting purchase • ${txn.account_number}` : 'Betting purchase',
      serviceType: 'Betting',
      provider: txn.betting_provider,
      createdAt: txn.created_at,
      ...buildTransactionTimestampFields(txn.created_at),
      extra: { account_number: txn.account_number, vending_provider: txn.vending_provider },
    };
  });

  const purchaseReferences = collectPurchaseReferences([
    ...airtimeTransactions,
    ...dataTransactions,
    ...electricityTransactions,
    ...educationTransactions,
    ...bettingTransactions,
    ...transferSent,
    ...transferReceived,
  ]);

  const fundingBankByReference = new Map<string, string>();
  for (const txn of fundingRes.data || []) {
    if (txn.reference && txn.bank_name) {
      fundingBankByReference.set(txn.reference, txn.bank_name);
    }
  }

  const walletTransactions: MobileTransaction[] = (walletRes.data || [])
    .filter((txn) => !shouldHideWalletLedgerEntry(txn, purchaseReferences))
    .map((txn) => {
      const tt = (txn.transaction_type || '').toLowerCase();
      const isRefund = tt === 'refund';
      const description = txn.description || '';
      const isFlutterwaveFunding = description.toLowerCase().includes('flutterwave');
      const reference = txn.reference || '';
      const ledgerAmount = Number(txn.amount) || 0;
      const isCredit = tt === 'credit' || isRefund;
      const fundingFee = isCredit && reference ? fundingFees.get(reference) : undefined;
      const bankName = reference ? fundingBankByReference.get(reference) : undefined;
      const formattedBankName = bankName ? formatBankDisplayName(bankName) : null;
      const extra =
        fundingFee != null || formattedBankName
          ? {
              ...(fundingFee != null
                ? {
                    grossAmount: ledgerAmount + fundingFee,
                    fundingFee,
                    netAmount: ledgerAmount,
                  }
                : {}),
              ...(formattedBankName ? { bankName: formattedBankName } : {}),
            }
          : undefined;

      return {
        id: txn.id,
        category: 'wallet' as const,
        type: isCredit ? ('credit' as const) : ('debit' as const),
        amount: ledgerAmount,
        status: 'Completed',
        reference: txn.reference,
        description,
        serviceType: isRefund
          ? 'Refund'
          : tt === 'credit'
            ? 'Fund Wallet'
            : 'Wallet Transaction',
        provider: isRefund
          ? null
          : tt === 'credit'
            ? formattedBankName || (isFlutterwaveFunding ? 'Flutterwave' : null)
            : null,
        createdAt: txn.created_at,
        ...buildTransactionTimestampFields(txn.created_at),
        extra,
      };
    });

  const walletReferences = new Set(
    walletTransactions.map((txn) => txn.reference).filter((reference): reference is string => Boolean(reference)),
  );

  const fundingTransactions: MobileTransaction[] = (fundingRes.data || [])
    .filter((txn) => txn.reference && !walletReferences.has(txn.reference))
    .map((txn) => {
      const grossAmount = Number(txn.amount) || 0;
      const fundingFee = (txn.reference && fundingFees.get(txn.reference)) ?? calculateFundingFee(grossAmount);
      const netAmount = grossAmount - fundingFee;
      const bankName = txn.bank_name || 'Flutterwave';
      const formattedBankName = formatBankDisplayName(bankName);

      return {
        id: txn.id,
        category: 'wallet' as const,
        type: 'credit' as const,
        amount: netAmount,
        status: 'Completed',
        reference: txn.reference,
        description: `Wallet funding via ${formattedBankName} (₦${grossAmount.toLocaleString('en-NG')} received, ₦${fundingFee.toLocaleString('en-NG')} fee)`,
        serviceType: 'Fund Wallet',
        provider: formattedBankName,
        createdAt: txn.created_at,
        ...buildTransactionTimestampFields(txn.created_at),
        extra: {
          sourceTable: 'funding_transactions',
          grossAmount,
          fundingFee,
          accountName: txn.account_name,
          accountNumber: txn.account_number,
          bankName: formattedBankName,
        },
      };
    });

  return [
    ...walletTransactions,
    ...fundingTransactions,
    ...airtimeTransactions,
    ...dataTransactions,
    ...electricityTransactions,
    ...educationTransactions,
    ...bettingTransactions,
    ...transferSent,
    ...transferReceived,
  ].sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
}
