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
    lower.includes('decoder') ||
    lower.includes('customer not found') ||
    lower.includes('not found') ||
    lower.includes('wrong') ||
    lower.includes('incorrect') ||
    lower.includes('does not exist') ||
    lower.includes('unable to verify') ||
    lower.includes('verification failed')
  );
}

/**
 * Strip vendor wrappers / JSON dumps so the UI shows a short human message.
 */
export function sanitizeSmartCardErrorMessage(raw?: string | null): string {
  if (!raw?.trim()) return WRONG_SMART_CARD_DEFAULT_MESSAGE;

  let text = raw.trim();

  const jsonMatch = text.match(/\{[\s\S]*\}/);
  if (jsonMatch) {
    try {
      const parsed = JSON.parse(jsonMatch[0]) as {
        message?: unknown;
        error?: unknown;
        data?: { message?: unknown };
      };
      const nested =
        (typeof parsed.message === 'string' && parsed.message) ||
        (typeof parsed.error === 'string' && parsed.error) ||
        (typeof parsed.data?.message === 'string' && parsed.data.message) ||
        '';
      if (nested.trim()) {
        text = nested;
      }
    } catch {
      // keep original text
    }
  }

  text = text
    .replace(/^eBills API error\s*\([^)]*\):\s*/i, '')
    .replace(/^failed to verify cable customer:\s*/i, '')
    .replace(/\\+/g, '')
    .replace(/\s+/g, ' ')
    .trim();

  if (!text || text.startsWith('{') || text.toLowerCase().includes('status:')) {
    return WRONG_SMART_CARD_DEFAULT_MESSAGE;
  }

  return text;
}
