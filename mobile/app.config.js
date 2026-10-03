// Single Expo config source (no app.json) — satisfies expo-doctor and keeps EAS google-services override.

const googleServicesFromEnv = process.env.GOOGLE_SERVICES_JSON;
const siteUrl = (process.env.EXPO_PUBLIC_SITE_URL || 'https://netppay.com').replace(/\/$/, '');
const siteHost = siteUrl.replace(/^https?:\/\//, '');

module.exports = {
  name: 'Netpay',
  slug: 'netpay',
  version: '1.0.0',
  description:
    'Pay airtime, data, electricity, cable TV, education and more from one secure NetPay wallet.',
  platforms: ['ios', 'android', 'web'],
  orientation: 'portrait',
  icon: './assets/images/logo-icon-1024.png',
  splash: {
    image: './assets/images/logo.png',
    resizeMode: 'contain',
    backgroundColor: '#ffffff',
  },
  scheme: 'netpay',
  userInterfaceStyle: 'automatic',
  web: {
    // SPA export for Vercel — single index.html + client router
    output: 'single',
    bundler: 'metro',
    favicon: './assets/images/logo.png',
    name: 'NetPay',
    shortName: 'NetPay',
    description:
      'Pay airtime, data, electricity, cable TV, education and more from one secure NetPay wallet.',
    themeColor: '#FF7F00',
    backgroundColor: '#FFFFFF',
    display: 'standalone',
    startUrl: '/sign-in-pin',
  },
  ios: {
    supportsTablet: true,
    bundleIdentifier: 'com.netpay.mobile',
    associatedDomains: [`applinks:${siteHost}`, 'applinks:www.netppay.com'],
    infoPlist: {
      CFBundleURLTypes: [
        {
          CFBundleURLSchemes: ['netpay'],
        },
      ],
      ITSAppUsesNonExemptEncryption: false,
    },
    usesAppleSignIn: false,
  },
  android: {
    package: 'com.netpay.mobile',
    googleServicesFile:
      googleServicesFromEnv && googleServicesFromEnv.trim().length > 0
        ? googleServicesFromEnv
        : './google-services.json',
    icon: './assets/images/logo-icon-1024.png',
    adaptiveIcon: {
      foregroundImage: './assets/images/logo-icon-1024.png',
      backgroundColor: '#FFFFFF',
    },
    edgeToEdgeEnabled: true,
    predictiveBackGestureEnabled: false,
    permissions: [
      'android.permission.POST_NOTIFICATIONS',
      'android.permission.VIBRATE',
      'android.permission.RECEIVE_BOOT_COMPLETED',
    ],
    intentFilters: [
      {
        action: 'VIEW',
        autoVerify: true,
        category: ['BROWSABLE', 'DEFAULT'],
        data: [
          { scheme: 'https', host: siteHost, pathPrefix: '/reset-password' },
          { scheme: 'https', host: 'www.netppay.com', pathPrefix: '/reset-password' },
          { scheme: 'https', host: siteHost, pathPrefix: '/pay' },
          { scheme: 'https', host: 'www.netppay.com', pathPrefix: '/pay' },
          { scheme: 'https', host: siteHost, pathPrefix: '/open' },
          { scheme: 'https', host: 'www.netppay.com', pathPrefix: '/open' },
        ],
      },
      {
        action: 'VIEW',
        category: ['BROWSABLE', 'DEFAULT'],
        data: [{ scheme: 'netpay' }],
      },
    ],
  },
  notification: {
    icon: './assets/images/notification-icon.png',
    color: '#FF7F00',
  },
  plugins: [
    'expo-router',
    [
      'expo-image-picker',
      {
        photosPermission: 'Allow NetPay to attach photos when you message support.',
        cameraPermission: 'Allow NetPay to take a photo to send in support chat.',
      },
    ],
    [
      'expo-splash-screen',
      {
        image: './assets/images/logo.png',
        imageWidth: 200,
        resizeMode: 'contain',
        backgroundColor: '#ffffff',
        dark: {
          backgroundColor: '#000000',
        },
      },
    ],
    'expo-local-authentication',
    [
      'expo-notifications',
      {
        icon: './assets/images/notification-icon.png',
        color: '#FF7F00',
        mode: 'production',
        android: {
          icon: './assets/images/notification-icon.png',
          color: '#FF7F00',
          enableVibration: true,
        },
      },
    ],
    'expo-secure-store',
    'expo-sharing',
    'expo-image',
    'expo-web-browser',
    '@react-native-community/datetimepicker',
  ],
  experiments: {
    typedRoutes: true,
  },
  extra: {
    siteUrl,
    router: {},
    eas: {
      projectId: 'a962982c-3160-42f2-9e64-3ab04ced7bf5',
    },
    firebase: {
      projectId: 'netpay-47909',
      messagingSenderId: '748935923743',
      androidAppId: '1:748935923743:android:0965f31a7e6e61ff702d2a',
    },
  },
};
