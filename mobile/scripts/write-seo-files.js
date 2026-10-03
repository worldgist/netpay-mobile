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

const publicPaths = [
  { loc: '/', priority: '1.0', changefreq: 'weekly' },
  { loc: '/landing', priority: '1.0', changefreq: 'weekly' },
  { loc: '/features', priority: '0.8', changefreq: 'monthly' },
  { loc: '/services', priority: '0.8', changefreq: 'monthly' },
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
