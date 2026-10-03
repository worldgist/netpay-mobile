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
  title?: string;
  description?: string;
  keywords?: string;
};

export function SeoHead({ page, title, description, keywords }: SeoHeadProps) {
  const seo = resolveSeo(page, { title, description, keywords });

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
