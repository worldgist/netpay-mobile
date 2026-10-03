/**
 * Expo web static export puts vector-icon fonts under
 * assets/node_modules/@expo/... — Vercel serves those @ paths as SPA HTML,
 * so MaterialIcons never load. Copy fonts to /assets/fonts and patch the bundle.
 */
const fs = require('fs');
const path = require('path');

const dist = path.join(__dirname, '..', 'dist');
const srcFonts = path.join(
  dist,
  'assets',
  'node_modules',
  '@expo',
  'vector-icons',
  'build',
  'vendor',
  'react-native-vector-icons',
  'Fonts',
);
const destFonts = path.join(dist, 'assets', 'fonts');
const fromPrefix = 'assets/node_modules/@expo/vector-icons/build/vendor/react-native-vector-icons/Fonts/';
const toPrefix = 'assets/fonts/';

function fail(message) {
  console.error(`[fix-expo-web-fonts] ${message}`);
  process.exit(1);
}

if (!fs.existsSync(srcFonts)) {
  fail(`Font source missing: ${srcFonts}`);
}

fs.mkdirSync(destFonts, { recursive: true });
for (const file of fs.readdirSync(srcFonts)) {
  if (!/\.(ttf|otf|woff2?)$/i.test(file)) continue;
  fs.copyFileSync(path.join(srcFonts, file), path.join(destFonts, file));
}

const jsDir = path.join(dist, '_expo', 'static', 'js', 'web');
if (!fs.existsSync(jsDir)) {
  fail(`Web JS bundle folder missing: ${jsDir}`);
}

let patched = 0;
for (const file of fs.readdirSync(jsDir)) {
  if (!file.endsWith('.js')) continue;
  const filePath = path.join(jsDir, file);
  const before = fs.readFileSync(filePath, 'utf8');
  if (!before.includes(fromPrefix)) continue;
  const after = before.split(fromPrefix).join(toPrefix);
  fs.writeFileSync(filePath, after);
  patched += 1;
}

if (patched === 0) {
  fail('No JS bundles contained vector-icon font paths to patch.');
}

console.log(`[fix-expo-web-fonts] Copied fonts → assets/fonts and patched ${patched} bundle(s).`);
