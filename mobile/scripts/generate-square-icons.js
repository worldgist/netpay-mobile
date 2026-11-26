#!/usr/bin/env node
/**
 * Pads logo.png to a square PNG for Expo icon / adaptive icon schema checks.
 * Run: node ./scripts/generate-square-icons.js
 */
const path = require('path');
const fs = require('fs');

const projectRoot = path.join(__dirname, '..');
const src = path.join(projectRoot, 'assets', 'images', 'logo.png');
const out = path.join(projectRoot, 'assets', 'images', 'logo-icon-1024.png');

async function main() {
  let sharp;
  try {
    sharp = require('sharp');
  } catch {
    console.error('Install sharp: npm install sharp --save-dev');
    process.exit(1);
  }
  if (!fs.existsSync(src)) {
    console.error('Missing source:', src);
    process.exit(1);
  }
  await sharp(src)
    .resize(1024, 1024, {
      fit: 'contain',
      background: { r: 255, g: 255, b: 255, alpha: 1 },
    })
    .png()
    .toFile(out);
  const meta = await sharp(out).metadata();
  console.log('Wrote', path.relative(projectRoot, out), `(${meta.width}x${meta.height})`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
