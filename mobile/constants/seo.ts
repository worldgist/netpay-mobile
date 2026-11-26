import { NETPAY_SITE_URL, siteUrl } from '@/constants/site';

export const SEO_SITE_NAME = 'NetPay';
export const SEO_DEFAULT_TITLE =
  'NetPay — Buy Airtime, Data, Electricity & Pay Bills in Nigeria';
export const SEO_DEFAULT_DESCRIPTION =
  'Pay everyday bills from one secure NetPay wallet. Buy MTN, Airtel, Glo and 9mobile airtime or data, electricity tokens, DStv, GOtv, StarTimes, WAEC, NECO and JAMB PINs — fast, clear and built for Nigeria.';
export const SEO_DEFAULT_KEYWORDS = [
  'NetPay',
  'Netpay Nigeria',
  'bill payment Nigeria',
  'buy airtime Nigeria',
  'buy data Nigeria',
  'electricity token Nigeria',
  'AEDC IKEDC EKEDC token',
  'pay DStv online',
  'GOtv subscription',
  'StarTimes payment',
  'WAEC PIN',
  'NECO PIN',
  'JAMB PIN',
  'fund wallet Nigeria',
  'virtual account Nigeria',
  'betting wallet funding',
  'fintech Nigeria',
  'secure digital wallet',
].join(', ');

export const SEO_OG_IMAGE = siteUrl('/og-image.png');
export const SEO_OG_IMAGE_ALT =
  'NetPay — Nigeria bill payments for airtime, data, electricity, cable TV and education';
export const SEO_TWITTER_HANDLE = '@netpay';

/** Google Search Console HTML-tag verification token (optional). */
export const GOOGLE_SITE_VERIFICATION = (
  process.env.EXPO_PUBLIC_GOOGLE_SITE_VERIFICATION || ''
).trim();

export type SeoPageKey =
  | 'home'
  | 'features'
  | 'services'
  | 'about'
  | 'contact'
  | 'faq'
  | 'privacy'
  | 'terms'
  | 'support'
  | 'login'
  | 'signup';

export type SeoDefinition = {
  title: string;
  description: string;
  path: string;
  keywords?: string;
  noIndex?: boolean;
};

export const SEO_PAGES: Record<SeoPageKey, SeoDefinition> = {
  home: {
    title: SEO_DEFAULT_TITLE,
    description: SEO_DEFAULT_DESCRIPTION,
    path: '/landing',
    keywords: SEO_DEFAULT_KEYWORDS,
  },
  features: {
    title: 'NetPay Features — Instant Payments, Secure Wallet & PIN Login',
    description:
      'Explore NetPay features: instant bill payments, bank-level security, one wallet for every bill, clear receipts, PIN and biometric unlock, transaction history and statements.',
    path: '/features',
    keywords:
      'NetPay features, instant payments Nigeria, secure wallet, PIN login, biometric login, bill payment receipts, transaction history, NetPay statements',
  },
  services: {
    title: 'NetPay Services — Airtime, Data, Electricity, Cable TV & More',
    description:
      'Pay airtime, data, electricity tokens, DStv, GOtv, StarTimes, WAEC, NECO, JAMB, betting wallets, fund your wallet and send transfers — all from one NetPay account.',
    path: '/services',
    keywords:
      'NetPay services, buy airtime, buy data, electricity token, cable TV payment, education PIN, betting funding, fund wallet, NetPay transfer',
  },
  about: {
    title: 'About NetPay — Nigerian Bill Payments Platform',
    description:
      'NetPay is a CAC-registered Nigerian bill payments company (RN7062973) built for speed, trust and everyday convenience — airtime, utilities, cable, education and more.',
    path: '/about-us',
    keywords:
      'about NetPay, NetPay Nigeria, Netpay Global Holdings, CAC RN7062973, bill payments company Nigeria',
  },
  contact: {
    title: 'Contact NetPay Support — Email, Phone & WhatsApp',
    description:
      'Reach NetPay customer support by email, phone or WhatsApp for wallet, payment and account help. Business hours and contact details inside.',
    path: '/contact-us',
    keywords: 'NetPay support, contact NetPay, NetPay WhatsApp, customer care Nigeria',
  },
  faq: {
    title: 'NetPay FAQ — Wallet, Bills, Transfers & Security',
    description:
      'Answers to common questions about NetPay wallet funding, airtime and bill payments, transfers, PIN security and account setup.',
    path: '/faq',
    keywords: 'NetPay FAQ, NetPay help, bill payment questions Nigeria, wallet funding help',
  },
  privacy: {
    title: 'Privacy Policy | NetPay',
    description:
      'How NetPay protects your personal data for wallet funding, airtime, data, electricity, cable TV, education, betting and transfers under Nigerian data protection standards.',
    path: '/privacy-policy',
    keywords: 'NetPay privacy policy, data protection Nigeria, NDPR, NetPay personal data',
  },
  terms: {
    title: 'Terms & Conditions | NetPay',
    description:
      'Terms for using NetPay wallet services including airtime, data, electricity, cable TV, education PINs, betting funding, transfers and referrals.',
    path: '/terms-and-conditions',
    keywords: 'NetPay terms and conditions, NetPay terms of service, bill payment terms',
  },
  support: {
    title: 'NetPay Support — Help Centre & Customer Care',
    description:
      'Find NetPay customer support resources, contact options and help for payments, wallet funding and account issues.',
    path: '/support',
    keywords: 'NetPay support, NetPay help centre, customer service Nigeria',
  },
  login: {
    title: 'Login to NetPay — Secure Wallet & Bill Payments',
    description:
      'Sign in to your NetPay account to pay bills, fund your wallet, buy airtime and data, and manage transactions securely.',
    path: '/auth/login',
    keywords: 'NetPay login, NetPay sign in, NetPay account',
  },
  signup: {
    title: 'Create a Free NetPay Account — Start Paying Bills',
    description:
      'Create a free NetPay account and start paying airtime, data, electricity, cable TV and education PINs from one secure wallet.',
    path: '/auth/signup',
    keywords: 'NetPay signup, create NetPay account, register NetPay',
  },
};

