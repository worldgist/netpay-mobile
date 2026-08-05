import { ImageSourcePropType } from 'react-native';

export const NGN_LOGO: ImageSourcePropType = require('@/assets/images/ngn.png');

export const FUND_WALLET_LABEL = 'Fund Wallet';

type TransactionLike = {
  category?: string | null;
  serviceType?: string | null;
  description?: string | null;
  provider?: string | null;
  type?: string | null;
};

function isFundWalletServiceType(serviceType: string) {
  return serviceType === 'fund wallet' || serviceType === 'add money';
}

export function isFundWalletTransaction(transaction: TransactionLike) {
  if ((transaction.category || '').toLowerCase() !== 'wallet') {
    return false;
  }

  const serviceType = (transaction.serviceType || '').toLowerCase();
  if (serviceType === 'refund') {
    return false;
  }

  if (isFundWalletServiceType(serviceType)) {
    return true;
  }

  const provider = (transaction.provider || '').toUpperCase();
  if (provider === 'NGN' || provider === 'FLUTTERWAVE') {
    return true;
  }

  const description = (transaction.description || '').toLowerCase();
  if (description.includes('funding fee')) {
    return false;
  }

  if (
    description.includes('wallet funding') ||
    description.includes('funding from') ||
    description.includes('funding via') ||
    description.includes('fund wallet') ||
    description.includes('added to your wallet')
  ) {
    return true;
  }

  return transaction.type === 'credit';
}

/** @deprecated Use isFundWalletTransaction */
export function isAddMoneyTransaction(transaction: TransactionLike) {
  return isFundWalletTransaction(transaction);
}

export function getWalletTransactionLabel(transaction: TransactionLike) {
  if (isFundWalletTransaction(transaction)) {
    return FUND_WALLET_LABEL;
  }

  if ((transaction.serviceType || '').toLowerCase() === 'refund') {
    return 'Refund';
  }

  return 'Wallet Transaction';
}
