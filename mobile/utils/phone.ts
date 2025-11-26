type ValidationResult = {
  normalized: string;
  isMatch: boolean;
  message?: string;
};

const NETWORK_PREFIXES: Record<string, string[]> = {
  MTN: ['0803', '0806', '0703', '0706', '0810', '0813', '0814', '0816', '0903', '0906', '0913', '0916', '0811'],
  AIRTEL: ['0802', '0808', '0708', '0701', '0812', '0902', '0901', '0907', '0912', '0801', '0804', '0904'],
  GLO: ['0805', '0807', '0811', '0815', '0905', '0915'],
  '9MOBILE': ['0809', '0817', '0818', '0909', '0908'],
};

const normalizeDigits = (input: string): string | null => {
  const digits = input.replace(/[^0-9]/g, '');

  if (digits.startsWith('234') && digits.length === 13) {
    return `0${digits.slice(3)}`;
  }

  if (digits.length === 11 && digits.startsWith('0')) {
    return digits;
  }

  if (digits.length === 10) {
    return `0${digits}`;
  }

  return null;
};

export const validateNigerianPhoneNumber = (phoneNumber: string, expectedNetwork?: string): ValidationResult => {
  const normalized = normalizeDigits(phoneNumber.trim());

  if (!normalized) {
    return {
      normalized: phoneNumber,
      isMatch: false,
      message: 'Phone number must contain 10 or 11 digits. You may prefix with +234 or 0.',
    };
  }

  if (!expectedNetwork) {
    return { normalized, isMatch: true };
  }

  const networkKey = expectedNetwork.toUpperCase();
  const prefixes = NETWORK_PREFIXES[networkKey];

  if (!prefixes || prefixes.length === 0) {
    return { normalized, isMatch: true };
  }

  const isMatch = prefixes.some((prefix) => normalized.startsWith(prefix));

  return {
    normalized,
    isMatch,
    message: isMatch
      ? undefined
      : `The phone number does not look like a ${expectedNetwork} line. Please double-check before proceeding.`,
  };
};
