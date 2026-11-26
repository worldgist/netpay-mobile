/**
 * Writes Google Search files (robots.txt + sitemap.xml) into dist after expo export.
 * Uses EXPO_PUBLIC_SITE_URL so the sitemap matches the live domain.
 */
const fs = require('fs');
const path = require('path');

const siteUrl = (process.env.EXPO_PUBLIC_SITE_URL || 'https://netppay.com').replace(/\/$/, '');
const distDir = path.join(__dirname, '..', 'dist');
const publicDir = path.join(__dirname, '..', 'public');
fs.mkdirSync(publicDir, { recursive: true });

const featureSource = fs.readFileSync(path.join(__dirname, '..', 'constants', 'seo-features.ts'), 'utf8');
const featureSlugs = [...featureSource.matchAll(/slug: '([^']+)'/g)].map((match) => match[1]);

const publicPaths = [
  { loc: '/', priority: '1.0', changefreq: 'weekly' },
  { loc: '/landing', priority: '1.0', changefreq: 'weekly' },
  { loc: '/features', priority: '0.8', changefreq: 'monthly' },
  { loc: '/services', priority: '0.8', changefreq: 'monthly' },
  { loc: '/search', priority: '0.6', changefreq: 'weekly' },
  ...featureSlugs.map((slug) => ({ loc: `/buy/${slug}`, priority: '0.9', changefreq: 'weekly' })),
  { loc: '/about-us', priority: '0.7', changefreq: 'monthly' },
  { loc: '/contact-us', priority: '0.7', changefreq: 'monthly' },
  { loc: '/faq', priority: '0.7', changefreq: 'monthly' },
  { loc: '/privacy-policy', priority: '0.5', changefreq: 'yearly' },
  { loc: '/terms-and-conditions', priority: '0.5', changefreq: 'yearly' },
  { loc: '/support', priority: '0.6', changefreq: 'monthly' },
  { loc: '/auth/login', priority: '0.6', changefreq: 'monthly' },
  { loc: '/auth/signup', priority: '0.6', changefreq: 'monthly' },
];

if (!fs.existsSync(distDir)) {
  console.warn('[write-seo-files] dist/ missing — skip');
  process.exit(0);
}

const robots = `User-agent: *
Allow: /
Allow: /landing
Allow: /features
Allow: /services
Allow: /search
Allow: /buy/
Allow: /about-us
Allow: /contact-us
Allow: /faq
Allow: /privacy-policy
Allow: /terms-and-conditions
Allow: /support
Allow: /auth/login
Allow: /auth/signup

Disallow: /(tabs)
Disallow: /sign-in-pin
Disallow: /setup-pin
Disallow: /setup-biometric
Disallow: /change-pin
Disallow: /change-password
Disallow: /delete-account
Disallow: /transaction-details
Disallow: /transfer
Disallow: /add-money

User-agent: Googlebot
Allow: /

Sitemap: ${siteUrl}/sitemap.xml
`;

const today = new Date().toISOString().slice(0, 10);
const urls = publicPaths
  .map(
    (page) => `  <url>
    <loc>${siteUrl}${page.loc === '/' ? '/' : page.loc}</loc>
    <lastmod>${today}</lastmod>
    <changefreq>${page.changefreq}</changefreq>
    <priority>${page.priority}</priority>
  </url>`,
  )
  .join('\n');

const sitemap = `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
${urls}
</urlset>
`;

fs.writeFileSync(path.join(distDir, 'robots.txt'), robots);
fs.writeFileSync(path.join(distDir, 'sitemap.xml'), sitemap);
fs.writeFileSync(path.join(publicDir, 'robots.txt'), robots);
fs.writeFileSync(path.join(publicDir, 'sitemap.xml'), sitemap);

const indexPath = path.join(distDir, 'index.html');
const indexHtml = fs.readFileSync(indexPath, 'utf8');

function escapeHtml(value) {
  return String(value)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function featureField(slug, field) {
  const block = featureSource.split(`slug: '${slug}'`)[1] || '';
  const match = block.match(new RegExp(`${field}:\\s*'([^']*)'`));
  return match ? match[1].replace(/\\'/g, "'") : '';
}

function replaceTag(html, pattern, tag) {
  if (pattern.test(html)) return html.replace(pattern, tag);
  return html.replace('</head>', `${tag}</head>`);
}

function writeStaticPage(relativePath, { title, description, keywords }) {
  const canonical = `${siteUrl}${relativePath}`;
  const safeTitle = escapeHtml(title);
  const safeDescription = escapeHtml(description);
  const safeKeywords = escapeHtml(keywords);
  const safeCanonical = escapeHtml(canonical);
  let html = indexHtml.replace(/<title>[^<]*<\/title>/, `<title>${safeTitle}</title>`);
  html = replaceTag(html, /<meta name="description" content="[^"]*">/, `<meta name="description" content="${safeDescription}">`);
  html = replaceTag(html, /<meta name="keywords" content="[^"]*">/, `<meta name="keywords" content="${safeKeywords}">`);
  html = replaceTag(html, /<link rel="canonical" href="[^"]*">/, `<link rel="canonical" href="${safeCanonical}">`);
  html = replaceTag(html, /<meta property="og:title" content="[^"]*">/, `<meta property="og:title" content="${safeTitle}">`);
  html = replaceTag(html, /<meta property="og:description" content="[^"]*">/, `<meta property="og:description" content="${safeDescription}">`);
  html = replaceTag(html, /<meta property="og:url" content="[^"]*">/, `<meta property="og:url" content="${safeCanonical}">`);
  html = replaceTag(html, /<meta name="twitter:title" content="[^"]*">/, `<meta name="twitter:title" content="${safeTitle}">`);
  html = replaceTag(html, /<meta name="twitter:description" content="[^"]*">/, `<meta name="twitter:description" content="${safeDescription}">`);
  const filePath = path.join(distDir, `${relativePath.replace(/^\//, '')}.html`);
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  fs.writeFileSync(filePath, html);
}

writeStaticPage('/search', {
  title: 'Search NetPay services',
  description: 'Search NetPay for airtime, data, electricity tokens, DStv, WAEC pins, betting wallets and transfers.',
  keywords: 'NetPay search, buy airtime, electricity token, DStv, WAEC',
});

for (const slug of featureSlugs) {
  writeStaticPage(`/buy/${slug}`, {
    title: featureField(slug, 'title'),
    description: featureField(slug, 'description'),
    keywords: featureField(slug, 'keywords'),
  });
}

for (const file of [
  'og-image.png',
  'logo.png',
  'manifest.webmanifest',
  'sw.js',
  'pwa-192.png',
  'pwa-512.png',
  'apple-touch-icon.png',
]) {
  const from = path.join(publicDir, file);
  const to = path.join(distDir, file);
  if (fs.existsSync(from)) {
    fs.copyFileSync(from, to);
  }
}

console.log(`[write-seo-files] Wrote robots.txt + sitemap.xml + PWA assets for ${siteUrl}`);
