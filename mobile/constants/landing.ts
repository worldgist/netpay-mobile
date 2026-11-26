import type { ComponentProps } from 'react';
import { MaterialIcons } from '@expo/vector-icons';

type IconName = ComponentProps<typeof MaterialIcons>['name'];

export const LANDING_BRAND = {
  orange: '#FF7F00',
  orangeDeep: '#E86F00',
  orangeSoft: '#FFF3E8',
  orangeWash: '#FFE8D4',
  navy: '#1A2B4A',
  text: '#334155',
  muted: '#667085',
  border: '#EEF2F6',
  white: '#FFFFFF',
  footerBg: '#FFF8F3',
} as const;

export const LANDING_NAV_LINKS = [
  { label: 'Home', href: '/landing' },
  { label: 'Features', href: '/features' },
  { label: 'Services', href: '/services' },
  { label: 'About', href: '/about-us' },
  { label: 'Contact', href: '/contact-us' },
] as const;

/** Hero copy under the main headline — core value + what NetPay offers. */
export const LANDING_HERO_VALUE =
  'One secure wallet for every everyday payment in Nigeria — fast, reliable, and built around how you already pay.';

export const LANDING_HERO_OFFERS = [
  'Airtime & data',
  'Electricity tokens',
  'Cable TV',
  'Education PINs',
  'Betting wallet funding',
  'Transfers & wallet funding',
] as const;

export const LANDING_SERVICES: {
  title: string;
  icon: IconName;
  subtitle?: string;
  description: string;
  slug?: string;
}[] = [
  {
    title: 'Airtime Top-up',
    icon: 'smartphone',
    subtitle: 'MTN · Airtel · Glo · 9mobile',
    description:
      'Recharge any Nigerian number instantly. Competitive rates, wallet-funded payments, and receipts you can trust.',
    slug: 'airtime',
  },
  {
    title: 'Data Bundles',
    icon: 'wifi',
    subtitle: 'Daily · Weekly · Monthly',
    description:
      'Pick the plan that fits your day — from short bursts to heavy monthly bundles across all major networks.',
    slug: 'data',
  },
  {
    title: 'Electricity Bills',
    icon: 'bolt',
    subtitle: 'Prepaid tokens & postpaid',
    description:
      'Buy prepaid meter tokens or settle postpaid bills for major discos nationwide. Token details appear on your receipt.',
    slug: 'electricity',
  },
  {
    title: 'Cable TV',
    icon: 'tv',
    subtitle: 'DStv · GOtv · StarTimes',
    description:
      'Renew entertainment packages in seconds. Enter your smartcard, choose a bouquet, and stay connected.',
    slug: 'cable-tv',
  },
  {
    title: 'Education PINs',
    icon: 'school',
    subtitle: 'WAEC · NECO · JAMB',
    description:
      'Get exam PINs and result checkers without queues. Pay from your wallet and copy the PIN from your receipt.',
    slug: 'education',
  },
  {
    title: 'Betting Funding',
    icon: 'casino',
    subtitle: 'Popular betting wallets',
    description:
      'Fund supported betting accounts quickly from your NetPay wallet when you need to top up and play.',
    slug: 'betting',
  },
];

