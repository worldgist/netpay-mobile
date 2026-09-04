export type ServiceLogoCategory =
  | 'airtime'
  | 'data'
  | 'electricity'
  | 'cable'
  | 'education'
  | 'betting';

export type ServiceLogo = {
  category: ServiceLogoCategory;
  code: string;
  name: string;
  logoUrl: string;
  sortOrder: number;
};

export function normalizeLogoCode(raw?: string | null): string {
  if (!raw) return '';
  return raw.toUpperCase().trim().replace(/\s+/g, '');
}

/** Map common aliases to the canonical service_logos.code */
export function canonicalLogoCode(category: ServiceLogoCategory, raw?: string | null): string {
  const code = normalizeLogoCode(raw);
  if (!code) return '';

  if (category === 'airtime' || category === 'data') {
    if (code.includes('MTN')) return 'MTN';
    if (code.includes('AIRTEL')) return 'AIRTEL';
    if (code.includes('GLO') || code.includes('GLOBACOM')) return 'GLO';
    if (code.includes('T2') || code.includes('9MOBILE') || code.includes('ETISALAT')) {
      return code.includes('9MOBILE') ? '9MOBILE' : 'T2';
    }
  }

  if (category === 'electricity') {
    if (code.includes('IKEJA') || code === 'IKEDC') return 'IKEJA';
    if (code.includes('EKO') || code === 'EKEDC') return 'EKO';
    if (code.includes('ABUJA') || code === 'AEDC') return 'ABUJA';
    if (code.includes('KADUNA') || code === 'KAEDCO') return 'KADUNA';
    if (code.includes('IBADAN') || code === 'IBEDC') return 'IBADAN';
    if (code.includes('KANO') || code === 'KEDCO') return 'KANO';
    if (code.includes('PORT') || code === 'PHEDC' || code === 'PORTHARCOURT') return 'PORTHARCOURT';
    if (code.includes('JOS') || code === 'JED') return 'JOS';
    if (code.includes('BENIN') || code === 'BEDC') return 'BENIN';
    if (code.includes('YOLA') || code === 'YEDC') return 'YOLA';
    if (code.includes('ENUGU') || code === 'EEDC') return 'ENUGU';
  }

  if (category === 'cable') {
    if (code.includes('DSTV')) return 'DSTV';
    if (code.includes('GOTV')) return 'GOTV';
    if (code.includes('STARTIMES') || code.includes('STARTIME')) return 'STARTIMES';
  }

  if (category === 'education') {
    if (code.includes('WAEC')) return 'WAEC';
    if (code.includes('NECO')) return 'NECO';
    if (code.includes('JAMB')) return 'JAMB';
  }

  return code;
}

export function buildLogoLookup(
  rows: Array<{ category: string; code: string; name: string; logo_url: string; sort_order?: number }>,
): Record<ServiceLogoCategory, Record<string, ServiceLogo>> {
  const lookup = {
    airtime: {},
    data: {},
    electricity: {},
    cable: {},
    education: {},
    betting: {},
  } as Record<ServiceLogoCategory, Record<string, ServiceLogo>>;

  for (const row of rows) {
    const category = row.category as ServiceLogoCategory;
    if (!lookup[category]) continue;
    const code = normalizeLogoCode(row.code);
    if (!code || !row.logo_url) continue;
    lookup[category][code] = {
      category,
      code,
      name: row.name,
      logoUrl: row.logo_url,
      sortOrder: row.sort_order ?? 0,
    };
  }

  return lookup;
}
