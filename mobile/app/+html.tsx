import type { PropsWithChildren } from 'react';
import { ScrollViewStyleReset } from 'expo-router/html';
import {
  GOOGLE_SITE_VERIFICATION,
  SEO_DEFAULT_DESCRIPTION,
  SEO_DEFAULT_KEYWORDS,
  SEO_DEFAULT_TITLE,
  SEO_OG_IMAGE,
  SEO_SITE_NAME,
  SEO_TWITTER_HANDLE,
  organizationJsonLd,
  softwareApplicationJsonLd,
  websiteJsonLd,
} from '@/constants/seo';
import { NETPAY_SITE_URL } from '@/constants/site';

/**
 * Root HTML document for Expo web (SPA). Sets default SEO that crawlers see
 * in index.html; per-route tags are updated via <SeoHead /> after navigation.
 */
export default function Root({ children }: PropsWithChildren) {
  return (
    <html lang="en-NG">
      <head>
        <meta charSet="utf-8" />
        <meta httpEquiv="X-UA-Compatible" content="IE=edge" />
        <meta
          name="viewport"
          content="width=device-width, initial-scale=1, maximum-scale=5, shrink-to-fit=no"
        />
        <title>{SEO_DEFAULT_TITLE}</title>
        <meta name="description" content={SEO_DEFAULT_DESCRIPTION} />
        <meta name="keywords" content={SEO_DEFAULT_KEYWORDS} />
        <meta name="author" content={SEO_SITE_NAME} />
        <meta name="robots" content="index,follow,max-image-preview:large,max-snippet:-1,max-video-preview:-1" />
        <meta name="googlebot" content="index,follow,max-image-preview:large" />
        <meta name="theme-color" content="#FF7F00" />
        <meta name="application-name" content={SEO_SITE_NAME} />
        <meta name="apple-mobile-web-app-title" content={SEO_SITE_NAME} />
        <meta name="apple-mobile-web-app-capable" content="yes" />
        <meta name="apple-mobile-web-app-status-bar-style" content="default" />
        <meta name="mobile-web-app-capable" content="yes" />
        <link rel="manifest" href="/manifest.webmanifest" />
        <link rel="icon" type="image/png" href="/logo.png" />
        <link rel="shortcut icon" type="image/png" href="/logo.png" />
        <link rel="apple-touch-icon" href="/apple-touch-icon.png" />
        <link rel="icon" type="image/png" sizes="192x192" href="/pwa-192.png" />
        <link rel="icon" type="image/png" sizes="512x512" href="/pwa-512.png" />
        <link rel="canonical" href={`${NETPAY_SITE_URL}/`} />
        {GOOGLE_SITE_VERIFICATION ? (
          <meta name="google-site-verification" content={GOOGLE_SITE_VERIFICATION} />
        ) : null}

        <meta property="og:type" content="website" />
        <meta property="og:site_name" content={SEO_SITE_NAME} />
        <meta property="og:title" content={SEO_DEFAULT_TITLE} />
        <meta property="og:description" content={SEO_DEFAULT_DESCRIPTION} />
        <meta property="og:url" content={`${NETPAY_SITE_URL}/`} />
        <meta property="og:image" content={SEO_OG_IMAGE} />
        <meta property="og:locale" content="en_NG" />

        <meta name="twitter:card" content="summary_large_image" />
        <meta name="twitter:site" content={SEO_TWITTER_HANDLE} />
        <meta name="twitter:title" content={SEO_DEFAULT_TITLE} />
        <meta name="twitter:description" content={SEO_DEFAULT_DESCRIPTION} />
        <meta name="twitter:image" content={SEO_OG_IMAGE} />

        <script type="application/ld+json">{JSON.stringify(organizationJsonLd())}</script>
        <script type="application/ld+json">{JSON.stringify(websiteJsonLd())}</script>
        <script type="application/ld+json">{JSON.stringify(softwareApplicationJsonLd())}</script>

        <ScrollViewStyleReset />
      </head>
      <body>{children}</body>
    </html>
  );
}