/** Full product & service catalog for the dedicated landing section. */
export const LANDING_PRODUCTS: {
  category: string;
  title: string;
  summary: string;
  offers: string[];
  icon: IconName;
  slug?: string;
}[] = [
  {
    category: 'Mobile',
    title: 'Airtime Top-up',
    summary:
      'Instant recharge for any Nigerian mobile number from your NetPay wallet — no USSD codes, no airtime agents.',
    offers: ['MTN', 'Airtel', 'Glo', '9mobile / T2', 'Wallet-funded payments'],
    icon: 'smartphone',
    slug: 'airtime',
  },
  {
    category: 'Mobile',
    title: 'Data Bundles',
    summary:
      'Buy daily, weekly and monthly data plans across major networks and keep every purchase on your transaction history.',
    offers: ['Daily plans', 'Weekly plans', 'Monthly bundles', 'All major networks'],
    icon: 'wifi',
    slug: 'data',
  },
  {
    category: 'Utilities',
    title: 'Electricity Bills',
    summary:
      'Pay prepaid or postpaid electricity with meter verification before debit, then get your token or receipt instantly.',
    offers: ['Prepaid tokens', 'Postpaid bills', 'Major discos', 'Token on receipt'],
    icon: 'bolt',
    slug: 'electricity',
  },
  {
    category: 'Entertainment',
    title: 'Cable TV Renewals',
    summary:
      'Renew DStv, GOtv and StarTimes packages by smartcard — confirm customer details, pick a bouquet, and stay connected.',
    offers: ['DStv', 'GOtv', 'StarTimes', 'Bouquet selection'],
    icon: 'tv',
    slug: 'cable-tv',
  },
  {
    category: 'Education',
    title: 'Exam & Result PINs',
    summary:
      'Purchase WAEC, NECO and JAMB PINs from your wallet and copy them straight from your receipt when you need them.',
    offers: ['WAEC', 'NECO', 'JAMB', 'Result checkers'],
    icon: 'school',
    slug: 'education',
  },
  {
    category: 'Lifestyle',
    title: 'Betting Wallet Funding',
    summary:
      'Fund supported betting accounts quickly so you can top up and play without leaving NetPay.',
    offers: ['Popular betting brands', 'Account verification', 'Fast wallet debit'],
    icon: 'casino',
    slug: 'betting',
  },
  {
    category: 'Wallet',
    title: 'NetPay Wallet',
    summary:
      'One balance that powers every bill payment — fund via virtual account and pay across services without switching apps.',
    offers: ['Virtual account funding', 'Secure balance', 'Clear ledgers'],
    icon: 'account-balance-wallet',
    slug: 'wallet',
  },
  {
    category: 'Transfers',
    title: 'Money Transfers',
    summary:
      'Send money to other NetPay users with confirmation screens, fees shown upfront, and receipts you can revisit.',
    offers: ['In-app transfers', 'Fee preview', 'Instant delivery'],
    icon: 'send',
    slug: 'transfer',
  },
];

export type LandingFeature = {
  slug: string;
  title: string;
  description: string;
  detail: string;
  icon: IconName;
  /** Step-by-step explanation shown on the feature detail page. */
  howItWorks: string[];
  tips?: string[];
};