export function resolveSeo(
  key: SeoPageKey,
  overrides?: Partial<Pick<SeoDefinition, 'title' | 'description' | 'keywords' | 'path'>>,
): SeoDefinition & { canonical: string; url: string } {
  const page = SEO_PAGES[key];
  const path = overrides?.path || page.path;
  return {
    ...page,
    title: overrides?.title || page.title,
    description: overrides?.description || page.description,
    keywords: overrides?.keywords || page.keywords || SEO_DEFAULT_KEYWORDS,
    path,
    // Prefer apex path `/` for the marketing home on the Expo host.
    canonical: siteUrl(path === '/landing' ? '/' : path),
    url: siteUrl(path === '/landing' ? '/' : path),
  };
}

export function organizationJsonLd() {
  return {
    '@context': 'https://schema.org',
    '@type': 'Organization',
    '@id': `${NETPAY_SITE_URL}/#organization`,
    name: SEO_SITE_NAME,
    legalName: 'Netpay Global Holdings Ltd',
    alternateName: ['Netpay', 'Net Pay', 'Netppay'],
    url: NETPAY_SITE_URL,
    logo: {
      '@type': 'ImageObject',
      url: siteUrl('/og-image.png'),
      width: 1200,
      height: 630,
    },
    image: SEO_OG_IMAGE,
    email: 'support@netppay.com',
    telephone: '+2347067398399',
    foundingLocation: {
      '@type': 'Place',
      address: {
        '@type': 'PostalAddress',
        addressLocality: 'Lagos',
        addressCountry: 'NG',
      },
    },
    identifier: {
      '@type': 'PropertyValue',
      name: 'CAC Registration',
      value: 'RN7062973',
    },
    sameAs: [
      'https://twitter.com/netpay',
      'https://instagram.com/netpay',
      'https://facebook.com/netpay',
    ],
    description: SEO_DEFAULT_DESCRIPTION,
    areaServed: {
      '@type': 'Country',
      name: 'Nigeria',
    },
    contactPoint: [
      {
        '@type': 'ContactPoint',
        contactType: 'customer support',
        email: 'support@netppay.com',
        telephone: '+2347067398399',
        availableLanguage: ['English'],
        areaServed: 'NG',
      },
    ],
  };
}

export function websiteJsonLd() {
  return {
    '@context': 'https://schema.org',
    '@type': 'WebSite',
    '@id': `${NETPAY_SITE_URL}/#website`,
    name: SEO_SITE_NAME,
    alternateName: ['Netpay', 'Net Pay', 'Netppay'],
    url: NETPAY_SITE_URL,
    description: SEO_DEFAULT_DESCRIPTION,
    inLanguage: 'en-NG',
    publisher: {
      '@id': `${NETPAY_SITE_URL}/#organization`,
    },
    potentialAction: {
      '@type': 'SearchAction',
      target: {
        '@type': 'EntryPoint',
        urlTemplate: `${NETPAY_SITE_URL}/search?q={search_term_string}`,
      },
      'query-input': 'required name=search_term_string',
    },
  };
}

