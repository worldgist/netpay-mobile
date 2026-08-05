export const WRONG_SMART_CARD_DEFAULT_MESSAGE =
  'The smart card number you entered is incorrect or invalid. Please check the number on your decoder and try again.';

export function isInvalidSmartCardError(
  errorMessage?: string | null,
  errorType?: string | null,
): boolean {
  const type = (errorType || '').toLowerCase();
  if (type === 'invalid_card') return true;

  if (!errorMessage) return false;
  const lower = errorMessage.toLowerCase();
  return (
    lower.includes('invalid') ||
    lower.includes('card number') ||
    lower.includes('smartcard') ||
    lower.includes('smart card') ||
    lower.includes('customer not found') ||
    lower.includes('not found') ||
    lower.includes('wrong') ||
    lower.includes('incorrect') ||
    lower.includes('does not exist') ||
    lower.includes('unable to verify') ||
    lower.includes('verification failed')
  );
}