export const LANDING_FEATURES: LandingFeature[] = [
  {
    slug: 'instant-payments',
    title: 'Instant Payments',
    description: 'Complete transactions in seconds.',
    detail:
      'From airtime to electricity tokens, NetPay processes most payments instantly so you never wait around.',
    icon: 'flash-on',
    howItWorks: [
      'Open the service you need — airtime, data, electricity, cable, education or betting.',
      'Enter the required details (phone, meter, smartcard or account ID) and amount or plan.',
      'Confirm the summary, approve with your PIN when asked, and NetPay submits the payment.',
      'Get an on-screen result and a receipt you can revisit in Transactions.',
    ],
    tips: [
      'Keep your wallet funded so payments do not stop at confirmation.',
      'Double-check the recipient details on the confirm screen before you pay.',
    ],
  },
  {
    slug: 'bank-level-security',
    title: 'Bank-Level Security',
    description: 'Your data and money are always protected.',
    detail:
      'PIN, biometric options, encrypted sessions and secure infrastructure keep every naira and every account safe.',
    icon: 'verified-user',
    howItWorks: [
      'Create your account and set a 4-digit transaction PIN during setup.',
      'Sign in with email/password or PIN. On supported devices, enable biometric unlock in Profile.',
      'Sensitive actions like payments and transfers ask for your PIN again before money moves.',
      'Sessions stay encrypted, and you can change PIN or password anytime from Security settings.',
    ],
    tips: [
      'Never share your PIN or OTP with anyone.',
      'After 5 wrong PIN attempts, the account can be suspended for safety.',
    ],
  },
  {
    slug: 'one-secure-wallet',
    title: 'One Secure Wallet',
    description: 'Fund once, pay for everything.',
    detail:
      'Keep your balance ready for airtime, bills, education PINs, transfers and everyday payments.',
    icon: 'account-balance-wallet',
    howItWorks: [
      'Open Fund Wallet to see your dedicated virtual account details.',
      'Transfer money from your bank into that account using the account number shown.',
      'When the deposit clears, your NetPay balance updates automatically.',
      'Use the same balance to pay any supported bill or send a transfer — no extra apps needed.',
    ],
    tips: [
      'Copy the virtual account number carefully when funding from your bank app.',
      'Check Transactions after funding to confirm the credit landed.',
    ],
  },
  {
    slug: 'all-major-networks',
    title: 'All Major Networks',
    description: 'Airtime and data that just works.',
    detail:
      'Top up MTN, Airtel, Glo and 9mobile numbers with daily, weekly and monthly plans from one wallet.',
    icon: 'cell-tower',
    howItWorks: [
      'Go to Airtime or Data from Pay Bills.',
      'Select the network and enter a valid Nigerian phone number.',
      'For airtime, type an amount within the network min/max. For data, pick a plan.',
      'Confirm payment, approve with PIN, and the top-up is delivered to that number.',
    ],
    tips: [
      'Use the network logo picker so the right provider is selected.',
      'Save time by reusing numbers from your recent transactions.',
    ],
  },
  {
    slug: 'nationwide-discos',
    title: 'Nationwide Discos',
    description: 'Power bills without the queues.',
    detail:
      'Buy prepaid tokens or settle postpaid electricity across supported discos — with meter details confirmed before you pay.',
    icon: 'electrical-services',
    howItWorks: [
      'Open Electricity and choose your disco (for example IKEDC, EKEDC, AEDC).',
      'Select prepaid or postpaid, then enter your meter number and phone.',
      'Verify the meter so NetPay can show the customer name and any minimum amount.',
      'Enter the amount, confirm charges, pay with PIN, and copy your token from the success screen or receipt.',
    ],
    tips: [
      'Always verify the meter before paying — the name should match the household.',
      'Keep the token from your receipt; you may need it if the meter does not load automatically.',
    ],
  },
  {
    slug: 'tv-exam-bills',
    title: 'TV & Exam Bills',
    description: 'Entertainment and education covered.',
    detail:
      'Renew DStv, GOtv and StarTimes packages, or buy WAEC, NECO and JAMB PINs whenever you need them.',
    icon: 'live-tv',
    howItWorks: [
      'For TV: open Cable TV, pick DStv, GOtv or StarTimes, enter the smartcard, and verify the account.',
      'Choose a bouquet/package, confirm the amount, and pay from your wallet.',
      'For education: open Education, select WAEC, NECO or JAMB, and enter any required profile details.',
      'Confirm and pay — PINs appear on the success screen and in your transaction receipt for easy copy.',
    ],
    tips: [
      'Verify smartcard or JAMB profile details before confirming payment.',
      'Copy education PINs immediately and store them safely.',
    ],
  },
  {
    slug: 'transaction-history',
    title: 'Transaction History',
    description: 'Track every payment in one place.',
    detail:
      'Browse past airtime, data, bills and transfers with filters and details so you always know where your money went.',
    icon: 'history',
    howItWorks: [
      'Open Transactions from the bottom tab to see your recent wallet activity.',
      'Filter by type or status when you need a narrower list.',
      'Tap any item to open full details — amount, reference, provider and service-specific fields.',
      'Share a PDF receipt from the detail screen when you need proof of payment.',
    ],
    tips: [
      'Use the reference number if you contact support about a payment.',
      'Failed payments still appear so you can see what went wrong.',
    ],
  },
  {
    slug: 'self-serve-24-7',
    title: '24/7 Self-Serve',
    description: 'Pay whenever life happens.',
    detail:
      'Top up and settle bills day or night from web or mobile — no queues, no closing hours for everyday payments.',
    icon: 'schedule',
    howItWorks: [
      'Sign in on the website or mobile app anytime — NetPay does not close for everyday bills.',
      'Fund your wallet when convenient, then pay instantly when you need airtime, power or TV.',
      'Use PIN unlock for returning visits so you are not typing a full password every time.',
      'If something fails, check the receipt/status and retry or contact support with the reference.',
    ],
    tips: [
      'Install the web app on your phone home screen for faster access.',
      'Keep a small wallet buffer overnight for emergency top-ups.',
    ],
  },
];

export function findLandingFeature(slug?: string | null): LandingFeature | undefined {
  if (!slug) return undefined;
  const normalized = String(slug).trim().toLowerCase();
  return LANDING_FEATURES.find((feature) => feature.slug === normalized);
}

