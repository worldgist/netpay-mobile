import { NETPAY_SITE_URL, siteUrl } from '@/constants/site';

export const SEO_SITE_NAME = 'NetPay';
export const SEO_DEFAULT_TITLE = 'NetPay — Pay Every Bill in One Place';
export const SEO_DEFAULT_DESCRIPTION =
  'Nigeria’s best bill payments platform. Pay airtime, data, electricity, cable TV, education, betting and more from one secure NetPay wallet.';
export const SEO_DEFAULT_KEYWORDS = [
  'NetPay',
  'bill payment Nigeria',
  'buy airtime',
  'buy data',
  'electricity token',
  'DStv payment',
  'GOtv',
  'WAEC PIN',
  'JAMB PIN',
  'wallet funding',
  'fintech Nigeria',
].join(', ');

export const SEO_OG_IMAGE = siteUrl('/og-image.png');
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
    title: 'Features | NetPay',
    description:
      'Explore NetPay features: instant payments, secure wallet, virtual account funding, transfers, biometric login, statements and 24/7 support.',
    path: '/features',
    keywords: 'NetPay features, instant payments, secure wallet, biometric login Nigeria',
  },
  services: {
    title: 'Services | NetPay',
    description:
      'Pay airtime, data, electricity, cable TV, education PINs, betting funding and more instantly with NetPay.',
    path: '/services',
    keywords: 'NetPay services, airtime, data, electricity, cable TV, education PIN, betting funding',
  },
  about: {
    title: 'About Us | NetPay',
    description:
      'Learn about NetPay — a Nigerian bill payments platform built for speed, security and everyday convenience.',
    path: '/about-us',
    keywords: 'about NetPay, NetPay Nigeria, bill payments company',
  },
  contact: {
    title: 'Contact & Support | NetPay',
    description:
      'Get help from NetPay support. Reach us by email, phone or WhatsApp for account and payment assistance.',
    path: '/contact-us',
    keywords: 'NetPay support, contact NetPay, customer care',
  },
  faq: {
    title: 'FAQ | NetPay',
    description:
      'Answers to common questions about NetPay wallet funding, bill payments, transfers, security and account setup.',
    path: '/faq',
    keywords: 'NetPay FAQ, help centre, bill payment questions',
  },
  privacy: {
    title: 'Privacy Policy | NetPay',
    description:
      'Read how NetPay collects, uses and protects your personal information across our mobile app and website.',
    path: '/privacy-policy',
    keywords: 'NetPay privacy policy, data protection Nigeria',
  },
  terms: {
    title: 'Terms & Conditions | NetPay',
    description:
      'Read the NetPay terms and conditions for using our bill payment, wallet and related digital services.',
    path: '/terms-and-conditions',
    keywords: 'NetPay terms and conditions, terms of service',
  },
  support: {
    title: 'Support | NetPay',
    description:
      'Find NetPay customer support resources, contact options and help for payments and account issues.',
    path: '/support',
    keywords: 'NetPay support, help, customer service',
  },
  login: {
    title: 'Login | NetPay',
    description: 'Sign in to your NetPay account to pay bills, fund your wallet and manage transactions.',
    path: '/auth/login',
    keywords: 'NetPay login, sign in',
  },
  signup: {
    title: 'Create Account | NetPay',
    description: 'Create a free NetPay account and start paying airtime, data, electricity and more in seconds.',
    path: '/auth/signup',
    keywords: 'NetPay signup, create account, register',
  },
};

export function resolveSeo(
  key: SeoPageKey,
  overrides?: Partial<Pick<SeoDefinition, 'title' | 'description' | 'keywords'>>,
): SeoDefinition & { canonical: string; url: string } {
  const page = SEO_PAGES[key];
  const path = page.path;
  return {
    ...page,
    title: overrides?.title || page.title,
    description: overrides?.description || page.description,
    keywords: overrides?.keywords || page.keywords || SEO_DEFAULT_KEYWORDS,
    canonical: siteUrl(path === '/landing' ? '/' : path),
    url: siteUrl(path === '/landing' ? '/' : path),
  };
}

export function organizationJsonLd() {
  return {
    '@context': 'https://schema.org',
    '@type': 'Organization',
    name: SEO_SITE_NAME,
    legalName: 'Netpay Global Holdings Ltd',
    url: NETPAY_SITE_URL,
    logo: siteUrl('/og-image.png'),
    email: 'support@netppay.com',
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
    contactPoint: {
      '@type': 'ContactPoint',
      contactType: 'customer support',
      email: 'support@netppay.com',
      availableLanguage: ['English'],
    },
  };
}

export function websiteJsonLd() {
  return {
    '@context': 'https://schema.org',
    '@type': 'WebSite',
    name: SEO_SITE_NAME,
    alternateName: ['Netpay', 'Net Pay'],
    url: NETPAY_SITE_URL,
    description: SEO_DEFAULT_DESCRIPTION,
    inLanguage: 'en-NG',
    publisher: {
      '@type': 'Organization',
      name: SEO_SITE_NAME,
      logo: {
        '@type': 'ImageObject',
        url: siteUrl('/og-image.png'),
      },
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
    operatingSystem: 'Android, iOS, Web',
    url: NETPAY_SITE_URL,
    description: SEO_DEFAULT_DESCRIPTION,
    offers: {
      '@type': 'Offer',
      price: '0',
      priceCurrency: 'NGN',
    },
    publisher: {
      '@type': 'Organization',
      name: SEO_SITE_NAME,
      url: NETPAY_SITE_URL,
    },
  };
}
