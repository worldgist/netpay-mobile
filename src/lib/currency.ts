/**
 * Format a number as Nigerian Naira currency
 */
export const formatNaira = (amount: number): string => {
  return `₦${amount.toLocaleString('en-NG', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })}`;
};

/**
 * Parse Naira string to number
 */
export const parseNaira = (nairaString: string): number => {
  return parseFloat(nairaString.replace(/[₦,]/g, ''));
};