export function landingFeaturePath(slug: string) {
  return `/features/${slug}` as const;
}

export const LANDING_FEATURE_STEPS: {
  title: string;
  description: string;
  icon: IconName;
}[] = [
  {
    title: 'Create your account',
    description: 'Sign up in minutes with your email and secure your wallet with a transaction PIN.',
    icon: 'person-add',
  },
  {
    title: 'Fund your wallet',
    description: 'Add money using your virtual account or supported funding methods so you are always ready.',
    icon: 'account-balance',
  },
  {
    title: 'Pay any bill',
    description: 'Choose airtime, data, electricity, cable, education and more — then confirm and get a receipt.',
    icon: 'payments',
  },
];

export const LANDING_SERVICE_HIGHLIGHTS: {
  title: string;
  description: string;
  icon: IconName;
}[] = [
  {
    title: 'One wallet for every bill',
    description:
      'Stop juggling apps and USSD codes. Fund once and move between airtime, utilities, entertainment and education.',
    icon: 'layers',
  },
  {
    title: 'Built for Nigerian networks',
    description:
      'NetPay works with the providers you already use — from MTN and Airtel to DStv, GOtv and major electricity discos.',
    icon: 'public',
  },
  {
    title: 'Confirm before you pay',
    description:
      'See customer names, packages and amounts clearly before you commit, so fewer mistakes reach your wallet.',
    icon: 'fact-check',
  },
];

export const LANDING_ABOUT_VALUES: {
  title: string;
  description: string;
  icon: IconName;
}[] = [
  {
    title: 'Speed without stress',
    description:
      'Everyday payments should take seconds, not an afternoon. We design every flow to get you from intent to receipt quickly.',
    icon: 'speed',
  },
  {
    title: 'Trust you can feel',
    description:
      'Clear confirmations, secure unlock, and receipts that make sense — so you always know what happened with your money.',
    icon: 'shield',
  },
  {
    title: 'Built for Nigeria',
    description:
      'Airtime, data, discos, cable and exam PINs sit at the centre of daily life here. NetPay is shaped around those realities.',
    icon: 'home',
  },
];

export const LANDING_ABOUT_FACTS: {
  label: string;
  value: string;
}[] = [
  { label: 'Registered company', value: 'CAC RN7062973' },
  { label: 'Focus', value: 'Bill payments & wallet' },
  { label: 'Coverage', value: 'Nationwide Nigeria' },
  { label: 'Support', value: 'Email, phone & WhatsApp' },
];

export const LANDING_PROVIDERS = [
  { name: 'MTN', source: require('@/assets/images/mtn.png') },
  { name: 'Airtel', source: require('@/assets/images/airtel.png') },
  { name: 'Glo', source: require('@/assets/images/glo.png') },
  { name: 'T2', source: require('@/assets/images/t2.png') },
  { name: '9mobile', source: require('@/assets/images/9mobile.png') },
  { name: 'DStv', source: require('@/assets/images/dstv.png') },
  { name: 'GOtv', source: require('@/assets/images/gotv.png') },
  { name: 'StarTimes', source: require('@/assets/images/startimes.png') },
] as const;

export const LANDING_STORE_LINKS = {
  ios: 'https://apps.apple.com/search?term=NetPay',
  android: 'https://play.google.com/store/search?q=NetPay&c=apps',
} as const;

export const LANDING_SOCIAL_LINKS = [
  { key: 'x', url: 'https://x.com/netpay' },
  { key: 'facebook', url: 'https://facebook.com/netpay' },
  { key: 'instagram', url: 'https://instagram.com/netpay' },
  { key: 'youtube', url: 'https://youtube.com/@netpay' },
] as const;

export const LANDING_FOOTER_LINKS = [
  { label: 'Features', href: '/features' },
  { label: 'Services', href: '/services' },
  { label: 'About', href: '/about-us' },
  { label: 'Contact Us', href: '/contact-us' },
  { label: 'Privacy', href: '/privacy-policy' },
  { label: 'Terms', href: '/terms-and-conditions' },
  { label: 'FAQ', href: '/faq' },
  { label: 'Support', href: '/support' },
] as const;
