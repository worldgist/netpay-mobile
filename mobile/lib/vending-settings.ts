export const VENDING_SETTING_KEYS = [
  'airtime_provider',
  'data_provider',
  'cable_provider',
  'electricity_provider',
  'betting_provider',
] as const;

export type VendingProviders = {
  airtime: string;
  data: string;
  cable: string;
  electricity: string;
  betting: string;
};

export const DEFAULT_VENDING_PROVIDERS: VendingProviders = {
  airtime: 'smeplug',
  data: 'smeplug',
  cable: 'mobilenig',
  electricity: 'vtpass',
  betting: 'ebills',
};

export function normalizeVendingProvider(raw: unknown): string {
  if (typeof raw !== 'string' || !raw.trim()) {
    return '';
  }

  let normalized = raw.toLowerCase().trim();
  if (normalized === 'ebill' || normalized === 'ebills.africa') {
    normalized = 'ebills';
  }
  if (normalized === 'mobile-nig' || normalized === 'mobile_nig') {
    normalized = 'mobilenig';
  }
  if (normalized === 'vt-pass' || normalized === 'vt_pass') {
    normalized = 'vtpass';
  }
  if (normalized === 'sme-plug' || normalized === 'sme_plug') {
    normalized = 'smeplug';
  }
  if (normalized === 'flutter-wave' || normalized === 'flutter_wave' || normalized === 'flw') {
    normalized = 'flutterwave';
  }

  return normalized;
}

export function parseVendingProviders(input: Partial<VendingProviders> | null | undefined): VendingProviders {
  return {
    airtime: normalizeVendingProvider(input?.airtime) || DEFAULT_VENDING_PROVIDERS.airtime,
    data: normalizeVendingProvider(input?.data) || DEFAULT_VENDING_PROVIDERS.data,
    cable: normalizeVendingProvider(input?.cable) || DEFAULT_VENDING_PROVIDERS.cable,
    electricity: normalizeVendingProvider(input?.electricity) || DEFAULT_VENDING_PROVIDERS.electricity,
    betting: normalizeVendingProvider(input?.betting) || DEFAULT_VENDING_PROVIDERS.betting,
  };
}

export function isVendingSettingKey(key: string): boolean {
  return (VENDING_SETTING_KEYS as readonly string[]).includes(key);
}

export function patchVendingProviderFromSettingKey(
  providers: VendingProviders,
  settingKey: string,
  settingValue: unknown,
): VendingProviders | null {
  if (!isVendingSettingKey(settingKey)) {
    return null;
  }

  let rawProvider: string | undefined;
  if (typeof settingValue === 'string') {
    rawProvider = settingValue;
  } else if (settingValue && typeof settingValue === 'object') {
    const obj = settingValue as Record<string, unknown>;
    if (typeof obj.provider === 'string') {
      rawProvider = obj.provider;
    }
  }

  const normalized = normalizeVendingProvider(rawProvider);
  if (!normalized) {
    return null;
  }

  switch (settingKey) {
    case 'airtime_provider':
      return { ...providers, airtime: normalized };
    case 'data_provider':
      return { ...providers, data: normalized };
    case 'cable_provider':
      return { ...providers, cable: normalized };
    case 'electricity_provider':
      return { ...providers, electricity: normalized };
    case 'betting_provider':
      return { ...providers, betting: normalized };
    default:
      return null;
  }
}
