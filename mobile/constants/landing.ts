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
    title: 'Education',
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
  {
    title: 'Fund Wallet',
    icon: 'account-balance-wallet',
    subtitle: 'Virtual account & cards',
    description:
      'Add money with a dedicated virtual account or supported funding options so your balance is ready for every bill.',
    slug: 'wallet',
  },
  {
    title: 'Transfers',
    icon: 'send',
    subtitle: 'Send money securely',
    description:
      'Move money to bank accounts with clear confirmation screens, receipts, and transaction history you can revisit.',
    slug: 'transfer',
  },
];

export const LANDING_FEATURES: {
  title: string;
  description: string;
  detail: string;
  icon: IconName;
}[] = [
  {
    title: 'Instant Payments',
    description: 'Complete transactions in seconds.',
    detail:
      'From airtime to electricity tokens, NetPay processes most payments instantly so you never wait around.',
    icon: 'flash-on',
  },
  {
    title: 'Bank-Level Security',
    description: 'Your data and money are always protected.',
    detail:
      'PIN, biometric options, encrypted sessions and secure infrastructure keep every naira and every account safe.',
    icon: 'verified-user',
  },
  {
    title: 'One Secure Wallet',
    description: 'Fund once, pay for everything.',
    detail:
      'Keep your balance ready for airtime, bills, education PINs, transfers and everyday payments.',
    icon: 'account-balance-wallet',
  },
  {
    title: 'Clear Receipts',
    description: 'Know exactly what you paid for.',
    detail:
      'Every successful payment gives you a receipt with amounts, references and service details you can share or revisit.',
    icon: 'receipt-long',
  },
  {
    title: 'PIN & Biometric Unlock',
    description: 'Sign in the way that fits you.',
    detail:
      'Returning users unlock with a 4-digit PIN. On supported devices, biometric login keeps access fast and private.',
    icon: 'fingerprint',
  },
  {
    title: 'Transaction History',
    description: 'Track every payment in one place.',
    detail:
      'Browse past airtime, data, bills and transfers with filters and details so you always know where your money went.',
    icon: 'history',
  },
  {
    title: 'Statements',
    description: 'Export what you need for records.',
    detail:
      'Generate a statement of account when you need a cleaner view of wallet activity for personal or business records.',
    icon: 'description',
  },
  {
    title: '24/7 Self-Serve',
    description: 'Pay whenever life happens.',
    detail:
      'Top up and settle bills day or night from web or mobile — no queues, no closing hours for everyday payments.',
    icon: 'schedule',
  },
];

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