/** Helps Google understand NetPay as a bill-payment / fintech product. */
export function softwareApplicationJsonLd() {
  return {
    '@context': 'https://schema.org',
    '@type': 'SoftwareApplication',
    name: SEO_SITE_NAME,
    applicationCategory: 'FinanceApplication',
    applicationSubCategory: 'Bill Payment',
    operatingSystem: 'Android, iOS, Web',
    url: NETPAY_SITE_URL,
    description: SEO_DEFAULT_DESCRIPTION,
    image: SEO_OG_IMAGE,
    offers: {
      '@type': 'Offer',
      price: '0',
      priceCurrency: 'NGN',
    },
    featureList: [
      'Airtime top-up',
      'Data bundles',
      'Electricity tokens',
      'Cable TV payments',
      'Education PINs',
      'Wallet funding',
      'Transfers',
      'PIN and biometric unlock',
    ],
    publisher: {
      '@id': `${NETPAY_SITE_URL}/#organization`,
    },
  };
}

/** Landing-page service catalog for rich results context. */
export function landingServicesJsonLd() {
  const services = [
    {
      name: 'Airtime Top-up',
      description: 'Buy MTN, Airtel, Glo and 9mobile airtime instantly from your NetPay wallet.',
      url: siteUrl('/buy/airtime'),
    },
    {
      name: 'Data Bundles',
      description: 'Buy daily, weekly and monthly data plans for major Nigerian networks.',
      url: siteUrl('/buy/data'),
    },
    {
      name: 'Electricity Tokens',
      description: 'Buy prepaid electricity tokens and settle bills across major discos.',
      url: siteUrl('/buy/electricity'),
    },
    {
      name: 'Cable TV',
      description: 'Renew DStv, GOtv and StarTimes subscriptions online.',
      url: siteUrl('/buy/cable-tv'),
    },
    {
      name: 'Education PINs',
      description: 'Buy WAEC, NECO and JAMB pins and result checkers.',
      url: siteUrl('/buy/education'),
    },
    {
      name: 'Wallet Funding',
      description: 'Fund your NetPay wallet with a dedicated virtual account.',
      url: siteUrl('/buy/wallet'),
    },
  ];

  return {
    '@context': 'https://schema.org',
    '@type': 'ItemList',
    name: 'NetPay bill payment services',
    itemListElement: services.map((service, index) => ({
      '@type': 'ListItem',
      position: index + 1,
      item: {
        '@type': 'Service',
        name: service.name,
        description: service.description,
        url: service.url,
        provider: {
          '@id': `${NETPAY_SITE_URL}/#organization`,
        },
        areaServed: {
          '@type': 'Country',
          name: 'Nigeria',
        },
      },
    })),
  };
}

export function breadcrumbJsonLd(items: { name: string; path: string }[]) {
  return {
    '@context': 'https://schema.org',
    '@type': 'BreadcrumbList',
    itemListElement: items.map((item, index) => ({
      '@type': 'ListItem',
      position: index + 1,
      name: item.name,
      item: siteUrl(item.path === '/landing' ? '/' : item.path),
    })),
  };
}

export function jsonLdForPage(page: SeoPageKey): Record<string, unknown>[] {
  if (page === 'home') {
    return [landingServicesJsonLd()];
  }

  if (page === 'features') {
    return [
      breadcrumbJsonLd([
        { name: 'Home', path: '/' },
        { name: 'Features', path: '/features' },
      ]),
    ];
  }

  if (page === 'services') {
    return [
      breadcrumbJsonLd([
        { name: 'Home', path: '/' },
        { name: 'Services', path: '/services' },
      ]),
      landingServicesJsonLd(),
    ];
  }

  if (page === 'about') {
    return [
      breadcrumbJsonLd([
        { name: 'Home', path: '/' },
        { name: 'About', path: '/about-us' },
      ]),
    ];
  }

  if (page === 'contact' || page === 'support') {
    return [
      breadcrumbJsonLd([
        { name: 'Home', path: '/' },
        { name: 'Contact', path: '/contact-us' },
      ]),
    ];
  }

  return [];
}
