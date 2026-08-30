import { ImageSourcePropType } from 'react-native';

export const NGN_LOGO: ImageSourcePropType = require('@/assets/images/ngn.png');

export const FUND_WALLET_LABEL = 'Fund Wallet';

type TransactionLike = {
  category?: string | null;
  serviceType?: string | null;
  description?: string | null;
  provider?: string | null;
  type?: string | null;
  metadata?: { bankName?: string | null } | null;
  extra?: { bankName?: string | null } | null;
};

function isFundWalletServiceType(serviceType: string) {
  return serviceType === 'fund wallet' || serviceType === 'add money';
}

const GENERIC_FUNDING_PROVIDERS = new Set(['NGN', 'FLUTTERWAVE']);

export function formatBankDisplayName(name: string) {
  const trimmed = name.trim();
  if (!trimmed) return 'Bank Transfer';
  return trimmed.replace(/_/g, ' ').replace(/\b\w/g, (char) => char.toUpperCase());
}

export function extractFundWalletBankName(transaction: TransactionLike) {
  const fromMeta = transaction.metadata?.bankName || transaction.extra?.bankName;
  if (fromMeta) {
    return formatBankDisplayName(fromMeta);
  }

  const provider = (transaction.provider || '').trim();
  if (provider && !GENERIC_FUNDING_PROVIDERS.has(provider.toUpperCase())) {
    return formatBankDisplayName(provider);
  }

  const description = transaction.description || '';
  const viaMatch = description.match(/wallet funding via\s+([^(,]+)/i);
  if (viaMatch?.[1]) {
    return formatBankDisplayName(viaMatch[1]);
  }

  const accountFundingMatch = description.match(/account funding\s*-\s*([^(\n]+)/i);
  if (accountFundingMatch?.[1]) {
    return formatBankDisplayName(accountFundingMatch[1]);
  }

  if (description.toLowerCase().includes('flutterwave') || provider.toUpperCase() === 'FLUTTERWAVE') {
    return 'Flutterwave';
  }

  if (/card|debit|credit card/i.test(description)) {
    return 'Card';
  }

  return 'Bank Transfer';
}

export function getFundWalletDepositLabel(transaction: TransactionLike) {
  return `${extractFundWalletBankName(transaction)} Deposit`;
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
    return getFundWalletDepositLabel(transaction);
  }

  if ((transaction.serviceType || '').toLowerCase() === 'refund') {
    return 'Refund';
  }

  return 'Wallet Transaction';
}

function parseTransactionDate(value: string | Date): Date | null {
  const date = value instanceof Date ? value : new Date(value);
  return Number.isNaN(date.getTime()) ? null : date;
}

export function formatTransactionDate(value: string | Date): string {
  const date = parseTransactionDate(value);
  if (!date) return '—';

  return date.toLocaleDateString('en-NG', {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
  });
}

export function formatTransactionTime(value: string | Date): string {
  const date = parseTransactionDate(value);
  if (!date) return '—';

  return date.toLocaleTimeString('en-NG', {
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hour12: true,
  });
}

export function formatTransactionDateTime(value: string | Date): string {
  const date = parseTransactionDate(value);
  if (!date) return '—';

  return date.toLocaleString('en-NG', {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hour12: true,
  });
}

export function buildTransactionTimestampFields(value: string | Date) {
  return {
    formattedDate: formatTransactionDate(value),
    formattedTime: formatTransactionTime(value),
    formattedDateTime: formatTransactionDateTime(value),
  };
}

export function getTransactionDisplayDateTime(transaction: {
  formattedDateTime?: string;
  formattedDate: string;
  formattedTime: string;
}) {
  return transaction.formattedDateTime || `${transaction.formattedDate}, ${transaction.formattedTime}`;
}
