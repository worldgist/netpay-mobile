#!/usr/bin/env node
/**
 * Optional: generate a monochrome Android status-bar icon derived from logo.png.
 * The app config uses logo.png directly; run this only if you need a separate
 * white-on-transparent asset for legacy Android tooling.
 * Run: node ./scripts/generate-notification-icon.js
 */
const path = require('path');
const fs = require('fs');

const projectRoot = path.join(__dirname, '..');
const src = path.join(projectRoot, 'assets', 'images', 'logo.png');
const out = path.join(projectRoot, 'assets', 'images', 'notification-icon.png');

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

  // Resize with transparent padding first so the icon has breathing room in status bar.
  const base = await sharp(src)
    .resize(96, 96, {
      fit: 'contain',
      background: { r: 255, g: 255, b: 255, alpha: 0 },
    })
    .png()
    .toBuffer();

  // Convert to raw pixels and map non-white logo pixels to solid white,
  // keeping near-white background fully transparent.
  const { data, info } = await sharp(base)
    .ensureAlpha()
    .raw()
    .toBuffer({ resolveWithObject: true });

  const outData = Buffer.alloc(data.length);
  const channels = info.channels; // expected RGBA

  for (let i = 0; i < data.length; i += channels) {
    const r = data[i];
    const g = data[i + 1];
    const b = data[i + 2];
    const a = data[i + 3];

    // Treat very light pixels as background.
    const isBackground = r > 242 && g > 242 && b > 242;

    outData[i] = 255;
    outData[i + 1] = 255;
    outData[i + 2] = 255;
    outData[i + 3] = isBackground ? 0 : a;
  }

  await sharp(outData, {
    raw: {
      width: info.width,
      height: info.height,
      channels,
    },
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
