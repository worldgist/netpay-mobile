import { useEffect } from 'react';
import { Platform } from 'react-native';
import Head from 'expo-router/head';
import {
  GOOGLE_SITE_VERIFICATION,
  SEO_OG_IMAGE,
  SEO_SITE_NAME,
  SEO_TWITTER_HANDLE,
  resolveSeo,
  type SeoPageKey,
} from '@/constants/seo';

type SeoHeadProps = {
  page: SeoPageKey;
  path?: string;
  title?: string;
  description?: string;
  keywords?: string;
};

export function SeoHead({ page, path, title, description, keywords }: SeoHeadProps) {
  const seo = resolveSeo(page, { title, description, keywords, path });

  useEffect(() => {
    if (Platform.OS !== 'web' || typeof document === 'undefined') return;
    document.title = seo.title;
    const setContent = (selector: string, value: string) => {
      const element = document.querySelector(selector);
      if (element) element.setAttribute('content', value);
    };
    setContent('meta[name="description"]', seo.description);
    setContent('meta[name="keywords"]', seo.keywords || '');
    setContent('meta[property="og:title"]', seo.title);
    setContent('meta[property="og:description"]', seo.description);
    setContent('meta[property="og:url"]', seo.url);
    setContent('meta[name="twitter:title"]', seo.title);
    setContent('meta[name="twitter:description"]', seo.description);
    const canonical = document.querySelector('link[rel="canonical"]');
    if (canonical) canonical.setAttribute('href', seo.canonical);
  }, [seo.title, seo.description, seo.keywords, seo.canonical, seo.url]);

  return (
    <Head>
      <title>{seo.title}</title>
      <meta name="description" content={seo.description} />
      <meta name="keywords" content={seo.keywords} />
      <meta name="author" content={SEO_SITE_NAME} />
      <meta
        name="robots"
        content={seo.noIndex ? 'noindex,nofollow' : 'index,follow,max-image-preview:large'}
      />
      <meta name="googlebot" content={seo.noIndex ? 'noindex,nofollow' : 'index,follow'} />
      <meta name="theme-color" content="#FF7F00" />
      <link rel="canonical" href={seo.canonical} />
      {GOOGLE_SITE_VERIFICATION ? (
        <meta name="google-site-verification" content={GOOGLE_SITE_VERIFICATION} />
      ) : null}

      <meta property="og:type" content="website" />
      <meta property="og:site_name" content={SEO_SITE_NAME} />
      <meta property="og:title" content={seo.title} />
      <meta property="og:description" content={seo.description} />
      <meta property="og:url" content={seo.url} />
      <meta property="og:image" content={SEO_OG_IMAGE} />
      <meta property="og:locale" content="en_NG" />

      <meta name="twitter:card" content="summary_large_image" />
      <meta name="twitter:site" content={SEO_TWITTER_HANDLE} />
      <meta name="twitter:title" content={seo.title} />
      <meta name="twitter:description" content={seo.description} />
      <meta name="twitter:image" content={SEO_OG_IMAGE} />
    </Head>
  );
}
