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
    description: 'Instant top-ups for MTN, Airtel, Glo, 9mobile and more at competitive rates.',
    slug: 'airtime',
  },
  {
    title: 'Data Bundles',
    icon: 'wifi',
    description: 'Daily, weekly and monthly data plans for every lifestyle and budget.',
    slug: 'data',
  },
  {
    title: 'Electricity Bills',
    icon: 'bolt',
    description: 'Buy prepaid tokens and settle electricity bills across major discos nationwide.',
    slug: 'electricity',
  },
  {
    title: 'Cable TV',
    icon: 'tv',
    subtitle: 'DStv, GOtv, Startimes',
    description: 'Renew DStv, GOtv, Startimes and other entertainment packages in seconds.',
    slug: 'cable-tv',
  },
  {
    title: 'Education',
    icon: 'school',
    subtitle: 'WAEC, NECO, JAMB',
    description: 'Get WAEC, NECO, JAMB and result checker PINs without the stress.',
    slug: 'education',
  },
  {
    title: 'Betting Funding',
    icon: 'casino',
    description: 'Fund Bet9ja, SportyBet, BetKing and other top platforms instantly.',
    slug: 'betting',
  },
  {
    title: 'Fund Wallet',
    icon: 'account-balance-wallet',
    description: 'Fund your NetPay wallet with a dedicated virtual account number.',
    slug: 'wallet',
  },
  {
    title: 'Transfers',
    icon: 'send',
    description: 'Send money to other NetPay users from your wallet.',
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
      'Keep your balance ready for airtime, bills, education PINs, betting funding and transfers.',
    icon: 'account-balance-wallet',
  },
  {
    title: 'Virtual Account Funding',
    description: 'Fund your wallet with a dedicated account.',
    detail:
      'Get a personal virtual account number and top up by bank transfer — credits usually land in moments.',
    icon: 'account-balance',
  },
  {
    title: 'Fast Transfers',
    description: 'Send money to other NetPay users.',
    detail:
      'Move funds between wallets quickly when you need to pay someone or split a bill.',
    icon: 'send',
  },
  {
    title: 'Transaction History',
    description: 'Track every payment in one place.',
    detail:
      'Review past airtime, bills and transfers anytime, with clear statuses and receipt details.',
    icon: 'receipt-long',
  },
  {
    title: 'Statements on Demand',
    description: 'Download your account activity.',
    detail:
      'Generate statement of account when you need records for personal tracking or verification.',
    icon: 'description',
  },
  {
    title: 'Biometric & PIN Login',
    description: 'Sign in the way that feels safest.',
    detail:
      'Use your transaction PIN and device biometrics where available for faster, safer access.',
    icon: 'fingerprint',
  },
  {
    title: 'Smart Notifications',
    description: 'Stay updated on every activity.',
    detail:
      'Get alerts for successful payments, wallet credits and important account updates.',
    icon: 'notifications-active',
  },
  {
    title: 'Referral Rewards',
    description: 'Invite friends and earn.',
    detail:
      'Share your referral link and grow with friends who join NetPay for everyday bill payments.',
    icon: 'card-giftcard',
  },
  {
    title: '24/7 Support',
    description: "We're always here to help.",
    detail:
      'Reach support anytime through our contact channels when you need help with a payment or account question.',
    icon: 'support-agent',
  },
  {
    title: 'Works Everywhere',
    description: 'Web, Android and iOS.',
    detail:
      'Use NetPay on the device that fits your day — browser or mobile app — with the same account.',
    icon: 'devices',
  },
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
  { label: 'Privacy', href: '/privacy-policy' },
  { label: 'Terms', href: '/terms-and-conditions' },
  { label: 'FAQ', href: '/faq' },
  { label: 'Support', href: '/contact-us' },
] as const;
