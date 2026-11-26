import type { ComponentProps } from 'react';
import { MaterialIcons } from '@expo/vector-icons';

type IconName = ComponentProps<typeof MaterialIcons>['name'];

export type SeoFeature = {
  slug: string;
  title: string;
  navTitle: string;
  description: string;
  keywords: string;
  icon: IconName;
  subtitle?: string;
  summary: string;
  points: string[];
  searchTerms: string[];
};

export const SEO_FEATURES: SeoFeature[] = [
  {
    slug: 'airtime',
    title: 'Buy Airtime in Nigeria | MTN, Airtel, Glo, 9mobile | NetPay',
    navTitle: 'Airtime Top-up',
    description:
      'Buy MTN, Airtel, Glo and 9mobile airtime instantly on NetPay. Recharge any Nigerian number from your wallet in seconds.',
    keywords:
      'buy airtime Nigeria, MTN airtime, Airtel airtime, Glo recharge, 9mobile airtime, NetPay airtime',
    icon: 'smartphone',
    summary: 'Instant airtime for every major Nigerian network.',
    points: [
      'Recharge MTN, Airtel, Glo and 9mobile.',
      'Airtime is sent to the number you enter.',
      'Pay from your NetPay wallet after you sign in.',
    ],
    searchTerms: ['airtime', 'recharge', 'mtn', 'airtel', 'glo', '9mobile', 'top up', 'topup', 'credit'],
  },
  {
    slug: 'data',
    title: 'Buy Data Bundles in Nigeria | MTN, Airtel, Glo, 9mobile | NetPay',
    navTitle: 'Data Bundles',
    description:
      'Buy cheap daily, weekly and monthly data bundles for MTN, Airtel, Glo and 9mobile on NetPay. Data is delivered to your line instantly.',
    keywords:
      'buy data Nigeria, MTN data, Airtel data bundle, Glo data, 9mobile data, cheap data NetPay',
    icon: 'wifi',
    summary: 'Daily, weekly and monthly data plans for every network.',
    points: [
      'Choose a plan for MTN, Airtel, Glo or 9mobile.',
      'Daily, weekly and monthly bundles are available.',
      'The bundle is sent to the phone number you enter.',
    ],
    searchTerms: ['data', 'bundle', 'internet', 'mtn data', 'airtel data', 'glo data', 'mb', 'gb'],
  },
  {
    slug: 'electricity',
    title: 'Buy Electricity Token | AEDC, IKEDC, EKEDC, IBEDC | NetPay',
    navTitle: 'Electricity Token',
    description:
      'Buy prepaid electricity tokens on NetPay for AEDC, IKEDC, EKEDC, IBEDC, KAEDCO, PHED, KEDCO, JED, BEDC and YEDC. Get your token by email and on your receipt.',
    keywords:
      'buy electricity token, prepaid meter token, AEDC token, IKEDC, EKEDC, IBEDC, PHED token, NetPay electricity',
    icon: 'bolt',
    subtitle: 'Prepaid and postpaid',
    summary: 'Prepaid tokens and postpaid payments for major Nigerian discos.',
    points: [
      'Enter your meter number and confirm the customer name.',
      'Prepaid purchases return a token you load on the meter.',
      'Your receipt includes the token, customer ID and address.',
    ],
    searchTerms: [
      'electricity',
      'token',
      'meter',
      'prepaid',
      'aedc',
      'ikedc',
      'ekedc',
      'ibedc',
      'phed',
      'kedco',
      'light',
      'nepa',
      'disco',
    ],
  },
  {
    slug: 'cable-tv',
    title: 'Pay DStv, GOtv and StarTimes | Cable TV Subscription | NetPay',
    navTitle: 'Cable TV',
    description:
      'Renew DStv, GOtv and StarTimes on NetPay. Pay your decoder or smartcard and get your subscription confirmed instantly.',
    keywords: 'pay DStv, GOtv subscription, StarTimes payment, cable TV Nigeria, NetPay DStv',
    icon: 'tv',
    subtitle: 'DStv, GOtv, StarTimes',
    summary: 'Renew DStv, GOtv and StarTimes from one wallet.',
    points: [
      'Enter your smartcard or IUC number.',
      'Pick a DStv, GOtv or StarTimes package.',
      'The subscription is sent to that decoder.',
    ],
    searchTerms: ['dstv', 'gotv', 'startimes', 'cable', 'tv', 'decoder', 'smartcard', 'iuc', 'subscription'],
  },
  {
    slug: 'education',
    title: 'Buy WAEC, NECO and JAMB PIN | Education | NetPay',
    navTitle: 'Education PINs',
    description:
      'Buy WAEC, NECO and JAMB pins and result checkers on NetPay. Exam pins are delivered as soon as the purchase succeeds.',
    keywords: 'buy WAEC pin, NECO pin, JAMB pin, result checker, NetPay education',
    icon: 'school',
    subtitle: 'WAEC, NECO, JAMB',
    summary: 'WAEC, NECO and JAMB pins without the queue.',
    points: [
      'Choose WAEC, NECO or JAMB.',
      'Pay from your NetPay wallet.',
      'Copy the PIN from your receipt or email.',
    ],
    searchTerms: ['waec', 'neco', 'jamb', 'pin', 'education', 'result checker', 'exam'],
  },
  {
    slug: 'betting',
    title: 'Fund Bet9ja, SportyBet and BetKing | Betting Wallet | NetPay',
    navTitle: 'Betting Wallet',
    description:
      'Fund Bet9ja, SportyBet, BetKing and other betting wallets on NetPay. Add money to your betting account from your NetPay wallet.',
    keywords: 'fund Bet9ja, SportyBet deposit, BetKing wallet, betting funding Nigeria, NetPay betting',
    icon: 'casino',
    summary: 'Fund leading betting accounts instantly.',
    points: [
      'Select your betting company.',
      'Enter the user ID for that betting account.',
      'The deposit is sent to that wallet.',
    ],
    searchTerms: ['bet9ja', 'sportybet', 'betking', 'betting', 'bet', '1xbet', 'nairabet'],
  },
  {
    slug: 'wallet',
    title: 'Fund Your Wallet with a Virtual Account | NetPay',
    navTitle: 'Fund Wallet',
    description:
      'Fund your NetPay wallet with a dedicated virtual account number. Transfer from any Nigerian bank and use the balance for bills.',
    keywords: 'fund wallet Nigeria, virtual account number, NetPay wallet funding, bank transfer',
    icon: 'account-balance-wallet',
    summary: 'A personal account number for wallet top-up.',
    points: [
      'Generate a NetPay virtual account if you do not have one.',
      'Transfer from your bank to that account number.',
      'Use the balance for airtime, bills, education and transfers.',
    ],
    searchTerms: ['wallet', 'fund', 'virtual account', 'account number', 'top up wallet', 'add money'],
  },
  {
    slug: 'transfer',
    title: 'Send Money to Another NetPay User | Transfer | NetPay',
    navTitle: 'Transfers',
    description:
      'Send money from your NetPay wallet to another NetPay user. Transfers stay inside NetPay so the other person can pay bills immediately.',
    keywords: 'send money Nigeria, NetPay transfer, wallet to wallet, NetPay send money',
    icon: 'send',
    summary: 'Move money to another NetPay wallet.',
    points: [
      'Enter the recipient NetPay details.',
      'Confirm the amount from your wallet balance.',
      'The transfer shows on both transaction histories.',
    ],
    searchTerms: ['transfer', 'send money', 'send', 'wallet transfer'],
  },
];

export function featurePath(slug: string): string {
  return `/buy/${slug}`;
}

export function findSeoFeature(slug: string | undefined | null): SeoFeature | undefined {
  const key = String(slug || '').trim().toLowerCase();
  return SEO_FEATURES.find((feature) => feature.slug === key);
}

export function searchSeoFeatures(query: string): SeoFeature[] {
  const terms = query
    .toLowerCase()
    .split(/[^a-z0-9]+/)
    .map((part) => part.trim())
    .filter((part) => part.length > 1);
  if (terms.length === 0) return SEO_FEATURES;
  return SEO_FEATURES.filter((feature) => {
    const haystack = [
      feature.navTitle,
      feature.title,
      feature.description,
      feature.summary,
      feature.keywords,
      ...feature.searchTerms,
      ...feature.points,
    ]
      .join(' ')
      .toLowerCase();
    return terms.every((term) => haystack.includes(term));
  });
}
