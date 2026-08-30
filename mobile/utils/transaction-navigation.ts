import type { Href } from 'expo-router';
import type { MobileTransaction } from '@/contexts/transactions-context';
import { buildRouteHref } from '@/utils/router-href';

export function buildTransactionDetailsHref(transaction: MobileTransaction): Href {
  return buildRouteHref('/transaction-details', {
    id: transaction.id,
    category: transaction.category,
    type: transaction.type,
    amount: transaction.amount.toString(),
    status: transaction.status || '',
    reference: transaction.reference || '',
    description: transaction.description || '',
    serviceType: transaction.serviceType || '',
    network: transaction.provider || '',
    date: transaction.createdAt,
    time: '',
    meterType: transaction.extra?.meterType || '',
    token: transaction.extra?.token || '',
    meterNumber: transaction.extra?.meter_number || '',
    customerName: transaction.extra?.customerName || '',
    customerAddress: transaction.extra?.customerAddress || '',
    phoneNumber: transaction.extra?.phone_number || transaction.extra?.phoneNumber || '',
    educationPin: transaction.extra?.educationPin || '',
    educationSerial: transaction.extra?.educationSerial || '',
    educationInstructions: transaction.extra?.educationInstructions || '',
    examType: transaction.extra?.examType || '',
    accountNumber: transaction.extra?.account_number || '',
    vendingProvider: transaction.extra?.vending_provider || '',
    sourceTable: transaction.extra?.sourceTable || '',
    transferFee: transaction.extra?.transferFee?.toString() || '',
    totalDebited: transaction.extra?.totalDebited?.toString() || '',
    grossAmount: transaction.extra?.grossAmount?.toString() || '',
    fundingFee: transaction.extra?.fundingFee?.toString() || '',
    netAmount: transaction.extra?.netAmount?.toString() || '',
    bankName: transaction.extra?.bankName || transaction.provider || '',
  });
}
